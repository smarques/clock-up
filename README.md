# Clock Up

Track time on ClickUp tasks directly from VS Code, with entries logged automatically to Clockify.

![Clock Up](resources/Clockup%20ScreenShot.png)

## Features

- **Task tree in the Activity Bar** — browse all tasks and subtasks from your selected ClickUp folder without leaving the editor
- **One-click timer** — hit `▶` on any task or subtask to start tracking instantly
- **Live status bar** — elapsed time and task name visible at a glance; click to stop
- **Auto-generated entry titles** — uses GitHub Copilot (if available) to write a concise description in English or Italian; falls back to `#taskId first words of task name`
- **Task search** — fuzzy-search across all tasks by name, sprint, or status via Quick Pick
- **Task detail panel** — view status, priority, due date, estimate, assignees, tags, custom fields, description, and checklists in a side panel
- **Clockify integration** — time entries are created automatically with correct start/end times and project association
- **Secure key storage** — API keys are stored in the OS keychain via VS Code SecretStorage, never in plain settings
- **Status management** — right-click any task to set its ClickUp status via Quick Pick; starting a timer automatically moves the task to *In Progress*
- **Survives restarts** — active timer state is persisted across VS Code sessions

## Requirements

- A [ClickUp](https://clickup.com) account with API access
- A [Clockify](https://clockify.me) account with API access

## Setup

### 1. Get your API keys

**ClickUp:** Go to *Settings → Apps → API Token* and copy your personal token.

**Clockify:** Go to *Profile Settings → API* and copy your API key.

### 2. Get your workspace/team IDs

**ClickUp team ID:** Found in the URL when browsing your workspace — `app.clickup.com/<team-id>/...`

**Clockify workspace ID:** Found in the URL in the Clockify web app — `app.clockify.me/t/<workspace-id>/...`

### 3. Configure the extension

Open VS Code settings (`Cmd+,`) and set:

```json
"clockup.clickupTeamId": "<your ClickUp team ID>",
"clockup.clockifyWorkspaceId": "<your Clockify workspace ID>"
```

Then store your API keys securely via the Command Palette (`Cmd+Shift+P`):

- **Clock Up: Set ClickUp API Key**
- **Clock Up: Set Clockify API Key**

Keys are stored in the OS keychain via VS Code's SecretStorage — never in settings files.

### 4. Select your projects

Run **Clock Up: Select Projects** from the Command Palette, or click the gear icon in the Clock Up panel.

1. Pick a **ClickUp folder** (shown as "Project" in the ClickUp UI)
2. Pick a **Clockify project** to log time against

## Tracking time

Open the **Clock Up** panel in the Activity Bar. It shows all tasks and subtasks from your selected ClickUp folder.

- **Start timer:** Click the `▶` button next to any task or subtask — the task is automatically moved to *In Progress* in ClickUp
- **Stop timer:** Click the status bar item at the bottom of the window (shows elapsed time and task name)
- **Change status:** Right-click any task and select **Set Task Status** to pick from the available statuses for that list

When you stop the timer, a time entry is created in Clockify with:
- **Description:** AI-generated summary, or `#<taskId> <first words of task name>` as fallback
- **Project:** your selected Clockify project
- **Start/end times:** the actual tracked interval

## Commands

| Command | Description |
|---|---|
| `Clock Up: Set ClickUp API Key` | Store your ClickUp API key securely |
| `Clock Up: Set Clockify API Key` | Store your Clockify API key securely |
| `Clock Up: Select Projects` | Choose a ClickUp folder and Clockify project |
| `Clock Up: Start Timer` | Start tracking the selected task |
| `Clock Up: Stop Timer` | Stop tracking and log the entry to Clockify |
| `Clock Up: Refresh Tasks` | Re-fetch the task list |
| `Clock Up: Search Tasks` | Fuzzy-search all tasks by name, sprint, or status |
| `Clock Up: Show Task Description` | Open the task detail panel |
| `Clock Up: Set Task Status` | Change the ClickUp status of a task (right-click menu) |

## Notes

- Timer state is persisted across VS Code restarts — you can close and reopen VS Code without losing an active timer
- Subtasks are shown nested under their parent task
- Tasks are fetched from all lists inside the selected ClickUp folder

## License

MIT — see [LICENSE](LICENSE) for details.
