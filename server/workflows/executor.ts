import crypto from "crypto";
import type { SandboxProvider } from "../providers/types.js";
import * as db from "../db.js";
import { parseWorkflow, validateWorkflow } from "./parser.js";
import { topologicalSort } from "./dag.js";
import { interpolate, type InterpolationContext } from "./interpolate.js";
import { EventEmitter } from "events";

export const workflowEvents = new EventEmitter();

export type RunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export class WorkflowExecutor {
  constructor(private provider: SandboxProvider) {}

  async run(workflowId: string, trigger: "manual" | "schedule" = "manual"): Promise<string> {
    const database = db.getDb();

    // Load workflow
    const workflow = database
      .prepare("SELECT * FROM workflows WHERE id = ?")
      .get(workflowId) as { id: string; yaml_content: string; name: string } | undefined;

    if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);

    const def = parseWorkflow(workflow.yaml_content);
    const errors = validateWorkflow(def);
    if (errors.length > 0) throw new Error(`Validation errors: ${errors.join(", ")}`);

    // Create run
    const runId = `run-${crypto.randomUUID().slice(0, 8)}`;
    database
      .prepare(
        "INSERT INTO workflow_runs (id, workflow_id, status, trigger) VALUES (?, ?, 'running', ?)"
      )
      .run(runId, workflowId, trigger);

    // Create step records
    for (const step of def.steps) {
      const stepId = `step-${crypto.randomUUID().slice(0, 8)}`;
      database
        .prepare(
          "INSERT INTO workflow_step_runs (id, run_id, step_name, status) VALUES (?, ?, ?, 'pending')"
        )
        .run(stepId, runId, step.name);
    }

    db.insertAudit(null, "workflow.started", { workflowId, runId, trigger, name: workflow.name });
    this.emitUpdate(runId);

    // Execute asynchronously
    this.executeRun(runId, def).catch((err) => {
      database
        .prepare("UPDATE workflow_runs SET status = 'failed', error = ?, completed_at = datetime('now') WHERE id = ?")
        .run(err instanceof Error ? err.message : String(err), runId);
      this.emitUpdate(runId);
    });

    return runId;
  }

  private async executeRun(runId: string, def: ReturnType<typeof parseWorkflow>): Promise<void> {
    const database = db.getDb();
    const levels = topologicalSort(def.steps);
    const context: InterpolationContext = { steps: {} };

    for (const level of levels) {
      // Check if run was cancelled
      const run = database.prepare("SELECT status FROM workflow_runs WHERE id = ?").get(runId) as { status: string };
      if (run.status === "cancelled") return;

      // Execute all steps in this level in parallel
      const results = await Promise.allSettled(
        level.map((step) => this.executeStep(runId, step, context))
      );

      // Check for failures
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === "rejected") {
          // Mark downstream steps as skipped
          this.skipDownstream(runId, level[i].name, def);

          database
            .prepare("UPDATE workflow_runs SET status = 'failed', error = ?, completed_at = datetime('now') WHERE id = ?")
            .run(result.reason instanceof Error ? result.reason.message : String(result.reason), runId);

          db.insertAudit(null, "workflow.failed", { runId, step: level[i].name });
          this.emitUpdate(runId);
          return;
        }
      }
    }

    // All steps completed
    database
      .prepare("UPDATE workflow_runs SET status = 'completed', completed_at = datetime('now') WHERE id = ?")
      .run(runId);

    db.insertAudit(null, "workflow.completed", { runId });
    this.emitUpdate(runId);
  }

  private async executeStep(
    runId: string,
    step: ReturnType<typeof parseWorkflow>["steps"][0],
    context: InterpolationContext
  ): Promise<void> {
    const database = db.getDb();

    // Update status to running
    database
      .prepare("UPDATE workflow_step_runs SET status = 'running', started_at = datetime('now') WHERE run_id = ? AND step_name = ?")
      .run(runId, step.name);
    this.emitUpdate(runId);

    // Interpolate prompt
    const prompt = interpolate(step.prompt, context);

    // Execute with timeout
    const timeoutMs = (step.timeout || 300) * 1000;
    let output: string;

    try {
      output = await Promise.race([
        this.provider.exec(step.sandbox, prompt),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Step '${step.name}' timed out after ${step.timeout}s`)), timeoutMs)
        ),
      ]);
    } catch (err) {
      database
        .prepare("UPDATE workflow_step_runs SET status = 'failed', error = ?, completed_at = datetime('now') WHERE run_id = ? AND step_name = ?")
        .run(err instanceof Error ? err.message : String(err), runId, step.name);
      this.emitUpdate(runId);
      throw err;
    }

    // Read output file if specified
    if (step.output) {
      try {
        const fileContent = await this.provider.exec(step.sandbox, `cat ${step.output}`);
        output = fileContent || output;
      } catch {
        // Output file may not exist, use exec output
      }
    }

    // Store in context for downstream steps
    context.steps[step.name] = { output };

    // Update status
    database
      .prepare("UPDATE workflow_step_runs SET status = 'completed', output = ?, completed_at = datetime('now') WHERE run_id = ? AND step_name = ?")
      .run(output.slice(0, 10000), runId, step.name);
    this.emitUpdate(runId);
  }

  private skipDownstream(runId: string, failedStep: string, def: ReturnType<typeof parseWorkflow>): void {
    const database = db.getDb();
    for (const step of def.steps) {
      const deps = Array.isArray(step.depends_on) ? step.depends_on : step.depends_on ? [step.depends_on] : [];
      if (deps.includes(failedStep)) {
        database
          .prepare("UPDATE workflow_step_runs SET status = 'skipped' WHERE run_id = ? AND step_name = ?")
          .run(runId, step.name);
        // Recursively skip downstream
        this.skipDownstream(runId, step.name, def);
      }
    }
  }

  cancel(runId: string): void {
    const database = db.getDb();
    database
      .prepare("UPDATE workflow_runs SET status = 'cancelled', completed_at = datetime('now') WHERE id = ?")
      .run(runId);
    database
      .prepare("UPDATE workflow_step_runs SET status = 'skipped' WHERE run_id = ? AND status = 'pending'")
      .run(runId);
    this.emitUpdate(runId);
  }

  private emitUpdate(runId: string): void {
    workflowEvents.emit("update", runId);
  }
}
