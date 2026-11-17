import {convertFileSrc} from '@tauri-apps/api/core'

/** The URL the webview loads the file at `path` from: the kernel's `vertex-file` protocol, which serves only what this window reaches. */
export const fileUrl = (path: string) => convertFileSrc(path, 'vertex-file')

/** The URL of a file of the installed plugin `id`'s folder: the kernel's `vertex-plugin` protocol, which serves nothing outside it. */
export const pluginAssetUrl = (id: string, path: string) => convertFileSrc(`${id}/${path.replace(/^\/+/, '')}`, 'vertex-plugin')
