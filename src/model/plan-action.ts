/**
 * PlanAction is the normalized action determined from a resource change's actions array.
 * Values match Terraform/OpenTofu plan JSON action strings plus 'replace' (derived).
 */
export type PlanAction =
  | "create"
  | "update"
  | "delete"
  | "replace"
  | "read"
  | "no-op"
  | "forget"
  | "open"
  | "unknown";

export const ACTION_SYMBOLS: Record<PlanAction, string> = {
  create: "➕",
  update: "🔧",
  delete: "❌",
  replace: "♻️",
  read: "👁",
  "no-op": "⬜",
  forget: "🗑",
  open: "📂",
  unknown: "❓",
};
