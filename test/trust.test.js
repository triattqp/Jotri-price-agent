/**
 * Tests for the trust layer: mandate enforcement + audit tamper-evidence.
 * No network, no keys on disk, no payment. Run: npm test
 */
import assert from "node:assert/strict";
import test from "node:test";
import { verifyEntries } from "../src/audit.js";
import { createIdentity, signJson, verifyJson } from "../src/identity.js";
import { checkCall, issueMandate, SpendLedger, verifyMandate } from "../src/mandate.js";

function setup() {
  const owner = createIdentity("owner");
  const agent = createIdentity("agent");
  const mandate = issueMandate(owner, agent.did, {
    scope: ["GET /price"],
    maxPerCallUsdc: "0.001",
    dailyCapUsdc: "0.10",
  });
  return { owner, agent, mandate, ledger: new SpendLedger() };
}

test("identity: signature verifies, foreign key does not", () => {
  const a = createIdentity("a");
  const b = createIdentity("b");
  const signed = signJson(a, { hello: "world" });
  assert.equal(verifyJson(a.publicKeyPem, signed), true);
  assert.equal(verifyJson(b.publicKeyPem, signed), false);
  const tampered = { ...signed, payload: signed.payload.replace("world", "mars!") };
  assert.equal(verifyJson(a.publicKeyPem, tampered), false);
});

test("mandate: valid mandate verifies", () => {
  const { owner, mandate } = setup();
  assert.deepEqual(verifyMandate(mandate, owner.publicKeyPem), { ok: true });
});

test("mandate: tampered fields fail verification", () => {
  const { owner, mandate } = setup();
  const bad = { ...mandate, maxPerCallUsdc: "100.00" };
  assert.equal(verifyMandate(bad, owner.publicKeyPem).ok, false);
});

test("mandate: expired mandate fails verification", () => {
  const { owner, agent } = setup();
  const expired = issueMandate(owner, agent.did, { ttlMs: -1000 });
  assert.equal(verifyMandate(expired, owner.publicKeyPem).ok, false);
});

test("mandate: call within scope and caps is allowed", () => {
  const { mandate, ledger } = setup();
  assert.deepEqual(checkCall(mandate, "GET /price", "0.001", ledger), { ok: true });
});

test("mandate: route outside scope is refused", () => {
  const { mandate, ledger } = setup();
  const r = checkCall(mandate, "POST /transfer", "0.001", ledger);
  assert.equal(r.ok, false);
  assert.match(r.reason, /not in mandate scope/);
});

test("mandate: amount above per-call cap is refused", () => {
  const { mandate, ledger } = setup();
  const r = checkCall(mandate, "GET /price", "0.002", ledger);
  assert.equal(r.ok, false);
  assert.match(r.reason, /exceeds maxPerCall/);
});

test("mandate: daily cap is enforced across calls", () => {
  const { mandate, ledger } = setup();
  for (let i = 0; i < 100; i++) {
    assert.deepEqual(checkCall(mandate, "GET /price", "0.001", ledger), { ok: true });
    ledger.record(mandate.agentDid, "0.001");
  }
  const r = checkCall(mandate, "GET /price", "0.001", ledger);
  assert.equal(r.ok, false);
  assert.match(r.reason, /daily cap/);
});

test("x402: v2 challenge header parses to $0.001 USDC on Base", async () => {
  const { parseChallenge } = await import("../src/x402client.js");
  const challenge = {
    x402Version: 2,
    error: "Payment required",
    resource: { url: "http://127.0.0.1:8000/price?coin=bitcoin" },
    accepts: [
      {
        scheme: "exact",
        network: "eip155:8453",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        amount: "1000",
        payTo: "0x076b862b5e2cd7e09569639402b2de76fcb8dedc",
        maxTimeoutSeconds: 300,
      },
    ],
  };
  const parsed = parseChallenge(challenge);
  assert.equal(parsed.scheme, "exact");
  assert.equal(parsed.network, "eip155:8453");
  assert.equal(parsed.amountUsdc, "0.001");
  assert.equal(parsed.payTo, "0x076b862b5e2cd7e09569639402b2de76fcb8dedc");
});

test("audit: untampered chain verifies, tampered chain fails", async () => {
  const { AuditLog } = await import("../src/audit.js");
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "audit-test-"));
  const log = new AuditLog(join(dir, "a.jsonl"));
  log.append("mandate_issued", "did:t3n:owner", { nonce: "n1" });
  log.append("price_requested", "did:t3n:agent", { coin: "bitcoin" });
  log.append("payment_required", "did:t3n:agent", { amountUsdc: "0.001" });
  assert.deepEqual(log.verify(), { ok: true, entries: 3 });

  const tampered = JSON.parse(JSON.stringify(log.entries));
  tampered[0].details.nonce = "n2"; // rewrite history
  assert.equal(verifyEntries(tampered).ok, false);
  assert.equal(verifyEntries(tampered).badSeq, 1);

  const reordered = [log.entries[1], log.entries[0], log.entries[2]];
  assert.equal(verifyEntries(reordered).ok, false);
});
