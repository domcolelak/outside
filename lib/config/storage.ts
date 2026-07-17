export type StorageMode = "database" | "memory";

/** Memory storage is deliberately limited to development/test or explicit demos. */
export function storageMode(): StorageMode {
  const requested = process.env.OUTSIDE_STORAGE_MODE?.trim().toLowerCase();
  if (requested && requested !== "database" && requested !== "memory") {
    throw new Error("OUTSIDE_STORAGE_MODE must be either 'database' or 'memory'.");
  }
  if (requested === "database" && !process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required when OUTSIDE_STORAGE_MODE=database.");
  }
  if (process.env.DATABASE_URL && requested !== "memory") return "database";
  if (requested === "memory") {
    if (process.env.NODE_ENV === "production") throw new Error("Production must not use in-memory storage.");
    return "memory";
  }
  if (process.env.NODE_ENV !== "production") return "memory";
  throw new Error("Production requires DATABASE_URL. Set OUTSIDE_STORAGE_MODE=memory only for an intentional ephemeral demo.");
}
