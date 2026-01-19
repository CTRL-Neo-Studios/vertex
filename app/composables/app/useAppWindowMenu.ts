import {Menu, MenuItem, PredefinedMenuItem, Submenu} from '@tauri-apps/api/menu';
import {exit, relaunch} from '@tauri-apps/plugin-process'
import type {AppSession} from "#shared/types/app/sessions";
import {useAppWebviewWindows} from "~/composables/app/useAppWebviewWindows";
import type {WindowMenuEvents} from "#shared/types/app/events";

interface MenuState {
    canSave: boolean;
    hasSelection: boolean;
    hasUndo: boolean;
    hasRedo: boolean;
}

export function useAppWindowMenu() {
    const $route = useRoute();
    const { and, or, not, evaluate, evaluateUnref } = usePredicateLogic()
    const $win = useAppWebviewWindows()

    const dispatcher = useEventDispatcher<WindowMenuEvents>(`window.menu`)

    const menuState = useState<MenuState>(`window.menu.state`, () => ({
        canSave: false,
        hasSelection: false,
        hasUndo: false,
        hasRedo: false,
    } satisfies MenuState));

    const isRoute = definePredicate((path: string) => {
        return $route.path == path
    })

    const hasRoute = definePredicate((path: string) => {
        return $route.path.includes(path)
    })

    const $inSinglespace = hasRoute('/singlespace')

    const $inWorkspace = hasRoute('/workspace')

    const $inMain = isRoute('/')

    const $inFunctional = hasRoute('/settings')

    const $inEditingSpace = or($inWorkspace, $inSinglespace)

    const $canCreateItems = and($inEditingSpace, not($inMain), not($inFunctional))

    const $canSaveItems = and($inEditingSpace, not($inMain), not($inFunctional))

    async function buildMenu() {
        const aboutMenu = await buildAboutMenu();
        const fileMenu = await buildFileMenu();
        const editMenu = await buildEditMenu();
        const viewMenu = await buildViewMenu();
        const helpMenu = await buildHelpMenu();

        // Create the main menu bar
        return await Menu.new({
            items: [aboutMenu, fileMenu, editMenu, viewMenu, helpMenu],
        });
    }

    async function buildAboutMenu() {
        return await Submenu.new({
            text: 'About',
            items: [
                // await MenuItem.new({
                //     id: 'quit',
                //     text: 'Quit',
                //     accelerator: 'CmdOrControl+Q',
                //     async action() {
                //         await exit()
                //     },
                // }),
                await PredefinedMenuItem.new({item: 'Quit'})
            ],
        });
    }

    // File Menu
    async function buildFileMenu() {
        const items = [];

        const newSubmenu = await Submenu.new({
            id: 'new',
            text: 'New...',
            items: [
                await PredefinedMenuItem.new({item: 'Separator'}),
                await MenuItem.new({
                    id: 'new-file',
                    text:  'New File',
                    accelerator: 'CmdOrCtrl+N',
                    action: () => handleNewFile(),
                    // enabled: unref(evaluate(and($canCreateItems, $inWorkspace)))
                }),
                await MenuItem.new({
                    id: 'new-folder',
                    text: 'New Folder',
                    accelerator: 'CmdOrCtrl+Shift+N',
                    action:  () => handleNewFolder(),
                    // enabled: unref(evaluate(and($canCreateItems,$inWorkspace))),
                })
            ],
            enabled: evaluateUnref(and($canCreateItems, $inWorkspace))
        });

        const openSubmenu = await Submenu.new({
            id: 'open',
            text: 'Open...',
            items: [
                await MenuItem.new({
                    id: 'open-file',
                    text: 'Open File',
                    accelerator: 'CmdOrCtrl+O',
                    action: () => handleOpenFile()
                }),
                await MenuItem.new({
                    id: 'open-folder',
                    text: 'Open folder',
                    accelerator: 'CmdOrCtrl+Shift+O',
                    action: () => handleOpenFolder()
                })
            ],
            enabled: evaluateUnref(not($inFunctional))
        })
        // Open
        items.push(openSubmenu);
        items.push(newSubmenu);

        items.push(await PredefinedMenuItem.new({ item: 'Separator' }));

        // Save
        items.push(await MenuItem.new({
            id: 'save',
            text: 'Save',
            accelerator: 'CmdOrCtrl+S',
            action: () => handleSave(),
            enabled: evaluateUnref($canSaveItems)
        }));

        items.push(await MenuItem.new({
            id: 'save-as',
            text: 'Save As...',
            accelerator: 'CmdOrCtrl+Shift+S',
            action: () => handleSaveAs(),
            enabled: evaluateUnref($canSaveItems)
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
            async action() {
                await relaunch()
            },
        }));

        items.push(await MenuItem.new({
            id: 'toggle-fullscreen',
            text: 'Toggle Fullscreen',
            accelerator: 'F11',
            action: async () => {
                const window = $win.getCurrentAppWindow()
                const isFullscreen = await window.isFullscreen();
                await window.setFullscreen(!isFullscreen);
            },
        }));

        items.push(await PredefinedMenuItem.new({ item: 'Separator' }));

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
            action: () => handleAboutSoftware(),
        }));

        return await Submenu.new({
            text: 'Help',
            items,
        });
    }

    // Set the menu on the window
    async function setMenu() {
        console.log('Setting Window Menu...')
        const menu = await buildMenu();
        const window = $win.getCurrentAppWindow();
        await menu.setAsWindowMenu(window)
        await menu.setAsAppMenu()
        console.log('Menu set.')
    }

    // Update menu when route changes
    async function updateMenu() {
        await setMenu();
    }

    // Action handlers
    function handleNewFile() {
        dispatcher.emit('categories.file.new.newFile')
    }

    function handleNewFolder() {
        dispatcher.emit('categories.file.new.newFolder')
    }

    function handleOpenFile() {
        dispatcher.emit('categories.file.open.openFile')
    }

    function handleOpenFolder() {
        dispatcher.emit('categories.file.open.openFolder')
    }

    function handleSave() {
        dispatcher.emit('categories.file.save')
    }

    function handleSaveAs() {
        dispatcher.emit('categories.file.saveAs')
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
        dispatcher.emit('categories.about.toDocs')
    }

    function handleReportIssue() {
        dispatcher.emit('categories.about.toRepoIssues')
    }

    function handleAboutSoftware() {
        dispatcher.emit('categories.about.toSoftware')
    }

    // Update menu state and rebuild
    async function updateMenuState(newState:  Partial<MenuState>) {
        menuState.value = { ... menuState.value, ...newState };
        await setMenu();
    }

    return {
        setMenu,
        // updateMenu,
        canCreateItems: $canCreateItems,
        dispatcher
    }
}