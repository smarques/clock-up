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

export interface ClickUpTask {
  id: string;
  name: string;
  status: { status: string; color: string };
  list: { id: string; name: string };
  parent?: string;
  url: string;
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

export async function getTasksFromFolder(
  apiKey: string,
  folderId: string
): Promise<ClickUpTask[]> {
  const lists = await getFolderLists(apiKey, folderId);
  const taskArrays = await Promise.all(
    lists.map((l) => getTasks(apiKey, l.id))
  );
  return taskArrays.flat();
}
