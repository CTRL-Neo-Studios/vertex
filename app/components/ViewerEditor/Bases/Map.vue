<script setup lang="ts">
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import type {ContextMenuItem} from "@nuxt/ui";
import {writeText} from "@tauri-apps/plugin-clipboard-manager";
import {RowScope, setViewOption, toText} from "@type32/obsidian-bases-parser";
import type {GeoJSONSource, Map as MapLibre, MapLayerMouseEvent, Popup} from "maplibre-gl";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {bareId, useBaseContext} from "~/composables/bases/useBaseContext";
import {latLng, mapStyle, pointText} from "~/utils/basesMap";
import {afterOverlaysClose} from "~/utils/overlays";

/**
 * Obsidian's map layout (its Maps plugin) on MapLibre: OpenFreeMap tiles unless `mapTiles`/`mapTilesDark` say
 * otherwise, a marker per row whose `coordinates` property is a point, drawn as Obsidian draws them (`markerColor`, the
 * accent by default; a white `markerIcon` from Lucide, or a dot). Hovering a marker shows its note's properties;
 * clicking opens it. Opened without `defaultZoom`, the map fits its markers (`center` then only counts without
 * markers); with it, the camera is `center` (else the markers' middle) at that zoom. Right click: New note there, Copy
 * coordinates, Set default center point, Set default zoom.
 */
const {t} = useI18n()
const ctx = useBaseContext()
const $cm = useColorMode()
const {getFileByPath} = useActiveWorkspaceIndex(ctx.session)
const {openTab} = useActiveTabs(ctx.session)
const $navi = useAppNavigator()

const view = computed(() => ctx.view.value)
const text = (key: string) => (typeof view.value[key] === 'string' && view.value[key] ? view.value[key] as string : null)
const number = (key: string) => (typeof view.value[key] === 'number' ? view.value[key] as number : null)
const coordinatesId = computed(() => text('coordinates'))
const style = computed(() => mapStyle(view.value.mapTiles, view.value.mapTilesDark, $cm.value === 'dark'))

/** `center`, a formula evaluated with `this` as filters see it. */
const center = computed(() => {
    const formula = text('center')
    if (!formula) return null
    const context = {host: ctx.host, now: Date.now(), thisPath: ctx.thisPath, formulas: ctx.base.value.formulas ?? {}}
    return latLng(new RowScope(context, ctx.thisPath).evaluate(formula))
})

interface Marker { row: RowScope, at: [number, number], image: string, icon: string | null, color: string | null }
const markers = computed((): Marker[] => {
    const id = coordinatesId.value
    if (!id) return []
    const optional = (key: string, row: RowScope) => {
        const property = text(key)
        const value = property ? row.property(property) : null
        return value && value.type !== 'Null' ? toText(value).trim() || null : null
    }
    return ctx.result.value.rows.flatMap((row) => {
        const at = latLng(row.property(id))
        if (!at) return []
        const icon = optional('markerIcon', row)?.replace(/^lucide-/, '') ?? null, color = optional('markerColor', row)
        return [{row, at, icon, color, image: `marker-${icon ?? 'dot'}-${color ?? 'accent'}`}]
    })
})

// Marker images: 192 px, shown at 0.12–0.24 of that by zoom, as Obsidian draws them.
interface IconSet { icons: Record<string, { body: string }>, aliases?: Record<string, { parent: string }> }
let lucide: Promise<IconSet> | null = null
async function iconImage(name: string): Promise<HTMLImageElement | null> {
    const set = await (lucide ??= import("@iconify-json/lucide/icons.json").then(module => module.default as IconSet))
    const icon = set.icons[name] ?? set.icons[set.aliases?.[name]?.parent ?? '']
    if (!icon) return null
    const image = new Image()
    image.src = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" color="white">${icon.body}</svg>`)}`
    await image.decode()
    return image
}
function cssColor(color: string | null) {
    const probe = document.createElement('div')
    probe.style.color = color && CSS.supports('color', color) ? color : 'var(--ui-primary)'
    el.value!.append(probe)
    const resolved = getComputedStyle(probe).color
    probe.remove()
    return resolved
}
const images = new Map<string, ImageData>()
async function drawMarker(marker: Marker) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 192
    const pen = canvas.getContext('2d')!
    pen.beginPath()
    pen.arc(96, 96, 48, 0, Math.PI * 2)
    pen.fillStyle = cssColor(marker.color)
    pen.fill()
    pen.lineWidth = 4
    pen.strokeStyle = 'rgba(255, 255, 255, 0.3)'
    pen.stroke()
    const icon = marker.icon ? await iconImage(marker.icon) : null
    if (icon) pen.drawImage(icon, 64, 64, 64, 64)
    else {
        pen.beginPath()
        pen.arc(96, 96, 16, 0, Math.PI * 2)
        pen.fillStyle = 'white'
        pen.fill()
    }
    return pen.getImageData(0, 0, 192, 192)
}

const el = useTemplateRef<HTMLDivElement>('el')
let map: MapLibre | null = null
let maplibre: typeof import("maplibre-gl") | null = null
let shown: Marker[] = []
const geojson = () => ({
    type: 'FeatureCollection' as const,
    features: shown.map((marker, index) => ({
        type: 'Feature' as const,
        geometry: {type: 'Point' as const, coordinates: [marker.at[1], marker.at[0]]},
        properties: {index, image: marker.image},
    })),
})

/** Draws missing marker images, then shows the markers. A later call wins. */
let drawing = 0
async function showMarkers() {
    const ticket = ++drawing, next = markers.value
    for (const marker of next) if (!images.has(marker.image)) images.set(marker.image, await drawMarker(marker))
    if (ticket !== drawing || !map) return
    for (const marker of next) if (!map.hasImage(marker.image)) map.addImage(marker.image, images.get(marker.image)!)
    shown = next
    ;(map.getSource('markers') as GeoJSONSource | undefined)?.setData(geojson())
}

/** The markers' layer, added again whenever the style is (a new style drops it). */
function addLayer() {
    for (const [id, image] of images) if (!map!.hasImage(id)) map!.addImage(id, image)
    map!.addSource('markers', {type: 'geojson', data: geojson()})
    map!.addLayer({
        id: 'marker-pins',
        type: 'symbol',
        source: 'markers',
        layout: {
            'icon-image': ['get', 'image'],
            'icon-size': ['interpolate', ['linear'], ['zoom'], 0, 0.12, 4, 0.18, 14, 0.22, 18, 0.24],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
        },
    })
}

function placeCamera() {
    if (!map || !maplibre) return
    const zoom = number('defaultZoom'), points = shown.map(marker => marker.at)
    const bounds = points.length ? points.reduce((box, [lat, lng]) => box.extend([lng, lat]), new maplibre.LngLatBounds()) : null
    if (zoom === null && bounds) return void map.fitBounds(bounds, {padding: 20})
    const middle = center.value ? {lat: center.value[0], lng: center.value[1]} : bounds?.getCenter() ?? {lat: 0, lng: 0}
    map.jumpTo({center: middle, zoom: zoom ?? 4})
}

// Hover popup: Vue renders its content into the popup's element; it stays while the pointer is over it.
const popupEl = document.createElement('div')
const hovered = shallowRef<Marker | null>(null)
let popup: Popup | null = null
let hiding: ReturnType<typeof setTimeout> | undefined
function hover(event: MapLayerMouseEvent) {
    clearTimeout(hiding)
    const marker = shown[event.features?.[0]?.properties.index as number]
    if (!marker || !map) return
    map.getCanvas().style.cursor = 'pointer'
    if (hovered.value === marker) return
    hovered.value = marker
    popup!.setLngLat([marker.at[1], marker.at[0]]).addTo(map)
}
function unhover() {
    if (map) map.getCanvas().style.cursor = ''
    hiding = setTimeout(() => {
        hovered.value = null
        popup?.remove()
    }, 150)
}
popupEl.addEventListener('mouseenter', () => clearTimeout(hiding))
popupEl.addEventListener('mouseleave', unhover)

const popupProperties = computed(() => {
    const row = hovered.value?.row
    return row ? (view.value.order ?? []).filter(id => id !== 'file.name' && row.property(id).type !== 'Null') : []
})

async function openNote(path: string) {
    const node = getFileByPath(`${ctx.session.rootPath}/${path}`)
    if (node) await $navi.toWorkspaceTab(ctx.session.uuid, openTab(node.uuid))
}

// Right click: where it was, and the zoom to offer. MapLibre cancels every right click, which the menu then ignores,
// so the map never sees it: the click is taken on its way down and sent to the menu's own box (the map's parent; a
// template ref there is lost when the menu re-renders it) instead.
const menuAt = shallowRef<[number, number] | null>(null)
function onContextMenu(event: MouseEvent) {
    event.stopPropagation()
    event.preventDefault()
    if (!map) return
    const box = el.value!.getBoundingClientRect(), at = map.unproject([event.clientX - box.left, event.clientY - box.top])
    menuAt.value = [at.lat, at.lng]
    el.value!.parentElement!.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, cancelable: true, clientX: event.clientX, clientY: event.clientY, button: 2}))
}
const zoom = ref(4)
const menuItems = computed((): ContextMenuItem[][] => {
    const at = menuAt.value
    if (!at) return []
    const [lat, lng] = pointText(at)
    const coordinates = coordinatesId.value
    const commit = (key: string, value: unknown) => ctx.commit(setViewOption(ctx.base.value, view.value.name, key, value))
    return [[
        ...(coordinates && ctx.property(coordinates).source === 'note'
            ? [{
                label: t('app.editor.ui.bases.newNote'),
                icon: 'i-lucide-square-pen',
                onSelect: () => void afterOverlaysClose(() => {
                    ctx.newItemPreset.value = {key: bareId(coordinates), value: [lat, lng]}
                    ctx.open.value = 'new'
                }),
            }]
            : []),
        {label: t('app.editor.ui.bases.copyCoordinates'), icon: 'i-lucide-copy', onSelect: () => void writeText(`${lat}, ${lng}`)},
        {label: t('app.editor.ui.bases.setDefaultCenter'), icon: 'i-lucide-map-pin', onSelect: () => commit('center', `[${lat}, ${lng}]`)},
        {label: t('app.editor.ui.bases.setDefaultZoom', {zoom: Math.round(zoom.value)}), icon: 'i-lucide-crosshair', onSelect: () => commit('defaultZoom', Math.round(zoom.value))},
    ]]
})

onMounted(async () => {
    maplibre = await import("maplibre-gl")
    maplibre.setWorkerUrl(workerUrl)
    if (!el.value) return
    map = new maplibre.Map({
        container: el.value,
        style: style.value,
        center: [0, 0],
        zoom: 4,
        minZoom: number('minZoom') ?? 0,
        maxZoom: number('maxZoom') ?? 18,
        attributionControl: {compact: true},
        // No rotation: there's no compass to undo it.
        dragRotate: false,
        touchPitch: false,
    })
    map.addControl(new maplibre.NavigationControl({showCompass: false}), 'top-right')
    popup = new maplibre.Popup({closeButton: false, closeOnClick: false, maxWidth: '240px', offset: 25, className: 'bases-map-popup'}).setDOMContent(popupEl)
    map.on('style.load', addLayer)
    map.on('mousemove', 'marker-pins', hover)
    map.on('mouseleave', 'marker-pins', unhover)
    map.on('click', 'marker-pins', (event) => {
        const marker = shown[event.features?.[0]?.properties.index as number]
        if (marker) void openNote(marker.row.path)
    })
    map.on('zoomend', () => zoom.value = map!.getZoom())
    map.once('load', async () => {
        await showMarkers()
        placeCamera()
    })
})
onBeforeUnmount(() => {
    clearTimeout(hiding)
    map?.remove()
    map = null
})
useResizeObserver(el, () => map?.resize())

watch(markers, () => void showMarkers())
watch(style, next => map?.setStyle(next, {diff: false}))
watch(() => number('minZoom'), value => map?.setMinZoom(value ?? 0))
watch(() => number('maxZoom'), value => map?.setMaxZoom(value ?? 18))
// Later edits move the camera as Obsidian does: a new center or zoom goes there; new coordinates fit again.
watch(center, value => value && map?.setCenter({lat: value[0], lng: value[1]}))
watch(() => number('defaultZoom'), value => value !== null && map?.setZoom(value))
watch(coordinatesId, async () => {
    await showMarkers()
    placeCamera()
})
</script>

<template>
    <UContextMenu :items="menuItems" size="sm">
        <div class="flex-1 min-h-0 flex flex-col">
            <!-- MapLibre's own CSS makes this `position: relative`, so it can't be an absolute inset child. -->
            <div ref="el" class="bases-map flex-1 min-h-0" @contextmenu.capture="onContextMenu"/>
        </div>
    </UContextMenu>
    <Teleport v-if="hovered" :to="popupEl">
        <div class="w-50 p-3 text-sm">
            <a class="block truncate font-semibold text-highlighted hover:underline cursor-pointer" @click="openNote(hovered.row.path)">
                {{ hovered.row.path.split('/').pop()!.replace(/\.md$/, '') }}
            </a>
            <div v-for="id in popupProperties" :key="id" class="mt-1.5 min-w-0">
                <div class="text-xs text-muted truncate">{{ ctx.property(id).label }}</div>
                <ViewerEditorBasesValue :row="hovered.row" :id="id"/>
            </div>
        </div>
    </Teleport>
</template>

<style>
/* MapLibre's popup and controls in the app's colours. */
.bases-map-popup .maplibregl-popup-content {
    padding: 0;
    border-radius: 16px;
    background: var(--ui-bg-elevated);
    box-shadow: 0 0 0 1px var(--ui-border), 0 8px 48px rgb(0 0 0 / 0.3);
}
.bases-map-popup.maplibregl-popup-anchor-top .maplibregl-popup-tip { border-bottom-color: var(--ui-bg-elevated); }
.bases-map-popup.maplibregl-popup-anchor-bottom .maplibregl-popup-tip { border-top-color: var(--ui-bg-elevated); }
.bases-map-popup.maplibregl-popup-anchor-left .maplibregl-popup-tip { border-right-color: var(--ui-bg-elevated); }
.bases-map-popup.maplibregl-popup-anchor-right .maplibregl-popup-tip { border-left-color: var(--ui-bg-elevated); }
.bases-map .maplibregl-ctrl-group { background: var(--ui-bg-elevated); box-shadow: 0 0 0 1px var(--ui-border); border-radius: 8px; }
.bases-map .maplibregl-ctrl-group button + button { border-top-color: var(--ui-border); }
.dark .bases-map .maplibregl-ctrl-icon { filter: invert(1); }
.bases-map .maplibregl-ctrl-attrib { background: color-mix(in oklab, var(--ui-bg) 70%, transparent); color: var(--ui-text-muted); }
.bases-map .maplibregl-ctrl-attrib a { color: inherit; }
.dark .bases-map .maplibregl-ctrl-attrib-button { filter: invert(1); }
</style>
