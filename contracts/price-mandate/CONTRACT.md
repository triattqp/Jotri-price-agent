# price-mandate vault contract — specification

A T3 Network vault contract for the Jotri Price Agent, following the
`doc-intake` pattern from Terminal 3's reference implementation
(`Terminal-3/private-doc-scanner`, `contracts/doc-intake`, Apache-2.0).

## Identity

- Tail: `price-mandate`, version `0.1.0`
- Registered under the owner's DID as `z:<tid>:price-mandate`
  (see `starter/scripts/setup-vault.ts` in the reference repo and
  `src/t3n.js:registerPriceMandateContract` here).
- Private maps, readable/writable only by this contract id:
  `mandates`, `spending`.

## Build (once the free T3 account exists)

Rust → WASM (`wasm32-wasip2`), same toolchain as `doc-intake`.
After building, the `.wasm` is pinned by SHA-256 in a manifest (same as
`starter/vault/manifest.json` in the reference repo) and registered with
`registerPriceMandateContract()`.

## Functions (all run inside the Intel TDX enclave; answers never values)

### `ingest` — store a mandate

Input (`mandate/v1`):

```json
{
  "schema": "mandate/v1",
  "mandate_id": "m_abc123",
  "agent_did": "did:t3n:agent-…",
  "owner_did": "did:t3n:…",
  "scope": ["GET /price"],
  "max_per_call_usdc": "0.001",
  "daily_cap_usdc": "0.10",
  "issued_at": "2026-11-12T00:00:00.000Z",
  "expires_at": "2026-11-13T00:00:00.000Z",
  "owner_signature": "<base64url Ed25519 over the canonical mandate>"
}
```

Behaviour: verify the owner signature over the canonical mandate
(reject on mismatch); verify `expires_at` is in the future; store under
`mandate_id` in the `mandates` map. Rejects a second `ingest` with the
same `mandate_id` unless the new one carries a higher `issued_at` and a
`supersedes` field naming the old id (rotation, not silent overwrite).

### `status` — what the vault knows about a mandate

Input: `{ "mandate_id": "m_abc123" }`

Output (presence + state only, never values):

```json
{
  "exists": true,
  "revoked": false,
  "expired": false,
  "scope": ["GET /price"],
  "spent_today_usdc": "0.042"
}
```

### `evaluate` — may this call proceed?

Input:

```json
{ "mandate_id": "m_abc123", "route": "GET /price", "amount_usdc": "0.001" }
```

Output (pass/fail + which checks ran, never values):

```json
{
  "allowed": true,
  "checks": [
    { "id": "signature.valid", "ok": true },
    { "id": "not_revoked", "ok": true },
    { "id": "not_expired", "ok": true },
    { "id": "route.in_scope", "ok": true },
    { "id": "amount.within_per_call_cap", "ok": true },
    { "id": "daily_cap.not_exceeded", "ok": true }
  ]
}
```

On `allowed: true` the contract atomically adds `amount_usdc` to the
`spending` map for the mandate's current UTC day, so the daily cap is
enforced even across concurrent calls.

### `revoke` — owner revokes a mandate

Input: `{ "mandate_id": "m_abc123", "owner_signature": "<sig over mandate_id + 'revoke'>" }`

Behaviour: verify the owner signature; mark the mandate revoked.
`evaluate` returns `allowed: false` with `not_revoked: false` afterwards.
Revocation is append-only: a revoked mandate can never be un-revoked.

## Deterministic checks (mirroring doc-intake's rule)

A field is trusted only by a deterministic check: signature verification,
expiry comparison, scope membership, decimal comparison of amounts.
No LLM judgement inside the contract — the enclave answers yes/no from
the stored mandate and the spending map.

## Reference implementation

The same semantics are implemented in TypeScript in this repo
(`src/mandate.js` + `src/audit.js`) and covered by `test/trust.test.js`,
so the contract's behaviour is testable before the WASM build exists.
