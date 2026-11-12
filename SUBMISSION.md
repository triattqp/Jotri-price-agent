# DoraHacks submission draft — Terminal 3 Build+Scale Agent Micro Grant

> DRAFT — do not submit yet. Status 12 Nov 2026 ~01:50 WIB: demo video DONE
> (`demo.mp4`, 2 min, narration + real demo output). Repo DONE:
> https://github.com/jjjjotirai/jotri-price-agent (public, empty, account
> jjjjotirai — akun pertama jotri-ai SUSPENDED GitHub; remote origin sudah
> diset di repo lokal). T3 account: did:t3n:19e4579a88c91a105f611abf92e4bc029fa4b091
> (dari email sambutan Terminal 3 ke limahha354@gmail.com; 20.000 sandbox
> credits diklaim). Verifikasi API 12 Nov: node testnet hidup; whoami stateless
> dijawab 401 — sesuai dokumen SDK, kunci akun adalah ETH private key untuk
> sesi handshake, bukan bearer key `t3n_key_...` yang diterima endpoint
> stateless, jadi ikatan key-did belum dibuktikan kriptografis dari VM
> (butuh sekali jalan quickstart SDK dengan key). Still needed: (1) `gh auth
> login` di VM via device flow (browser masuk sebagai jjjjotirai) lalu push,
> (2) submit on DoraHacks after 1.
>
> Verified DoraHacks page (parent, live check):
> https://dorahacks.io/hackathon/t3-build-scale-grant/detail
> Deadline: **24 Dec 2026, 22:59 WIB**. Requirements: repo link
> (GitHub/GitLab/Bitbucket) + demo video. Judging: **Traction 80%**
> (real-user adoption, credits across unique DIDs, dashboard/analytics)
> + **Visibility 20%** (X + Telegram group, tag @terminal3io).
> Top 2 share the $1,800 pool.

## Title

**Amani Price Agent — a trust-native x402 price agent on T3 Network**

## Tagline

An AI agent that pays $0.001 per crypto price via x402 — with its own
`did:t3n` identity, a scoped owner mandate, and a tamper-evident audit
trail. It never holds a key.

## Description (for the form)

AI agents that pay for data today must hold the payer's wallet key and
API keys in the clear. Amani Price Agent fixes that with the T3 Network
Developer Platform:

- **Identity:** the agent has its own `did:t3n` identity; every request
  is signed with its agent key.
- **Auth:** the owner issues a scoped, time-limited, revocable delegation
  mandate — only `GET /price`, max $0.001/call, $0.10/day. The agent
  verifies signature, scope, expiry and caps before every call and
  refuses anything outside them.
- **Audit trail:** every step is written to a hash-chained, append-only
  audit log (the local mirror of T3's Merkle-backed tamper-evident
  ledger). Tampering is detected by re-verification.
- **Sealed execution:** payment signing and secrets run inside the T3
  Intel TDX enclave (attested handshake → `authenticate()` → the agent's
  own vault contract `z:<tid>:price-mandate`). The enclave answers
  pass/fail, never values — the same pattern as Terminal 3's own
  private-doc-scanner reference implementation.

The paid API is real and already verified: the Jotri Price API
($0.001 USDC/call on Base via x402, payTo the owner's wallet) passed
11/11 `vapi check` assertions on 9 Nov 2026. The agent is Amani, the
owner's real personal agent; the user is the owner himself.

## What was built

- `src/identity.js` — Ed25519 agent identity, `did:t3n` IDs
- `src/mandate.js` — scoped delegation mandate + daily spend ledger
- `src/audit.js` — hash-chained append-only audit log
- `src/x402client.js` — x402 402-challenge client for the price API
- `src/t3n.js` — T3 Network adapter (signIn / register contract /
  evaluate), modelled on Terminal 3's reference repo
- `contracts/price-mandate/CONTRACT.md` — vault contract spec
- `test/trust.test.js` — 10 tests, all passing (mandate enforcement +
  audit tamper-evidence + x402 challenge parsing)
- `src/demo.js` — end-to-end dry-run demo against the real local API
- `demo.mp4` — 2-minute demo video (narration + real demo output),
  built 12 Nov 2026 in `demo-video/` (`render_slides.py` + TTS)

## T3 account (verified 12 Nov 2026)

- Account: login Google limahha354@gmail.com; 20.000 sandbox credits claimed.
- Owner DID: `did:t3n:19e4579a88c91a105f611abf92e4bc029fa4b091` — source:
  Terminal 3 welcome email to limahha354@gmail.com (provider-issued).
  The DID's 40-hex tail is the ETH address the account key is the private
  key of (per the SDK README, the claim API key *is* that private key).
- API verification from this VM (12 Nov, connector `custom.terminal3`,
  helper `~/workspace/custom-connectors/custom.terminal3/bin/t3n.py`):
  node `https://cn-api.sg.testnet.t3n.terminal3.io` is live (root 404,
  unauthenticated `POST /api/discover` 401, both ~1.5 s); the credential is
  registered with placement `custom_header:X-T3N-Api-Key` and the helper
  attaches it. `t3n.py whoami` was answered **401** — the expected response
  for this credential type: per the SDK (`@terminal3/t3n-client`), the
  stateless `/api/discover` and `/api/invoke` endpoints only resolve an org
  agent's opaque bearer key (`t3n_key_...`) or an OAuth bearer, not an
  account ETH key. The account key authenticates via the session flow
  instead (ML-KEM handshake + `authenticate()` with a local EthSign of the
  challenge), which needs the key bytes locally — the credential store only
  supplies a surrogate for HTTP requests, so a full cryptographic
  key-to-DID proof was **not** run from this VM. Next step for full proof:
  run the SDK quickstart once with the key in hand (it prints
  `Connected as: did:t3n:...`), or after the first session auth, mint an
  org agent key via `create-agent` — that `t3n_key_...` bearer *does* work
  on the stateless endpoints and its `whoami` returns the agent DID.
- The DID is well-formed as far as the node is concerned:
  `GET /api/agent-card/<did>` returns 404 `no agent card hosted for this
  DID` (no public card — expected for a plain account DID, cards are hosted
  only for org agents created with one), not a malformed-DID error.

## Links (fill in before submit)

- Repo: https://github.com/jjjjotirai/jotri-price-agent (public, empty;
  remote origin set in the local repo. Still to do: `gh auth login` on the
  VM via device flow, then push.)
- Demo video: `demo.mp4` in this repo (2 min): 0:00 the problem
  (agent holding keys) → 0:25 mandate issued + verified → 0:50 price
  request, 402 challenge, caps checked → 1:20 audit log verified +
  tamper test fails as expected → 1:50 what the T3 account unlocks
  (enclave path).
- Live demo: local only until the T3 account + Deno deploy are live.

## Grant use (if awarded)

- T3 sandbox credits to run the enclave path end-to-end on testnet.
- Google Cloud intro (grant perk) to host the agent runner.
- Remainder toward the first month of paid-call volume once the agent
  serves real users.

## Team

- Joko Purnomo (jotri.ai) — owner, builder. Solo.
