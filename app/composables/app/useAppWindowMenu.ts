import {Menu, MenuItem, PredefinedMenuItem, Submenu} from '@tauri-apps/api/menu';
import {getCurrentWindow} from '@tauri-apps/api/window';
import type {ActiveWindowSession} from "#shared/types/active/sessions";

interface MenuState {
    canSave: boolean;
    hasSelection: boolean;
    hasUndo: boolean;
    hasRedo: boolean;
}

export function useAppWindowMenu(session?: ActiveWindowSession) {
    const $route = useRoute();
    const { and, or, evaluate } = usePredicateLogic()

    if (!session) {
        console.error("useAppWindowMenu was called without a window session!");
    }

    const dispatcher = useEventDispatcher(`window.menu.${session?.uuid}`)

    const menuState = useState<MenuState>(`window.menu.${session?.uuid}`, () => ({
        canSave: false,
        hasSelection: false,
        hasUndo: false,
        hasRedo: false,
    } satisfies MenuState));

    const isRoute = definePredicate((path: string) => {
        const route = useRoute()
        return route.path === path
    })

    const $inSinglespace = isRoute('/singlespace')

    const $inWorkspace = isRoute('/workspace')

    const $canCreateItems = or($inWorkspace, $inSinglespace)

    async function buildMenu() {
        const fileMenu = await buildFileMenu();
        const editMenu = await buildEditMenu();
        const viewMenu = await buildViewMenu();
        const helpMenu = await buildHelpMenu();

        // Create the main menu bar
        return await Menu.new({
            items: [fileMenu, editMenu, viewMenu, helpMenu],
        });
    }

    // File Menu
    async function buildFileMenu() {
        const items = [];

        // "New" Submenu
        const newFileItem = await MenuItem. new({
            id: 'new-file',
            text:  'New File',
            accelerator: 'CmdOrCtrl+N',
            action: () => handleNewFile(),
            enabled: evaluate($canCreateItems).value
        });

        const newFolderItem = await MenuItem.new({
            id: 'new-folder',
            text: 'New Folder',
            accelerator: 'CmdOrCtrl+Shift+N',
            action:  () => handleNewFolder(),
            enabled: evaluate($inWorkspace).value
        });

        const newSubmenu = await Submenu.new({
            text: 'New...',
            items: [newFileItem, newFolderItem],
            enabled: evaluate($canCreateItems).value
        });

        items.push(newSubmenu);
        items.push(await PredefinedMenuItem.new({ item: 'Separator' }));

        // Open
        items.push(await MenuItem.new({
            id: 'open',
            text: 'Open.. .',
            accelerator: 'CmdOrCtrl+O',
            action: () => handleOpen(),
        }));

        items.push(await PredefinedMenuItem.new({ item: 'Separator' }));

        // Save
        items.push(await MenuItem.new({
            id: 'save',
            text: 'Save',
            accelerator: 'CmdOrCtrl+S',
            action: () => handleSave(),
        }));

        items.push(await MenuItem.new({
            id: 'save-as',
            text: 'Save As...',
            accelerator: 'CmdOrCtrl+Shift+S',
            action: () => handleSaveAs(),
        }));

        items.push(await PredefinedMenuItem.new({ item: 'Separator' }));
        items.push(await PredefinedMenuItem.new({ item: 'CloseWindow' }));
        items.push(await PredefinedMenuItem.new({ item: 'Quit' }));

        return await Submenu.new({
            text: 'File',
            items,
        });
    }

    // Edit Menu
    async function buildEditMenu() {
        const items = [];

        items.push(await MenuItem.new({
            id: 'undo',
            text:  'Undo',
            accelerator: 'CmdOrCtrl+Z',
            action: () => document.execCommand('undo'),
        }));

        items.push(await MenuItem.new({
            id: 'redo',
            text: 'Redo',
            accelerator: 'CmdOrCtrl+Shift+Z',
            action:  () => document.execCommand('redo'),
        }));

        items.push(await PredefinedMenuItem.new({ item: 'Separator' }));

        items.push(await MenuItem.new({
            id: 'cut',
            text: 'Cut',
            accelerator: 'CmdOrCtrl+X',
            action: () => document.execCommand('cut'),
        }));

        items.push(await MenuItem.new({
            id: 'copy',
            text: 'Copy',
            accelerator: 'CmdOrCtrl+C',
            action: () => document.execCommand('copy'),
        }));

        items.push(await MenuItem.new({
            id: 'paste',
            text: 'Paste',
            accelerator: 'CmdOrCtrl+V',
            action: () => document.execCommand('paste'),
        }));

        items.push(await PredefinedMenuItem.new({ item: 'Separator' }));

        items.push(await MenuItem.new({
            id: 'select-all',
            text: 'Select All',
            accelerator: 'CmdOrCtrl+A',
            action: () => document.execCommand('selectAll'),
        }));

        return await Submenu.new({
            text: 'Edit',
            items,
        });
    }

    // View Menu
    async function buildViewMenu() {
        const items = [];

        items.push(await MenuItem.new({
            id: 'reload',
            text: 'Reload',
            accelerator: 'CmdOrCtrl+R',
            action: () => reloadNuxtApp(),
        }));

        items.push(await MenuItem.new({
            id: 'toggle-fullscreen',
            text: 'Toggle Fullscreen',
            accelerator: 'F11',
            action: async () => {
                const window = getCurrentWindow();
                const isFullscreen = await window.isFullscreen();
                await window.setFullscreen(!isFullscreen);
            },
        }));

        items.push(await PredefinedMenuItem. new({ item: 'Separator' }));

        items.push(await MenuItem.new({
            id: 'zoom-in',
            text: 'Zoom In',
            accelerator: 'CmdOrCtrl+Plus',
            action:  () => handleZoomIn(),
            enabled: false
        }));

        items.push(await MenuItem.new({
            id: 'zoom-out',
            text: 'Zoom Out',
            accelerator: 'CmdOrCtrl+-',
            action: () => handleZoomOut(),
            enabled: false
        }));

        items.push(await MenuItem.new({
            id: 'reset-zoom',
            text: 'Reset Zoom',
            accelerator: 'CmdOrCtrl+0',
            action:  () => handleResetZoom(),
        }));

        return await Submenu.new({
            text: 'View',
            items,
        });
    }

    // Help Menu
    async function buildHelpMenu() {
        const items = [];

        items.push(await MenuItem.new({
            id: 'documentation',
            text: 'Documentation',
            action: () => handleOpenDocs(),
        }));

        items.push(await MenuItem.new({
            id: 'report-issue',
            text: 'Report Issue',
            action:  () => handleReportIssue(),
        }));

        items.push(await PredefinedMenuItem. new({ item: 'Separator' }));

        items.push(await MenuItem.new({
            id: 'about',
            text: 'About',
            action: () => handleAbout(),
        }));

        return await Submenu.new({
            text: 'Help',
            items,
        });
    }

    // Set the menu on the window
    async function setMenu() {
        const menu = await buildMenu();
        const window = getCurrentWindow();
        await menu.setAsWindowMenu(window)
    }

    // Update menu when route changes
    async function updateMenu() {
        await setMenu();
    }

    // Action handlers
    function handleNewFile() {
        emitEvent('new-file');
    }

    function handleNewFolder() {
        emitEvent('new-folder')
    }

    function handleOpen() {
        emitEvent('open')
    }

    function handleSave() {
        emitEvent('save')
    }

    function handleSaveAs() {
        emitEvent('save-as')
    }

    function handleZoomIn() {
        document.body.style.zoom = `${parseFloat(document.body. style.zoom || '1') + 0.1}`;
    }

    function handleZoomOut() {
        document.body.style.zoom = `${parseFloat(document.body.style.zoom || '1') - 0.1}`;
    }

    function handleResetZoom() {
        document.body.style.zoom = '1';
    }

    function handleOpenDocs() {
        window.open('https://your-docs-url.com', '_blank');
    }

    function handleReportIssue() {
        window.open('https://github.com/yourorg/yourrepo/issues', '_blank');
    }

    function handleAbout() {
        emitEvent('about')
    }

    // Update menu state and rebuild
    async function updateMenuState(newState:  Partial<MenuState>) {
        menuState.value = { ... menuState.value, ...newState };
        await setMenu();
    }

    function emitEvent(eventName: string, data?: any) {
        const event = new CustomEvent(`menu:${eventName}`, { detail: data });
        window.dispatchEvent(event);
    }

    return {
        setMenu,
        // updateMenu,
        canCreateItems: $canCreateItems,
    }
}