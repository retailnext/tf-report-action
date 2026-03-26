/**
 * Proxy detection matching `@actions/http-client` behavior.
 *
 * Reads `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` environment variables (with
 * lowercase precedence) and determines whether a request should be routed
 * through a proxy. Accepts an `Env` parameter for dependency injection
 * instead of reading `process.env` directly.
 */

import type { Env } from "../env/index.js";

// ---------------------------------------------------------------------------
// Loopback detection
// ---------------------------------------------------------------------------

/** Whether `host` is a loopback address that should always bypass the proxy. */
function isLoopbackAddress(host: string): boolean {
  const lower = host.toLowerCase();
  return (
    lower === "localhost" ||
    lower.startsWith("127.") ||
    lower.startsWith("[::1]") ||
    lower.startsWith("[0:0:0:0:0:0:0:1]")
  );
}

// ---------------------------------------------------------------------------
// NO_PROXY bypass
// ---------------------------------------------------------------------------

/**
 * Whether `reqUrl` should bypass the proxy.
 *
 * Bypass occurs when:
 * 1. The hostname is a loopback address.
 * 2. `NO_PROXY` / `no_proxy` contains `*` (bypass all).
 * 3. The hostname (optionally with port) matches a `NO_PROXY` entry exactly.
 * 4. The hostname is a subdomain of a `NO_PROXY` entry (with or without
 *    leading dot).
 *
 * Matching is case-insensitive. Ports default to 80 (HTTP) or 443 (HTTPS)
 * when not specified in the request URL.
 */
export function checkBypass(reqUrl: URL, env: Env): boolean {
  if (!reqUrl.hostname) {
    return false;
  }

  if (isLoopbackAddress(reqUrl.hostname)) {
    return true;
  }

  const noProxy = env["no_proxy"] ?? env["NO_PROXY"] ?? "";
  if (!noProxy) {
    return false;
  }

  // Determine the effective port for matching.
  let reqPort: number | undefined;
  if (reqUrl.port) {
    reqPort = Number(reqUrl.port);
  } else if (reqUrl.protocol === "http:") {
    reqPort = 80;
  } else if (reqUrl.protocol === "https:") {
    reqPort = 443;
  }

  // Build the set of host representations to match against.
  const upperHosts = [reqUrl.hostname.toUpperCase()];
  if (reqPort !== undefined) {
    upperHosts.push(`${upperHosts[0]!}:${String(reqPort)}`);
  }

  for (const entry of noProxy
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s !== "")) {
    if (
      entry === "*" ||
      upperHosts.some(
        (h) =>
          h === entry ||
          h.endsWith(`.${entry}`) ||
          (entry.startsWith(".") && h.endsWith(entry)),
      )
    ) {
      return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Proxy URL resolution
// ---------------------------------------------------------------------------

/**
 * Get the proxy URL for a given request URL, or `undefined` if no proxy
 * applies.
 *
 * Environment variable precedence (matching `@actions/http-client`):
 * - HTTPS requests: `https_proxy` → `HTTPS_PROXY`
 * - HTTP requests:  `http_proxy` → `HTTP_PROXY`
 *
 * If the proxy URL has no scheme, `http://` is prepended automatically.
 */
export function getProxyUrl(reqUrl: URL, env: Env): URL | undefined {
  if (checkBypass(reqUrl, env)) {
    return undefined;
  }

  const proxyVar =
    reqUrl.protocol === "https:"
      ? (env["https_proxy"] ?? env["HTTPS_PROXY"])
      : (env["http_proxy"] ?? env["HTTP_PROXY"]);

  if (!proxyVar) {
    return undefined;
  }

  try {
    const url = new URL(proxyVar);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url;
    }
  } catch {
    // Fall through to retry with http:// prefix.
  }

  // If parsing failed or the scheme wasn't http/https, try prepending http://
  // (matches @actions/http-client behavior for bare host:port values).
  try {
    return new URL(`http://${proxyVar}`);
  } catch {
    return undefined;
  }
}
