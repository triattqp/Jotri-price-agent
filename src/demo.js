/**
 * End-to-end trust demo (DRY-RUN: no payment is ever sent).
 *
 *   1. Start the real Jotri Price API first:  python3 ~/workspace/x402-api/server.py
 *   2. Run:  npm run demo
 *
 * Flow: owner issues a signed, scoped mandate -> agent verifies it ->
 * agent requests a price -> the API answers 402 with the x402 challenge ->
 * the agent checks the mandate caps -> stops at PAYMENT_REQUIRED (dry-run)
 * -> the hash-chained audit log is verified -> a tampered copy fails
 * verification, as it should.
 *
 * Optional: `npm run demo -- --t3` also attempts the T3 Network sign-in
 * (src/t3n.js). Without a free T3 account it fails with a clear message
 * telling the user where to sign up — that is the expected outcome here.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AuditLog, verifyEntries } from "./audit.js";
import { createIdentity } from "./identity.js";
import { checkCall, issueMandate, SpendLedger, verifyMandate } from "./mandate.js";
import { getPrice, parseChallenge } from "./x402client.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "out");
const PRICE_API = process.env.PRICE_API_URL ?? "http://127.0.0.1:8000";
const COIN = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "bitcoin";
const WANT_T3 = process.argv.includes("--t3");

const step = (n, msg) => console.log(`\n[${n}] ${msg}`);
const ok = (msg) => console.log(`    ✓ ${msg}`);
const note = (msg) => console.log(`    · ${msg}`);

mkdirSync(OUT, { recursive: true });
const logPath = join(OUT, "audit.jsonl");
rmSync(logPath, { force: true });
const log = new AuditLog(logPath);
const ledger = new SpendLedger();

// 1. Identities
step(1, "Identities — owner (Joko) and agent (Amani)");
const owner = createIdentity("joko-owner");
const agent = createIdentity("amani-agent");
console.log(`    owner DID: ${owner.did}`);
console.log(`    agent DID: ${agent.did}`);
log.append("identity_created", owner.did, { agentDid: agent.did });

// 2. Owner issues a scoped mandate
step(2, "Owner issues a scoped, signed mandate");
const mandate = issueMandate(owner, agent.did, {
  scope: ["GET /price"],
  maxPerCallUsdc: "0.001",
  dailyCapUsdc: "0.10",
  ttlMs: 24 * 60 * 60 * 1000,
});
console.log(`    scope: ${mandate.scope.join(", ")} | max/call: $${mandate.maxPerCallUsdc} | daily cap: $${mandate.dailyCapUsdc}`);
console.log(`    expires: ${mandate.expiresAt} | nonce: ${mandate.nonce}`);
log.append("mandate_issued", owner.did, {
  agentDid: agent.did,
  scope: mandate.scope,
  maxPerCallUsdc: mandate.maxPerCallUsdc,
  dailyCapUsdc: mandate.dailyCapUsdc,
  expiresAt: mandate.expiresAt,
  nonce: mandate.nonce,
});

// 3. Agent verifies the mandate before doing anything
step(3, "Agent verifies the mandate (signature, expiry, payload)");
const verified = verifyMandate(mandate, owner.publicKeyPem);
if (!verified.ok) {
  console.error(`    ✗ mandate rejected: ${verified.reason}`);
  process.exit(1);
}
ok("owner signature valid, mandate in force");
log.append("mandate_verified", agent.did, { nonce: mandate.nonce });

// 4. Agent requests a price from the real local API
step(4, `Agent requests a price: GET ${PRICE_API}/price?coin=${COIN}`);
let challenge;
try {
  const res = await getPrice(PRICE_API, COIN);
  if (res.status !== 402) {
    console.error(`    ✗ expected HTTP 402, got ${res.status}: ${JSON.stringify(res.body).slice(0, 200)}`);
    console.error("    Is server.py running? python3 ~/workspace/x402-api/server.py");
    process.exit(1);
  }
  challenge = parseChallenge(res.challenge);
} catch (err) {
  console.error(`    ✗ could not reach the price API at ${PRICE_API}: ${err.message}`);
  console.error("    Start it first: python3 ~/workspace/x402-api/server.py");
  process.exit(1);
}
ok(`402 Payment Required — challenge parsed`);
console.log(`    scheme: ${challenge.scheme} | network: ${challenge.network}`);
console.log(`    amount: ${challenge.amount} base units = $${challenge.amountUsdc} USDC`);
console.log(`    asset: ${challenge.asset}`);
console.log(`    payTo: ${challenge.payTo}`);
log.append("price_requested", agent.did, {
  coin: COIN,
  route: "GET /price",
  challenge: {
    scheme: challenge.scheme,
    network: challenge.network,
    amountUsdc: challenge.amountUsdc,
    payTo: challenge.payTo,
  },
});

// 5. Mandate enforcement: route + caps
step(5, "Mandate enforcement — route, per-call cap, daily cap");
const allowed = checkCall(mandate, "GET /price", challenge.amountUsdc, ledger);
if (!allowed.ok) {
  console.error(`    ✗ call refused: ${allowed.reason}`);
  log.append("call_refused", agent.did, { reason: allowed.reason });
  process.exit(1);
}
ok(`route in scope, $${challenge.amountUsdc} <= max/call $${mandate.maxPerCallUsdc}, daily spent $0.000 <= cap $${mandate.dailyCapUsdc}`);

// 6. Dry-run stop: no payment is sent
step(6, "DRY-RUN stop — no payment is sent");
note("A live $0.001 USDC payment needs a funded Base wallet + a signing key.");
note("This demo never touches keys, so it stops here — by design.");
log.append("payment_required", agent.did, {
  amountUsdc: challenge.amountUsdc,
  network: challenge.network,
  payTo: challenge.payTo,
  mode: "dry-run",
  paid: false,
});

// 7. Audit chain verification
step(7, "Audit trail — verify the hash chain");
const check = log.verify();
if (!check.ok) {
  console.error(`    ✗ audit chain broken at seq ${check.badSeq}: ${check.reason}`);
  process.exit(1);
}
ok(`chain valid, ${check.entries} entries, log at out/audit.jsonl`);

// 8. Tamper-evidence: a modified copy must fail
step(8, "Tamper-evidence — modify one entry in a copy, verification must fail");
const tampered = JSON.parse(JSON.stringify(log.entries));
tampered[1].details.maxPerCallUsdc = "100.00"; // attacker raises the cap
const tamperCheck = verifyEntries(tampered);
if (tamperCheck.ok) {
  console.error("    ✗ TAMPER NOT DETECTED — audit log is broken!");
  process.exit(1);
}
ok(`tampering detected at seq ${tamperCheck.badSeq} — the log cannot be silently edited`);

// 9. Optional T3 sign-in attempt
if (WANT_T3) {
  step(9, "T3 Network sign-in (needs a free T3 account)");
  try {
    const t3n = await import("./t3n.js");
    const ctx = await t3n.signIn();
    ok(`signed in as ${ctx.did}`);
  } catch (err) {
    note(`expected without an account: ${err.message.split("\n")[0]}`);
  }
}

console.log(`\nDone. Audit log: ${logPath}`);
console.log("Next: sign up free at https://terminal3.io/products/agent-developer-kit,");
console.log("set T3N_API_KEY, and run `npm run demo -- --t3` to wire the enclave path.");
