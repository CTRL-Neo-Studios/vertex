//! Update channels and the channel token for the updater backend (`plugins.updater` in tauri.conf.json).
//!
//! The token is kept in the OS credential store (macOS Keychain, Windows Credential Manager,
//! Linux Secret Service), never in settings.json. The channel list is fetched here rather than from
//! the webview because the backend does not allow cross-origin requests.

const KEYRING_SERVICE: &str = "dev.ctrl-neo.vertex";
const KEYRING_ACCOUNT: &str = "updater-token";
/// Same host, prefix and app id as the updater endpoint in tauri.conf.json; keep both in sync.
const CHANNELS_URL: &str = "https://www.ctrl-neo.dev/apps/api/v1/apps/vertex/channels";
const TOKEN_HEADER: &str = "x-updater-token";

#[derive(serde::Serialize, serde::Deserialize)]
pub struct Channel {
    name: String,
    /// `public` or `restricted`.
    access: String,
}

#[derive(serde::Deserialize)]
struct ChannelsResponse {
    channels: Vec<Channel>,
}

fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).map_err(|e| e.to_string())
}

fn read_token() -> Result<Option<String>, String> {
    match entry()?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn update_token_get() -> Result<Option<String>, String> {
    read_token()
}

/// Saves the token; an empty string removes it.
#[tauri::command]
pub fn update_token_set(token: String) -> Result<(), String> {
    let token = token.trim();
    let entry = entry()?;
    if !token.is_empty() {
        return entry.set_password(token).map_err(|e| e.to_string());
    }
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Public channels plus the restricted ones the saved token grants.
#[tauri::command]
pub async fn update_channels() -> Result<Vec<Channel>, String> {
    let token = tauri::async_runtime::spawn_blocking(read_token)
        .await
        .map_err(|e| e.to_string())??;
    // reqwest is built without a bundled crypto provider (same setup as tauri-plugin-updater).
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    let mut request = reqwest::Client::new().get(CHANNELS_URL);
    if let Some(token) = token {
        request = request.header(TOKEN_HEADER, token);
    }
    let response = request
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| e.to_string())?;
    let body: ChannelsResponse = response.json().await.map_err(|e| e.to_string())?;
    Ok(body.channels)
}
