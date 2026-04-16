# Clock Up — Project Context for Claude

## What this is

A VSCode extension that connects ClickUp and Clockify for time tracking directly inside the editor.

## User flow

1. User opens the **Clock Up** panel in the Activity Bar
2. Clicks the gear icon → **Select Projects** wizard:
   - Quick Pick 1: choose a **ClickUp Folder** (= "Project" in ClickUp UI) from all folders across all spaces
   - Quick Pick 2: choose a **Clockify Project**
3. Tree view shows tasks and subtasks from the selected ClickUp folder (aggregated from all lists inside it)
4. User clicks `▶` inline button on a task or subtask → timer starts
5. Status bar shows live elapsed time + task name; click it to stop
6. On stop → Clockify time entry is created with:
   - **Description**: `#taskId first five words of task name`
   - **Project**: the selected Clockify project
   - **Start/end**: actual tracked times

## Architecture

```
src/
├── extension.ts              # activate/deactivate, wires everything
├── commands.ts               # all VSCode command registrations
├── config.ts                 # SecretStorage for API keys + obfuscated hints in settings
├── api/
│   ├── clickup.ts            # ClickUp REST API client
│   └── clockify.ts           # Clockify REST API client
├── views/
│   ├── taskTreeProvider.ts   # Activity Bar TreeView
│   └── timerStatusBar.ts     # Live status bar timer
└── state/
    └── timerState.ts         # globalState: active timer + selected project
```

## Key design decisions

- **API keys** stored in VSCode `SecretStorage` (OS keychain), not settings.json
- **Obfuscated hints** (`clockup.clickupApiKeyHint`, `clockup.clockifyApiKeyHint`) written to settings after each key save so the user can confirm they're set
- **ClickUp "project"** = Folder (not Space, not List). Spaces are too coarse; Lists are too fine. Folders map to what ClickUp calls "Projects" in the UI.
- **Tasks** fetched from all Lists inside the selected Folder, aggregated into a flat+nested tree
- **Subtasks** identified by `task.parent` field; shown nested under parent in tree
- **Timer state** persisted in `globalState` so it survives VSCode restarts
- **Entry title format**: `#<taskId> <first 5 words of task name>`
- **Bundler**: esbuild (not webpack) — faster, simpler config

## Settings (settings.json)

| Key | Purpose |
|---|---|
| `clockup.clickupTeamId` | ClickUp workspace/team ID |
| `clockup.clockifyWorkspaceId` | Clockify workspace ID |
| `clockup.clickupApiKeyHint` | Read-only obfuscated preview of ClickUp key |
| `clockup.clockifyApiKeyHint` | Read-only obfuscated preview of Clockify key |

## Commands

| Command | Description |
|---|---|
| `Clock Up: Set ClickUp API Key` | Store key in SecretStorage |
| `Clock Up: Set Clockify API Key` | Store key in SecretStorage |
| `Clock Up: Select Projects` | Two-step Quick Pick wizard to pick ClickUp folder + Clockify project |
| `Clock Up: Start Timer` | Start tracking (inline button on tree item) |
| `Clock Up: Stop Timer` | Stop tracking + create Clockify entry (click status bar) |
| `Clock Up: Refresh Tasks` | Re-fetch task list |

## Current status

### Done
- [x] Project scaffold (TypeScript + esbuild, VSCode extension structure)
- [x] ClickUp API client: workspaces, spaces, folders, lists, tasks (with subtasks)
- [x] Clockify API client: list projects, create time entries
- [x] SecretStorage for API keys with obfuscated settings hints
- [x] `Select Projects` wizard: ClickUp Folder picker + Clockify Project picker
- [x] Task TreeView: header bar showing current selection, tasks + nested subtasks
- [x] Timer state: start/stop, persisted across restarts
- [x] Status bar: live elapsed time display, click to stop
- [x] Entry title formatting: `#id first five words`
- [x] `.vscode/launch.json` + `tasks.json` for F5 dev workflow with watch mode

### In progress
- [ ] Fix project selection: switched from Lists to Folders — `commands.ts` and `taskTreeProvider.ts` still need updating to use `getAllFolders` / `getTasksFromFolder` and renamed `SelectedProject` fields (`clickupFolderId`, `clickupFolderName`)

### To do
- [ ] Error state in tree view when API key is missing (prompt to configure)
- [ ] Loading indicator while tasks are fetching
- [ ] Handle ClickUp pagination (tasks endpoint returns max 100 by default)
- [ ] Test with real API keys end-to-end

## ClickUp API notes

- Auth header: `Authorization: <token>` (no "Bearer" prefix)
- Hierarchy: Team → Space → Folder → List → Task
- Subtasks returned when `?subtasks=true` is added to the task endpoint
- Subtasks have a `parent` field with the parent task ID
- Folders = "Projects" in the ClickUp UI

## Clockify API notes

- Auth header: `X-Api-Key: <key>`
- Time entries require ISO 8601 start/end times
- `projectId` is optional but recommended
