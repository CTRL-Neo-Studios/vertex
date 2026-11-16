//! AI provider access for the webview (plugin `vertex-ai`). Requests go through here so API keys stay in the OS
//! credential store and never reach the webview: the frontend names a provider, Rust checks the URL against that
//! provider's `baseURL` in settings and adds the key itself.

use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, LazyLock, Mutex};
use std::time::Duration;
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::plugin::{Builder, TauriPlugin};
use tauri::{AppHandle, Manager, Runtime, State};
use tauri_plugin_vertex::api::{self, blocking, install_crypto};
use tokio::sync::Notify;

const CATALOG_URL: &str = "https://models.dev/api.json";
const CATALOG_FILE: &str = "models-dev.json";
const CATALOG_MAX_AGE: Duration = Duration::from_secs(24 * 60 * 60);

/// In-flight `ai_request`s by request id; notifying one aborts it.
#[derive(Default)]
pub struct AiRequests(Mutex<HashMap<String, Arc<Notify>>>);

impl AiRequests {
    fn remove(&self, id: &str) {
        if let Ok(mut map) = self.0.lock() {
            map.remove(id);
        }
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiResponseHead {
    status: u16,
    headers: HashMap<String, String>,
}

fn account(provider_id: &str) -> String {
    format!("ai-provider:{provider_id}")
}

fn read_key(provider_id: &str) -> Result<Option<String>, String> {
    api::keychain_get(&account(provider_id))
}

/// Removes a provider's key; a missing one is fine.
fn delete_key(provider_id: &str) -> Result<(), String> {
    api::keychain_delete(&account(provider_id))
}

/// `aiConfig.providers` as id → baseURL; `None` when the settings have no provider list at all.
fn ai_providers(settings: &Value) -> Option<HashMap<&str, &str>> {
    let list = settings.get("aiConfig")?.get("providers")?.as_array()?;
    Some(
        list.iter()
            .filter_map(|p| Some((p.get("id")?.as_str()?, p.get("baseURL").and_then(Value::as_str).unwrap_or(""))))
            .collect(),
    )
}

/// `settings.aiConfig.providers[id].baseURL`, the only origin `ai_request` may call for that provider.
fn provider_base_url<R: Runtime>(app: &AppHandle<R>, id: &str) -> Option<String> {
    let settings = api::settings(app);
    ai_providers(&settings)?.get(id).map(|url| (*url).to_owned())
}

/// Providers whose saved API key must go: removed, or pointed at another baseURL (a key is bound to its host, so it
/// is never sent somewhere the user didn't save it for). New settings without a provider list remove nothing.
fn stale_ai_providers(old: &Value, new: &Value) -> Vec<String> {
    let (Some(old), Some(new)) = (ai_providers(old), ai_providers(new)) else {
        return Vec::new();
    };
    old.into_iter()
        .filter(|(id, url)| new.get(id) != Some(url))
        .map(|(id, _)| id.to_owned())
        .collect()
}

/// One client for every AI call. Connect timeout only: a generation can stream for minutes.
static CLIENT: LazyLock<Result<reqwest::Client, String>> = LazyLock::new(|| {
    install_crypto();
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        // Redirects may not leave the provider's origin: the request was only checked against that.
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            let first = attempt.previous().first().map(|u| u.origin());
            if attempt.previous().len() > 5 || first != Some(attempt.url().origin()) {
                attempt.stop()
            } else {
                attempt.follow()
            }
        }))
        .build()
        .map_err(|e| e.to_string())
});

fn client() -> Result<&'static reqwest::Client, String> {
    CLIENT.as_ref().map_err(Clone::clone)
}

/// `url` must be http(s) and have the same scheme, host and port as the provider's `baseURL`.
fn check_origin(url: &str, base_url: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(url).map_err(|e| format!("invalid url: {e}"))?;
    let base = reqwest::Url::parse(base_url).map_err(|e| format!("invalid provider baseURL: {e}"))?;
    if !matches!(url.scheme(), "http" | "https") || url.origin() != base.origin() {
        return Err("url is outside the provider's baseURL origin".into());
    }
    Ok(url)
}

/// Saves a provider's API key; an empty string removes it.
#[tauri::command]
async fn ai_key_set(provider_id: String, key: String) -> Result<(), String> {
    blocking(move || {
        let key = key.trim();
        if key.is_empty() {
            return delete_key(&provider_id);
        }
        api::keychain_set(&account(&provider_id), key)
    })
    .await
}

#[tauri::command]
async fn ai_key_has(provider_id: String) -> Result<bool, String> {
    blocking(move || read_key(&provider_id).map(|k| k.is_some())).await
}

/// Sends one request to a provider and resolves with the response head. The body then streams over `on_chunk`:
/// raw byte chunks, then a single JSON `{"end":true}` or `{"error":"…"}` (`"aborted"` after `ai_request_cancel`).
/// Non-2xx responses are not errors; their body streams like any other so the caller can read the message.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
async fn ai_request<R: Runtime>(
    app: AppHandle<R>,
    requests: State<'_, AiRequests>,
    request_id: String,
    provider_id: String,
    url: String,
    method: String,
    headers: HashMap<String, String>,
    body: Option<String>,
    on_chunk: Channel<InvokeResponseBody>,
) -> Result<AiResponseHead, String> {
    let base_url = provider_base_url(&app, &provider_id).ok_or_else(|| format!("unknown AI provider: {provider_id}"))?;
    let url = check_origin(&url, &base_url)?;
    let method = reqwest::Method::from_bytes(method.to_ascii_uppercase().as_bytes()).map_err(|e| e.to_string())?;
    let id = provider_id.clone();
    let key = blocking(move || read_key(&id)).await?;

    let mut request = client()?.request(method, url);
    for (name, value) in headers {
        if !name.eq_ignore_ascii_case("authorization") {
            request = request.header(name, value);
        }
    }
    if let Some(key) = key {
        request = request.bearer_auth(key);
    }
    if let Some(body) = body {
        request = request.body(body);
    }

    let cancel = Arc::new(Notify::new());
    requests
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .insert(request_id.clone(), cancel.clone());

    let sent = tokio::select! {
        r = request.send() => r.map_err(|e| e.to_string()),
        _ = cancel.notified() => Err("aborted".to_string()),
    };
    let mut response = match sent {
        Ok(r) => r,
        Err(e) => {
            requests.remove(&request_id);
            return Err(e);
        }
    };

    let mut head = AiResponseHead { status: response.status().as_u16(), headers: HashMap::new() };
    for (name, value) in response.headers() {
        let Ok(value) = value.to_str() else { continue };
        head.headers
            .entry(name.as_str().to_owned())
            .and_modify(|v| {
                v.push_str(", ");
                v.push_str(value);
            })
            .or_insert_with(|| value.to_owned());
    }

    tauri::async_runtime::spawn(async move {
        let end = loop {
            let chunk = tokio::select! {
                c = response.chunk() => c,
                _ = cancel.notified() => break Some("aborted".to_string()),
            };
            match chunk {
                Ok(Some(bytes)) => {
                    // The webview is gone: nobody to stream to.
                    if on_chunk.send(InvokeResponseBody::Raw(bytes.to_vec())).is_err() {
                        break None;
                    }
                }
                Ok(None) => break Some(String::new()),
                Err(e) => break Some(e.to_string()),
            }
        };
        if let Some(error) = end {
            let message = if error.is_empty() {
                serde_json::json!({ "end": true })
            } else {
                serde_json::json!({ "error": error })
            };
            let _ = on_chunk.send(InvokeResponseBody::Json(message.to_string()));
        }
        app.state::<AiRequests>().remove(&request_id);
    });

    Ok(head)
}

/// Aborts an in-flight `ai_request`; unknown or finished ids are ignored.
#[tauri::command]
fn ai_request_cancel(requests: State<'_, AiRequests>, request_id: String) {
    if let Some(cancel) = requests.0.lock().ok().and_then(|m| m.get(&request_id).cloned()) {
        // Stores a permit when nothing is waiting yet, so a cancel between awaits isn't lost.
        cancel.notify_one();
    }
}

/// The models.dev catalog, cached in the app data dir for 24 h. On fetch failure a stale cache is served.
#[tauri::command]
async fn ai_model_catalog<R: Runtime>(app: AppHandle<R>) -> Result<Value, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = dir.join(CATALOG_FILE);
    let cached = || -> Option<Value> { serde_json::from_slice(&std::fs::read(&path).ok()?).ok() };

    let fresh = std::fs::metadata(&path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.elapsed().ok())
        .is_some_and(|age| age < CATALOG_MAX_AGE);
    if fresh {
        if let Some(v) = cached() {
            return Ok(v);
        }
    }

    let fetched: Result<(Value, Vec<u8>), String> = async {
        let bytes = client()?
            .get(CATALOG_URL)
            .timeout(Duration::from_secs(60))
            .send()
            .await
            .and_then(|r| r.error_for_status())
            .map_err(|e| e.to_string())?
            .bytes()
            .await
            .map_err(|e| e.to_string())?;
        let value = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
        Ok((value, bytes.to_vec()))
    }
    .await;

    match fetched {
        Ok((value, bytes)) => {
            // A failed cache write only costs a refetch next time.
            let _ = std::fs::create_dir_all(&dir).and_then(|_| std::fs::write(&path, bytes));
            Ok(value)
        }
        Err(e) => cached().ok_or(e),
    }
}

/// The AI plugin (`vertex-ai`); register it after the kernel's. A saved key goes when its provider is removed or
/// moved to another baseURL, checked after every settings save.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("vertex-ai")
        .invoke_handler(tauri::generate_handler![
            ai_key_set,
            ai_key_has,
            ai_request,
            ai_request_cancel,
            ai_model_catalog,
        ])
        .setup(|app, _api| {
            app.manage(AiRequests::default());
            api::on_settings_change(app, |old, new| {
                for id in stale_ai_providers(old, new) {
                    if let Err(e) = delete_key(&id) {
                        eprintln!("[ai] could not delete the key of provider {id}: {e}");
                    }
                }
            });
            Ok(())
        })
        .build()
}

#[cfg(test)]
mod tests {
    use super::{check_origin, stale_ai_providers};
    use serde_json::json;

    #[test]
    fn origin_check() {
        let base = "https://api.example.com/v1";
        assert!(check_origin("https://api.example.com/v1/chat/completions", base).is_ok());
        assert!(check_origin("https://api.example.com:443/other", base).is_ok());
        assert!(check_origin("http://api.example.com/v1/chat", base).is_err());
        assert!(check_origin("https://api.example.com:8443/v1", base).is_err());
        assert!(check_origin("https://evil.com/v1", base).is_err());
        assert!(check_origin("https://api.example.com.evil.com/v1", base).is_err());
        assert!(check_origin("file:///etc/passwd", "file:///etc").is_err());
        assert!(check_origin("http://localhost:11434/v1/models", "http://localhost:11434/v1").is_ok());
    }

    #[test]
    fn ai_keys_go_with_removed_or_moved_providers() {
        let cfg = |providers: serde_json::Value| json!({"aiConfig": {"providers": providers}});
        let old = cfg(json!([
            {"id": "a", "baseURL": "https://a.dev/v1"},
            {"id": "b", "baseURL": "https://b.dev/v1"},
            {"id": "c", "baseURL": "https://c.dev/v1"}
        ]));
        let new = cfg(json!([
            {"id": "a", "baseURL": "https://a.dev/v1", "name": "renamed"},
            {"id": "b", "baseURL": "https://evil.dev/v1"},
            {"id": "d", "baseURL": "https://d.dev/v1"}
        ]));
        let mut stale = stale_ai_providers(&old, &new);
        stale.sort();
        assert_eq!(stale, ["b", "c"]);
        assert!(stale_ai_providers(&old, &json!({})).is_empty());
        assert_eq!(stale_ai_providers(&old, &cfg(json!([]))).len(), 3);
    }
}
