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
import { getAllFolders } from "./api/clickup";
import { TaskTreeItem } from "./views/taskTreeProvider";
import { TimerStatusBar } from "./views/timerStatusBar";

export function registerCommands(
  context: vscode.ExtensionContext,
  statusBar: TimerStatusBar,
  refreshTree: () => void
): void {
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
        const entryTitle = await generateEntryTitle(item.id, item.label as string);

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

    vscode.commands.registerCommand("clockup.refreshTasks", refreshTree)
  );
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

async function generateEntryTitle(taskId: string, taskName: string): Promise<string> {
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
          `Write a concise 10-word description for a time tracking entry based on this task name.\n` +
          `Reply with ONLY the 10 words, no punctuation, no extra text.\n\n` +
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
