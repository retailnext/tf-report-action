import { describe, expect, it } from "vitest";
import * as http from "node:http";
import { httpRequest, assertOk } from "../../../src/http/transport.js";
import { ActionsError } from "../../../src/http/errors.js";

/** Start a local HTTP server, return its URL and a close function. */
function startServer(
  handler: (
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ) => void,
): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      resolve({
        url: `http://127.0.0.1:${String(addr.port)}`,
        close: () =>
          new Promise<void>((res) => {
            server.close(() => {
              res();
            });
          }),
      });
    });
  });
}

describe("httpRequest", () => {
  it("makes a direct GET request", async () => {
    const { url, close } = await startServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("hello");
    });

    try {
      const response = await httpRequest("GET", `${url}/test`, {}, undefined, {
        env: {},
      });
      expect(response.status).toBe(200);
      expect(response.body).toBe("hello");
    } finally {
      await close();
    }
  });

  it("sends request body on POST", async () => {
    let receivedBody = "";
    const { url, close } = await startServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        receivedBody = Buffer.concat(chunks).toString("utf-8");
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
    });

    try {
      const body = JSON.stringify({ key: "value" });
      const response = await httpRequest(
        "POST",
        `${url}/api`,
        { "Content-Type": "application/json" },
        body,
        { env: {} },
      );
      expect(response.status).toBe(201);
      expect(receivedBody).toBe(body);
    } finally {
      await close();
    }
  });

  it("routes HTTP through proxy when configured", async () => {
    let proxyHit = false;
    let requestedUrl = "";

    // A simple HTTP proxy that intercepts requests.
    const { url: proxyUrl, close } = await startServer((req, res) => {
      proxyHit = true;
      requestedUrl = req.url ?? "";
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("proxied");
    });

    try {
      const targetUrl = "http://example.test:9999/path";
      const response = await httpRequest(
        "GET",
        targetUrl,
        {},
        undefined,
        { env: { http_proxy: proxyUrl } },
      );
      expect(proxyHit).toBe(true);
      expect(requestedUrl).toBe(targetUrl);
      expect(response.status).toBe(200);
      expect(response.body).toBe("proxied");
    } finally {
      await close();
    }
  });

  it("bypasses proxy for loopback addresses", async () => {
    const { url, close } = await startServer((_req, res) => {
      res.writeHead(200);
      res.end("direct");
    });

    try {
      const response = await httpRequest("GET", `${url}/test`, {}, undefined, {
        env: { http_proxy: "http://proxy.invalid:9999" },
      });
      // Should connect directly (loopback bypass), not through the bogus proxy.
      expect(response.status).toBe(200);
      expect(response.body).toBe("direct");
    } finally {
      await close();
    }
  });

  it("returns response headers", async () => {
    const { url, close } = await startServer((_req, res) => {
      res.writeHead(200, { "X-Custom": "test-value" });
      res.end("");
    });

    try {
      const response = await httpRequest("GET", `${url}/`, {}, undefined, {
        env: {},
      });
      expect(response.headers["x-custom"]).toBe("test-value");
    } finally {
      await close();
    }
  });
});

describe("assertOk", () => {
  it("does not throw for 2xx status codes", () => {
    expect(() => assertOk(200, "ok")).not.toThrow();
    expect(() => assertOk(201, "created")).not.toThrow();
    expect(() => assertOk(204, "")).not.toThrow();
  });

  it("throws ActionsError for non-2xx status codes", () => {
    expect(() => assertOk(404, "not found")).toThrow(ActionsError);
    expect(() => assertOk(500, "error")).toThrow(ActionsError);
  });

  it("includes status code in error", () => {
    try {
      assertOk(403, "forbidden");
    } catch (e) {
      expect(e).toBeInstanceOf(ActionsError);
      expect((e as ActionsError).statusCode).toBe(403);
      expect((e as ActionsError).message).toContain("403");
    }
  });

  it("truncates long response body in error message", () => {
    const longBody = "x".repeat(300);
    try {
      assertOk(500, longBody);
    } catch (e) {
      expect((e as ActionsError).message.length).toBeLessThan(250);
      expect((e as ActionsError).message).toContain("\u2026");
    }
  });

  it("includes context prefix when provided", () => {
    try {
      assertOk(422, "bad", "postComment");
    } catch (e) {
      expect((e as ActionsError).message).toMatch(/^postComment: /);
    }
  });
});
