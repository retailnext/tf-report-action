/**
 * Unified JSONL scanner — the single JSON Lines processing path for all flows.
 *
 * Replaces `parser/ui-log.ts` (`parseUILog`), `raw-formatter/jsonl.ts`
 * (`tryFormatJsonLines`), and the extraction helpers in `builder/apply.ts`.
 *
 * @module jsonl-scanner
 */

export { scanString, scanFile } from "./scan.js";
export { isJsonLines } from "./detect.js";
export type { ScanResult, PlannedChange } from "./types.js";
