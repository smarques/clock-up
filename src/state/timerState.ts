import * as vscode from "vscode";

const TIMER_KEY = "clockup.activeTimer";
const PROJECT_KEY = "clockup.selectedProject";

export interface SelectedProject {
  clickupFolderId: string;
  clickupFolderName: string;
  clockifyProjectId: string;
  clockifyProjectName: string;
}

export interface ActiveTimer {
  taskId: string;
  taskName: string;
  entryTitle: string; // "#taskId first five words"
  clockifyProjectId: string;
  startTime: string; // ISO string
}

export function getSelectedProject(
  context: vscode.ExtensionContext
): SelectedProject | undefined {
  return context.workspaceState.get<SelectedProject>(PROJECT_KEY);
}

export async function saveSelectedProject(
  context: vscode.ExtensionContext,
  project: SelectedProject
): Promise<void> {
  await context.workspaceState.update(PROJECT_KEY, project);
}

export function getActiveTimer(
  context: vscode.ExtensionContext
): ActiveTimer | undefined {
  return context.workspaceState.get<ActiveTimer>(TIMER_KEY);
}

export async function saveActiveTimer(
  context: vscode.ExtensionContext,
  timer: ActiveTimer
): Promise<void> {
  await context.workspaceState.update(TIMER_KEY, timer);
}

export async function clearActiveTimer(
  context: vscode.ExtensionContext
): Promise<void> {
  await context.workspaceState.update(TIMER_KEY, undefined);
}
