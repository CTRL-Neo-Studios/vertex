//! `web_fetch`, the transport under the chat's `fetchUrl` tool (the AI SDK's web fetch, `app/utils/webPage.ts`): one
//! GET of a public http(s) URL, without following redirects (the tool follows them, each hop another call), returned
//! raw. No cookies, no keys, no proxy. Hosts on this machine or the local network are refused at every hop: the
//! resolver drops their addresses (so a public name pointing at 192.168.x.x fails too) and URLs naming such an address
//! are rejected before the request.

use std::error::Error;
use std::net::{IpAddr, SocketAddr, ToSocketAddrs};
use std::sync::{Arc, LazyLock};
use std::time::Duration;

/// The tool's `maxBytes`; one byte more is read, so its own size check sees an over-long body.
const MAX_BODY: usize = 2 * 1024 * 1024;
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
        .redirect(reqwest::redirect::Policy::none())
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

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct Head {
    status: u16,
    status_text: String,
    headers: Vec<(String, String)>,
}

/// The response as bytes: the head's JSON length (u32, big-endian), the head, then the body (raw, not JSON: a page
/// can be megabytes).
fn frame(head: &Head, body: &[u8]) -> Result<Vec<u8>, String> {
    let head = serde_json::to_vec(head).map_err(|e| e.to_string())?;
    let len = u32::try_from(head.len()).map_err(|e| e.to_string())?;
    Ok([&len.to_be_bytes()[..], &head, body].concat())
}

#[tauri::command]
pub async fn web_fetch(url: String, accept: Option<String>) -> Result<tauri::ipc::Response, String> {
    let url = reqwest::Url::parse(&url).map_err(|e| format!("invalid url: {e}"))?;
    if !allowed_url(&url) {
        return Err(if matches!(url.scheme(), "http" | "https") { LOCAL.into() } else { "only http and https URLs can be fetched".into() });
    }
    let client = CLIENT.as_ref().map_err(Clone::clone)?;
    let mut request = client.get(url);
    if let Some(accept) = accept {
        request = request.header(reqwest::header::ACCEPT, accept);
    }
    let fail = |e: reqwest::Error| {
        let text = describe(&e);
        if text.contains(LOCAL) { LOCAL.to_owned() } else { text }
    };
    let mut response = request.send().await.map_err(fail)?;
    let status = response.status();
    let head = Head {
        status: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or_default().to_owned(),
        headers: response.headers().iter().filter_map(|(k, v)| Some((k.to_string(), v.to_str().ok()?.to_owned()))).collect(),
    };
    let mut body = Vec::new();
    // A declared length over the limit is refused by the tool from the header alone.
    if response.content_length().is_none_or(|n| n <= MAX_BODY as u64) {
        while let Some(chunk) = response.chunk().await.map_err(fail)? {
            body.extend_from_slice(&chunk);
            if body.len() > MAX_BODY {
                body.truncate(MAX_BODY + 1);
                break;
            }
        }
    }
    Ok(tauri::ipc::Response::new(frame(&head, &body)?))
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
}
