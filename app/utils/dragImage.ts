/**
 * The drag image of rows dragged from a file browser: the first row's icon and name on a card, with two cards stacked
 * behind and a count for more than one. One element per window, off-screen but laid out, filled in on the DOM, since
 * `setDragImage` takes it within `dragstart`.
 */
let ghost: HTMLElement | undefined

function ghostElement() {
    if (ghost) return ghost
    ghost = document.createElement('div')
    // The padding holds the stacked cards.
    ghost.className = 'fixed -top-96 left-0 w-max pe-2 pb-2 pointer-events-none'
    ghost.innerHTML = `<div class="relative">
        <div data-ghost-stack class="absolute inset-0 translate-x-2 translate-y-2 rounded-md border border-accented bg-muted"></div>
        <div data-ghost-stack class="absolute inset-0 translate-x-1 translate-y-1 rounded-md border border-accented bg-elevated"></div>
        <div data-ghost-card class="relative inline-flex items-center gap-2 rounded-md border border-accented bg-default px-2.5 py-1.5 text-xs font-medium text-highlighted shadow-sm">
            <span data-ghost-name></span>
            <span data-ghost-count class="rounded-sm bg-primary px-1.5 py-0.5 text-[10px] text-inverted"></span>
        </div>
    </div>`
    document.body.append(ghost)
    return ghost
}

/** The image filled with a copy of `grab` (a row's icon and name) and `count` (shown from two on). */
export function dragImage(grab: Element, count: number, countLabel: string) {
    const el = ghostElement()
    el.querySelector('[data-ghost-name]')!.replaceChildren(grab.cloneNode(true))
    const badge = el.querySelector<HTMLElement>('[data-ghost-count]')!
    badge.textContent = countLabel
    for (const part of [badge, ...el.querySelectorAll<HTMLElement>('[data-ghost-stack]')]) part.hidden = count < 2
    return el
}

/**
 * The filled image as a PNG data URL, for the native drag (`dragOut`), which takes an image rather than an element. A
 * webview can't snapshot DOM, so its cards, icon and text are drawn on a canvas from their laid-out boxes and styles.
 */
// ponytail: drawn at 1x (a PNG without a DPI is read as 72 dpi), so it's soft on a Retina screen; write a pHYs chunk if it matters.
export async function dragImagePng(image: HTMLElement) {
    const origin = image.getBoundingClientRect(), canvas = document.createElement('canvas')
    canvas.width = Math.ceil(origin.width)
    canvas.height = Math.ceil(origin.height)
    const ctx = canvas.getContext('2d')!
    const box = (el: Element | Range) => { const r = el.getBoundingClientRect(); return [r.x - origin.x, r.y - origin.y, r.width, r.height] as const }
    const shown = (el: Element) => !el.closest('[hidden]')
    for (const el of [...image.querySelectorAll('[data-ghost-stack], [data-ghost-card], [data-ghost-count]')].filter(shown)) {
        const s = getComputedStyle(el), [x, y, w, h] = box(el)
        ctx.beginPath()
        ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, parseFloat(s.borderTopLeftRadius))
        ctx.fillStyle = s.backgroundColor
        ctx.fill()
        if (parseFloat(s.borderTopWidth)) {
            ctx.strokeStyle = s.borderTopColor
            ctx.stroke()
        }
    }
    // An icon is a CSS mask (`--svg`): drawn, then filled with its colour.
    for (const icon of image.querySelectorAll('.iconify')) {
        const s = getComputedStyle(icon), url = /url\((['"]?)(.+)\1\)/.exec(s.getPropertyValue('--svg'))?.[2]
        if (!url) continue
        const img = new Image(), [x, y, w, h] = box(icon)
        img.src = url
        await img.decode().catch(() => {})
        const mask = document.createElement('canvas')
        mask.width = w
        mask.height = h
        const m = mask.getContext('2d')!
        m.drawImage(img, 0, 0, w, h)
        m.globalCompositeOperation = 'source-in'
        m.fillStyle = s.color
        m.fillRect(0, 0, w, h)
        ctx.drawImage(mask, x, y)
    }
    const texts = document.createTreeWalker(image, NodeFilter.SHOW_TEXT)
    for (let node = texts.nextNode(); node; node = texts.nextNode()) {
        const text = node.textContent?.trim(), parent = node.parentElement!
        if (!text || !shown(parent)) continue
        const range = document.createRange()
        range.selectNodeContents(node)
        const s = getComputedStyle(parent), [x, y, , h] = box(range)
        ctx.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`
        ctx.fillStyle = s.color
        ctx.textBaseline = 'middle'
        ctx.fillText(text, x, y + h / 2)
    }
    return canvas.toDataURL('image/png')
}
