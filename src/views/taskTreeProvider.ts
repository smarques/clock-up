import * as vscode from "vscode";
import { getTasksFromFolder, ClickUpTask, TaskGroup } from "../api/clickup";
import { SelectedProject } from "../state/timerState";

type NodeKind = "placeholder" | "header" | "sprint" | "task";

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
      case "sprint":
        this.iconPath = new vscode.ThemeIcon("milestone");
        break;
      case "task":
        this.iconPath = new vscode.ThemeIcon(
          raw?.parent ? "circle-small-filled" : "circle-outline"
        );
        this.description = raw?.status.status ?? "";
        this.command = {
          command: "clockup.showDescription",
          title: "Show Description",
          arguments: [this],
        };
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

  private groupedCache: TaskGroup[] = [];
  private allTasksCache: ClickUpTask[] = [];

  constructor(
    private getApiKey: () => Promise<string | undefined>,
    private getSelectedProject: () => SelectedProject | undefined
  ) {}

  refresh(): void {
    this.groupedCache = [];
    this.allTasksCache = [];
    this._onDidChangeTreeData.fire(undefined);
  }

  updateTaskInCache(taskId: string, status: string, color: string): void {
    const task = this.allTasksCache.find((t) => t.id === taskId);
    if (task) {
      task.status = { status, color };
      this._onDidChangeTreeData.fire(undefined);
    }
  }

  async getOrFetchAllTasks(): Promise<ClickUpTask[]> {
    if (this.allTasksCache.length > 0) {
      return this.allTasksCache;
    }
    const selected = this.getSelectedProject();
    if (!selected) {
      return [];
    }
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      return [];
    }
    const groups = await getTasksFromFolder(apiKey, selected.clickupFolderId);
    this.groupedCache = groups;
    this.allTasksCache = groups.flatMap((g) => g.tasks);
    return this.allTasksCache;
  }

  getTreeItem(element: TaskTreeItem): vscode.TreeItem {
    return element;
  }

  getParent(element: TaskTreeItem): vscode.ProviderResult<TaskTreeItem> {
    if (element.kind !== "task" || !element.raw) {
      return undefined;
    }

    const { parent, list } = element.raw;

    // Subtask whose parent exists in this folder → parent task is the tree parent
    if (parent) {
      const parentTask = this.allTasksCache.find((t) => t.id === parent);
      if (parentTask) {
        return new TaskTreeItem(
          "task",
          parentTask.id,
          parentTask.name,
          vscode.TreeItemCollapsibleState.Collapsed,
          parentTask
        );
      }
    }

    // Top-level task (no parent, or parent outside folder) → sprint node is the tree parent
    const group = this.groupedCache.find((g) => g.list.id === list.id);
    if (!group) {
      return undefined;
    }
    return new TaskTreeItem(
      "sprint",
      group.list.id,
      group.list.name,
      vscode.TreeItemCollapsibleState.Collapsed
    );
  }

  /** Create a TaskTreeItem suitable for passing to TreeView.reveal(). */
  itemForTask(task: ClickUpTask): TaskTreeItem {
    const hasChildren = this.allTasksCache.some((t) => t.parent === task.id);
    return new TaskTreeItem(
      "task",
      task.id,
      task.name,
      hasChildren
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
      task
    );
  }

  async getChildren(element?: TaskTreeItem): Promise<TaskTreeItem[]> {
    // ── subtasks of a task ────────────────────────────────────────────────
    if (element?.kind === "task") {
      return this.allTasksCache
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

    // ── tasks inside a sprint (list) ──────────────────────────────────────
    if (element?.kind === "sprint") {
      const group = this.groupedCache.find((g) => g.list.id === element.id);
      if (!group) {
        return [];
      }

      // A task is top-level in its list when it has no parent, or when its
      // parent doesn't exist anywhere in the folder (orphaned reference).
      // Tasks whose parent IS in the folder belong under that parent task,
      // even if the parent lives in a different list.
      const allFolderTaskIds = new Set(this.allTasksCache.map((t) => t.id));
      const topLevelTasks = group.tasks.filter(
        (t) => !t.parent || !allFolderTaskIds.has(t.parent)
      );

      // Which of those top-level tasks have subtasks anywhere in the folder?
      const topLevelIds = new Set(topLevelTasks.map((t) => t.id));
      const subtaskParentIds = new Set(
        this.allTasksCache
          .filter((t) => t.parent && topLevelIds.has(t.parent))
          .map((t) => t.parent!)
      );

      return topLevelTasks.map(
        (t) =>
          new TaskTreeItem(
            "task",
            t.id,
            t.name,
            subtaskParentIds.has(t.id)
              ? vscode.TreeItemCollapsibleState.Collapsed
              : vscode.TreeItemCollapsibleState.None,
            t
          )
      );
    }

    // ── root level ────────────────────────────────────────────────────────
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
      const groups = await getTasksFromFolder(apiKey, selected.clickupFolderId);
      this.groupedCache = groups;
      this.allTasksCache = groups.flatMap((g) => g.tasks);

      const allFolderTaskIds = new Set(
        this.allTasksCache.map((t) => t.id)
      );

      const sprintItems = groups
        .filter((g) =>
          g.tasks.some((t) => !t.parent || !allFolderTaskIds.has(t.parent))
        )
        .map((g) => {
          const topLevelCount = g.tasks.filter(
            (t) => !t.parent || !allFolderTaskIds.has(t.parent)
          ).length;
          const item = new TaskTreeItem(
            "sprint",
            g.list.id,
            g.list.name,
            vscode.TreeItemCollapsibleState.Collapsed
          );
          item.description = `${topLevelCount} task${topLevelCount !== 1 ? "s" : ""}`;
          return item;
        });

      return [header, ...sprintItems];
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Clock Up: ${message}`);
      return [header];
    }
  }
}
