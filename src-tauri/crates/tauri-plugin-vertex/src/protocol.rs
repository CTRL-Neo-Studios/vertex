//! `vertex-file`: the files a window shows (images in notes, canvases, Bases, chats), served only when the asking window
//! reaches them (`reach.rs`). Replaces the asset protocol, whose scope is the same for every window. The frontend's URL
//! is `fileUrl(path)` (`convertFileSrc(path, 'vertex-file')`): the path, URI-encoded, after the host.

use crate::reach::reaches;
use std::path::Path;
use tauri::http::header::{ACCESS_CONTROL_ALLOW_ORIGIN, CONTENT_TYPE, ORIGIN};
use tauri::http::{Request, Response, StatusCode};
use tauri::{Runtime, UriSchemeContext, UriSchemeResponder};

pub const SCHEME: &str = "vertex-file";

/// The content type of what the viewers load, by extension; anything else is plain bytes.
fn content_type(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()).map(str::to_ascii_lowercase).as_deref() {
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("avif") => "image/avif",
        Some("bmp") => "image/bmp",
        Some("ico") => "image/x-icon",
        Some("svg") => "image/svg+xml",
        _ => "application/octet-stream",
    }
}

/// A response readable by the page that asked (its origin echoed, as the asset protocol did): a canvas drawing an
/// image it loaded stays exportable, and `fetch` works.
fn response(origin: &str, code: StatusCode, content_type: Option<&str>, body: Vec<u8>) -> Response<Vec<u8>> {
    let mut builder = Response::builder().status(code).header(ACCESS_CONTROL_ALLOW_ORIGIN, origin);
    if let Some(content_type) = content_type {
        builder = builder.header(CONTENT_TYPE, content_type);
    }
    builder.body(body).unwrap()
}

pub fn handle<R: Runtime>(ctx: UriSchemeContext<'_, R>, request: Request<Vec<u8>>, responder: UriSchemeResponder) {
    let origin = request.headers().get(ORIGIN).and_then(|o| o.to_str().ok()).unwrap_or("null").to_owned();
    let encoded = request.uri().path().trim_start_matches('/');
    let path = percent_encoding::percent_decode_str(encoded).decode_utf8_lossy().into_owned();
    if !reaches(ctx.app_handle(), ctx.webview_label(), &path) {
        return responder.respond(response(&origin, StatusCode::FORBIDDEN, None, Vec::new()));
    }
    tauri::async_runtime::spawn_blocking(move || {
        responder.respond(match std::fs::read(&path) {
            Ok(bytes) => response(&origin, StatusCode::OK, Some(content_type(Path::new(&path))), bytes),
            Err(_) => response(&origin, StatusCode::NOT_FOUND, None, Vec::new()),
        });
    });
}
