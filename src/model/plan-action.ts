/**
 * PlanAction is the normalized action determined from a resource change's actions array.
 * Values match Terraform/OpenTofu plan JSON action strings plus derived actions:
 * - `replace`: derived from two-element action pairs (create+delete or delete+create)
 * - `move`: derived from no-op with `previous_address` (moved block)
 * - `import`: derived from no-op with `importing` (import block, no other changes)
 */
export type PlanAction =
  | "create"
  | "update"
  | "delete"
  | "replace"
  | "read"
  | "no-op"
  | "forget"
  | "move"
  | "import"
  | "open"
  | "unknown";

export const ACTION_SYMBOLS: Record<PlanAction, string> = {
  create: "➕",
  update: "🔧",
  delete: "🗑️",
  replace: "±",
  read: "👁",
  "no-op": "⬜",
  forget: "👋",
  move: "🚚",
  import: "📥",
  open: "📂",
  unknown: "❓",
};
