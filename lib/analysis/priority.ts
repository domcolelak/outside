import type { Priority } from "@/lib/types";

export const PRIORITY_RANK: Readonly<Record<Priority, number>> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

export const PRIORITY_STYLE: Readonly<Record<Priority, { color: string; label: string }>> = {
  critical: { color: "#ff5b6e", label: "Critical" },
  high: { color: "#ff8a5b", label: "High" },
  medium: { color: "#f5c451", label: "Medium" },
  low: { color: "#5b8cff", label: "Low" },
  info: { color: "#38e1c3", label: "Info" },
};
