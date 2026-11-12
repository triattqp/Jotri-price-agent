/**
 * T3 Network adapter — the production path for the trust layer.
 *
 * Modelled line-for-line on Terminal 3's own reference implementation
 * (Terminal-3/private-doc-scanner, Apache-2.0 — cloned for study at
 * ../reference-private-doc-scanner/):
 *   - signIn()            <- starter/scripts/t3n.ts
 *   - registerPriceMandateContract() <- starter/scripts/setup-vault.ts
 *   - evaluateMandate()   <- starter/scripts/vault.ts
 *   - integration pattern <- docs/integration-t3.md
 *
 * Requires a FREE T3 account: sign up at
 * https://terminal3.io/products/agent-developer-kit — you get a did:t3n,
 * an API key and 20,000 sandbox credits. The key comes from the
 * environment (T3N_API_KEY) or a git-ignored .env; it is NEVER printed,
 * logged or written to disk by this code.
 *
 * This file is NOT executed by the local demo (no key here). It is the
 * drop-in that replaces the local sealed-executor stub once the account
 * exists: `npm run demo -- --t3` will use it (see demo.js).
 */
export const SIGN_UP_URL = "https://terminal3.io/products/agent-developer-kit";
export const ENV = "testnet";
export const NODE_URL = "https://cn-api.sg.testnet.t3n.terminal3.io";
export const CONTRACT_TAIL = "price-mandate";
export const CONTRACT_VERSION = "0.1.0";

/** Attested handshake (TDX quote vs the operator-signed manifest), then sign in with the key. */
export async function signIn() {
  const sdk = await import("@terminal3/t3n-sdk").catch(() => {
    throw new Error(
      "@terminal3/t3n-sdk is not installed. Run `npm install` in this folder, then retry.",
    );
  });
  const key = process.env.T3N_API_KEY?.trim();
  if (!key) {
    throw new Error(
      `No T3N API key found. Get one by signing up (free) at ${SIGN_UP_URL} — it is shown once. ` +
        "Then set T3N_API_KEY in the environment or in a git-ignored .env file. " +
        "Never paste the key into a chat.",
    );
  }
  const trustAnchor = await sdk.fetchTrustedManifest(ENV, { baseUrl: NODE_URL });
  const address = sdk.eth_get_address(key);
  const client = new sdk.T3nClient({
    baseUrl: NODE_URL,
    trustAnchor,
    wasmComponent: await sdk.loadWasmComponent(),
    handlers: { EthSign: sdk.metamask_sign(address, undefined, key) },
  });
  await client.handshake();
  const did = (await client.authenticate(sdk.createEthAuthInput(address))).value;
  const tenant = new sdk.TenantClient({
    t3n: client,
    baseUrl: NODE_URL,
    endpoint: NODE_URL,
    tenantDid: did,
  });
  return { sdk, client, did, tenant };
}

/**
 * Register the price-mandate vault contract under the owner's DID
 * (z:<tid>:price-mandate) with private maps only the contract can read or
 * write — the same shape as doc-intake's setup (register + maps.create
 * with writers/readers restricted to the contract id).
 *
 * @param {object} ctx - { sdk, tenant } from signIn()
 * @param {Uint8Array} wasm - compiled contract (Rust -> WASM, see
 *   contracts/price-mandate/CONTRACT.md). Built once the T3 account exists.
 */
export async function registerPriceMandateContract({ sdk, tenant }, wasm) {
  const name = tenant.canonicalName(CONTRACT_TAIL);
  const registered = await sdk.getContractVersion(NODE_URL, name).catch(() => null);
  if (registered === CONTRACT_VERSION) {
    return { name, version: registered, already: true };
  }
  const reg = await tenant.contracts.register({
    tail: CONTRACT_TAIL,
    version: CONTRACT_VERSION,
    wasm,
  });
  // Private maps: only this contract may read or write them.
  const acl = { writers: { only: [reg.contract_id] }, readers: { only: [reg.contract_id] } };
  for (const tail of ["mandates", "spending"]) {
    try {
      await tenant.maps.create({ tail, visibility: "private", ...acl });
    } catch (err) {
      if (!/already.?exists/i.test(String(err?.message ?? err))) throw err;
      await tenant.maps.update(tail, acl);
    }
  }
  return { name, version: CONTRACT_VERSION, contractId: reg.contract_id, already: false };
}

/**
 * Ask the enclave whether a mandate allows a call. The contract answers
 * from inside the enclave with pass/fail + which checks ran — never values
 * (same contract as doc-intake's status/evaluate).
 *
 * @param {object} ctx - { client } from signIn()
 * @param {string} mandateId - the mandate's nonce
 * @param {object} call - { route, amountUsdc }
 */
export async function evaluateMandate({ sdk, client }, mandateId, call) {
  const contract = `price-mandate`;
  const version = await sdk.getContractVersion(NODE_URL, contract).catch(() => null);
  if (!version) {
    throw new Error(`No price-mandate vault yet. Run registerPriceMandateContract() first.`);
  }
  return client.executeAndDecode({
    contract_id: contract,
    contract_version: version,
    function_name: "evaluate",
    input: { mandate_id: mandateId, route: call.route, amount_usdc: call.amountUsdc },
  });
}
