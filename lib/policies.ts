import fs from "fs";
import path from "path";
import os from "os";
import { ROOT, run, runCapture } from "./runner.js";
import * as registry from "./registry.js";

export const PRESETS_DIR = path.join(ROOT, "policies", "presets");

export interface PresetInfo {
  file: string;
  name: string;
  description: string;
}

export function listPresets(): PresetInfo[] {
  if (!fs.existsSync(PRESETS_DIR)) return [];
  return fs
    .readdirSync(PRESETS_DIR)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => {
      const content = fs.readFileSync(path.join(PRESETS_DIR, f), "utf-8");
      const nameMatch = content.match(/^\s*name:\s*(.+)$/m);
      const descMatch = content.match(/^\s*description:\s*"?([^"]*)"?$/m);
      return {
        file: f,
        name: nameMatch ? nameMatch[1].trim() : f.replace(".yaml", ""),
        description: descMatch ? descMatch[1].trim() : "",
      };
    });
}

export function loadPreset(name: string): string | null {
  const file = path.join(PRESETS_DIR, `${name}.yaml`);
  if (!fs.existsSync(file)) {
    console.error(`  Preset not found: ${name}`);
    return null;
  }
  return fs.readFileSync(file, "utf-8");
}

export function getPresetEndpoints(content: string): string[] {
  const hosts: string[] = [];
  const regex = /host:\s*([^\s,}]+)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    hosts.push(match[1]);
  }
  return hosts;
}

function extractPresetEntries(presetContent: string): string | null {
  const npMatch = presetContent.match(/^network_policies:\n([\s\S]*)$/m);
  if (!npMatch) return null;
  return npMatch[1].trimEnd();
}

function parseCurrentPolicy(raw: string): string {
  if (!raw) return "";
  const sep = raw.indexOf("---");
  if (sep === -1) return raw;
  return raw.slice(sep + 3).trim();
}

export function applyPreset(sandboxName: string, presetName: string): boolean {
  const presetContent = loadPreset(presetName);
  if (!presetContent) return false;

  const presetEntries = extractPresetEntries(presetContent);
  if (!presetEntries) {
    console.error(`  Preset ${presetName} has no network_policies section.`);
    return false;
  }

  let rawPolicy = "";
  try {
    rawPolicy = runCapture(
      `openshell policy get --full ${sandboxName} 2>/dev/null`,
      { ignoreError: true }
    );
  } catch { /* ignore */ }

  let currentPolicy = parseCurrentPolicy(rawPolicy);

  let merged: string;
  if (currentPolicy && currentPolicy.includes("network_policies:")) {
    const lines = currentPolicy.split("\n");
    const result: string[] = [];
    let inNetworkPolicies = false;
    let inserted = false;

    for (const line of lines) {
      const isTopLevel = /^\S.*:/.test(line);

      if (line.trim() === "network_policies:" || line.trim().startsWith("network_policies:")) {
        inNetworkPolicies = true;
        result.push(line);
        continue;
      }

      if (inNetworkPolicies && isTopLevel && !inserted) {
        result.push(presetEntries);
        inserted = true;
        inNetworkPolicies = false;
      }

      result.push(line);
    }

    if (inNetworkPolicies && !inserted) {
      result.push(presetEntries);
    }

    merged = result.join("\n");
  } else if (currentPolicy) {
    if (!currentPolicy.includes("version:")) {
      currentPolicy = "version: 1\n" + currentPolicy;
    }
    merged = currentPolicy + "\n\nnetwork_policies:\n" + presetEntries;
  } else {
    merged = "version: 1\n\nnetwork_policies:\n" + presetEntries;
  }

  const tmpFile = path.join(os.tmpdir(), `nemoclaw-policy-${Date.now()}.yaml`);
  fs.writeFileSync(tmpFile, merged, "utf-8");

  try {
    run(`openshell policy set --policy "${tmpFile}" --wait ${sandboxName}`);
    console.log(`  Applied preset: ${presetName}`);
  } finally {
    fs.unlinkSync(tmpFile);
  }

  const sandbox = registry.getSandbox(sandboxName);
  if (sandbox) {
    const pols = sandbox.policies || [];
    if (!pols.includes(presetName)) {
      pols.push(presetName);
    }
    registry.updateSandbox(sandboxName, { policies: pols });
  }

  return true;
}

export function getAppliedPresets(sandboxName: string): string[] {
  const sandbox = registry.getSandbox(sandboxName);
  return sandbox ? sandbox.policies || [] : [];
}
