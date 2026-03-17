/**
 * Parser module — pure functions that turn raw JSON/JSONL strings into typed objects.
 *
 * Each parser lives in its own file; this barrel re-exports them all.
 * Note: JSONL parsing is handled by `jsonl-scanner/` (the unified scanner),
 * not by this module.
 */

export { parsePlan } from "./plan.js";
export { parseValidateOutput } from "./validate-output.js";
export { detectToolFromPlan, detectToolFromOutput } from "./detect-tool.js";
