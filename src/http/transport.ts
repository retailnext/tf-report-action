/**
 * HTTP transport layer with proxy routing and CONNECT tunneling.
 *
 * Provides `httpRequest()` — a single function for making HTTP/HTTPS requests
 * that automatically routes through proxies when configured via environment
 * variables. HTTPS requests through HTTP proxies use the HTTP CONNECT method
 * to establish a tunnel.
 *
 * The transport is injected into higher-level clients (e.g. the GitHub client)
 * via their factory functions — they never import this module directly.
 */

import * as http from "node:http";
import * as https from "node:https";
import * as tls from "node:tls";
import type { Env } from "../env/index.js";
import { ActionsError } from "./errors.js";
import { getProxyUrl } from "./proxy.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Raw HTTP response from the transport layer. */
export interface HttpResponse {
  readonly status: number;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly body: string;
}

/** Options controlling transport behavior. */
export interface TransportOptions {
  /** Environment variables for proxy detection. Defaults to `process.env`. */
  readonly env?: Env;
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

/**
 * Make an HTTP/HTTPS request, routing through a proxy if one is configured
 * in the environment.
 *
 * Proxy routing:
 * - No proxy: direct request via `http.request` / `https.request`
 * - HTTP target through proxy: send absolute-URI request to the proxy
 * - HTTPS target through HTTP proxy: HTTP CONNECT tunnel, then TLS
 */
export async function httpRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string,
  options?: TransportOptions,
): Promise<HttpResponse> {
  const target = new URL(url);
  const env = options?.env ?? (process.env as Env);
  const proxyUrl = getProxyUrl(target, env);

  if (!proxyUrl) {
    return directRequest(method, target, headers, body);
  }

  if (target.protocol === "https:") {
    return tunnelRequest(method, target, proxyUrl, headers, body);
  }

  // HTTP through HTTP proxy — send absolute-form request to proxy.
  return proxyPlainRequest(method, target, proxyUrl, headers, body);
}

/**
 * Assert that an HTTP status code is in the 2xx range.
 *
 * Throws `ActionsError` with the status code if not successful. The response
 * body is truncated to 200 characters in the error message to avoid leaking
 * sensitive data.
 */
export function assertOk(
  status: number,
  body: string,
  context?: string,
): void {
  if (status >= 200 && status < 300) {
    return;
  }
  const truncated =
    body.length > 200 ? body.slice(0, 200) + "\u2026" : body;
  const prefix = context ? `${context}: ` : "";
  throw new ActionsError(
    `${prefix}HTTP ${String(status)}: ${truncated}`,
    status,
  );
}

// ---------------------------------------------------------------------------
// Internal: direct request (no proxy)
// ---------------------------------------------------------------------------

function directRequest(
  method: string,
  target: URL,
  headers: Record<string, string>,
  body?: string,
): Promise<HttpResponse> {
  const transport = target.protocol === "https:" ? https : http;
  return new Promise<HttpResponse>((resolve, reject) => {
    const req = transport.request(target, { method, headers }, (res) => {
      collectResponse(res, resolve, reject);
    });
    req.on("error", reject);
    if (body !== undefined) {
      req.write(body);
    }
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Internal: HTTP target through HTTP proxy (absolute-form request)
// ---------------------------------------------------------------------------

function proxyPlainRequest(
  method: string,
  target: URL,
  proxyUrl: URL,
  headers: Record<string, string>,
  body?: string,
): Promise<HttpResponse> {
  return new Promise<HttpResponse>((resolve, reject) => {
    const req = http.request(
      {
        hostname: proxyUrl.hostname,
        port: proxyUrl.port || 80,
        method,
        path: target.href,
        headers,
      },
      (res) => {
        collectResponse(res, resolve, reject);
      },
    );
    req.on("error", reject);
    if (body !== undefined) {
      req.write(body);
    }
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Internal: HTTPS target through HTTP proxy (CONNECT tunnel)
// ---------------------------------------------------------------------------

function tunnelRequest(
  method: string,
  target: URL,
  proxyUrl: URL,
  headers: Record<string, string>,
  body?: string,
): Promise<HttpResponse> {
  const targetHost = target.hostname;
  const targetPort = target.port || "443";

  return new Promise<HttpResponse>((resolve, reject) => {
    // Step 1: Open a CONNECT tunnel through the proxy.
    const connectReq = http.request({
      hostname: proxyUrl.hostname,
      port: proxyUrl.port || 80,
      method: "CONNECT",
      path: `${targetHost}:${targetPort}`,
    });

    connectReq.on("connect", (_res, socket) => {
      // Step 2: Establish TLS over the tunnel socket.
      const tlsSocket = tls.connect(
        {
          socket,
          servername: targetHost,
        },
        () => {
          // Step 3: Send the actual HTTPS request through the TLS socket.
          const req = https.request(
            {
              hostname: targetHost,
              port: Number(targetPort),
              method,
              path: target.pathname + target.search,
              headers,
              socket: tlsSocket,
              createConnection: () => tlsSocket,
            },
            (res) => {
              collectResponse(res, resolve, reject);
            },
          );
          req.on("error", reject);
          if (body !== undefined) {
            req.write(body);
          }
          req.end();
        },
      );
      tlsSocket.on("error", reject);
    });

    connectReq.on("error", reject);
    connectReq.end();
  });
}

// ---------------------------------------------------------------------------
// Internal: response collector
// ---------------------------------------------------------------------------

function collectResponse(
  res: http.IncomingMessage,
  resolve: (value: HttpResponse) => void,
  reject: (reason: unknown) => void,
): void {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
  });
  res.on("end", () => {
    resolve({
      status: res.statusCode ?? 0,
      headers: res.headers as Record<string, string | string[] | undefined>,
      body: Buffer.concat(chunks).toString("utf-8"),
    });
  });
  res.on("error", reject);
}
