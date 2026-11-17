import {shallowRef} from 'vue'
import type {HostServices} from '#shared/plugin/api'

let theme: HostServices['ui']['theme'] | undefined

/**
 * The window's theme for plugins (`ctx.ui.theme`): read from the page as it's drawn, so whatever sets it (light and
 * dark, the colours, a workspace's theme, custom CSS) is followed without knowing which. A change to `<html>`'s class
 * or style, or to `<head>`'s styles, makes its readers read again, once per frame. One per window.
 */
export function pageTheme(): HostServices['ui']['theme'] {
    if (theme) return theme
    const changed = shallowRef(0)
    let frame = 0
    const observer = new MutationObserver(() => {
        frame ||= requestAnimationFrame(() => {
            frame = 0
            changed.value++
        })
    })
    observer.observe(document.documentElement, {attributes: true, attributeFilter: ['class', 'style']})
    observer.observe(document.head, {childList: true, subtree: true, characterData: true})
    theme = {
        get dark() {
            void changed.value
            return document.documentElement.classList.contains('dark')
        },
        value(property) {
            void changed.value
            return getComputedStyle(document.documentElement).getPropertyValue(property).trim()
        },
    }
    return theme
}
