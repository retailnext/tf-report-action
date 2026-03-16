/**
 * Action module barrel — public API for the GitHub Action entry point.
 */

export { run } from "./main.js";
export { parseInputs } from "./inputs.js";
export type { ActionInputs } from "./inputs.js";
