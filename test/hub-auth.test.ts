import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";

let tmpDir: string;
let auth: typeof import("../server/auth");
let db: typeof import("../server/db");

describe("hub auth", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hub-auth-test-"));
    // Point HOME to temp dir so token and db are isolated
    process.env.HOME = tmpDir;
    const nemoDir = path.join(tmpDir, ".nemoclaw");
    fs.mkdirSync(nemoDir, { recursive: true });

    // Clear module caches
    for (const key of Object.keys(require.cache)) {
      if (key.includes("hub/server/")) delete require.cache[key];
    }

    db = require("../server/db") as typeof import("../server/db");
    db.getDb(path.join(nemoDir, "hub.db"));

    auth = require("../server/auth") as typeof import("../server/auth");
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("generates token on first call", () => {
    const token = auth.getToken();
    assert.ok(token);
    assert.equal(token.length, 64); // 32 bytes hex
  });

  it("returns same token on subsequent calls", () => {
    const t1 = auth.getToken();
    const t2 = auth.getToken();
    assert.equal(t1, t2);
  });

  it("login with correct token returns session ID", () => {
    const token = auth.getToken();
    const sessionId = auth.login(token);
    assert.ok(sessionId);
  });

  it("login with wrong token returns null", () => {
    auth.getToken();
    const sessionId = auth.login("wrong-token");
    assert.equal(sessionId, null);
  });

  it("validates active session", () => {
    const token = auth.getToken();
    const sessionId = auth.login(token)!;
    assert.ok(auth.validateSession(sessionId));
  });

  it("rejects invalid session", () => {
    assert.equal(auth.validateSession("nonexistent"), false);
    assert.equal(auth.validateSession(undefined), false);
  });

  it("logout invalidates session", () => {
    const token = auth.getToken();
    const sessionId = auth.login(token)!;
    auth.logout(sessionId);
    assert.equal(auth.validateSession(sessionId), false);
  });
});
