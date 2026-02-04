<script setup lang="ts">
import type {InternalLink, InternalLinkClickDetail} from "#codemirror-rich-obsidian-editor/editor-types";
import {type BaseSource, createBase, createReactiveBaseFromYAML, useBase} from "@type32/obsidian-bases-parser";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import type {YamlFormData} from "@type32/yaml-editor-form";
import {useActiveFileTreeMemo} from "~/composables/active/memoization/useActiveFileTreeMemo";
import {useFileIO} from "~/composables/io/useFileIO";
import type {DropdownMenuItem} from "@nuxt/ui";
import type { TableColumn } from '@nuxt/ui'
import { h, resolveComponent } from 'vue'
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useAppNavigator} from "~/composables/app/useAppNavigator";


const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

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
const $tab = useActiveTabs(unref($session))
const $navi = useAppNavigator()
const $fio = useFileIO()

function propogateFileIndexToSourceArray(): BaseSource<YamlFormData>[] {
    let source: BaseSource<YamlFormData>[] = []

    // Map fileIndex to BaseSource format
    for (const path in unref(fileIndex)) {
        const file = unref(fileIndex)[path]
        if (!file || file.isFolder) continue // Skip folders and invalid entries
        // console.log(file)
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

function propogateDisplayData(): TableColumn<BaseSource<YamlFormData>>[] {
    const originals: TableColumn<BaseSource<YamlFormData>>[] = [
        {
            accessorKey: 'id',
            header: '#',
            cell: ({row}) => `#${row.getValue<string>('id').slice(0, 4)}`
        },
        {
            accessorKey: 'name',
            header: 'File Name',
            cell: ({row}) => h(UButton, {
                variant: 'link',
                size: 'sm',
                block: true,
                class: 'justify-left cursor-pointer',
                async onClick() {
                    await $navi.toWorkspaceTab(unref($session)?.uuid, $tab.openTab(row.getValue<string>('id')))
                }
            })
        },
        {
            accessorKey: 'ctime',
            header: 'Created Time',
            cell: ({ row }) => {
                return new Date(row.getValue('ctime')).toLocaleString('en-US', {
                    day: 'numeric',
                    month: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    year: 'numeric',
                    hour12: false
                })
            }
        },
        {
            accessorKey: 'mtime',
            header: 'Last Modified Time',
            cell: ({ row }) => {
                return new Date(row.getValue('mtime')).toLocaleString('en-US', {
                    day: 'numeric',
                    month: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    year: 'numeric',
                    hour12: false
                })
            }
        },
        {
            accessorKey: 'size'
        }
    ]

    return originals
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

const table = useTemplateRef('table')
const currentViewResults = computed(() => unref($base.query.getViewResults(unref(activeView))).items)
const baseViewsItems = computed<DropdownMenuItem[][]>(() => [
    [
        ...unref($base.views).map(i => ({
            label: i.name,
            onSelect(e) {
                activeView.value = i.name
            },
            icon: getIconFromBaseType(i.type),
            checked: unref(activeView).includes(i.name),
            active: unref(activeView).includes(i.name)
        } satisfies DropdownMenuItem))
    ]
])
const columns = computed<TableColumn<BaseSource<YamlFormData>>[]>(() => propogateDisplayData())

onMounted(async () => {
    await until($session).toMatch(v => !!v)

    if (!unref(activeView) || unref(activeView) == '')
        activeView.value = unref($base.viewNames)[0] || ''

    $base.setSource(propogateFileIndexToSourceArray())
    // console.log(unref($base.source))
    // console.log(JSON.stringify(propogateFileIndexToSourceArray()))

    console.log(unref(activeView))
    console.log(unref($base.query.getViewResults(unref(activeView))))
    console.log(unref($base.views))
})

</script>

<template>
    <ViewerEditorLayoutWrapper
        scrollMode="none"
        v-model:fileName="fileName"
        @onRename="(oldValue: string, newValue: string) => emit('on-rename', oldValue, newValue)"
        :filePath="filePath"
        :renaming="renaming"
        :showStatusBar="false"
        :bottomSpacing="false"
    >
        <template #default>
            <div class="w-full flex flex-col flex-1 h-full pb-10" :style="{maxHeight: 'calc(100vh - var(--ui-header-height) - 0.0rem)'}">
                <div class="w-full">
                    <div class="w-full flex items-center justify-center p-1 px-2">
                        <UDropdownMenu
                            :items="baseViewsItems"
                            size="sm"
                        >
                            <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-layout-grid" label="Views"/>
                        </UDropdownMenu>
                        <div class="grow"/>
                    </div>
                </div>
                <UTable
                    ref="table"
                    sticky
                    :data="currentViewResults"
                    class="flex-1"
                    :ui="{
                        thead: 'backdrop-blur-xs bg-linear-to-t from-default/0 to-default'
                    }"
                />
            </div>
        </template>
    </ViewerEditorLayoutWrapper>
</template>

<style scoped>

</style>