const BASE_URL = "https://api.clockify.me/api/v1";

export interface ClockifyProject {
  id: string;
  name: string;
  color: string;
}

export interface ClockifyTimeEntry {
  id: string;
  description: string;
  timeInterval: {
    start: string;
    end: string;
    duration: string;
  };
}

async function request<T>(
  method: string,
  path: string,
  apiKey: string,
  body?: unknown
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "X-Api-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Clockify API error ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

export async function getProjects(
  apiKey: string,
  workspaceId: string
): Promise<ClockifyProject[]> {
  return request<ClockifyProject[]>(
    "GET",
    `/workspaces/${workspaceId}/projects`,
    apiKey
  );
}

export async function createTimeEntry(
  apiKey: string,
  workspaceId: string,
  params: {
    description: string;
    start: Date;
    end: Date;
    projectId?: string;
    billable?: boolean;
  }
): Promise<ClockifyTimeEntry> {
  return request<ClockifyTimeEntry>(
    "POST",
    `/workspaces/${workspaceId}/time-entries`,
    apiKey,
    {
      description: params.description,
      start: params.start.toISOString(),
      end: params.end.toISOString(),
      projectId: params.projectId,
      billable: params.billable ?? false,
    }
  );
}
