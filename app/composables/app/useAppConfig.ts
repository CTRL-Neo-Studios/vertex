import { ref, unref } from 'vue';
import { LazyStore } from "@tauri-apps/plugin-store";
import { defaultAppConfig } from "#shared/utils/defaults/apps";
import type { AppConfig } from "#shared/types/app/config";

const STORE_FILENAME = 'vertex_config.json';
const STORE_KEY = 'config';

/**
 * A composable for managing the application's configuration.
 * It handles loading from and saving to the Tauri store,
 * provides default values, and shares the config reactively across the app.
 */
export function useAppConfig() {
    const config = useState<AppConfig | null>(`${STORE_KEY}.data`, () => null);

    const isLoaded = useState<boolean>(`${STORE_KEY}.is_loaded`, () => false);

    const fileStore = new LazyStore(STORE_FILENAME);

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
            const storedData = await fileStore.get<AppConfig>(STORE_KEY);

            config.value = defaultAppConfig(storedData);

            if (!storedData) {
                await fileStore.set(STORE_KEY, config.value);
                await fileStore.save();
            }

        } catch (error) {
            console.error("Fatal: Failed to load application config:", error);
            config.value = defaultAppConfig();
        } finally {
            isLoaded.value = true;
        }

        return config.value;
    }

    /**
     * Saves the configuration to the Tauri store.
     * @param newData - An optional object with partial config values to update.
     *                  If not provided, the current state will be saved.
     */
    async function save(newData?: PossiblyRef<Partial<AppConfig>>) {
        if (!config.value) {
            console.warn("Attempted to save config before it was loaded. Operation skipped.");
            return;
        }

        const updateData = unref(newData);

        if (updateData) {
            config.value = {
                ...config.value,
                ...updateData,
            };
        }

        try {
            await fileStore.set(STORE_KEY, config.value);
            await fileStore.save();
        } catch (error) {
            console.error("Failed to save application config:", error);
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
    };
}