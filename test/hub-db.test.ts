import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";

// Use a temp DB for each test
let tmpDir: string;
let db: typeof import("../server/db");

function freshDb() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hub-db-test-"));
  const dbPath = path.join(tmpDir, "test.db");
  // We need to reset the module each time, so import dynamically
  db = require("../server/db") as typeof import("../server/db");
  db.getDb(dbPath);
  return dbPath;
}

describe("hub database", () => {
  beforeEach(() => {
    freshDb();
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("messages", () => {
    it("inserts and retrieves messages", () => {
      db.insertMessage("test-sandbox", "user", "hello");
      db.insertMessage("test-sandbox", "assistant", "hi there");

      const msgs = db.getMessages("test-sandbox");
      assert.equal(msgs.length, 2);
      assert.equal(msgs[0].role, "user");
      assert.equal(msgs[0].content, "hello");
      assert.equal(msgs[1].role, "assistant");
    });

    it("filters by sandbox", () => {
      db.insertMessage("sandbox-a", "user", "msg a");
      db.insertMessage("sandbox-b", "user", "msg b");

      const msgsA = db.getMessages("sandbox-a");
      assert.equal(msgsA.length, 1);
      assert.equal(msgsA[0].content, "msg a");
    });

    it("supports limit and offset", () => {
      for (let i = 0; i < 10; i++) {
        db.insertMessage("test", "user", `msg ${i}`);
      }

      const page1 = db.getMessages("test", { limit: 3, offset: 0 });
      assert.equal(page1.length, 3);
      assert.equal(page1[0].content, "msg 0");

      const page2 = db.getMessages("test", { limit: 3, offset: 3 });
      assert.equal(page2.length, 3);
      assert.equal(page2[0].content, "msg 3");
    });
  });

  describe("audit events", () => {
    it("inserts and retrieves events", () => {
      db.insertAudit("test-sandbox", "sandbox.created", { name: "test" });
      db.insertAudit(null, "credential.updated", { key: "NVIDIA_API_KEY" });

      const events = db.getAuditEvents();
      assert.equal(events.length, 2);
    });

    it("filters by sandbox", () => {
      db.insertAudit("sandbox-a", "policy.applied", {});
      db.insertAudit("sandbox-b", "policy.applied", {});

      const events = db.getAuditEvents({ sandbox: "sandbox-a" });
      assert.equal(events.length, 1);
    });

    it("filters by event type", () => {
      db.insertAudit("test", "sandbox.created", {});
      db.insertAudit("test", "policy.applied", {});

      const events = db.getAuditEvents({ eventType: "policy.applied" });
      assert.equal(events.length, 1);
      assert.equal(events[0].event_type, "policy.applied");
    });

    it("stores detail as JSON string", () => {
      db.insertAudit("test", "test.event", { foo: "bar", num: 42 });
      const events = db.getAuditEvents();
      const detail = JSON.parse(events[0].detail!);
      assert.equal(detail.foo, "bar");
      assert.equal(detail.num, 42);
    });
  });

  describe("sessions", () => {
    it("creates and retrieves sessions", () => {
      const future = new Date(Date.now() + 86400000).toISOString();
      db.createSession("session-1", future);

      const session = db.getSession("session-1");
      assert.ok(session);
      assert.equal(session!.id, "session-1");
    });

    it("returns undefined for missing session", () => {
      const session = db.getSession("nonexistent");
      assert.equal(session, undefined);
    });

    it("deletes sessions", () => {
      const future = new Date(Date.now() + 86400000).toISOString();
      db.createSession("session-2", future);
      db.deleteSession("session-2");

      const session = db.getSession("session-2");
      assert.equal(session, undefined);
    });

    it("cleans expired sessions", () => {
      const past = new Date(Date.now() - 1000).toISOString();
      const future = new Date(Date.now() + 86400000).toISOString();
      db.createSession("expired", past);
      db.createSession("valid", future);

      db.cleanExpiredSessions();

      assert.equal(db.getSession("expired"), undefined);
      assert.ok(db.getSession("valid"));
    });
  });
});
