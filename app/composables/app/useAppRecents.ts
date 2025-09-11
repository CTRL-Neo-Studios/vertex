import {Store, LazyStore} from "@tauri-apps/plugin-store";
import type {AppRecents, RecentRecord} from "#shared/types/app/recents";
import {exists} from "@tauri-apps/plugin-fs";
import {defaultAppRecents} from "#shared/utils/defaults/apps";

export function useAppRecents() {
    const $keywords = {
        "recents.data": "recents",
        "recents.fileName": "recents_directories.json"
    }
    const recents = useState<AppRecents | null>('recents.data', () => null)

    const recentsStore = new LazyStore($keywords['recents.fileName']);

    async function load() {
        await recentsStore.init();
        const data = await recentsStore.get<AppRecents>($keywords["recents.data"]);

        recents.value = defaultAppRecents(data);

        if (!data) {
            await recentsStore.set($keywords["recents.data"], unref(recents));
            await recentsStore.save();
        }

        // TODO Uncomment this after testing
        // await validate();
        return recents.value;
    }

    async function save() {
        if (!recents.value)
            return;

        // 💡 Save raw current state — DO NOT re-normalize with defaultAppRecents()
        await recentsStore.set($keywords["recents.data"], unref(recents));
        await recentsStore.save();
    }

    async function addRecord(record: RecentRecord) {
        if (!unref(recents)) {
            console.warn("Recents not loaded. Call load() first.");
            return;
        }
        unref(recents)?.recentRecords.push(record);
        await save();
    }

    async function removeRecord(fullPath: string) {
        if (recents.value) {
            recents.value.recentRecords = recents.value.recentRecords.filter(
                (i) => i.fullPath !== fullPath
            );
            await save();
        }
    }

    async function validate() {
        if (!recents.value) return;

        const validRecords = [];
        for (const record of recents.value.recentRecords) {
            if (await exists(record.fullPath)) {
                validRecords.push(record);
            }
        }

        if (validRecords.length !== recents.value.recentRecords.length) {
            recents.value.recentRecords = validRecords;
            await save();
        }
    }

    return {
        load,
        save,
        addRecord,
        removeRecord,
        validate,
        recents
    }
}