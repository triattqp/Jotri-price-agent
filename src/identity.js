/**
 * Agent identity: Ed25519 keypair + a did:t3n-style identifier.
 *
 * Local demo form. On T3 Network the DID comes from
 * `client.authenticate()` (see src/t3n.js); the local form uses the same
 * shape — `did:t3n:agent-<fingerprint>` — so the mandate and audit code
 * work unchanged once the real DID is plugged in.
 *
 * The private key never leaves this process in the demo (it is generated
 * fresh per run). In production the agent key lives in the T3 vault and
 * signing happens inside the enclave.
 */
import { createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";

/** Deterministic JSON: object keys sorted recursively. */
export function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
}

export function createIdentity(label) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pubDer = publicKey.export({ type: "spki", format: "der" });
  // Fingerprint = last 16 bytes of the DER public key, base64url.
  const fingerprint = pubDer.subarray(-16).toString("base64url");
  return {
    label,
    did: `did:t3n:agent-${fingerprint}`,
    publicKey,
    privateKey,
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }),
  };
}

/** Sign a JSON object; returns { payload (canonical string), signature }. */
export function signJson(identity, obj) {
  const payload = canonical(obj);
  const signature = sign(null, Buffer.from(payload, "utf8"), identity.privateKey);
  return { payload, signature: signature.toString("base64url") };
}

/** Verify a { payload, signature } pair against a PEM public key. */
export function verifyJson(publicKeyPem, { payload, signature }) {
  try {
    return verify(
      null,
      Buffer.from(payload, "utf8"),
      createPublicKey(publicKeyPem),
      Buffer.from(signature, "base64url"),
    );
  } catch {
    return false;
  }
}
