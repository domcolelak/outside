import type { AgencyNote, AgencyRole } from "./types";

export function visibleAgencyNotes(notes: AgencyNote[], role: AgencyRole): AgencyNote[] {
  return role === "viewer" ? notes.filter((note) => note.visibility === "shared") : notes;
}
