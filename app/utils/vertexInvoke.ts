import {invoke, type InvokeArgs} from "@tauri-apps/api/core";

/** `invoke` for one of the app's Tauri plugins (`vertex`, `vertex-git`…): its commands are `plugin:<plugin>|<command>`. */
export const pluginInvoke = (plugin: string) =>
    <T>(command: string, args?: InvokeArgs) => invoke<T>(`plugin:${plugin}|${command}`, args)

/** A kernel command (src-tauri/crates/tauri-plugin-vertex). */
export const vertexInvoke = pluginInvoke('vertex')
