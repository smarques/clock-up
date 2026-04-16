import * as vscode from "vscode";

const CLICKUP_KEY = "clockup.clickupApiKey";
const CLOCKIFY_KEY = "clockup.clockifyApiKey";

function obfuscate(key: string): string {
  if (key.length <= 8) return "•".repeat(key.length);
  return key.slice(0, 4) + "•".repeat(key.length - 8) + key.slice(-4);
}

export async function getClickUpApiKey(
  context: vscode.ExtensionContext
): Promise<string | undefined> {
  return context.secrets.get(CLICKUP_KEY);
}

export async function setClickUpApiKey(
  context: vscode.ExtensionContext
): Promise<void> {
  const key = await vscode.window.showInputBox({
    title: "ClickUp API Key",
    prompt: "Enter your ClickUp personal API token",
    password: true,
    ignoreFocusOut: true,
  });
  if (key) {
    await context.secrets.store(CLICKUP_KEY, key);
    await vscode.workspace
      .getConfiguration("clockup")
      .update("clickupApiKeyHint", obfuscate(key), vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage("ClickUp API key saved.");
  }
}

export async function getClockifyApiKey(
  context: vscode.ExtensionContext
): Promise<string | undefined> {
  return context.secrets.get(CLOCKIFY_KEY);
}

export async function setClockifyApiKey(
  context: vscode.ExtensionContext
): Promise<void> {
  const key = await vscode.window.showInputBox({
    title: "Clockify API Key",
    prompt: "Enter your Clockify API key",
    password: true,
    ignoreFocusOut: true,
  });
  if (key) {
    await context.secrets.store(CLOCKIFY_KEY, key);
    await vscode.workspace
      .getConfiguration("clockup")
      .update("clockifyApiKeyHint", obfuscate(key), vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage("Clockify API key saved.");
  }
}

export function getSettings() {
  const config = vscode.workspace.getConfiguration("clockup");
  return {
    clockifyWorkspaceId: config.get<string>("clockifyWorkspaceId", ""),
    clickupTeamId: config.get<string>("clickupTeamId", ""),
    projectMapping: config.get<Record<string, string>>("projectMapping", {}),
    entryDescriptionLanguage: config.get<"english" | "italian">("entryDescriptionLanguage", "english"),
  };
}
