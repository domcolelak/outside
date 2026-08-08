/**
 * The wire format for a two-part credential (an identifier plus a secret),
 * stored as one encrypted value.
 *
 * This lives on its own, free of Node built-ins, because both sides of the
 * contract need it: the browser assembles the pair before sending it, and the
 * adapter splits it apart on the server. Defining it in the adapter would have
 * forced the browser to reimplement the format inline — two definitions of one
 * contract, free to drift apart silently.
 *
 * A colon separates the halves. Only the FIRST colon splits, so a secret is free
 * to contain them; the identifier is not, which holds for the providers that use
 * this (a Censys API ID is a UUID).
 */

export interface CredentialPair {
  id: string;
  secret: string;
}

/** Join an identifier and secret into the single value the store holds. */
export function joinCredentialPair(id: string, secret: string): string {
  return `${id.trim()}:${secret.trim()}`;
}

/** Split a stored pair. Returns null when either half is missing. */
export function splitCredentialPair(raw: string): CredentialPair | null {
  const separator = raw.indexOf(":");
  if (separator <= 0) return null;
  const id = raw.slice(0, separator).trim();
  const secret = raw.slice(separator + 1).trim();
  return id && secret ? { id, secret } : null;
}

/**
 * Split a credential of a fixed number of parts, where only the LAST part may
 * contain colons — the same rule as the pair, extended.
 *
 * Microsoft identity credentials are three parts (tenant, client, secret). The
 * leading parts are GUIDs and never contain a colon; the trailing secret is free
 * to, so the split is bounded from the left rather than naive.
 *
 * Returns null unless exactly `count` non-empty parts are present, so a
 * half-filled credential can never be partially applied.
 */
export function splitCredentialParts(raw: string, count: number): string[] | null {
  if (count < 2) return null;
  const parts: string[] = [];
  let rest = raw;
  for (let index = 0; index < count - 1; index += 1) {
    const separator = rest.indexOf(":");
    if (separator <= 0) return null;
    parts.push(rest.slice(0, separator).trim());
    rest = rest.slice(separator + 1);
  }
  parts.push(rest.trim());
  return parts.every((part) => part.length > 0) ? parts : null;
}

/** Join fixed parts into the single value the credential store holds. */
export function joinCredentialParts(...parts: string[]): string {
  return parts.map((part) => part.trim()).join(":");
}
