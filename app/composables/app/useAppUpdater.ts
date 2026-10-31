import {check} from '@tauri-apps/plugin-updater'
import {relaunch} from '@tauri-apps/plugin-process'
import {ask} from '@tauri-apps/plugin-dialog'
import {useAppSettings} from '~/composables/app/useAppSettings'
import useQuickToasts from '~/composables/utility/useQuickToasts'

/**
 * Check-for-updates flow against the backend in `plugins.updater` (tauri.conf.json).
 * The selected channel and optional token are sent as the `x-updater-channel` / `x-updater-token`
 * headers the backend reads (its `headers` config). Download + install is the plugin's job;
 * `relaunch()` restarts on macOS/Linux (Windows exits via its installer).
 */
export function useAppUpdater() {
    const $settings = useAppSettings()
    const $qt = useQuickToasts()
    const {t} = useI18n()
    const isChecking = ref(false)

    function headers(): Record<string, string> {
        const channel = $settings.config.value?.updateChannel || 'stable'
        const token = $settings.config.value?.updateToken || ''
        return {'x-updater-channel': channel, ...(token ? {'x-updater-token': token} : {})}
    }

    async function checkForUpdates() {
        if (isChecking.value) return
        isChecking.value = true
        try {
            await $settings.load()
            const update = await check({headers: headers()})
            if (!update) {
                $qt.info(t('app.updates.upToDate.title'), t('app.updates.upToDate.description'))
                return
            }
            const prompt = t('app.updates.available.prompt', {version: update.version})
                + (update.body ? `\n\n${update.body}` : '')
            const install = await ask(prompt, {
                title: t('app.updates.available.title'),
                kind: 'info',
                okLabel: t('app.updates.install'),
                cancelLabel: t('app.updates.later'),
            })
            if (!install) {
                await update.close()
                return
            }
            await update.downloadAndInstall()
            await relaunch()
        } catch (error) {
            $qt.error(t('app.updates.error'), error instanceof Error ? error.message : String(error))
        } finally {
            isChecking.value = false
        }
    }

    return {checkForUpdates, isChecking}
}
