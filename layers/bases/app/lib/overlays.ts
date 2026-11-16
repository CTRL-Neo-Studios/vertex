/**
 * Runs `open` once the closing menus and dialogs are gone (at most a second), then a frame later. A popover opened from
 * a menu item or the command palette otherwise closes again when that overlay hands the focus back.
 */
export async function afterOverlaysClose(open: () => void) {
    for (let i = 0; i < 20 && document.querySelector('[role="menu"], [role="dialog"]'); i++) await new Promise(r => setTimeout(r, 50))
    requestAnimationFrame(open)
}
