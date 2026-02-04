<script setup lang="ts">
import type {InternalLink, InternalLinkClickDetail} from "#codemirror-rich-obsidian-editor/editor-types";
import {type BaseSource, createBase, createReactiveBaseFromYAML, useBase} from "@type32/obsidian-bases-parser";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import type {YamlFormData} from "@type32/yaml-editor-form";
import {useActiveFileTreeMemo} from "~/composables/active/memoization/useActiveFileTreeMemo";
import {useFileIO} from "~/composables/io/useFileIO";
import type {DropdownMenuItem} from "@nuxt/ui";

const editorInstance = defineModel('editorInstance')
const fileName = defineModel<string>('fileName')
const content = defineModel<string>({ default: '' })
const contentSaved = defineModel<boolean>('contentSaved', {default: false})
const activeView = defineModel<string>('activeView', {required: false, default: ''})

const props = withDefaults(defineProps<{
    internalLinkList: InternalLink[],
    renaming: boolean,
    filePath?: string,
    sessionId: string,
    disabled?: boolean
}>(), {
    renaming: false,
    filePath: '',
    disabled: false
})

const emit = defineEmits<{
    (e: 'on-rename', oldValue: string, newValue: string): void
    (e: 'on-clicked-internal-link', detail: InternalLinkClickDetail): void
}>()

const $session = computed(() => $sesh.getSession(props.sessionId))
const $sesh = useActiveSessions()
const $ftMemo = useActiveFileTreeMemo(unref($session))
const {
    getFileByUuid,
    fileIndex,
} = useActiveWorkspaceIndex(unref($session))
const $fio = useFileIO()

function propogateFileIndexToSourceArray(): BaseSource<YamlFormData>[] {
    let source: BaseSource<YamlFormData>[] = []

    // Map fileIndex to BaseSource format
    for (const path in unref(fileIndex)) {
        const file = unref(fileIndex)[path]
        if (!file || file.isFolder) continue // Skip folders and invalid entries
        console.log(file)
        // Use file UUID as the key and properties as the value
        const memo = $ftMemo.getFromLabel(`${file.fileName}${file.uuid.slice(0,4)}`)
        const sourceEntry: BaseSource<YamlFormData> = {
            data: file.properties,
            id: file.uuid,
            name: memo.unextName,
            basename: memo.name,
            path: file.relativePath,
            folder: $fio.getParentDirectorySync(file.fullPath),
            ext: memo.ext,
            ctime: file.createdTime,
            mtime: file.modifiedTime,
            tags: file.properties.tags,
            backlinks: file.forelinks,
            properties: file.properties
            //TODO: Require rest of the fields' impl.
        } satisfies YamlFormData
        source.push(sourceEntry)
    }

    return source
}

function getIconFromBaseType(baseType: string) {
    switch(baseType) {
        case 'list':
            return 'i-lucide-list';
        case 'table':
            return 'i-lucide-rows-3';
        case 'cards':
            return 'i-lucide-gallery-vertical-end';
        case 'map':
            return 'i-lucide-map'
    }
}

const baseSource = computed<BaseSource<YamlFormData>[]>(() => propogateFileIndexToSourceArray())
const $base = useBase({
    base: unref(content),
    source: unref(baseSource),
    trackChanges: true,
})

watch($base.hasChanges, (newValue) => {
    if (newValue)
        content.value = $base.save()
})

const currentViewResults = computed(() => unref($base.query.getViewResults(unref(activeView))).items)
const baseViewsItems = computed<DropdownMenuItem[][]>(() => [
    [
        ...unref($base.views).map(i => ({
            label: i.name,
            onSelect(e) {
                activeView.value = i.name
            },
            icon: getIconFromBaseType(i.type)
        } satisfies DropdownMenuItem))
    ]
])

onMounted(async () => {
    await until($session).toMatch(v => !!v)

    if (!unref(activeView) || unref(activeView) == '')
        activeView.value = unref($base.viewNames)[0] || ''

    $base.setSource(propogateFileIndexToSourceArray())
    console.log(unref($base.source))
    // console.log(JSON.stringify(propogateFileIndexToSourceArray()))

    console.log(unref(activeView))
    console.log(unref($base.query.getViewResults(unref(activeView))))
    console.log(unref($base.views))
})

</script>

<template>
    <ViewerEditorLayoutWrapper
        scrollMode="both"
        v-model:fileName="fileName"
        @onRename="(oldValue: string, newValue: string) => emit('on-rename', oldValue, newValue)"
        :filePath="filePath"
        :renaming="renaming"
        :showStatusBar="false"
    >
        <template #default>
            <div class="w-full h-full flex flex-col">
                <div class="top-0 left-0 right-0 w-full sticky">
                    <div class="w-full flex items-center justify-center p-1">
                        <UDropdownMenu
                            :items="baseViewsItems"
                            size="sm"
                        >
                            <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-layout-grid" label="Views"/>
                        </UDropdownMenu>
                        <div class="grow"/>
                    </div>
                </div>
                <div class="flex-1">
                    <UTable :data="currentViewResults"/>
                </div>
            </div>
        </template>
    </ViewerEditorLayoutWrapper>
</template>

<style scoped>

</style>