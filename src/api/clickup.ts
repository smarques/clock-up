const BASE_URL = "https://api.clickup.com/api/v2";

export interface ClickUpWorkspace {
  id: string;
  name: string;
}

export interface ClickUpSpace {
  id: string;
  name: string;
}

export interface ClickUpFolder {
  id: string;
  name: string;
  spaceName?: string;
}

export interface ClickUpList {
  id: string;
  name: string;
}

export interface ClickUpAssignee {
  id: number;
  username: string;
  color: string;
  email: string;
  profilePicture?: string | null;
}

export interface ClickUpPriority {
  id: string;
  priority: string;
  color: string;
  orderindex: string;
}

export interface ClickUpChecklistItem {
  id: string;
  name: string;
  resolved: boolean;
  orderindex: number;
}

export interface ClickUpChecklist {
  id: string;
  name: string;
  orderindex: number;
  items: ClickUpChecklistItem[];
}

export interface ClickUpCustomField {
  id: string;
  name: string;
  type: string;
  value?: unknown;
  type_config?: {
    options?: Array<{ id: string; name: string; color?: string; orderindex: number }>;
  };
}

export interface ClickUpTask {
  id: string;
  name: string;
  description?: string;
  status: { status: string; color: string };
  priority?: ClickUpPriority | null;
  due_date?: string | null;
  start_date?: string | null;
  time_estimate?: number | null;
  assignees?: ClickUpAssignee[];
  tags?: Array<{ name: string; tag_fg: string; tag_bg: string }>;
  checklists?: ClickUpChecklist[];
  custom_fields?: ClickUpCustomField[];
  list: { id: string; name: string };
  folder?: { id: string; name: string };
  parent?: string;
  url: string;
}

export interface ClickUpStatus {
  status: string;
  color: string;
  type: string;
  orderindex: number;
}

async function request<T>(path: string, apiKey: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: apiKey },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ClickUp API error ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

async function put<T>(path: string, apiKey: string, body: unknown): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "PUT",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ClickUp API error ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

export async function getWorkspaces(apiKey: string): Promise<ClickUpWorkspace[]> {
  const data = await request<{ teams: ClickUpWorkspace[] }>("/team", apiKey);
  return data.teams;
}

export async function getSpaces(
  apiKey: string,
  teamId: string
): Promise<ClickUpSpace[]> {
  const data = await request<{ spaces: ClickUpSpace[] }>(
    `/team/${teamId}/space?archived=false`,
    apiKey
  );
  return data.spaces;
}

export async function getFolders(
  apiKey: string,
  spaceId: string
): Promise<ClickUpFolder[]> {
  const data = await request<{ folders: ClickUpFolder[] }>(
    `/space/${spaceId}/folder?archived=false`,
    apiKey
  );
  return data.folders;
}

export async function getFolderLists(
  apiKey: string,
  folderId: string
): Promise<ClickUpList[]> {
  const data = await request<{ lists: ClickUpList[] }>(
    `/folder/${folderId}/list?archived=false`,
    apiKey
  );
  return data.lists;
}

export async function getAllFolders(
  apiKey: string,
  teamId: string
): Promise<ClickUpFolder[]> {
  const spaces = await getSpaces(apiKey, teamId);
  const results = await Promise.all(
    spaces.map(async (space) => {
      const folders = await getFolders(apiKey, space.id);
      return folders.map((f) => ({ ...f, spaceName: space.name }));
    })
  );
  return results.flat();
}

async function getTasks(
  apiKey: string,
  listId: string
): Promise<ClickUpTask[]> {
  const data = await request<{ tasks: ClickUpTask[] }>(
    `/list/${listId}/task?archived=false&include_closed=false&subtasks=true`,
    apiKey
  );
  return data.tasks;
}

export async function getListStatuses(
  apiKey: string,
  listId: string
): Promise<ClickUpStatus[]> {
  const data = await request<{ statuses?: ClickUpStatus[] }>(
    `/list/${listId}`,
    apiKey
  );
  return (data.statuses ?? []).sort((a, b) => a.orderindex - b.orderindex);
}

export async function updateTaskStatus(
  apiKey: string,
  taskId: string,
  status: string
): Promise<ClickUpTask> {
  return put<ClickUpTask>(`/task/${taskId}`, apiKey, { status });
}

export interface TaskGroup {
  list: ClickUpList;
  tasks: ClickUpTask[];
}

export async function getTasksFromFolder(
  apiKey: string,
  folderId: string
): Promise<TaskGroup[]> {
  const lists = await getFolderLists(apiKey, folderId);
  return Promise.all(
    lists.map(async (list) => ({ list, tasks: await getTasks(apiKey, list.id) }))
  );
}
