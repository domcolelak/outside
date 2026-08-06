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
