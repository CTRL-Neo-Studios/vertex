import type {DialogOptions} from '#shared/plugin/api'
import {vertexInvoke} from '~/utils/vertexInvoke'

/**
 * Open and Save dialogs, shown by Rust (`dialogs.rs`): the pick is this window's to read (open) or write (save), and no
 * other window's. `null` when cancelled. Plugins get them as `ctx.dialogs`.
 */
export const pickToOpen = (options: DialogOptions & { directory?: boolean } = {}) =>
    vertexInvoke<string | null>('dialog_open', {options})

export const pickToSave = (options: DialogOptions = {}) =>
    vertexInvoke<string | null>('dialog_save', {options})
