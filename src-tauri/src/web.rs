//! `web_fetch`, behind the chat's `fetchUrl` tool: a GET of any public http(s) page, returned as text. No cookies, no
//! keys, no proxy. Hosts on this machine or the local network are refused, at every hop: the resolver drops their
//! addresses (so a public name pointing at 192.168.x.x fails too) and URLs naming such an address are rejected before
//! the request and at each redirect.

use std::error::Error;
use std::net::{IpAddr, SocketAddr, ToSocketAddrs};
use std::sync::{Arc, LazyLock};
use std::time::Duration;

const MAX_BODY: usize = 2 * 1024 * 1024;
const MAX_REDIRECTS: usize = 5;
const LOCAL: &str = "refused: the address is on this computer or its local network";

/// Whether `ip` is on the public internet: not loopback, private, link-local, shared (CGNAT), unspecified,
/// broadcast, documentation, multicast or reserved; IPv4-mapped IPv6 counts as its IPv4 address.
fn is_public(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            let [a, b, ..] = v4.octets();
            !(v4.is_private()
                || v4.is_loopback()
                || v4.is_link_local()
                || v4.is_unspecified()
                || v4.is_broadcast()
                || v4.is_documentation()
                || v4.is_multicast()
                || a == 0
                || (a == 100 && (64..128).contains(&b))
                || a >= 240)
        }
        IpAddr::V6(v6) => match v6.to_ipv4_mapped() {
            Some(v4) => is_public(IpAddr::V4(v4)),
            None => {
                let first = v6.segments()[0];
                // fc00::/7 unique local, fe80::/10 link-local.
                !(v6.is_loopback() || v6.is_unspecified() || v6.is_multicast() || first & 0xfe00 == 0xfc00 || first & 0xffc0 == 0xfe80)
            }
        },
    }
}

/// http(s), and not naming a non-public address (names are checked by [`PublicOnly`] when resolved).
fn allowed_url(url: &reqwest::Url) -> bool {
    matches!(url.scheme(), "http" | "https")
        && match url.host() {
            Some(url::Host::Ipv4(ip)) => is_public(IpAddr::V4(ip)),
            Some(url::Host::Ipv6(ip)) => is_public(IpAddr::V6(ip)),
            Some(url::Host::Domain(_)) => true,
            None => false,
        }
}

/// The system resolver, keeping only public addresses.
struct PublicOnly;

impl reqwest::dns::Resolve for PublicOnly {
    fn resolve(&self, name: reqwest::dns::Name) -> reqwest::dns::Resolving {
        let host = name.as_str().to_owned();
        Box::pin(async move {
            let found = tauri::async_runtime::spawn_blocking(move || (host.as_str(), 0).to_socket_addrs().map(Iterator::collect::<Vec<_>>)).await??;
            let public: Vec<SocketAddr> = found.into_iter().filter(|a| is_public(a.ip())).collect();
            if public.is_empty() {
                return Err(LOCAL.into());
            }
            Ok(Box::new(public.into_iter()) as reqwest::dns::Addrs)
        })
    }
}

static CLIENT: LazyLock<Result<reqwest::Client, String>> = LazyLock::new(|| {
    crate::ai::install_crypto();
    reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .no_proxy()
        .dns_resolver(Arc::new(PublicOnly))
        .user_agent(concat!("Vertex/", env!("CARGO_PKG_VERSION")))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() > MAX_REDIRECTS {
                attempt.error("too many redirects")
            } else if !allowed_url(attempt.url()) {
                attempt.error(LOCAL)
            } else {
                attempt.follow()
            }
        }))
        .build()
        .map_err(|e| e.to_string())
});

/// An error with its causes: reqwest's own message doesn't say why ("error sending request").
fn describe(error: &dyn Error) -> String {
    let mut text = error.to_string();
    let mut source = error.source();
    while let Some(cause) = source {
        text.push_str(": ");
        text.push_str(&cause.to_string());
        source = cause.source();
    }
    text
}

/// Text types the webview can read; anything else comes back without its body.
fn is_text(content_type: &str) -> bool {
    let kind = content_type.split(';').next().unwrap_or_default().trim().to_ascii_lowercase();
    kind.is_empty() || kind.starts_with("text/") || kind.ends_with("json") || kind.ends_with("xml")
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebPage {
    /// After redirects.
    url: String,
    status: u16,
    content_type: String,
    /// `None` for types that aren't text (see [`is_text`]); invalid UTF-8 is replaced.
    body: Option<String>,
    /// The body was cut at 2 MB.
    truncated: bool,
}

#[tauri::command]
pub async fn web_fetch(url: String) -> Result<WebPage, String> {
    let url = reqwest::Url::parse(&url).map_err(|e| format!("invalid url: {e}"))?;
    if !allowed_url(&url) {
        return Err(if matches!(url.scheme(), "http" | "https") { LOCAL.into() } else { "only http and https URLs can be fetched".into() });
    }
    let client = CLIENT.as_ref().map_err(Clone::clone)?;
    let mut response = client
        .get(url)
        .header(reqwest::header::ACCEPT, "text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.5")
        .send()
        .await
        .map_err(|e| describe(&e))?;
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default()
        .to_owned();
    let mut page = WebPage { url: response.url().to_string(), status: response.status().as_u16(), content_type, body: None, truncated: false };
    if !is_text(&page.content_type) {
        return Ok(page);
    }
    let mut bytes = Vec::new();
    // ponytail: bytes as UTF-8 (lossy), ignoring the page's charset; decode with encoding_rs if non-UTF-8 pages matter.
    while let Some(chunk) = response.chunk().await.map_err(|e| describe(&e))? {
        let room = MAX_BODY - bytes.len();
        if chunk.len() > room {
            bytes.extend_from_slice(&chunk[..room]);
            page.truncated = true;
            break;
        }
        bytes.extend_from_slice(&chunk);
    }
    page.body = Some(String::from_utf8_lossy(&bytes).into_owned());
    Ok(page)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_public_addresses_and_http_urls_pass() {
        for ip in ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fe80::1", "fd00::1", "::ffff:192.168.1.1"] {
            assert!(!is_public(ip.parse().unwrap()), "{ip}");
        }
        for ip in ["1.1.1.1", "93.184.216.34", "2606:4700::1111"] {
            assert!(is_public(ip.parse().unwrap()), "{ip}");
        }
        let ok = |u: &str| allowed_url(&reqwest::Url::parse(u).unwrap());
        assert!(ok("https://example.com/a") && ok("http://1.1.1.1/"));
        assert!(!ok("http://127.0.0.1:3000/") && !ok("http://[::1]/") && !ok("file:///etc/passwd") && !ok("ftp://example.com/"));
    }

    #[test]
    fn text_types_are_read_and_others_are_not() {
        for t in ["text/html; charset=utf-8", "application/json", "application/ld+json", "application/xhtml+xml", ""] {
            assert!(is_text(t), "{t}");
        }
        for t in ["image/png", "application/pdf", "application/octet-stream"] {
            assert!(!is_text(t), "{t}");
        }
    }
}
