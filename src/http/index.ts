/**
 * HTTP primitives for making proxy-aware requests.
 *
 * This module provides the transport layer used by higher-level clients
 * (GitHub API, artifact uploader). Modules that perform HTTP requests
 * accept the transport function via dependency injection — they import
 * only the types from this barrel, not the concrete `httpRequest`.
 */

export { ActionsError } from "./errors.js";
export { withRetry } from "./retry.js";
export type { RetryOptions } from "./retry.js";
export { getProxyUrl, checkBypass } from "./proxy.js";
export { httpRequest, assertOk } from "./transport.js";
export type { HttpResponse, TransportOptions } from "./transport.js";
