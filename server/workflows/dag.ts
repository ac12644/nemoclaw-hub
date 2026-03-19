import type { WorkflowStep } from "./parser.js";

/**
 * Topological sort of workflow steps.
 * Returns array of "levels" — steps within a level can run in parallel.
 */
export function topologicalSort(steps: WorkflowStep[]): WorkflowStep[][] {
  const stepMap = new Map(steps.map((s) => [s.name, s]));
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();

  for (const step of steps) {
    inDegree.set(step.name, 0);
    adjList.set(step.name, []);
  }

  for (const step of steps) {
    const deps = normalizeDeps(step.depends_on);
    inDegree.set(step.name, deps.length);
    for (const dep of deps) {
      adjList.get(dep)?.push(step.name);
    }
  }

  const levels: WorkflowStep[][] = [];
  const remaining = new Set(steps.map((s) => s.name));

  while (remaining.size > 0) {
    const level: WorkflowStep[] = [];
    for (const name of remaining) {
      if ((inDegree.get(name) || 0) === 0) {
        level.push(stepMap.get(name)!);
      }
    }

    if (level.length === 0) {
      throw new Error("Circular dependency detected");
    }

    for (const step of level) {
      remaining.delete(step.name);
      for (const dependent of adjList.get(step.name) || []) {
        inDegree.set(dependent, (inDegree.get(dependent) || 1) - 1);
      }
    }

    levels.push(level);
  }

  return levels;
}

/**
 * Detect cycles in the step dependency graph.
 * Returns the cycle path if found, null if DAG is valid.
 */
export function detectCycles(steps: WorkflowStep[]): string[] | null {
  const visited = new Set<string>();
  const stack = new Set<string>();
  const parent = new Map<string, string>();

  const depsMap = new Map<string, string[]>();
  for (const step of steps) {
    depsMap.set(step.name, normalizeDeps(step.depends_on));
  }

  function dfs(name: string): string[] | null {
    visited.add(name);
    stack.add(name);

    // Visit dependents (steps that depend on this one)
    for (const step of steps) {
      const deps = depsMap.get(step.name) || [];
      if (deps.includes(name)) {
        if (stack.has(step.name)) {
          return [name, step.name];
        }
        if (!visited.has(step.name)) {
          parent.set(step.name, name);
          const cycle = dfs(step.name);
          if (cycle) return cycle;
        }
      }
    }

    stack.delete(name);
    return null;
  }

  for (const step of steps) {
    if (!visited.has(step.name)) {
      const cycle = dfs(step.name);
      if (cycle) return cycle;
    }
  }

  return null;
}

function normalizeDeps(deps: string | string[] | undefined): string[] {
  if (!deps) return [];
  return Array.isArray(deps) ? deps : [deps];
}
