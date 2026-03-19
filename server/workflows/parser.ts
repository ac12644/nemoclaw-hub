import yaml from "js-yaml";

export interface WorkflowStep {
  name: string;
  sandbox: string;
  prompt: string;
  timeout?: number;
  output?: string;
  policies?: string[];
  depends_on?: string | string[];
}

export interface WorkflowDefinition {
  name: string;
  schedule?: string;
  steps: WorkflowStep[];
}

export function parseWorkflow(yamlContent: string): WorkflowDefinition {
  const raw = yaml.load(yamlContent) as Record<string, unknown>;
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid YAML: expected an object");
  }
  if (!raw.name || typeof raw.name !== "string") {
    throw new Error("Workflow must have a 'name' field");
  }
  if (!Array.isArray(raw.steps) || raw.steps.length === 0) {
    throw new Error("Workflow must have at least one step");
  }

  const steps: WorkflowStep[] = (raw.steps as Record<string, unknown>[]).map((s, i) => {
    if (!s.name) throw new Error(`Step ${i} must have a 'name' field`);
    if (!s.sandbox) throw new Error(`Step '${s.name}' must have a 'sandbox' field`);
    if (!s.prompt) throw new Error(`Step '${s.name}' must have a 'prompt' field`);

    return {
      name: s.name as string,
      sandbox: s.sandbox as string,
      prompt: s.prompt as string,
      timeout: typeof s.timeout === "number" ? s.timeout : 300,
      output: typeof s.output === "string" ? s.output : undefined,
      policies: Array.isArray(s.policies) ? (s.policies as string[]) : undefined,
      depends_on: s.depends_on as string | string[] | undefined,
    };
  });

  return {
    name: raw.name as string,
    schedule: typeof raw.schedule === "string" ? raw.schedule : undefined,
    steps,
  };
}

export function validateWorkflow(def: WorkflowDefinition): string[] {
  const errors: string[] = [];
  const stepNames = new Set(def.steps.map((s) => s.name));

  // Check unique step names
  if (stepNames.size !== def.steps.length) {
    errors.push("Duplicate step names found");
  }

  // Check depends_on references
  for (const step of def.steps) {
    const deps = Array.isArray(step.depends_on)
      ? step.depends_on
      : step.depends_on
        ? [step.depends_on]
        : [];
    for (const dep of deps) {
      if (!stepNames.has(dep)) {
        errors.push(`Step '${step.name}' depends on unknown step '${dep}'`);
      }
      if (dep === step.name) {
        errors.push(`Step '${step.name}' cannot depend on itself`);
      }
    }
  }

  // Check schedule format (basic validation)
  if (def.schedule) {
    const parts = def.schedule.trim().split(/\s+/);
    if (parts.length !== 5) {
      errors.push(`Invalid cron schedule: expected 5 fields, got ${parts.length}`);
    }
  }

  return errors;
}
