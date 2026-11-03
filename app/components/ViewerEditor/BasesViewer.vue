<script setup lang="ts">
import type {
	InternalLink,
	InternalLinkClickDetail,
	InternalLinkNode
} from "#codemirror-rich-obsidian-editor/editor-types";
import {type BaseSource, type SortConfig, useBase} from "@type32/obsidian-bases-parser";
import {getInternalLinks} from "#shared/utils/index/rewriteLinks";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import type {YamlFormData} from "@type32/yaml-editor-form";
import type {DropdownMenuItem,TableColumn} from "@nuxt/ui";
import {h, resolveComponent, type VNode} from 'vue'
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {toLargestFileSizeUnit} from "#shared/utils/fs/filestats";
import type { Column, SortingState } from '@tanstack/vue-table'
import NewBaseViewModal from "~/components/Modals/Bases/NewBaseViewModal.vue";
import {fileNameFromPath, getFileExtensionFromPath, isImage} from "#shared/utils/fs/filenames";
import {parentPathOf} from "#shared/utils/index/parse";
import {EditorProseEmbedImageDisplay} from "#components";
import {convertFileSrc} from "@tauri-apps/api/core";

const {t} = useI18n()
const $ovl = useOverlay()
const loadingData = ref(false)

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const UScrollArea = resolveComponent('UScrollArea')
const UDropdownMenu = resolveComponent('UDropdownMenu')
const UPopover = resolveComponent('UPopover')
const UTooltip = resolveComponent('UTooltip')
const ModalNewBaseView = $ovl.create(NewBaseViewModal)

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
const {
    getFileByUuid,
    fileIndex,
} = useActiveWorkspaceIndex(unref($session))
const $tab = useActiveTabs(unref($session))
const $navi = useAppNavigator()

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
                    label: t('app.editor.ui.bases.sortAscending'),
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
                    label: t('app.editor.ui.bases.sortDescending'),
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
                label: t('app.editor.ui.bases.clearSorting'),
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

type Row = BaseSource<YamlFormData>

/** Horizontally scrolling strip of badges with faded edges. */
function badgeStrip(badges: VNode[]) {
    return h('div', {class: 'relative max-w-96'}, [
        h('div', {class: 'absolute left-0 top-0 bottom-0 h-full w-4 pointer-events-none bg-linear-to-r to-default/0 from-default z-10'}),
        h(UScrollArea, {orientation: 'horizontal', class: 'no-scrollbar max-w-96 w-full px-2'}, {
            default: () => h('div', {class: 'flex gap-1.5 items-center w-fit'}, badges),
        }),
        h('div', {class: 'absolute right-0 top-0 bottom-0 h-full w-4 pointer-events-none bg-linear-to-r from-default/0 to-default z-10'}),
    ])
}

const getFileLinkBadgeList = (ids: string[]) => badgeStrip(ids.map(id => h(UBadge, {
    label: `${getFileByUuid(id)?.fileName}`,
    variant: 'soft',
    class: 'cursor-pointer',
    size: 'md',
    onClick: () => $navi.toWorkspaceTab(unref($session)?.uuid, $tab.openTab(id)),
})))

const getTagsBadgeList = (tags: string[]) => badgeStrip(tags.map(tag => h(UBadge, {label: `${tag}`, variant: 'subtle', size: 'md'})))

const formatTime = (value: unknown) => new Date(value as string).toLocaleString('en-US', {
    day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
})

/** A built-in column: `id` is the Bases property name, `labelKey` its i18n header. */
function fileColumn(id: string, accessorKey: keyof Row, labelKey: string, cell: (value: unknown, row: Row) => unknown): TableColumn<Row> {
    return {
        id,
        accessorKey,
        header: ({column}) => getHeader(column, t(labelKey)),
        cell: ({row}) => cell(row.getValue(id), row.original),
    } as TableColumn<Row>
}

function propogateFileIndexToSourceArray(): Row[] {
    return Object.values(unref(fileIndex)).filter(file => !file.isFolder).map(file => ({
        data: file.properties,
        id: file.uuid,
        name: fileNameFromPath(file.fileName, true),
        basename: file.fileName,
        path: file.relativePath,
        folder: parentPathOf(file.relativePath.replace(/\\/g, '/')) || '/',
        ext: getFileExtensionFromPath(file.fileName),
        ctime: file.createdTime,
        mtime: file.modifiedTime,
        tags: file.properties.tags,
        backlinks: file.backlinks,
        properties: file.properties,
        size: file.size,
        links: file.forelinks,
    }) satisfies Row)
}

function propogateDisplayDataColumns(): TableColumn<Row>[] {
    const cols = 'app.editor.ui.bases.columns'
    const originals: TableColumn<Row>[] = [
        {id: '#id', accessorKey: 'id', header: '#', cell: ({row}) => `#${row.getValue<string>('#id').slice(0, 4)}`},
        fileColumn('file.name', 'name', `${cols}.name`, (name, row) => h(UButton, {
            variant: 'link',
            class: 'cursor-pointer',
            label: name,
            size: 'sm',
            onClick: () => $navi.toWorkspaceTab(unref($session)?.uuid, $tab.openTab(row.id as string)),
        })),
        fileColumn('file.ctime', 'ctime', `${cols}.ctime`, formatTime),
        fileColumn('file.mtime', 'mtime', `${cols}.mtime`, formatTime),
        fileColumn('file.size', 'size', `${cols}.size`, size => toLargestFileSizeUnit(size as number)),
        fileColumn('file.basename', 'basename', `${cols}.basename`, v => v),
        fileColumn('file.path', 'path', `${cols}.path`, v => v),
        fileColumn('file.folder', 'folder', `${cols}.folder`, v => v),
        fileColumn('file.ext', 'ext', `${cols}.ext`, ext => h(UBadge, {label: `.${ext}`, variant: 'soft', color: 'neutral', size: 'md'})),
        fileColumn('file.links', 'links', 'app.editor.ui.forelinks', ids => getFileLinkBadgeList(ids as string[])),
        fileColumn('file.backlinks', 'backlinks', 'app.editor.ui.backlinks', ids => getFileLinkBadgeList(ids as string[])),
        fileColumn('tags', 'tags', `${cols}.tags`, tags => getTagsBadgeList((tags as string[] | undefined) ?? [])),
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
								default: () => h(UTooltip, { text: t('app.editor.ui.viewImage') }, () => h(UButton, { color: 'neutral', variant: 'ghost', size: 'xs', icon: 'i-lucide-image' })),
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

const BASE_TYPE_ICONS: Record<string, string> = {list: 'i-lucide-rows-3', table: 'i-lucide-sheet', cards: 'i-lucide-layout-grid', map: 'i-lucide-map'}
function getIconFromBaseType(baseType: string) {
    return BASE_TYPE_ICONS[baseType]
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

watch(activeView, loadColumnsVisibilityFromBase)

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
                label: t('app.editor.ui.bases.view'),
                icon: 'i-lucide-eye',
                onSelect() {
                    activeView.value = i.name
                }
            }], [{
                label: t('app.editor.ui.bases.remove'),
                icon: 'i-lucide-trash',
                color: 'error',
				onSelect() {
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
            label: t('app.editor.ui.bases.addView'),
            icon: 'i-lucide-grid-2x2-plus',
            async onSelect() {
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
    const cols: DropdownMenuItem[] = unref(table)?.tableApi?.getAllColumns()
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
                label: t('app.editor.ui.bases.hideAll'),
                icon: 'i-lucide-eye-off',
                onSelect() {
                    setAllColumnsVisibility(false)
                }
            },
            {
                label: t('app.editor.ui.bases.addFormula'),
                icon: 'i-lucide-square-function',
                disabled: true, // not implemented yet
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
})

const sorting = ref<SortingState>([])

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
                            <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-layout-dashboard" :label="$t('app.editor.ui.bases.views')">
                                <template #trailing>
                                    <UBadge :label="activeView" size="xs" variant="subtle" color="neutral"/>
                                </template>
                            </UButton>
                        </UDropdownMenu>
						<UInput
							v-model="searchTerm"
							icon="i-lucide-search"
							size="sm"
							:placeholder="$t('app.editor.ui.bases.search', {count: currentViewResults.length})"
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
                                :label="$t('app.generic.properties')"
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
