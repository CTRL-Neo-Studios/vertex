import {convertFileSrc} from '@tauri-apps/api/core'

/** The URL the webview loads the file at `path` from: the kernel's `vertex-file` protocol, which serves only what this window reaches. */
export const fileUrl = (path: string) => convertFileSrc(path, 'vertex-file')
