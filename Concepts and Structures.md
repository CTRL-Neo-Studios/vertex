# Concepts and Structures

## Two Modes, One App

The Editor has two main modes: Workspace Mode, and Singlespace Mode.

A Workspace is a folder that contains groups of markdown files and other types of files, which the editor will index everything in the folder and use that indexed information to enhance markdown editing features, i.e. internal links, embeds and etc.
Singlespace is when the Vertex editor is editing a single file without the context of all the files in a folder. Like Notepad, but Rich text editing with Markdown.

When the user opens a folder using Vertex, it automatically opens that folder in Workspace Mode.
When the user opens a file using Vertex, it automatically opens that folder in the Singlespace Mode.

Context is the core difference between a Workspace and a Singlespace/Single-File.

## Operating Flow

```mermaid
graph TD
    N_1[App Entry]
    
    subgraph S_1[Initialization Phase]
        S_1A1[Opening App]
        S_1A2[Getting Recent Data]
        S_1A3[Open New/Create New/etc.]
    end

    subgraph S_2[Indexing & Caching Phase]
        S_2A1[Index Files in Workspace]
        S_2A2[Cache Markdown Frontmatter Properties, Metadata, Backlinks, Forelinks, etc.]
        
        S_2A1 --> S_2A2
    end

    subgraph S_3[Read/Write Operations]
        S_3A1[Read, Write]
    end

    N_1 --> S_1
    S_1 --> S_2
    S_1 --> S_3
```

---

## Sessions: Two Layers, Two Concepts

Vertex has **two distinct types of sessions** that work together to provide seamless multi-window functionality with persistent state across app restarts.

### ActiveSession (Runtime Layer)

**Purpose**: Represents a workspace or singlespace that's currently active during runtime.

**Characteristics**:
- Lives only in memory (not persisted to disk)
- Created when a user opens a folder (workspace) or file (singlespace)
- Managed by `useActiveSessions()` composable
- Used for current editing context and file indexing

**Structure**:
[Type definition file](shared/types/active/sessions.d.ts)

**Lifecycle**: Created → Used during editing → Destroyed when window closes

### AppSession (Persistence Layer)

**Purpose**: Represents a window's state for recovery across app restarts.

**Characteristics**:
- Persisted to disk (`sessions.json`) by Rust; webviews never write the file
- Contains recovery information (opened tabs, focused tab, expanded folders)
- Mirrored per window by `useAppSessions()`, kept fresh by the `vertex://sessions-changed` event
- Updated continuously by `useAppSessionPersistence()` while the window is open

**Structure**:
[Type definition file](shared/types/app/sessions.d.ts)

**Lifecycle**: Created → Updated on every tab/folder change → Loaded on restart → Recovered (per the *Reopen windows on launch* setting)

### Why Two Session Types?

This separation follows the **Single Responsibility Principle**:

- **ActiveSession** handles runtime editing context
- **AppSession** handles persistence and recovery

This design prevents confusion between "what's currently happening" (ActiveSession) and "what needs to be saved/recovered" (AppSession).

---

## State Ownership

Anything shared between windows lives in Rust (`src-tauri/src/state.rs`), which is the **only writer** of
`sessions.json` and `settings.json`. Windows call commands and listen for change events; they never read or
write those files themselves. This removes the cross-window lost-update races the old design had.

| Rust command | Purpose |
|---|---|
| `sessions_list` / `sessions_upsert` / `sessions_remove` | AppSession CRUD; every write is persisted (atomic temp-file + rename) and broadcast as `vertex://sessions-changed` |
| `settings_get` / `settings_set` | App settings; every write is broadcast as `vertex://settings-changed` |
| `take_open_requests` | Drains the queue of paths the OS asked us to open |
| `quit_app` | Asks every session window to flush (`vertex://flush-requested` → `vertex://flush-done`), then exits |

The frontend wrapper is `app/utils/stateClient.ts`. It has no Vue lifecycle, so it is safe from plugins and callbacks.

### AI requests

Every AI call goes through Rust (`src-tauri/src/ai.rs`) so provider API keys never reach the webview:

| Rust command | Purpose |
|---|---|
| `ai_key_set` / `ai_key_has` | Provider API keys in the OS keychain (`ai-provider:<id>`). There is no getter. No keychain → error, never a plaintext fallback |
| `ai_request` / `ai_request_cancel` | One HTTP request for a provider: the URL must share the provider's `baseURL` origin, Rust adds `Authorization`, and the body streams back over a `Channel` |
| `ai_model_catalog` | The models.dev catalog, cached for a day, for model badges |

- `app/utils/aiFetch.ts` wraps `ai_request` as a `fetch`, which ai-sdk (`@ai-sdk/openai-compatible`) and the editor's `aiAssistant({ endpoint: { fetch } })` use unchanged.
- Changing a provider's `baseURL` or removing it deletes its key in `settings_set`, so a saved key can't be pointed at another host.
- `settings.aiConfig`: provider profiles → model profiles (provider + model + system prompt) → features (`shared/constants/ai.ts`), each falling back to the default model profile. Workspace-overridable: `aiConfig.features` (trusted folders only: a shared vault can pick among your own profiles or turn a feature off, never add a provider, model or prompt) and `aiConfig.chatStorage` (any folder).

### Chats

Chats belong to a workspace (singlespace has none) and are stored by Rust (`src-tauri/src/chats.rs`); the webview only
calls `app/utils/chatClient.ts`.

| `aiConfig.chatStorage` | Where | Format |
|---|---|---|
| `app` (default) | `<app_data>/chats/<workspaceId>/` | Plain JSON; never in the workspace, never synced |
| `workspace` | `<root>/.vertex/chats/` | age-encrypted; needs the workspace's chat password |

- The workspace id is in `<root>/.vertex/workspace.json` (`{"id": …}`, other keys kept), so app-data chats follow the folder through moves and renames. A *copy* of the folder keeps the id, so both copies share their app-data chats.
- Encryption: `key.age` is a per-workspace X25519 identity encrypted with the password (age scrypt, about 1 s per unlock); each `<id>.chat` and `folders.chat` is encrypted to it. The unlocked identity stays in Rust memory; "Remember on this device" also puts it in the keychain (`chat-key:<workspaceId>`). There's no password recovery.
- Folders are virtual: each chat stores its `folder` inside its (encrypted) content and `folders.chat` keeps empty ones, so folder names never show on disk. Files are flat `<id>.chat`; the dot-folder is skipped by the index and watcher.
- Switching `chatStorage` leaves existing chats where they are; each location lists its own.
- Frontend: `useChats(session)` (`app/composables/ai/useChats.ts`) holds the index, the vault state and one live `@ai-sdk/vue` `Chat` per chat, shared by its tab and the right panel. `app/utils/chatTransport.ts` runs `streamText` in the webview through `createAiFetch`; each send's instructions are the profile prompt plus the active note (live buffer) and every note attached in the conversation (capped at ~60k characters). The chat saves after each sent message and finished reply; a failed save shows in the chat with Retry.
- A chat tab is an `ActiveTab` with `kind: 'chat'` and the chat id as its id; `AppSessionContext.openedChatIds` restores them.

---

## Window Model

| Window | Label | Notes |
|---|---|---|
| Main | `main` | Anchor. Never destroyed at runtime. Hidden while any session window exists, shown when the last one closes — enforced by Rust (`sync_main_visibility`) on real window create/destroy events. Recovers saved sessions and serves the OS open queue. |
| Session | `session-{uuid}` | One per workspace/singlespace. `uuid` is the AppSession uuid. Starts at `/loading` and initializes itself. |
| Settings | `settings` | Singleton utility window. Not persisted. |

Labels, routes and `useState` keys come from `shared/constants/app.ts`; never hand-build them.

### Opening something

```mermaid
sequenceDiagram
    participant OS
    participant Rust
    participant Main as main window
    participant Win as session-{uuid}
    OS->>Rust: file association / second launch / Finder "Open With"
    Rust->>Rust: push path to open queue
    Rust-->>Main: vertex://open-requested
    Main->>Rust: take_open_requests
    Main->>Rust: sessions_upsert(new AppSession)
    Main->>Win: create window at /loading
    Rust->>Rust: webview-created → hide main
    Win->>Win: useAppSessionRecovery: open root, restore tabs
```

Menu/button opens (`useAppSessionActions`) skip the queue and start at `sessions_upsert`. Opening a path that
already has a window focuses that window instead.

### Closing and quitting

- **Close window**: a single `onCloseRequested` handler (`useAppSessionPersistence.registerCloseHandlers`) awaits the
  last pending session write, then lets Tauri destroy the window. Because state was persisted continuously,
  teardown (`clearTabs`, `clearIndex`) can never overwrite it. Rust shows `main` if this was the last session window.
- **Quit (Cmd+Q)**: `quit_app` sends `flush-requested`, waits for every session window's `flush-done`
  (3 s guard against a hung webview), then exits. No fixed sleeps.

### Startup recovery

The main window reopens saved sessions according to **Settings → General → Reopen windows on launch**:
`none`, `workspaces`, `singlespaces` or `both`. Older settings files with `openLastOpenedWindows: true` migrate to
`workspaces`, which was the previous behaviour.

---

## Composables

| Composable | Responsibility |
|---|---|
| `useAppSessions` | Per-window mirror of AppSessions; CRUD via `stateClient`; current window's session; startup recovery |
| `useAppSettings` | Per-window mirror of settings; `set` (memory) / `save` (persist + broadcast) |
| `useAppSessionActions` | User-facing "open folder/file" actions; one AppSession + window per path |
| `useAppSessionNavigator` | Turns a path into an ActiveSession in the current window and routes to it |
| `useAppSessionRecovery` | Restores a session window's tabs/folders from its AppSession |
| `useAppSessionPersistence` | Writes the window's tabs/focus/folders back to its AppSession on change; owns the close path |
| `useAppFileStartHandler` | Main window: drains the OS open queue |
| `useAppWebviewWindows` | Find/create webview windows; no session logic |

Dependency direction is one-way: actions → navigator/sessions; recovery → navigator; persistence → sessions.
Nothing in `app/composables/app` is imported by `shared/`.

### Initialization

```mermaid
sequenceDiagram
    participant Plugin as initialize.client.ts (every window)
    participant S as useAppSessions / useAppSettings
    participant Rust
    Plugin->>S: settings.load(), apply theme
    Plugin->>S: listen for sessions/settings changes
    Plugin->>S: initializeCurrentAppSession() (from window label)
    alt main window
        Plugin->>S: recoverSavedAppSessions(settings.recoverSessions)
        Plugin->>Rust: take_open_requests (and on every open-requested)
    end
```

`app.vue` builds the native menu on mount, on focus and on route change. Session windows continue in `/loading`
→ `useAppSessionRecovery` → the workspace/singlespace layout, which builds the index, restores tabs and then starts
`useAppSessionPersistence`.
