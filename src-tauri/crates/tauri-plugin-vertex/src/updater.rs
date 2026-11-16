//! Update channels and the channel token for the updater backend (`plugins.updater` in tauri.conf.json).
//!
//! The token is kept in the OS credential store (macOS Keychain, Windows Credential Manager,
//! Linux Secret Service), never in settings.json. The channel list is fetched here rather than from
//! the webview because the backend does not allow cross-origin requests.

use crate::api::{blocking, install_crypto, keychain_delete, keychain_get, keychain_set};

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

#[tauri::command]
pub fn update_token_get() -> Result<Option<String>, String> {
    keychain_get(KEYRING_ACCOUNT)
}

/// Saves the token; an empty string removes it.
#[tauri::command]
pub fn update_token_set(token: String) -> Result<(), String> {
    let token = token.trim();
    if token.is_empty() {
        keychain_delete(KEYRING_ACCOUNT)
    } else {
        keychain_set(KEYRING_ACCOUNT, token)
    }
}

/// Public channels plus the restricted ones the saved token grants.
#[tauri::command]
pub async fn update_channels() -> Result<Vec<Channel>, String> {
    let token = blocking(|| keychain_get(KEYRING_ACCOUNT)).await?;
    install_crypto();
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
