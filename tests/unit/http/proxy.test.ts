import { describe, expect, it } from "vitest";
import { checkBypass, getProxyUrl } from "../../../src/http/proxy.js";
import type { Env } from "../../../src/env/index.js";

/** Build an Env with the given key-value pairs. */
function env(vars: Record<string, string>): Env {
  return vars;
}

describe("checkBypass", () => {
  describe("loopback addresses", () => {
    it.each([
      "localhost",
      "LOCALHOST",
      "127.0.0.1",
      "127.255.255.255",
      "[::1]",
      "[0:0:0:0:0:0:0:1]",
    ])("bypasses %s", (host) => {
      const url = new URL(`http://${host}/path`);
      expect(checkBypass(url, {})).toBe(true);
    });
  });

  describe("NO_PROXY", () => {
    it("bypasses on wildcard *", () => {
      const url = new URL("https://anything.example.com");
      expect(checkBypass(url, env({ NO_PROXY: "*" }))).toBe(true);
    });

    it("bypasses on exact hostname match (case-insensitive)", () => {
      const url = new URL("https://MyServer.com/path");
      expect(checkBypass(url, env({ NO_PROXY: "myserver.com" }))).toBe(true);
    });

    it("bypasses on hostname:port match", () => {
      const url = new URL("https://myserver.com:8443/path");
      expect(checkBypass(url, env({ NO_PROXY: "myserver.com:8443" }))).toBe(
        true,
      );
    });

    it("bypasses with default port 443 for HTTPS", () => {
      const url = new URL("https://myserver.com/path");
      expect(checkBypass(url, env({ NO_PROXY: "myserver.com:443" }))).toBe(
        true,
      );
    });

    it("bypasses with default port 80 for HTTP", () => {
      const url = new URL("http://myserver.com/path");
      expect(checkBypass(url, env({ NO_PROXY: "myserver.com:80" }))).toBe(true);
    });

    it("bypasses subdomain matching (no leading dot)", () => {
      const url = new URL("https://sub.example.com");
      expect(checkBypass(url, env({ NO_PROXY: "example.com" }))).toBe(true);
    });

    it("bypasses subdomain matching (leading dot)", () => {
      const url = new URL("https://sub.example.com");
      expect(checkBypass(url, env({ NO_PROXY: ".example.com" }))).toBe(true);
    });

    it("does not bypass non-matching hostname", () => {
      const url = new URL("https://other.com");
      expect(checkBypass(url, env({ NO_PROXY: "example.com" }))).toBe(false);
    });

    it("does not bypass partial hostname match", () => {
      // "notexample.com" should NOT match "example.com"
      const url = new URL("https://notexample.com");
      expect(checkBypass(url, env({ NO_PROXY: "example.com" }))).toBe(false);
    });

    it("prefers no_proxy over NO_PROXY", () => {
      const url = new URL("https://example.com");
      expect(
        checkBypass(url, env({ no_proxy: "*", NO_PROXY: "other.com" })),
      ).toBe(true);
    });

    it("handles comma-separated entries with whitespace", () => {
      const url = new URL("https://second.com");
      expect(
        checkBypass(
          url,
          env({ NO_PROXY: "first.com , second.com , third.com" }),
        ),
      ).toBe(true);
    });

    it("returns false when NO_PROXY is empty", () => {
      const url = new URL("https://example.com");
      expect(checkBypass(url, env({ NO_PROXY: "" }))).toBe(false);
    });

    it("returns false when NO_PROXY is not set", () => {
      const url = new URL("https://example.com");
      expect(checkBypass(url, {})).toBe(false);
    });
  });
});

describe("getProxyUrl", () => {
  it("returns https_proxy for HTTPS requests", () => {
    const result = getProxyUrl(
      new URL("https://api.github.com"),
      env({ https_proxy: "http://proxy:8080" }),
    );
    expect(result?.href).toBe("http://proxy:8080/");
  });

  it("returns http_proxy for HTTP requests", () => {
    const result = getProxyUrl(
      new URL("http://example.com"),
      env({ http_proxy: "http://proxy:3128" }),
    );
    expect(result?.href).toBe("http://proxy:3128/");
  });

  it("prefers lowercase over uppercase", () => {
    const result = getProxyUrl(
      new URL("https://api.github.com"),
      env({
        https_proxy: "http://lower:8080",
        HTTPS_PROXY: "http://upper:8080",
      }),
    );
    expect(result?.href).toBe("http://lower:8080/");
  });

  it("falls back to uppercase when lowercase is not set", () => {
    const result = getProxyUrl(
      new URL("https://api.github.com"),
      env({ HTTPS_PROXY: "http://upper:8080" }),
    );
    expect(result?.href).toBe("http://upper:8080/");
  });

  it("does not use http_proxy for HTTPS requests", () => {
    const result = getProxyUrl(
      new URL("https://api.github.com"),
      env({ http_proxy: "http://proxy:3128" }),
    );
    expect(result).toBeUndefined();
  });

  it("does not use https_proxy for HTTP requests", () => {
    const result = getProxyUrl(
      new URL("http://example.com"),
      env({ https_proxy: "http://proxy:8080" }),
    );
    expect(result).toBeUndefined();
  });

  it("returns undefined when no proxy var is set", () => {
    const result = getProxyUrl(new URL("https://api.github.com"), {});
    expect(result).toBeUndefined();
  });

  it("returns undefined when bypassed", () => {
    const result = getProxyUrl(
      new URL("https://api.github.com"),
      env({ https_proxy: "http://proxy:8080", NO_PROXY: "*" }),
    );
    expect(result).toBeUndefined();
  });

  it("prepends http:// when scheme is missing", () => {
    const result = getProxyUrl(
      new URL("https://api.github.com"),
      env({ https_proxy: "proxy.local:8080" }),
    );
    expect(result?.href).toBe("http://proxy.local:8080/");
  });

  it("returns undefined for completely unparseable proxy values", () => {
    const result = getProxyUrl(
      new URL("https://api.github.com"),
      env({ https_proxy: "://broken" }),
    );
    expect(result).toBeUndefined();
  });
});
