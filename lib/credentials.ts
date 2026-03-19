import fs from "fs";
import path from "path";
import readline from "readline";
import { execSync } from "child_process";
import { CREDS_DIR, CREDS_FILE } from "./config.js";

export function loadCredentials(): Record<string, string> {
  try {
    if (fs.existsSync(CREDS_FILE)) {
      return JSON.parse(fs.readFileSync(CREDS_FILE, "utf-8")) as Record<string, string>;
    }
  } catch { /* ignore */ }
  return {};
}

export function saveCredential(key: string, value: string): void {
  fs.mkdirSync(CREDS_DIR, { recursive: true, mode: 0o700 });
  const creds = loadCredentials();
  creds[key] = value;
  fs.writeFileSync(CREDS_FILE, JSON.stringify(creds, null, 2), { mode: 0o600 });
}

export function getCredential(key: string): string | null {
  if (process.env[key]) return process.env[key]!;
  const creds = loadCredentials();
  return creds[key] || null;
}

export function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function ensureApiKey(): Promise<void> {
  let key = getCredential("NVIDIA_API_KEY");
  if (key) {
    process.env.NVIDIA_API_KEY = key;
    return;
  }

  key = await prompt("  NVIDIA API Key: ");

  if (!key || !key.startsWith("nvapi-")) {
    console.error("  Invalid key. Must start with nvapi-");
    process.exit(1);
  }

  saveCredential("NVIDIA_API_KEY", key);
  process.env.NVIDIA_API_KEY = key;
}

export function isRepoPrivate(repo: string): boolean {
  try {
    const json = execSync(`gh api repos/${repo} --jq .private 2>/dev/null`, { encoding: "utf-8" }).trim();
    return json === "true";
  } catch {
    return false;
  }
}

export async function ensureGithubToken(): Promise<void> {
  let token = getCredential("GITHUB_TOKEN");
  if (token) {
    process.env.GITHUB_TOKEN = token;
    return;
  }

  try {
    token = execSync("gh auth token 2>/dev/null", { encoding: "utf-8" }).trim();
    if (token) {
      process.env.GITHUB_TOKEN = token;
      return;
    }
  } catch { /* ignore */ }

  token = await prompt("  GitHub Token: ");

  if (!token) {
    console.error("  Token required.");
    process.exit(1);
  }

  saveCredential("GITHUB_TOKEN", token);
  process.env.GITHUB_TOKEN = token;
}

export { CREDS_DIR, CREDS_FILE } from "./config.js";
