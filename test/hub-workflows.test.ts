import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseWorkflow, validateWorkflow } from "../server/workflows/parser.js";
import { topologicalSort, detectCycles } from "../server/workflows/dag.js";
import { interpolate } from "../server/workflows/interpolate.js";
import { cronMatches } from "../server/workflows/scheduler.js";

describe("workflow parser", () => {
  it("parses valid YAML", () => {
    const def = parseWorkflow(`
name: test-workflow
schedule: "0 9 * * MON"
steps:
  - name: step1
    sandbox: my-agent
    prompt: "Do something"
  - name: step2
    sandbox: my-agent
    prompt: "Do something else"
    depends_on: step1
`);
    assert.equal(def.name, "test-workflow");
    assert.equal(def.schedule, "0 9 * * MON");
    assert.equal(def.steps.length, 2);
    assert.equal(def.steps[1].depends_on, "step1");
  });

  it("throws on missing name", () => {
    assert.throws(() => parseWorkflow("steps:\n  - name: a\n    sandbox: b\n    prompt: c"), /name/);
  });

  it("throws on missing steps", () => {
    assert.throws(() => parseWorkflow("name: test"), /step/);
  });

  it("throws on step without sandbox", () => {
    assert.throws(
      () => parseWorkflow("name: test\nsteps:\n  - name: a\n    prompt: c"),
      /sandbox/
    );
  });
});

describe("workflow validation", () => {
  it("passes for valid workflow", () => {
    const def = parseWorkflow(`
name: valid
steps:
  - name: a
    sandbox: s1
    prompt: go
  - name: b
    sandbox: s1
    prompt: go
    depends_on: a
`);
    const errors = validateWorkflow(def);
    assert.equal(errors.length, 0);
  });

  it("detects unknown dependency", () => {
    const def = parseWorkflow(`
name: bad-dep
steps:
  - name: a
    sandbox: s1
    prompt: go
    depends_on: nonexistent
`);
    const errors = validateWorkflow(def);
    assert.ok(errors.some((e) => e.includes("nonexistent")));
  });

  it("detects self-dependency", () => {
    const def = parseWorkflow(`
name: self-dep
steps:
  - name: a
    sandbox: s1
    prompt: go
    depends_on: a
`);
    const errors = validateWorkflow(def);
    assert.ok(errors.some((e) => e.includes("itself")));
  });

  it("detects invalid cron", () => {
    const def = parseWorkflow(`
name: bad-cron
schedule: "invalid"
steps:
  - name: a
    sandbox: s1
    prompt: go
`);
    const errors = validateWorkflow(def);
    assert.ok(errors.some((e) => e.includes("cron")));
  });
});

describe("DAG topological sort", () => {
  it("sorts independent steps into one level", () => {
    const steps = [
      { name: "a", sandbox: "s", prompt: "p" },
      { name: "b", sandbox: "s", prompt: "p" },
    ];
    const levels = topologicalSort(steps);
    assert.equal(levels.length, 1);
    assert.equal(levels[0].length, 2);
  });

  it("sorts dependent steps into multiple levels", () => {
    const steps = [
      { name: "a", sandbox: "s", prompt: "p" },
      { name: "b", sandbox: "s", prompt: "p", depends_on: "a" },
      { name: "c", sandbox: "s", prompt: "p", depends_on: "b" },
    ];
    const levels = topologicalSort(steps);
    assert.equal(levels.length, 3);
    assert.equal(levels[0][0].name, "a");
    assert.equal(levels[1][0].name, "b");
    assert.equal(levels[2][0].name, "c");
  });

  it("handles parallel branches", () => {
    const steps = [
      { name: "root", sandbox: "s", prompt: "p" },
      { name: "left", sandbox: "s", prompt: "p", depends_on: "root" },
      { name: "right", sandbox: "s", prompt: "p", depends_on: "root" },
      { name: "join", sandbox: "s", prompt: "p", depends_on: ["left", "right"] },
    ];
    const levels = topologicalSort(steps);
    assert.equal(levels.length, 3);
    assert.equal(levels[0].length, 1); // root
    assert.equal(levels[1].length, 2); // left, right
    assert.equal(levels[2].length, 1); // join
  });

  it("throws on circular dependency", () => {
    const steps = [
      { name: "a", sandbox: "s", prompt: "p", depends_on: "b" },
      { name: "b", sandbox: "s", prompt: "p", depends_on: "a" },
    ];
    assert.throws(() => topologicalSort(steps), /[Cc]ircular/);
  });
});

describe("DAG cycle detection", () => {
  it("returns null for valid DAG", () => {
    const steps = [
      { name: "a", sandbox: "s", prompt: "p" },
      { name: "b", sandbox: "s", prompt: "p", depends_on: "a" },
    ];
    assert.equal(detectCycles(steps), null);
  });

  it("detects direct cycle", () => {
    const steps = [
      { name: "a", sandbox: "s", prompt: "p", depends_on: "b" },
      { name: "b", sandbox: "s", prompt: "p", depends_on: "a" },
    ];
    const cycle = detectCycles(steps);
    assert.ok(cycle);
    assert.ok(cycle!.length >= 2);
  });
});

describe("interpolation", () => {
  it("replaces step output references", () => {
    const result = interpolate("Read {{steps.scan.output}} and summarize", {
      steps: { scan: { output: "/tmp/report.json" } },
    });
    assert.equal(result, "Read /tmp/report.json and summarize");
  });

  it("leaves unknown references untouched", () => {
    const result = interpolate("Use {{steps.missing.output}}", { steps: {} });
    assert.equal(result, "Use {{steps.missing.output}}");
  });

  it("handles multiple references", () => {
    const result = interpolate("{{steps.a.output}} and {{steps.b.output}}", {
      steps: { a: { output: "fileA" }, b: { output: "fileB" } },
    });
    assert.equal(result, "fileA and fileB");
  });

  it("handles no references", () => {
    const result = interpolate("plain text", { steps: {} });
    assert.equal(result, "plain text");
  });
});

describe("cron matcher", () => {
  it("matches wildcard", () => {
    assert.ok(cronMatches("* * * * *", new Date()));
  });

  it("matches specific minute and hour", () => {
    const d = new Date(2026, 2, 19, 9, 0); // March 19, 2026 09:00
    assert.ok(cronMatches("0 9 * * *", d));
    assert.ok(!cronMatches("30 9 * * *", d));
  });

  it("matches day of week", () => {
    const mon = new Date(2026, 2, 16, 9, 0); // Monday 09:00
    assert.ok(cronMatches("0 9 * * 1", mon));
    assert.ok(!cronMatches("0 9 * * 5", mon));
  });

  it("matches step patterns", () => {
    const d = new Date(2026, 0, 1, 0, 0); // minute 0
    assert.ok(cronMatches("*/5 * * * *", d));
    const d2 = new Date(2026, 0, 1, 0, 3); // minute 3
    assert.ok(!cronMatches("*/5 * * * *", d2));
  });

  it("matches ranges", () => {
    const d = new Date(2026, 0, 1, 10, 0); // hour 10
    assert.ok(cronMatches("0 9-11 * * *", d));
    assert.ok(!cronMatches("0 12-14 * * *", d));
  });

  it("rejects invalid format", () => {
    assert.ok(!cronMatches("invalid", new Date()));
    assert.ok(!cronMatches("* *", new Date()));
  });
});
