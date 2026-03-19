import * as db from "../db.js";
import type { WorkflowExecutor } from "./executor.js";

export class WorkflowScheduler {
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(private executor: WorkflowExecutor) {}

  start(): void {
    if (this.interval) return;
    this.interval = setInterval(() => this.tick(), 60_000);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private tick(): void {
    const database = db.getDb();
    const workflows = database
      .prepare("SELECT * FROM workflows WHERE enabled = 1 AND schedule IS NOT NULL")
      .all() as Array<{ id: string; name: string; schedule: string }>;

    const now = new Date();

    for (const wf of workflows) {
      if (!cronMatches(wf.schedule, now)) continue;

      // Check no run is currently running for this workflow
      const running = database
        .prepare("SELECT id FROM workflow_runs WHERE workflow_id = ? AND status = 'running' LIMIT 1")
        .get(wf.id);
      if (running) continue;

      this.executor.run(wf.id, "schedule").catch((err) => {
        console.error(`Scheduled run failed for workflow ${wf.name}:`, err);
      });
    }
  }
}

/**
 * Simple cron matcher. Supports: numbers, *, ranges (1-5), steps (*​/5).
 * Format: minute hour dayOfMonth month dayOfWeek
 */
export function cronMatches(expression: string, date: Date): boolean {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const fields = [
    date.getMinutes(),
    date.getHours(),
    date.getDate(),
    date.getMonth() + 1,
    date.getDay(),
  ];

  for (let i = 0; i < 5; i++) {
    if (!fieldMatches(parts[i], fields[i])) return false;
  }

  return true;
}

function fieldMatches(pattern: string, value: number): boolean {
  if (pattern === "*") return true;

  // Step: */5
  if (pattern.startsWith("*/")) {
    const step = parseInt(pattern.slice(2), 10);
    return !isNaN(step) && step > 0 && value % step === 0;
  }

  // Comma-separated: 1,5,10
  const parts = pattern.split(",");
  for (const part of parts) {
    // Range: 1-5
    if (part.includes("-")) {
      const [min, max] = part.split("-").map((s) => parseInt(s, 10));
      if (!isNaN(min) && !isNaN(max) && value >= min && value <= max) return true;
    } else {
      const num = parseInt(part, 10);
      if (!isNaN(num) && num === value) return true;
    }
  }

  return false;
}
