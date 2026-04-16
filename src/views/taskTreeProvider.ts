import * as vscode from "vscode";
import { getTasksFromFolder, ClickUpTask } from "../api/clickup";
import { SelectedProject } from "../state/timerState";

type NodeKind = "placeholder" | "header" | "task";

export class TaskTreeItem extends vscode.TreeItem {
  constructor(
    public readonly kind: NodeKind,
    public readonly id: string,
    label: string,
    collapsible: vscode.TreeItemCollapsibleState,
    public readonly raw?: ClickUpTask
  ) {
    super(label, collapsible);
    this.contextValue = kind;

    switch (kind) {
      case "placeholder":
        this.iconPath = new vscode.ThemeIcon("arrow-right");
        this.command = {
          command: "clockup.selectProjects",
          title: "Select Projects",
        };
        break;
      case "header":
        this.iconPath = new vscode.ThemeIcon("link");
        this.command = {
          command: "clockup.selectProjects",
          title: "Change Projects",
        };
        break;
      case "task":
        this.iconPath = new vscode.ThemeIcon(
          raw?.parent ? "circle-small-filled" : "circle-outline"
        );
        this.description = raw?.status.status ?? "";
        break;
    }
  }
}

export class TaskTreeProvider
  implements vscode.TreeDataProvider<TaskTreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    TaskTreeItem | undefined | null
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private taskCache: ClickUpTask[] = [];

  constructor(
    private getApiKey: () => Promise<string | undefined>,
    private getSelectedProject: () => SelectedProject | undefined
  ) {}

  refresh(): void {
    this.taskCache = [];
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: TaskTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TaskTreeItem): Promise<TaskTreeItem[]> {
    // Subtasks of a task
    if (element?.kind === "task") {
      return this.taskCache
        .filter((t) => t.parent === element.id)
        .map(
          (t) =>
            new TaskTreeItem(
              "task",
              t.id,
              t.name,
              vscode.TreeItemCollapsibleState.None,
              t
            )
        );
    }

    // Root level
    const selected = this.getSelectedProject();
    if (!selected) {
      return [
        new TaskTreeItem(
          "placeholder",
          "",
          "Select projects to get started…",
          vscode.TreeItemCollapsibleState.None
        ),
      ];
    }

    const header = new TaskTreeItem(
      "header",
      "",
      `${selected.clickupFolderName}  →  ${selected.clockifyProjectName}`,
      vscode.TreeItemCollapsibleState.None
    );
    header.tooltip = "Click to change project selection";

    const apiKey = await this.getApiKey();
    if (!apiKey) {
      return [header];
    }

    try {
      const tasks = await getTasksFromFolder(apiKey, selected.clickupFolderId);
      this.taskCache = tasks;

      const childIds = new Set(
        tasks.filter((t) => t.parent).map((t) => t.parent!)
      );

      const topLevel = tasks
        .filter((t) => !t.parent)
        .map(
          (t) =>
            new TaskTreeItem(
              "task",
              t.id,
              t.name,
              childIds.has(t.id)
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None,
              t
            )
        );

      return [header, ...topLevel];
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Clock Up: ${message}`);
      return [header];
    }
  }
}
