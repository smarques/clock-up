import * as vscode from "vscode";
import { getClickUpApiKey } from "./config";
import { TaskTreeProvider } from "./views/taskTreeProvider";
import { TimerStatusBar } from "./views/timerStatusBar";
import { registerCommands } from "./commands";
import { getActiveTimer, getSelectedProject } from "./state/timerState";

export function activate(context: vscode.ExtensionContext): void {
  const treeProvider = new TaskTreeProvider(
    () => getClickUpApiKey(context),
    () => getSelectedProject(context)
  );

  vscode.window.createTreeView("clockup.tasksView", {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });

  const statusBar = new TimerStatusBar(context);

  // Resume timer display if VSCode was restarted mid-session
  if (getActiveTimer(context)) {
    statusBar.start();
  }

  registerCommands(context, statusBar, () => treeProvider.refresh());
}

export function deactivate(): void {
  // cleanup handled via context.subscriptions
}
