/**
 * Domain ownership verification via DNS-TXT.
 *
 * The user proves control of a domain by publishing a TXT record containing a
 * per-domain token we issue. This is the standard, robust ownership proof (same
 * mechanism used by Google, AWS, etc.): only someone who controls the domain's
 * DNS can add the record. Pure helpers here are unit-tested; the DNS lookup and
 * persistence live in the API route and store.
 */

import { createHmac, randomBytes } from "node:crypto";

export const TXT_PREFIX = "outside-verify";

/** A short, unguessable token. Bound to the domain via HMAC so it is stable and
 * cannot be transplanted to another domain. */
export function issueToken(domain: string, secret: string): string {
  const nonce = randomBytes(9).toString("base64url");
  const sig = createHmac("sha256", secret).update(`${domain}:${nonce}`).digest("base64url").slice(0, 16);
  return `${nonce}${sig}`;
}

/** The exact TXT record value the user must publish. */
export function expectedTxtValue(token: string): string {
  return `${TXT_PREFIX}=${token}`;
}

/** The record name to publish it at (root TXT). */
export function txtRecordName(domain: string): string {
  return domain;
}

/**
 * Decide whether any of the domain's observed TXT records satisfy the token.
 * Tolerant of provider quoting/whitespace; matches the exact issued token only.
 */
export function isTokenPresent(txtRecords: string[], token: string): boolean {
  const target = expectedTxtValue(token);
  return txtRecords.some((raw) => {
    const cleaned = raw.trim().replace(/^"|"$/g, "").trim();
    return cleaned === target;
  });
}
