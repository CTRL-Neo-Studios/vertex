<script setup lang="ts">
import type {
	InternalLink,
	InternalLinkClickDetail,
	InternalLinkNode
} from "#codemirror-rich-obsidian-editor/editor-types";
import {
    type BaseSource,
    createBase,
    createReactiveBaseFromYAML,
    type SortConfig,
    useBase
} from "@type32/obsidian-bases-parser";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import type {YamlFormData} from "@type32/yaml-editor-form";
import {useActiveFileTreeMemo} from "~/composables/active/memoization/useActiveFileTreeMemo";
import {useFileIO} from "~/composables/io/useFileIO";
import type {DropdownMenuItem} from "@nuxt/ui";
import type {TableColumn} from '@nuxt/ui'
import {h, resolveComponent} from 'vue'
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {toLargestFileSizeUnit} from "#shared/utils/fs/filestats";
import type { Column, SortingState } from '@tanstack/vue-table'
import NewBaseViewModal from "~/components/Modals/Bases/NewBaseViewModal.vue";
import {getFileExtensionFromPath, isImage} from "#shared/utils/fs/filenames";
import {EditorProseEmbedImageDisplay} from "#components";
import {convertFileSrc} from "@tauri-apps/api/core";

const $ovl = useOverlay()
const loadingData = ref(false)

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const UScrollArea = resolveComponent('UScrollArea')
const UDropdownMenu = resolveComponent('UDropdownMenu')
const UPopover = resolveComponent('UPopover')
const UTooltip = resolveComponent('UTooltip')
const ModalNewBaseView = $ovl.create(NewBaseViewModal)

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

function getHeader(column: Column<BaseSource<YamlFormData>>, label: string) {
    const isSorted = column.getIsSorted()

    return h(
        UDropdownMenu,
        {
            content: {
                align: 'start'
            },
            'aria-label': 'Actions dropdown',
            size: 'sm',
            items: [[
                {
                    label: 'Sort Ascending',
                    type: 'checkbox',
                    icon: 'i-lucide-arrow-up-narrow-wide',
                    checked: isSorted === 'asc',
                    onSelect: () => {
                        if (isSorted === 'asc') {
                            $base.removeViewSort(unref(activeView), column.id)
                            column.clearSorting()
                        } else {
                            $base.addViewSort(unref(activeView), column.id, 'ASC')
                            column.toggleSorting(false)
                        }
                    }
                },
                {
                    label: 'Sort Descending',
                    icon: 'i-lucide-arrow-down-wide-narrow',
                    type: 'checkbox',
                    checked: isSorted === 'desc',
                    onSelect: () => {
                        if (isSorted === 'desc') {
                            $base.removeViewSort(unref(activeView), column.id)
                            column.clearSorting()
                        } else {
                            $base.addViewSort(unref(activeView), column.id, 'DESC')
                            column.toggleSorting(true)
                        }
                    }
                }
            ], [{
                label: 'Clear Sorting',
                icon: 'i-lucide-trash',
                color: 'error',
                onSelect: () => {
                    $base.removeViewSort(unref(activeView), column.id)
                    column.clearSorting()
                }
            }]]
        },
        () =>
            h(UButton, {
                color: 'neutral',
                variant: 'ghost',
                label,
                size: 'sm',
                icon: isSorted
                    ? isSorted === 'asc'
                        ? 'i-lucide-arrow-up-narrow-wide'
                        : 'i-lucide-arrow-down-wide-narrow'
                    : 'i-lucide-arrow-up-down',
                class: '-mx-2.5 data-[state=open]:bg-elevated',
                'aria-label': `Sort by ${isSorted === 'asc' ? 'descending' : 'ascending'}`
            })
    )
}

function getFileLinkBadgeList(idList: string[]) {
    return h('div', { class: 'relative max-w-96' }, [
        h('div', {class: 'absolute left-0 top-0 bottom-0 h-full w-4 pointer-events-none bg-linear-to-r to-default/0 from-default z-10'}),
        h(UScrollArea, {orientation: 'horizontal', class: 'no-scrollbar max-w-96 w-full px-2'}, {
            default: () => h('div', {class: 'flex gap-1.5 items-center w-fit'}, [
                idList.map((v) => h(UBadge, {
                    label: `${getFileByUuid(v)?.fileName}`,
                    variant: 'soft',
                    class: 'cursor-pointer',
                    async onClick() {
                        await $navi.toWorkspaceTab(unref($session)?.uuid, $tab.openTab(v))
                    },
                    size: 'md'
                }))
            ])
        }),
        h('div', {class: 'absolute right-0 top-0 bottom-0 h-full w-4 pointer-events-none bg-linear-to-r from-default/0 to-default z-10'}),
    ])
}

function getTagsBadgeList(stringList: string[]) {
    return h('div', { class: 'relative max-w-96' }, [
        h('div', {class: 'absolute left-0 top-0 bottom-0 h-full w-4 pointer-events-none bg-linear-to-r to-default/0 from-default z-10'}),
        h(UScrollArea, {orientation: 'horizontal', class: 'no-scrollbar max-w-96 w-full px-2'}, {
            default: () => h('div', {class: 'flex gap-1.5 items-center w-fit'}, [
                stringList.map((v) => h(UBadge, {
                    label: `${v}`,
                    variant: 'subtle',
                    size: 'md'
                }))
            ])
        }),
        h('div', {class: 'absolute right-0 top-0 bottom-0 h-full w-4 pointer-events-none bg-linear-to-r from-default/0 to-default z-10'}),
    ])
}

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

function propogateDisplayDataColumns(): TableColumn<BaseSource<YamlFormData>>[] {
    const originals: TableColumn<BaseSource<YamlFormData>>[] = [
        {
            id: '#id',
            accessorKey: 'id',
            header: '#',
            cell: ({row}) => `#${row.getValue<string>('#id').slice(0, 4)}`
        },
        {
            id: 'file.name',
            accessorKey: 'name',
            header: ({ column }) => getHeader(column, 'File Name'),
            cell: ({row}) => h(UButton, {
                variant: 'link',
                class: 'cursor-pointer',
                label: row.getValue<string>('file.name'),
                async onClick() {
                    await $navi.toWorkspaceTab(unref($session)?.uuid, $tab.openTab(row.getValue<string>('#id')))
                },
                size: 'sm'
            })
        },
        {
            id: 'file.ctime',
            accessorKey: 'ctime',
            header: ({ column }) => getHeader(column, 'Created Time'),
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
            header: ({ column }) => getHeader(column, 'Last Modified Time'),
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
            header: ({ column }) => getHeader(column, 'File Size'),
            cell: ({row}) => toLargestFileSizeUnit(row.getValue<number>('file.size'))
        },
        {
            id: 'file.basename',
            accessorKey: 'basename',
            header: ({ column }) => getHeader(column, 'File Base Name'),
            cell: ({row}) => row.getValue<string>('file.basename')
        },
        {
            id: 'file.path',
            accessorKey: 'path',
            header: ({ column }) => getHeader(column, 'File Relative Path'),
            cell: ({row}) => row.getValue<string>('file.path')
        },
        {
            id: 'file.folder',
            accessorKey: 'folder',
            header: ({ column }) => getHeader(column, 'File Parent Folder'),
            cell: ({row}) => row.getValue<string>('file.folder')
        },
        {
            id: 'file.ext',
            accessorKey: 'ext',
            header: ({ column }) => getHeader(column, 'File Extension'),
            cell: ({row}) => h(UBadge, {
                label: `.${row.getValue<string>('file.ext')}`,
                variant: 'soft',
                color: 'neutral',
                size: 'md'
            })
        },
        {
            id: 'file.links',
            accessorKey: 'links',
            header: ({ column }) => getHeader(column, 'Forelinks'),
            cell: ({row}) => getFileLinkBadgeList(row.getValue<string[]>('file.links'))
        },
        {
            id: 'file.backlinks',
            accessorKey: 'backlinks',
            header: ({ column }) => getHeader(column, 'Backlinks'),
            cell: ({row}) => getFileLinkBadgeList(row.getValue<string[]>('file.backlinks'))
        },
        {
            id: 'tags',
            accessorKey: 'tags',
            header: ({ column }) => getHeader(column, 'Tags'),
            cell: ({row}) => getTagsBadgeList(row.getValue<string[]>('tags'))
        }
    ]

    const columnIds = originals.map(v => v.id).filter(i => i != undefined)
    const datas = unref(currentViewResults).map(i => i.data).filter(i => i != undefined)
	const columnMap = new Map<string, string>()
	datas.forEach((value) => {
		Object.keys(value).forEach((key) => {
			if (!columnMap.has(key)) {
				const val = value[key]

				if (Array.isArray(val)) {
					const itemType = val.length > 0 ? typeof val[0] : 'unknown'
					columnMap.set(key, `array[${itemType}]`)
				} else if (val instanceof Date) {
					columnMap.set(key, 'date')
				} else if (val === null || val === undefined) {
					columnMap.set(key, 'null')
				} else {
					columnMap.set(key, typeof val)
				}
			}
		})
	})

	const propCols: TableColumn<BaseSource<YamlFormData>>[] = columnMap.keys().toArray().map((key) => {
		const keyType = columnMap.get(key)
		if (!keyType || columnIds.includes(key)) return;
		let flag = true

		const col: TableColumn<BaseSource<YamlFormData>> = {
			accessorFn: (originalRow) => originalRow.properties || originalRow.data,
			id: key,
			header: ({column}) => getHeader(column, key),
			cell: ({row}) => {
				const rowVal = (row.getValue(key) as any)
				if (!rowVal[key]) {
					flag = false
					return
				}

				if (keyType === 'array[string]') {
					return getTagsBadgeList(rowVal[key] as string[])
				} else if (keyType === 'array[object]' || keyType === 'object') {
					return JSON.stringify(rowVal[key])
				} else if (keyType === 'string') {
					const links = getInternalLinks(rowVal[key] as string)
					if (links.length <= 0) return;
					else if (links.length == 1) {
						const [link]: InternalLinkNode[] = links
						if (!link) return;
						const internalLink = props.internalLinkList.find(value => value.filePath?.endsWith(link.path))
						if (!internalLink) return;
						if (isImage(getFileExtensionFromPath(`${internalLink.filePath}`)))
							return h(UPopover, {}, {
								default: () => h(UTooltip, { text: 'Click to view Image' }, () => h(UButton, { color: 'neutral', variant: 'ghost', size: 'xs', icon: 'i-lucide-image' })),
								content: () => h(EditorProseEmbedImageDisplay, { srcPath: convertFileSrc(`${getFileByUuid(internalLink.referenceId)?.fullPath}`), display: internalLink.name })
							})
						else
							return h(UButton, {
								variant: 'link',
								class: 'cursor-pointer',
								label: internalLink.name,
								async onClick() {
									await $navi.toWorkspaceTab(unref($session)?.uuid, $tab.openTab(internalLink.referenceId))
								},
								size: 'sm'
							})
					} else {
						const [link]: InternalLinkNode[] = links
						if (!link) return;
						const internalLinkIds = props.internalLinkList.filter(value => value.filePath?.endsWith(link.path)).map(value => value.referenceId)
						return getFileLinkBadgeList(internalLinkIds)
					}
				} else {
					return rowVal[key]
				}
			}
		} satisfies TableColumn<BaseSource<YamlFormData>>

		if (!flag) return;
		return col
	}).filter((value) => value != undefined)

	originals.push(...propCols)

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

function loadColumnsVisibilityFromBase() {
	console.log('load cols visibility from base')
    unref(columns).forEach((column) => {
		const exists = ($base.getView(unref(activeView))?.order || [])?.includes(`${column.id}`)
		unref(table)?.tableApi?.getColumn(`${column.id}`)?.toggleVisibility(exists)
	})
}

function loadColumnsSortingFromBase() {
    $base.getView(unref(activeView))?.sort?.forEach((i: SortConfig) => {
        sorting.value.push({
            id: i.property,
            desc: i.direction === "DESC"
        })
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

watch(activeView, (newValue) => {
	loadingData.value = true
	propogateDisplayDataColumns()
	loadColumnsVisibilityFromBase()
	loadingData.value = false
})

const searchTerm = ref('')
const table = useTemplateRef('table')
const currentViewResults = computed(() => unref($base.query.getViewResults(unref(activeView))).items)
const baseViewsItems = computed<DropdownMenuItem[][]>(() => [
    [
        ...unref($base.views).map(i => ({
            label: i.name,
            icon: getIconFromBaseType(i.type),
            checked: unref(activeView).includes(i.name),
            active: unref(activeView).includes(i.name),
            slot: 'view' as const,
            children: [[{
                label: 'View',
                icon: 'i-lucide-eye',
                onSelect(e) {
                    activeView.value = i.name
                }
            }], [{
                label: 'Remove',
                icon: 'i-lucide-trash',
                color: 'error',
				onSelect(e) {
					if (unref($base.viewNames).length <= 1) return;
					const baseName = i.name
					$base.removeView(baseName)
					if (baseName === unref(activeView))
						activeView.value = unref($base.viewNames)[0] || ''
				},
				disabled: unref($base.viewNames).length <= 1
            }]]
        } satisfies DropdownMenuItem))
    ],
    [
        {
            label: 'Add View',
            icon: 'i-lucide-grid-2x2-plus',
            async onSelect(e) {
                const view = await ModalNewBaseView.open()
                if (view) {
                    $base.addView(view)
					if (view?.name) {
						$base.addViewOrder(view.name, 'file.name')
						activeView.value = view.name
					}
                }
            }
        }
    ]
])
const columns = computed<TableColumn<BaseSource<YamlFormData>>[]>(() => propogateDisplayDataColumns())
const columnsDropdownItems = computed<DropdownMenuItem[][]>(() => {
    let cols: DropdownMenuItem[] = unref(table)?.tableApi?.getAllColumns()
        .filter((column) => column.getCanHide() && column.id != '#id')
        .map((column) => ({
            label: column.id || '',
            type: 'checkbox' as const,
            checked: column.getIsVisible(),
            onUpdateChecked(checked: boolean) {
                setBaseColumnVisibility(column.id, checked)
                unref(table)?.tableApi?.getColumn(column.id)?.toggleVisibility(checked)
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
	loadingData.value = true
    await until($session).toMatch(v => !!v)

    if (!unref(activeView) || unref(activeView) == '')
        activeView.value = unref($base.viewNames)[0] || ''

    $base.setSource(unref(baseSource))
    // console.log(unref($base.source))
    // console.log(JSON.stringify(propogateFileIndexToSourceArray()))

	// Note on this part: for some weird reason, the `columns` field of the UTable tends to fetch the static columns first, which were the
	// `originals` in the propogate columns function. Then, as the data is "gradually fetched" (which isn't but UTable or the Tanstack Table somehow thinks it is),
	// the columns would THEN propogate to its full form. I absolutely despise Tanstack Tables for making such an appaling
	// fucking table framework with weird as fuck APIs and hard to understand documentations that gives me a fucking headache
	// instead of the functions that I want to work with.
	//
	// Because of this 'delayed' column propogation perceived by the Tanstack table, I have to manually wait for the table to load all the columns
	// in its first phrase of fetching the static cols and the phrase of fetching & processing the dynamic cols and then have it put into the damn table.
	// God I hate it when frameworks work in weird and unexpected ways.
	await until(table).toMatch(v => !!v)
	await until(() => unref(table)?.tableApi?.getAllColumns().length).toMatch(v => v === unref(columns).length)

	loadingData.value = false
    loadColumnsVisibilityFromBase()
    loadColumnsSortingFromBase()

    // console.log(unref(activeView))
    // console.log(unref($base.query.getViewResults(unref(activeView))))
    // console.log(unref($base.views))
})

const sorting = ref<SortingState>([])
const filters = ref([])

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
                            <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-layout-dashboard" label="Views">
                                <template #trailing>
                                    <UBadge :label="activeView" size="xs" variant="subtle" color="neutral"/>
                                </template>
                            </UButton>
                        </UDropdownMenu>
						<UInput
							v-model="searchTerm"
							icon="i-lucide-search"
							size="sm"
							:placeholder="`Search in ${currentViewResults.length} Results...`"
							:ui="{ trailing: 'pr-0.5' }"
							variant="ghost"
						>
							<template #trailing v-if="searchTerm != ''">
								<UButton size="sm" variant="link" @click="searchTerm = ''" color="neutral" icon="i-lucide-x"/>
							</template>
						</UInput>
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
					v-if="!loadingData"
                    v-model:sorting="sorting"
                    :columns="columns"
                    ref="table"
                    sticky
                    :data="currentViewResults"
                    class="flex-1"
					v-model:global-filter="searchTerm"
                    :ui="{
                        thead: 'backdrop-blur-xs bg-linear-to-t from-transparent to-default',
                        td: 'py-1',
                        th: 'py-2 pt-0 text-xs',
                    }"
                />
            </div>
        </template>
    </ViewerEditorLayoutWrapper>
</template>

<style scoped>

</style>
