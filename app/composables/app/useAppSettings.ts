import { LazyStore } from "@tauri-apps/plugin-store";
import { defaultAppSettings } from "#shared/utils/defaults/apps";
import type { AppSettings } from "#shared/types/app/settings";
import {useAppWebviewWindows} from "~/composables/app/useAppWebviewWindows";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import type {DeepPartial} from "#shared/types/types";

const STORE_FILENAME = 'settings.json';
const STORE_KEY = 'settings';

/**
 * A composable for managing the application's configuration.
 * It handles loading from and saving to the Tauri store,
 * provides default values, and shares the config reactively across the app.
 */
export function useAppSettings() {
    const config = useState<AppSettings | null>(`${STORE_KEY}.data`, () => null);

    const isLoaded = useState<boolean>(`${STORE_KEY}.is_loaded`, () => false);

    const fileStore = new LazyStore(STORE_FILENAME);

    const $win = useAppWebviewWindows()
    const $qt = useQuickToasts()

    /**
     * Loads the configuration from the Tauri store.
     * If no config exists, it creates one with default values and saves it.
     * This function is safe to call multiple times; it will only read from disk once.
     */
    async function load() {
        if (isLoaded.value) {
            return config.value;
        }

        try {
            await fileStore.init();
            const storedData = await fileStore.get<AppSettings>(STORE_KEY);

            config.value = defaultAppSettings(storedData);

            if (!storedData) {
                await fileStore.set(STORE_KEY, unref(config));
                await fileStore.save();
            }

        } catch (error) {
            console.error("Fatal: Failed to load application config:", error);
            config.value = defaultAppSettings();
        } finally {
            isLoaded.value = true;
        }

        return unref(config);
    }

    /**
     * Saves the configuration to the Tauri store.
     * @param newData - An optional object with partial config values to update.
     *                  If not provided, the current state will be saved.
     */
    async function save(newData?: PossiblyRef<Partial<AppSettings>>): Promise<boolean> {
        let success: boolean = true

        if (!unref(config)) {
            console.warn("Attempted to save config before it was loaded. Operation skipped.");
            success = false
            return success;
        }

        const updateData = unref(newData);

        if (updateData) {
            config.value = defaultAppSettings({
                ...config.value,
                ...updateData,
            });
        }

        try {
            await fileStore.set(STORE_KEY, unref(config));
            await fileStore.save();
        } catch (error) {
            console.error("Failed to save application config:", error);
            success = false
        }

        return success
    }

    function set(data: DeepPartial<AppSettings>, source?: string) {
        // console.log('Old', source, unref(config))
        if (config.value)
            config.value = defaultAppSettings({
                ...unref(config),
                ...data
            })
        // console.log('New', source, unref(config))
    }

    async function createOrFocusSettingsWindow() {
        const window = await $win.getAppWindowWithLabel('settings')
        if (window) {
            await $win.showWindowWithLabel('settings')
        } else {
            const settingsWindow = $win.createAppWebviewWindow('/settings', 'settings', 'Settings')

            const closeUnlisten = await settingsWindow.listen('tauri://close-requested', async function (e) {
                await settingsWindow.destroy()
                closeUnlisten()
            })

            const destroyUnlisten = await settingsWindow.listen('tauri://destroyed', async function (e) {
                await settingsWindow.destroy()
                destroyUnlisten()
            })
        }
    }

    return {
        /**
         * The reactive application configuration object.
         * Will be `null` until `load()` has been successfully called.
         */
        config,
        /**
         * A reactive boolean indicating if the configuration has been loaded from the store.
         */
        isLoaded,
        load,
        save,
        set,
        createOrFocusSettingsWindow
    };
}