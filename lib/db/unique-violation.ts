/**
 * Whether a database error is a unique-constraint violation.
 *
 * Two requests that both create the same row is normal under concurrency, not a
 * failure: one wins, the other reads back what now exists. Recognising that case
 * is spread across several stores, each checking the Prisma code in a slightly
 * different way, so the check lives here once.
 *
 * Deliberately structural rather than `instanceof PrismaClientKnownRequestError`
 * — the error crosses transaction and adapter boundaries, and an interactive
 * transaction can rethrow something that is shaped right but is no longer the
 * same class.
 */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}
