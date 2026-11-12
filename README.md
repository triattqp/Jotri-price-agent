# Jotri Price Agent — a trust-native x402 price agent on T3 Network

**For the Terminal 3 Build+Scale Agent Micro Grant (DoraHacks, closes 24 Dec 2026).**

An AI agent that answers crypto-price questions by calling the
Jotri Price API — a real, working x402 pay-per-call API
($0.001 USDC/call on Base, verified 11/11 by `vapi check` on 9 Nov 2026).
The problem it solves is exactly the grant's theme: today an agent that pays
for data must hold the payer's wallet key and API keys in the clear. This
agent never does.

## How trust works (the grant's three pillars)

| Pillar | How this agent does it |
|---|---|
| **Identity** | The agent has its own `did:t3n` identity. Every request it makes is signed with its agent key (`src/identity.js`). On T3 Network the DID comes from `client.authenticate()`; locally the same shape is used so the code is unchanged once the real DID is plugged in (`src/t3n.js`). |
| **Auth** | The owner (Joko) issues a **scoped, time-limited, revocable delegation mandate**: only `POST /price` (here: `GET /price`), max **$0.001/call**, daily cap **$0.10**, expiry set by the owner (`src/mandate.js`). The mandate is Ed25519-signed by the owner; the agent verifies the signature, scope, expiry and caps before every call — and refuses anything outside them. |
| **Audit trail** | Every step (mandate issued, call attempted, payment required, result) is appended to a **hash-chained, append-only audit log** (`src/audit.js`) — the local mirror of T3's Merkle-backed tamper-evident ledger. `verify()` recomputes the whole chain; flipping one byte is detected. On T3 the same entries are written by the enclave. |

The sensitive part — payment signing and the API key — is designed to run
**inside the T3 Intel TDX enclave** (`src/t3n.js`, modeled line-for-line on
Terminal 3's own reference implementation,
[`Terminal-3/private-doc-scanner`](https://github.com/Terminal-3/private-doc-scanner),
Apache-2.0, cloned under `reference-private-doc-scanner/` for study):
`fetchTrustedManifest` → attested `handshake()` → `authenticate()` →
`TenantClient` → the agent's own vault contract `z:<tid>:price-mandate`
(registered like `doc-intake`, private maps only that contract can read).
The agent asks the enclave to *evaluate* the mandate and execute the paid
call; it never sees the key or the raw secret. The enclave returns
pass/fail, never values.

## What is real, what is a stub (honest status)

- **Real and runnable now:** agent identity, mandate issue/verify/enforce,
  hash-chained audit log + tamper detection, x402 402-challenge parsing
  against the real local Jotri Price API (`~/workspace/x402-api/server.py`).
  Run `npm test` and `npm run demo` — no keys, no network, no payment.
- **Needs a free T3 account (Joko):** `src/t3n.js` (`signIn`,
  `registerPriceMandateContract`, `evaluateMandate`). Sign up at
  <https://terminal3.io/products/agent-developer-kit> — free, gives a
  `did:t3n`, an API key and 20,000 sandbox credits. The contract artifact
  (`contracts/price-mandate/`) follows the `doc-intake` Rust→WASM pattern;
  it is specified here and built once the account exists.
- **Needs a funded Base wallet (Joko, $0.001 USDC/call):** the demo stops at
  the 402 challenge on purpose — it never signs a payment and never touches
  a key. A live paid call is a separate, explicitly-approved step.

## Run

```bash
# 1. Start the real Jotri Price API (port 8000) in one terminal:
python3 ~/workspace/x402-api/server.py

# 2. Run the trust demo (dry-run: no payment is sent):
npm run demo

# 3. Run the tests (mandate enforcement + audit tamper-evidence):
npm test
```

Demo output: mandate issued → mandate verified → price requested →
`402 Payment Required` challenge parsed ($0.001 USDC, Base, payTo Joko's
wallet) → mandate caps checked → `PAYMENT_REQUIRED` logged (dry-run) →
audit chain verified → tamper check on a modified copy fails as expected.

## Layout

```
src/
  identity.js   Ed25519 agent identity, did:t3n-style IDs, sign/verify
  mandate.js    Scoped delegation mandate + daily spend ledger
  audit.js      Hash-chained append-only audit log
  x402client.js Minimal x402 client (402 challenge parsing)
  t3n.js        T3 Network adapter (needs free T3 account + API key)
  demo.js       End-to-end trust demo (dry-run, no payment)
test/
  trust.test.js Mandate enforcement + audit tamper-evidence
contracts/
  price-mandate/CONTRACT.md   Vault contract spec (Rust→WASM, doc-intake pattern)
SUBMISSION.md   DoraHacks submission draft
```

## Why this fits the grant

- **Agent builders with real users:** the agent is Amani, Joko's real
  personal agent; the API is Joko's real paid API; the user is Joko.
- **Trust-native:** identity + scoped auth + audit trail are the product,
  not an afterthought — they are the three things the grant asks for.
- **SOC 2 direction:** every agent action is attributable to a DID,
  bounded by a signed mandate, and provable from a tamper-evident log —
  the same properties Terminal 3's Agent Command sells to regulated
  enterprises (see `terminal3.io` — SOC 2, ISO 27001:2022).
- **Free to start:** T3 sandbox is free (20,000 credits); the demo runs
  with zero keys and zero spend; the grant's own perks (subsidised T3
  credits, Google Cloud intro) map directly onto scaling this agent.
