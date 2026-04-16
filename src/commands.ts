import * as vscode from "vscode";
import {
  setClickUpApiKey,
  setClockifyApiKey,
  getClickUpApiKey,
  getClockifyApiKey,
  getSettings,
} from "./config";
import {
  saveActiveTimer,
  clearActiveTimer,
  getActiveTimer,
  saveSelectedProject,
  getSelectedProject,
} from "./state/timerState";
import { createTimeEntry, getProjects } from "./api/clockify";
import { getAllFolders, ClickUpTask, ClickUpCustomField } from "./api/clickup";
import { TaskTreeItem, TaskTreeProvider } from "./views/taskTreeProvider";
import { TimerStatusBar } from "./views/timerStatusBar";

let activeDescriptionPanel: vscode.WebviewPanel | undefined;

export function registerCommands(
  context: vscode.ExtensionContext,
  statusBar: TimerStatusBar,
  treeProvider: TaskTreeProvider,
  treeView: vscode.TreeView<TaskTreeItem>
): void {
  const refreshTree = () => treeProvider.refresh();
  context.subscriptions.push(
    vscode.commands.registerCommand("clockup.setClickUpApiKey", () =>
      setClickUpApiKey(context)
    ),

    vscode.commands.registerCommand("clockup.setClockifyApiKey", () =>
      setClockifyApiKey(context)
    ),

    vscode.commands.registerCommand("clockup.selectProjects", async () => {
      await selectProjects(context, refreshTree);
    }),

    vscode.commands.registerCommand(
      "clockup.startTimer",
      async (item: TaskTreeItem) => {
        const selected = getSelectedProject(context);
        if (!selected) {
          vscode.window.showWarningMessage(
            "No project selected. Run 'Clock Up: Select Projects' first."
          );
          return;
        }

        const existing = getActiveTimer(context);
        if (existing) {
          const choice = await vscode.window.showWarningMessage(
            `Timer already running for "${existing.taskName}". Stop it and start a new one?`,
            "Yes",
            "No"
          );
          if (choice !== "Yes") return;
          await stopAndSave(context, statusBar);
        }

        const startTime = new Date().toISOString();
        const { entryDescriptionLanguage } = getSettings();
        const entryTitle = await generateEntryTitle(item.id, item.label as string, entryDescriptionLanguage);

        await saveActiveTimer(context, {
          taskId: item.id,
          taskName: item.label as string,
          entryTitle,
          clockifyProjectId: selected.clockifyProjectId,
          startTime,
        });

        statusBar.start();
        vscode.window.showInformationMessage(`Timer started: "${entryTitle}"`);
      }
    ),

    vscode.commands.registerCommand("clockup.stopTimer", async () => {
      const timer = getActiveTimer(context);
      if (!timer) {
        vscode.window.showWarningMessage("No active timer.");
        return;
      }
      await stopAndSave(context, statusBar);
    }),

    vscode.commands.registerCommand("clockup.refreshTasks", refreshTree),

    vscode.commands.registerCommand("clockup.searchTasks", async () => {
      let tasks: ClickUpTask[];
      try {
        tasks = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Clock Up: Loading tasks…",
          },
          () => treeProvider.getOrFetchAllTasks()
        );
      } catch (err) {
        vscode.window.showErrorMessage(
          `Clock Up: ${err instanceof Error ? err.message : err}`
        );
        return;
      }

      if (tasks.length === 0) {
        vscode.window.showInformationMessage(
          "No tasks found. Select a project first."
        );
        return;
      }

      const parentById = new Map(tasks.map((t) => [t.id, t]));

      type TaskPickItem = vscode.QuickPickItem & { task: ClickUpTask };

      const items: TaskPickItem[] = tasks.map((t) => {
        const isSubtask = !!t.parent;
        const parent = t.parent ? parentById.get(t.parent) : undefined;
        return {
          label: `$(${isSubtask ? "circle-small-filled" : "circle-outline"}) ${t.name}`,
          description: [t.list.name, parent?.name].filter(Boolean).join("  ·  "),
          detail: t.status.status,
          task: t,
        };
      });

      const picked = await vscode.window.showQuickPick<TaskPickItem>(items, {
        title: "Clock Up: Search Tasks",
        placeHolder: "Type to filter by name, sprint, or status…",
        matchOnDescription: true,
        matchOnDetail: true,
      });

      if (!picked) {
        return;
      }

      if (activeDescriptionPanel) {
        activeDescriptionPanel.dispose();
      }

      activeDescriptionPanel = vscode.window.createWebviewPanel(
        "clockup.taskDescription",
        panelTitle(picked.task.name),
        vscode.ViewColumn.Beside,
        { enableScripts: false }
      );
      activeDescriptionPanel.webview.html = buildDescriptionHtml(picked.task);
      activeDescriptionPanel.onDidDispose(() => {
        activeDescriptionPanel = undefined;
      });

      treeView.reveal(treeProvider.itemForTask(picked.task), {
        select: true,
        focus: false,
        expand: true,
      });
    }),

    vscode.commands.registerCommand(
      "clockup.showDescription",
      (item: TaskTreeItem) => {
        if (!item.raw) {
          vscode.window.showInformationMessage("No task data available.");
          return;
        }

        if (activeDescriptionPanel) {
          activeDescriptionPanel.dispose();
        }

        activeDescriptionPanel = vscode.window.createWebviewPanel(
          "clockup.taskDescription",
          panelTitle(item.label as string),
          vscode.ViewColumn.Beside,
          { enableScripts: false }
        );
        activeDescriptionPanel.webview.html = buildDescriptionHtml(item.raw);
        activeDescriptionPanel.onDidDispose(() => {
          activeDescriptionPanel = undefined;
        });
      }
    )
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function panelTitle(name: string, maxLen = 40): string {
  return name.length > maxLen ? name.slice(0, maxLen - 1) + "…" : name;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatMs(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatDate(tsMs: string): string {
  return new Date(Number(tsMs)).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatCustomFieldValue(field: ClickUpCustomField): string | null {
  const v = field.value;
  if (v === null || v === undefined || v === "") {
    return null;
  }
  switch (field.type) {
    case "drop_down": {
      const idx = typeof v === "number" ? v : Number(v);
      const opt = field.type_config?.options?.find((o) => o.orderindex === idx);
      return opt?.name ?? String(v);
    }
    case "labels": {
      const ids = Array.isArray(v) ? (v as string[]) : [];
      const names = ids.map(
        (id) => field.type_config?.options?.find((o) => o.id === id)?.name ?? id
      );
      return names.length ? names.join(", ") : null;
    }
    case "checkbox":
      return v ? "✓ Yes" : "✗ No";
    case "date":
      return typeof v === "string" || typeof v === "number"
        ? formatDate(String(v))
        : null;
    case "users": {
      const users = Array.isArray(v) ? v : [v];
      const names = users
        .map((u) =>
          u && typeof u === "object" && "username" in u
            ? (u as { username: string }).username
            : null
        )
        .filter(Boolean);
      return names.length ? names.join(", ") : null;
    }
    default:
      if (typeof v === "string") { return v || null; }
      if (typeof v === "number") { return String(v); }
      return null;
  }
}

function buildDescriptionHtml(task: ClickUpTask): string {
  // ── metadata chips ────────────────────────────────────────────────────────
  const metaRows: string[] = [];

  // Status
  metaRows.push(
    `<div class="meta-item">
      <span class="meta-label">Status</span>
      <span class="badge" style="background:${esc(task.status.color)};color:#fff">
        ${esc(task.status.status)}
      </span>
    </div>`
  );

  // Priority
  if (task.priority) {
    metaRows.push(
      `<div class="meta-item">
        <span class="meta-label">Priority</span>
        <span class="badge" style="background:${esc(task.priority.color)};color:#fff">
          ${esc(task.priority.priority)}
        </span>
      </div>`
    );
  }

  // Due date
  if (task.due_date) {
    metaRows.push(
      `<div class="meta-item">
        <span class="meta-label">Due date</span>
        <span class="meta-value">${esc(formatDate(task.due_date))}</span>
      </div>`
    );
  }

  // Time estimate
  if (task.time_estimate) {
    metaRows.push(
      `<div class="meta-item">
        <span class="meta-label">Estimate</span>
        <span class="meta-value">${esc(formatMs(task.time_estimate))}</span>
      </div>`
    );
  }

  // Sprint (list name — in sprint workflows each list is a sprint)
  if (task.list?.name) {
    metaRows.push(
      `<div class="meta-item">
        <span class="meta-label">Sprint / List</span>
        <span class="meta-value">${esc(task.list.name)}</span>
      </div>`
    );
  }

  // Assignees
  if (task.assignees?.length) {
    const names = task.assignees.map((a) => esc(a.username)).join(", ");
    metaRows.push(
      `<div class="meta-item">
        <span class="meta-label">Assignees</span>
        <span class="meta-value">${names}</span>
      </div>`
    );
  }

  // Tags
  if (task.tags?.length) {
    const tagHtml = task.tags
      .map(
        (t) =>
          `<span class="badge tag" style="background:${esc(t.tag_bg)};color:${esc(t.tag_fg)}">${esc(t.name)}</span>`
      )
      .join(" ");
    metaRows.push(
      `<div class="meta-item">
        <span class="meta-label">Tags</span>
        <span class="meta-value">${tagHtml}</span>
      </div>`
    );
  }

  // ── custom fields ─────────────────────────────────────────────────────────
  const customFieldRows = (task.custom_fields ?? [])
    .map((f) => {
      const val = formatCustomFieldValue(f);
      if (!val) { return ""; }
      return `<div class="meta-item">
        <span class="meta-label">${esc(f.name)}</span>
        <span class="meta-value">${esc(val)}</span>
      </div>`;
    })
    .filter(Boolean);

  // ── description ───────────────────────────────────────────────────────────
  const descHtml = task.description?.trim()
    ? `<section class="section">
        <h3>Description</h3>
        <p class="description">${esc(task.description).replace(/\n/g, "<br>")}</p>
      </section>`
    : "";

  // ── checklists ────────────────────────────────────────────────────────────
  const checklistHtml = (task.checklists ?? [])
    .map((cl) => {
      const items = cl.items
        .sort((a, b) => a.orderindex - b.orderindex)
        .map(
          (item) =>
            `<li class="${item.resolved ? "resolved" : ""}">
              <span class="check-icon">${item.resolved ? "✓" : "○"}</span>
              ${esc(item.name)}
            </li>`
        )
        .join("\n");
      const total = cl.items.length;
      const done = cl.items.filter((i) => i.resolved).length;
      return `<section class="section">
        <h3>${esc(cl.name)} <span class="progress">${done}/${total}</span></h3>
        <ul class="checklist">${items}</ul>
      </section>`;
    })
    .join("\n");

  // ── assemble ──────────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';" />
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      padding: 20px 24px;
      line-height: 1.6;
      max-width: 800px;
    }
    .header {
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 10px;
      margin-bottom: 16px;
    }
    h2 {
      font-size: 1.15em;
      margin: 0 0 6px;
      overflow-wrap: break-word;
      word-break: break-word;
    }
    .open-link {
      font-size: 0.85em;
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
    }
    .open-link:hover { text-decoration: underline; }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 8px 16px;
      margin-bottom: 20px;
    }
    .meta-item {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .meta-label {
      font-size: 0.75em;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--vscode-descriptionForeground);
    }
    .meta-value { font-size: 0.9em; }
    .badge {
      display: inline-block;
      padding: 1px 7px;
      border-radius: 10px;
      font-size: 0.8em;
      font-weight: 600;
      text-transform: capitalize;
    }
    .badge.tag { font-weight: 400; }
    .section { margin-top: 20px; }
    .section h3 {
      font-size: 0.9em;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--vscode-descriptionForeground);
      margin: 0 0 8px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .progress {
      font-size: 0.85em;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 1px 6px;
      border-radius: 8px;
      text-transform: none;
      letter-spacing: 0;
    }
    .description {
      white-space: pre-wrap;
      font-size: 0.92em;
      line-height: 1.7;
      margin: 0;
    }
    .checklist {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .checklist li {
      font-size: 0.92em;
      display: flex;
      gap: 8px;
      align-items: baseline;
    }
    .checklist li.resolved {
      color: var(--vscode-disabledForeground);
      text-decoration: line-through;
    }
    .check-icon { flex-shrink: 0; }
    .divider {
      border: none;
      border-top: 1px solid var(--vscode-panel-border);
      margin: 20px 0 0;
    }
  </style>
</head>
<body>
  <div class="header">
    <h2>${esc(task.name)}</h2>
    <a class="open-link" href="${esc(task.url)}">Open in ClickUp →</a>
  </div>

  <div class="meta-grid">
    ${metaRows.join("\n    ")}
    ${customFieldRows.join("\n    ")}
  </div>

  ${descHtml}
  ${checklistHtml}
</body>
</html>`;
}

async function selectProjects(
  context: vscode.ExtensionContext,
  refreshTree: () => void
): Promise<void> {
  const clickupKey = await getClickUpApiKey(context);
  if (!clickupKey) {
    vscode.window.showErrorMessage(
      "No ClickUp API key set. Run 'Clock Up: Set ClickUp API Key' first."
    );
    return;
  }

  const clockifyKey = await getClockifyApiKey(context);
  if (!clockifyKey) {
    vscode.window.showErrorMessage(
      "No Clockify API key set. Run 'Clock Up: Set Clockify API Key' first."
    );
    return;
  }

  const { clickupTeamId, clockifyWorkspaceId } = getSettings();
  if (!clickupTeamId) {
    vscode.window.showErrorMessage(
      "No ClickUp team ID set. Add 'clockup.clickupTeamId' in settings."
    );
    return;
  }
  if (!clockifyWorkspaceId) {
    vscode.window.showErrorMessage(
      "No Clockify workspace ID set. Add 'clockup.clockifyWorkspaceId' in settings."
    );
    return;
  }

  // Step 1: pick ClickUp folder
  let clickupFolders;
  try {
    clickupFolders = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "Loading ClickUp projects…" },
      () => getAllFolders(clickupKey, clickupTeamId)
    );
  } catch (err) {
    vscode.window.showErrorMessage(
      `Failed to load ClickUp projects: ${err instanceof Error ? err.message : err}`
    );
    return;
  }

  const clickupPick = await vscode.window.showQuickPick(
    clickupFolders.map((f) => ({
      label: f.name,
      description: f.spaceName,
      id: f.id,
    })),
    { title: "Select ClickUp Project", placeHolder: "Choose a ClickUp folder…" }
  );
  if (!clickupPick) return;

  // Step 2: pick Clockify project
  let clockifyProjects;
  try {
    clockifyProjects = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "Loading Clockify projects…" },
      () => getProjects(clockifyKey, clockifyWorkspaceId)
    );
  } catch (err) {
    vscode.window.showErrorMessage(
      `Failed to load Clockify projects: ${err instanceof Error ? err.message : err}`
    );
    return;
  }

  const clockifyPick = await vscode.window.showQuickPick(
    clockifyProjects.map((p) => ({ label: p.name, id: p.id })),
    { title: "Select Clockify Project", placeHolder: "Choose a Clockify project…" }
  );
  if (!clockifyPick) return;

  await saveSelectedProject(context, {
    clickupFolderId: clickupPick.id,
    clickupFolderName: clickupPick.label,
    clockifyProjectId: clockifyPick.id,
    clockifyProjectName: clockifyPick.label,
  });

  refreshTree();
  vscode.window.showInformationMessage(
    `Project set: ${clickupPick.label}  →  ${clockifyPick.label}`
  );
}

async function generateEntryTitle(taskId: string, taskName: string, language: "english" | "italian"): Promise<string> {
  const prefix = `#${taskId}`;
  const fallback = `${prefix} ${taskName.trim().split(/\s+/).slice(0, 10).join(" ")}`;

  try {
    const models = await vscode.lm.selectChatModels({ vendor: "copilot" });
    if (models.length === 0) {
      return fallback;
    }

    const tokenSource = new vscode.CancellationTokenSource();
    const response = await models[0].sendRequest(
      [
        vscode.LanguageModelChatMessage.User(
          `Write a concise 10-word description in ${language} for a time tracking entry based on this task name.\n` +
          `Reply with ONLY the 10 words in ${language}, no punctuation, no extra text.\n\n` +
          `Task: ${taskName}`
        ),
      ],
      {},
      tokenSource.token
    );

    let description = "";
    for await (const chunk of response.text) {
      description += chunk;
    }

    const trimmed = description.trim();
    return trimmed ? `${prefix} ${trimmed}` : fallback;
  } catch {
    return fallback;
  }
}

async function stopAndSave(
  context: vscode.ExtensionContext,
  statusBar: TimerStatusBar
): Promise<void> {
  const timer = getActiveTimer(context);
  if (!timer) return;

  const endTime = new Date();
  const startTime = new Date(timer.startTime);

  statusBar.stop();
  await clearActiveTimer(context);

  const clockifyKey = await getClockifyApiKey(context);
  if (!clockifyKey) {
    vscode.window.showWarningMessage(
      "No Clockify API key set. Time entry not saved."
    );
    return;
  }

  const { clockifyWorkspaceId } = getSettings();
  if (!clockifyWorkspaceId) {
    vscode.window.showWarningMessage(
      "No Clockify workspace ID set. Time entry not saved."
    );
    return;
  }

  try {
    await createTimeEntry(clockifyKey, clockifyWorkspaceId, {
      description: timer.entryTitle,
      start: startTime,
      end: endTime,
      projectId: timer.clockifyProjectId,
    });

    const duration = Math.round(
      (endTime.getTime() - startTime.getTime()) / 60_000
    );
    vscode.window.showInformationMessage(
      `Logged ${duration} min for "${timer.entryTitle}" to Clockify.`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(
      `Failed to create Clockify entry: ${message}`
    );
  }
}
