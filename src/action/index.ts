/**
 * Action module barrel — public API for the GitHub Action entry point.
 *
 * This module is strictly limited to code that requires live infrastructure:
 * GitHub API calls, artifact upload (Twirp/JWT), and the main() guard.
 */

export { run } from "./main.js";
