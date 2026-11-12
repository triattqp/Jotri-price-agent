/**
 * Hash-chained, append-only audit log — the local mirror of T3 Network's
 * Merkle-backed tamper-evident ledger ("Every action is written to the
 * tamper-evident log", "Every action logged in a tamper-proof ledger").
 *
 * Each entry commits to the previous entry's hash, so any edit, deletion
 * or reordering anywhere in the log breaks verification of every entry
 * after it. Entries are JSONL: one line per entry, append-only.
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { canonical } from "./identity.js";

function hashEntry(entry) {
  const { hash, ...unsigned } = entry;
  return createHash("sha256").update(canonical(unsigned), "utf8").digest("hex");
}

export class AuditLog {
  constructor(path) {
    this.path = path;
    this.entries = [];
    if (existsSync(path)) {
      const raw = readFileSync(path, "utf8").trim();
      if (raw) this.entries = raw.split("\n").map((line) => JSON.parse(line));
    }
  }

  append(action, actor, details = {}) {
    const prev = this.entries.length ? this.entries[this.entries.length - 1].hash : "GENESIS";
    const entry = {
      seq: this.entries.length + 1,
      ts: new Date().toISOString(),
      action,
      actor,
      details,
      prev,
    };
    entry.hash = hashEntry(entry);
    this.entries.push(entry);
    appendFileSync(this.path, JSON.stringify(entry) + "\n");
    return entry;
  }

  /** Recompute the whole chain. Returns { ok, badSeq? }. */
  verify() {
    let prev = "GENESIS";
    for (const entry of this.entries) {
      if (entry.prev !== prev) return { ok: false, badSeq: entry.seq, reason: "prev-hash mismatch" };
      if (entry.hash !== hashEntry(entry)) return { ok: false, badSeq: entry.seq, reason: "entry hash mismatch" };
      prev = entry.hash;
    }
    return { ok: true, entries: this.entries.length };
  }

  /** Verify a log file without appending to it. */
  static verifyFile(path) {
    const log = new AuditLog(path);
    return log.verify();
  }
}

/** Convenience for tests: verify an in-memory entry list. */
export function verifyEntries(entries) {
  const tmp = { entries, path: "" };
  let prev = "GENESIS";
  for (const entry of entries) {
    if (entry.prev !== prev) return { ok: false, badSeq: entry.seq };
    if (entry.hash !== hashEntry(entry)) return { ok: false, badSeq: entry.seq };
    prev = entry.hash;
  }
  return { ok: true, entries: entries.length };
}

export function __hashEntryForTest(entry) {
  return hashEntry(entry);
}
