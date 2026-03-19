import path from "path";
import os from "os";

export const CONFIG_DIR =
  process.env.AGENTHUB_HOME || path.join(os.homedir(), ".agenthub");

export const DB_PATH = path.join(CONFIG_DIR, "hub.db");
export const TOKEN_PATH = path.join(CONFIG_DIR, "hub-token.json");
export const REGISTRY_FILE = path.join(CONFIG_DIR, "sandboxes.json");
export const CREDS_DIR = CONFIG_DIR;
export const CREDS_FILE = path.join(CONFIG_DIR, "credentials.json");
