import * as vscode from "vscode";
import { getActiveTimer } from "../state/timerState";

export class TimerStatusBar {
  private item: vscode.StatusBarItem;
  private interval: ReturnType<typeof setInterval> | undefined;

  constructor(private context: vscode.ExtensionContext) {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.item.command = "clockup.stopTimer";
    context.subscriptions.push(this.item);
  }

  start(): void {
    this.refresh();
    this.interval = setInterval(() => this.refresh(), 1000);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
    this.item.hide();
  }

  private refresh(): void {
    const timer = getActiveTimer(this.context);
    if (!timer) {
      this.stop();
      return;
    }

    const elapsed = Date.now() - new Date(timer.startTime).getTime();
    const hours = Math.floor(elapsed / 3_600_000);
    const minutes = Math.floor((elapsed % 3_600_000) / 60_000);
    const seconds = Math.floor((elapsed % 60_000) / 1_000);

    const hh = String(hours).padStart(2, "0");
    const mm = String(minutes).padStart(2, "0");
    const ss = String(seconds).padStart(2, "0");

    this.item.text = `$(clock) ${hh}:${mm}:${ss}  #${timer.taskId}`;
    this.item.tooltip = `Tracking: ${timer.taskName}\nClick to stop`;
    this.item.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground"
    );
    this.item.show();
  }
}
