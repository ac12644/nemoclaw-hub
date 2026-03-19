export interface StepContext {
  output?: string;
  [key: string]: unknown;
}

export interface InterpolationContext {
  steps: Record<string, StepContext>;
}

/**
 * Interpolate {{variable.path}} references in a template string.
 * Supports: {{steps.stepName.output}}, {{steps.stepName.anyField}}
 */
export function interpolate(template: string, context: InterpolationContext): string {
  return template.replace(/\{\{([\w.]+)\}\}/g, (match, path: string) => {
    const parts = path.split(".");
    let current: unknown = context;

    for (const part of parts) {
      if (current == null || typeof current !== "object") return match;
      current = (current as Record<string, unknown>)[part];
    }

    if (current == null) return match;
    return String(current);
  });
}
