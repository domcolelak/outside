export function staleGraphIds(existingIds: Iterable<string>, incomingIds: Iterable<string>): string[] {
  const incoming = new Set(incomingIds);
  return [...existingIds].filter((id) => !incoming.has(id));
}
