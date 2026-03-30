import { describe, expect, it } from "vitest";
import { ActionsError } from "../../../src/http/index.js";
import { uploadBlob } from "../../../src/artifact/blob-upload.js";
import type { ArtifactTransport } from "../../../src/artifact/types.js";

interface CapturedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | undefined;
}

function mockTransport(
  status: number,
  responseBody = "",
): { transport: ArtifactTransport; requests: CapturedRequest[] } {
  const requests: CapturedRequest[] = [];
  const transport: ArtifactTransport = (method, url, headers, body) => {
    requests.push({ method, url, headers, body });
    return Promise.resolve({ status, headers: {}, body: responseBody });
  };
  return { transport, requests };
}

const SIGNED_URL =
  "https://account.blob.core.windows.net/container/path?sig=abc";

describe("uploadBlob", () => {
  // A-8: sends PUT to signed URL with content
  it("sends PUT to the signed URL with content", async () => {
    const { transport, requests } = mockTransport(201);
    await uploadBlob({
      signedUrl: SIGNED_URL,
      content: "hello world",
      contentType: "text/html",
      transport,
      sleep: async () => {
        /* no-op */
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]!.method).toBe("PUT");
    expect(requests[0]!.url).toBe(SIGNED_URL);
    expect(requests[0]!.body).toBe("hello world");
  });

  // A-9: sets x-ms-blob-type: BlockBlob
  it("sets x-ms-blob-type header to BlockBlob", async () => {
    const { transport, requests } = mockTransport(201);
    await uploadBlob({
      signedUrl: SIGNED_URL,
      content: "data",
      contentType: "text/html",
      transport,
      sleep: async () => {
        /* no-op */
      },
    });

    expect(requests[0]!.headers["x-ms-blob-type"]).toBe("BlockBlob");
  });

  // A-10: sets Content-Type based on provided contentType
  it("sets Content-Type from the contentType parameter", async () => {
    const { transport, requests } = mockTransport(201);
    await uploadBlob({
      signedUrl: SIGNED_URL,
      content: "data",
      contentType: "text/markdown",
      transport,
      sleep: async () => {
        /* no-op */
      },
    });

    expect(requests[0]!.headers["Content-Type"]).toBe("text/markdown");
  });

  it("sets Content-Length to UTF-8 byte length", async () => {
    const { transport, requests } = mockTransport(201);
    // Multi-byte: "é" is 2 bytes in UTF-8, "🎉" is 4 bytes
    const content = "héllo 🎉";
    const expectedBytes = Buffer.byteLength(content, "utf-8");

    await uploadBlob({
      signedUrl: SIGNED_URL,
      content,
      contentType: "text/html",
      transport,
      sleep: async () => {
        /* no-op */
      },
    });

    expect(requests[0]!.headers["Content-Length"]).toBe(String(expectedBytes));
  });

  it("retries on 5xx errors", async () => {
    let callCount = 0;
    const transport: ArtifactTransport = () => {
      callCount++;
      if (callCount < 3) {
        return Promise.resolve({
          status: 500,
          headers: {},
          body: "Server Error",
        });
      }
      return Promise.resolve({ status: 201, headers: {}, body: "" });
    };

    await uploadBlob({
      signedUrl: SIGNED_URL,
      content: "data",
      contentType: "text/html",
      transport,
      sleep: async () => {
        /* no-op */
      },
    });

    expect(callCount).toBe(3);
  });

  it("does not retry on 4xx errors", async () => {
    const { transport } = mockTransport(403, "Forbidden");

    await expect(
      uploadBlob({
        signedUrl: SIGNED_URL,
        content: "data",
        contentType: "text/html",
        transport,
        sleep: async () => {
          /* no-op */
        },
      }),
    ).rejects.toThrow(ActionsError);
  });

  it("throws on non-2xx final response", async () => {
    const transport: ArtifactTransport = () =>
      Promise.resolve({
        status: 502,
        headers: {},
        body: "Bad Gateway",
      });

    await expect(
      uploadBlob({
        signedUrl: SIGNED_URL,
        content: "data",
        contentType: "text/html",
        transport,
        sleep: async () => {
          /* no-op */
        },
      }),
    ).rejects.toThrow(/502/);
  });
});
