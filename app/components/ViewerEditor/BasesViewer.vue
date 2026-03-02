<script setup lang="ts">
import type {InternalLink, InternalLinkClickDetail} from "#codemirror-rich-obsidian-editor/editor-types";
import {type BaseSource, createBase, createReactiveBaseFromYAML, useBase} from "@type32/obsidian-bases-parser";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import type {YamlFormData} from "@type32/yaml-editor-form";
import {useActiveFileTreeMemo} from "~/composables/active/memoization/useActiveFileTreeMemo";
import {useFileIO} from "~/composables/io/useFileIO";
import type {ArrayOrNested, DropdownMenuItem} from "@nuxt/ui";
import type {TableColumn} from '@nuxt/ui'
import {h, resolveComponent} from 'vue'
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {toLargestFileSizeUnit} from "#shared/utils/fs/filestats";
import {upperFirst} from 'scule'


const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const UScrollArea = resolveComponent('UScrollArea')

const editorInstance = defineModel('editorInstance')
const fileName = defineModel<string>('fileName')
const content = defineModel<string>({default: ''})
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
        const memo = $ftMemo.getFromLabel(`${file.fileName}${file.uuid.slice(0, 4)}`)
        const sourceEntry: BaseSource<YamlFormData> = {
            data: file.properties,
            id: file.uuid,
            name: memo.unextName,
            basename: memo.name,
            path: file.relativePath,
            folder: $fio.getParentDirectorySync(file.relativePath),
            ext: memo.ext,
            ctime: file.createdTime,
            mtime: file.modifiedTime,
            tags: file.properties.tags,
            backlinks: file.backlinks,
            properties: file.properties,
            size: file.size,
            links: file.forelinks
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
            id: 'file.name',
            accessorKey: 'name',
            header: 'File Name',
            cell: ({row}) => h(UButton, {
                variant: 'link',
                class: 'cursor-pointer',
                label: row.getValue<string>('file.name'),
                async onClick() {
                    await $navi.toWorkspaceTab(unref($session)?.uuid, $tab.openTab(row.getValue<string>('id')))
                }
            })
        },
        {
            id: 'file.ctime',
            accessorKey: 'ctime',
            header: 'Created Time',
            cell: ({row}) => {
                return new Date(row.getValue('file.ctime')).toLocaleString('en-US', {
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
            id: 'file.mtime',
            accessorKey: 'mtime',
            header: 'Last Modified Time',
            cell: ({row}) => {
                return new Date(row.getValue('file.mtime')).toLocaleString('en-US', {
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
            id: 'file.size',
            accessorKey: 'size',
            header: 'File Size',
            cell: ({row}) => toLargestFileSizeUnit(row.getValue<number>('file.size'))
        },
        {
            id: 'file.basename',
            accessorKey: 'basename',
            header: 'File Base Name',
            cell: ({row}) => row.getValue<string>('file.basename')
        },
        {
            id: 'file.path',
            accessorKey: 'path',
            header: 'File Relative Path',
            cell: ({row}) => row.getValue<string>('file.path')
        },
        {
            id: 'file.folder',
            accessorKey: 'folder',
            header: 'File Parent Folder',
            cell: ({row}) => row.getValue<string>('file.folder')
        },
        {
            id: 'file.ext',
            accessorKey: 'ext',
            header: 'File Extension',
            cell: ({row}) => h(UBadge, {
                label: `.${row.getValue<string>('file.ext')}`,
                variant: 'soft',
                color: 'neutral'
            })
        },
        {
            id: 'file.links',
            accessorKey: 'links',
            header: 'Forelinks',
            cell: ({row}) => h('div', { class: 'relative max-w-96' }, [
                h('div', {class: 'absolute left-0 top-0 bottom-0 h-full w-4 pointer-events-none bg-linear-to-r to-default/0 from-default z-10'}),
                h(UScrollArea, {orientation: 'horizontal', class: 'no-scrollbar max-w-96 w-full px-2'}, [
                    h('div', {class: 'flex gap-1.5 items-center w-fit'}, [
                        row.getValue<string[]>('file.links').map((v) => h(UBadge, {
                            label: `${getFileByUuid(v)?.fileName}`,
                            variant: 'soft',
                            class: 'cursor-pointer',
                            async onClick() {
                                await $navi.toWorkspaceTab(unref($session)?.uuid, $tab.openTab(v))
                            }
                        }))
                    ]),
                ]),
                h('div', {class: 'absolute right-0 top-0 bottom-0 h-full w-4 pointer-events-none bg-linear-to-r from-default/0 to-default'}),
            ])
        },
        {
            id: 'file.backlinks',
            accessorKey: 'backlinks',
            header: 'Backlinks',
            cell: ({row}) => h('div', { class: 'relative max-w-96' }, [
                h('div', {class: 'absolute left-0 top-0 bottom-0 h-full w-4 pointer-events-none bg-linear-to-r to-default/0 from-default z-10'}),
                h(UScrollArea, {orientation: 'horizontal', class: 'no-scrollbar max-w-96 w-full px-2'}, [
                    h('div', {class: 'flex gap-1.5 items-center w-fit'}, [
                        row.getValue<string[]>('file.backlinks').map((v) => h(UBadge, {
                            label: `${getFileByUuid(v)?.fileName}`,
                            variant: 'soft',
                            class: 'cursor-pointer',
                            async onClick() {
                                await $navi.toWorkspaceTab(unref($session)?.uuid, $tab.openTab(v))
                            }
                        }))
                    ]),
                ]),
                h('div', {class: 'absolute right-0 top-0 bottom-0 h-full w-4 pointer-events-none bg-linear-to-r from-default/0 to-default z-10'}),
            ])
        },
        {
            accessorKey: 'tags',
            header: 'Tags',
            cell: ({row}) => h('div', { class: 'relative max-w-96' }, [
                h('div', {class: 'absolute left-0 top-0 bottom-0 h-full w-4 pointer-events-none bg-linear-to-r to-default/0 from-default z-10'}),
                h(UScrollArea, {orientation: 'horizontal', class: 'no-scrollbar max-w-96 w-full px-2'}, [
                    h('div', {class: 'flex gap-1.5 items-center w-fit'}, [
                        row.getValue<string[]>('tags').map((v) => h(UBadge, {
                            label: `${v}`,
                            variant: 'subtle',
                        }))
                    ]),
                ]),
                h('div', {class: 'absolute right-0 top-0 bottom-0 h-full w-4 pointer-events-none bg-linear-to-r from-default/0 to-default z-10'}),
            ])
        }
    ]

    return originals
}

function getIconFromBaseType(baseType: string) {
    switch (baseType) {
        case 'list':
            return 'i-lucide-rows-3';
        case 'table':
            return 'i-lucide-sheet';
        case 'cards':
            return 'i-lucide-layout-grid';
        case 'map':
            return 'i-lucide-map'
    }
}

function setBaseColumnVisibility(columnId: string, visible: boolean) {
    if (columnId !== 'id') {
        if (visible)
            $base.addViewOrder(unref(activeView), columnId)
        else
            $base.removeViewOrder(unref(activeView), columnId)
    }
}

function applyAllColumnsVisibilityFromBaseConfig() {
    console.log($base.getView(unref(activeView))?.order)
    unref(table)?.tableApi?.getAllColumns()
        .filter((column) => column.getCanHide())
        .forEach((column) => {
            const exists = $base.getView(unref(activeView))?.order?.includes(column.id)
            unref(table)?.tableApi?.getColumn(column.id)?.toggleVisibility(exists)
        })
}

function setAllColumnsVisibility(visible: boolean) {
    unref(table)?.tableApi?.getAllColumns()
        .filter((column) => column.getCanHide())
        .forEach((column) => {
            setBaseColumnVisibility(column.id, visible)
            unref(table)?.tableApi?.getColumn(column.id)?.toggleVisibility(visible)
        })
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
const columnsDropdownItems = computed<DropdownMenuItem[][]>(() => {
    let cols: DropdownMenuItem[] = unref(table)?.tableApi?.getAllColumns()
        .filter((column) => column.getCanHide())
        .map((column) => ({
            label: column?.columnDef?.header?.toString() || column.id || '',
            type: 'checkbox' as const,
            checked: column.getIsVisible(),
            onUpdateChecked(checked: boolean) {
                setBaseColumnVisibility(column.id, checked)
                unref(table)?.tableApi?.getColumn(column.id)?.toggleVisibility(!!checked)
            },
            onSelect(e: Event) {
                e.preventDefault()
            }
        } satisfies DropdownMenuItem)) || []
    return [cols,
        [
            {
                label: 'Hide all',
                icon: 'i-lucide-eye-off',
                onSelect(e) {
                    setAllColumnsVisibility(false)
                }
            },
            {
                label: 'Add formula',
                icon: 'i-lucide-square-function',
                onSelect(e) {

                }
            }
        ]
    ]
})

onMounted(async () => {
    await until($session).toMatch(v => !!v)

    if (!unref(activeView) || unref(activeView) == '')
        activeView.value = unref($base.viewNames)[0] || ''

    $base.setSource(propogateFileIndexToSourceArray())
    // console.log(unref($base.source))
    // console.log(JSON.stringify(propogateFileIndexToSourceArray()))

    applyAllColumnsVisibilityFromBaseConfig()

    // console.log(unref(activeView))
    // console.log(unref($base.query.getViewResults(unref(activeView))))
    // console.log(unref($base.views))
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
            <div
                class="w-full flex flex-col flex-1 h-full pb-10"
                :style="{maxHeight: 'calc(100vh - var(--ui-header-height) - 0.0rem)'}"
            >
                <div class="w-full">
                    <div class="w-full flex items-center justify-center p-1 px-2">
                        <UDropdownMenu
                            :items="baseViewsItems"
                            size="sm"
                        >
                            <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-layout-dashboard" label="Views"/>
                        </UDropdownMenu>
                        <div class="grow"/>
                        <UDropdownMenu
                            :items="columnsDropdownItems"
                            :content="{ align: 'end' }"
                        >
                            <UButton
                                size="sm"
                                label="Properties"
                                icon="i-lucide-table-properties"
                                color="neutral"
                                variant="ghost"
                            />
                        </UDropdownMenu>
                    </div>
                </div>
                <UTable
                    :columns="columns"
                    ref="table"
                    sticky
                    :data="currentViewResults"
                    class="flex-1"
                    :ui="{
                        thead: 'backdrop-blur-xs bg-linear-to-t from-default/0 to-default',
                        td: 'py-1',
                        th: 'py-2'
                    }"
                />
            </div>
        </template>
    </ViewerEditorLayoutWrapper>
</template>

<style scoped>

</style>