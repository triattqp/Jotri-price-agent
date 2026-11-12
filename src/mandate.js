/**
 * Scoped delegation mandate: the owner (Joko) authorises the agent to do
 * exactly one thing, within exact bounds. Modelled on T3's delegation
 * grants (the T3 Network checks "the owner's delegation grant: if this
 * agent has the permission to make this request").
 *
 * Mandate fields:
 *   agentDid       — the agent's did:t3n
 *   ownerDid       — the owner's did:t3n
 *   scope          — allowed routes, e.g. ["GET /price"]
 *   maxPerCallUsdc — max spend per single call ("0.001")
 *   dailyCapUsdc   — max spend per UTC day ("0.10")
 *   issuedAt / expiresAt — ISO timestamps
 *   nonce          — unique per mandate (replay protection)
 *
 * The mandate is signed by the OWNER's key. The agent verifies the
 * signature, scope, expiry and caps before every call — and refuses
 * anything outside them. Revocation = the owner stops issuing / publishes
 * a revocation entry in the audit log; the enclave checks it (see
 * contracts/price-mandate/CONTRACT.md).
 */
import { canonical, signJson, verifyJson } from "./identity.js";

export function issueMandate(owner, agentDid, opts = {}) {
  const now = new Date();
  const mandate = {
    version: "mandate/v1",
    agentDid,
    ownerDid: owner.did,
    scope: opts.scope ?? ["GET /price"],
    maxPerCallUsdc: opts.maxPerCallUsdc ?? "0.001",
    dailyCapUsdc: opts.dailyCapUsdc ?? "0.10",
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + (opts.ttlMs ?? 24 * 60 * 60 * 1000)).toISOString(),
    nonce: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
  };
  const signed = signJson(owner, mandate);
  return { ...mandate, signature: signed.signature, _payload: signed.payload };
}

/** Verify signature + expiry. Returns { ok, reason? }. */
export function verifyMandate(mandate, ownerPublicKeyPem, now = new Date()) {
  const { signature, _payload, ...unsigned } = mandate;
  if (!verifyJson(ownerPublicKeyPem, { payload: _payload, signature })) {
    return { ok: false, reason: "bad owner signature" };
  }
  // Re-canonicalise to make sure the payload matches the mandate fields.
  if (_payload !== canonical(unsigned)) {
    return { ok: false, reason: "mandate fields do not match signed payload" };
  }
  if (new Date(mandate.expiresAt) <= now) return { ok: false, reason: "mandate expired" };
  if (new Date(mandate.issuedAt) > now) return { ok: false, reason: "mandate not yet valid" };
  return { ok: true };
}

/** Decimal dollars ("0.001") -> integer micro-USDC (1 USDC = 1_000_000). Avoids float drift. */
export function toMicro(amountUsdc) {
  const [whole, frac = ""] = String(amountUsdc).split(".");
  const padded = (frac + "000000").slice(0, 6);
  return Number(whole) * 1_000_000 + Number(padded);
}

/** Check a single call against the mandate. Returns { ok, reason? }. */
export function checkCall(mandate, route, amountUsdc, ledger, now = new Date()) {
  if (!mandate.scope.includes(route)) {
    return { ok: false, reason: `route ${route} not in mandate scope [${mandate.scope.join(", ")}]` };
  }
  const amountMicro = toMicro(amountUsdc);
  if (amountMicro > toMicro(mandate.maxPerCallUsdc)) {
    return { ok: false, reason: `amount $${amountUsdc} exceeds maxPerCall $${mandate.maxPerCallUsdc}` };
  }
  const spentMicro = ledger.spentTodayMicro(mandate.agentDid, now);
  if (spentMicro + amountMicro > toMicro(mandate.dailyCapUsdc)) {
    return { ok: false, reason: `daily cap $${mandate.dailyCapUsdc} would be exceeded (spent $${(spentMicro / 1e6).toFixed(3)} today)` };
  }
  return { ok: true };
}

/** In-memory daily spend ledger (UTC day), integer micro-USDC. The enclave keeps the real one. */
export class SpendLedger {
  constructor() {
    this.totals = new Map(); // key: `${agentDid}|${YYYY-MM-DD}` -> micro-USDC (integer)
  }

  static dayKey(date) {
    return date.toISOString().slice(0, 10);
  }

  spentTodayMicro(agentDid, now = new Date()) {
    return this.totals.get(`${agentDid}|${SpendLedger.dayKey(now)}`) ?? 0;
  }

  spentToday(agentDid, now = new Date()) {
    return this.spentTodayMicro(agentDid, now) / 1e6;
  }

  record(agentDid, amountUsdc, now = new Date()) {
    const key = `${agentDid}|${SpendLedger.dayKey(now)}`;
    this.totals.set(key, (this.totals.get(key) ?? 0) + toMicro(amountUsdc));
  }
}
