/**
 * Minimal x402 client for the Jotri Price API (local server.py).
 *
 * x402 v2 puts the payment challenge in the `payment-required` response
 * HEADER (base64url JSON), not in the body — the body is just
 * `{"error":"Payment required"}`. The challenge's `accepts` list says:
 * scheme exact, network eip155:8453 (Base), amount 1000 = $0.001 USDC,
 * asset USDC 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913, payTo Joko's
 * wallet 0x076b862b5e2cd7e09569639402b2de76fcb8dedc.
 *
 * The payment itself is deliberately NOT performed here: a real x402
 * payment needs a funded Base wallet and a signing key, and this demo
 * never touches keys. The demo stops at the parsed 402 and logs
 * PAYMENT_REQUIRED. A live paid call is a separate, explicitly-approved
 * step (see README "Live payment").
 */

/** Decode a base64url string. */
function b64urlDecode(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64").toString("utf8");
}

/** GET /price against a base URL. Returns { status, body, challenge }. */
export async function getPrice(baseUrl, coin = "bitcoin") {
  const url = `${baseUrl.replace(/\/+$/, "")}/price?coin=${encodeURIComponent(coin)}`;
  const res = await fetch(url, { headers: { "User-Agent": "jotri-price-agent/0.1.0" } });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  let challenge = null;
  const header = res.headers.get("payment-required");
  if (header) {
    try {
      challenge = JSON.parse(b64urlDecode(header));
    } catch {
      challenge = null;
    }
  }
  // Fallback: some servers put accepts in the body.
  if (!challenge && body?.accepts) challenge = body;
  return { status: res.status, body, challenge };
}

/**
 * Parse an x402 v2 challenge object ({ accepts: [...] }) into a
 * human-readable summary.
 */
export function parseChallenge(challenge) {
  const list = Array.isArray(challenge?.accepts) ? challenge.accepts : [];
  const first = list[0] ?? {};
  const amount = first.amount ?? null;
  return {
    x402Version: challenge?.x402Version ?? null,
    scheme: first.scheme ?? null,
    network: first.network ?? null,
    amount, // base units, e.g. "1000"
    amountUsdc: amount !== null ? (Number(amount) / 1e6).toFixed(3) : null,
    asset: first.asset ?? null,
    payTo: first.payTo ?? null,
    maxTimeoutSeconds: first.maxTimeoutSeconds ?? null,
    resourceUrl: challenge?.resource?.url ?? null,
    raw: challenge,
  };
}
