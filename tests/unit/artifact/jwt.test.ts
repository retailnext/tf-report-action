import { describe, expect, it } from "vitest";
import { extractBackendIds } from "../../../src/artifact/jwt.js";

/** Build a JWT with a custom payload (no signature verification needed). */
function buildJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString(
    "base64url",
  );
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.signature`;
}

describe("extractBackendIds", () => {
  const runId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const jobId = "11111111-2222-3333-4444-555555555555";

  // A-1: scp claim is correctly parsed into two UUIDs
  it("extracts backend IDs from a valid Actions.Results scope", () => {
    const token = buildJwt({
      scp: `Actions.ExampleScope Actions.Results:${runId}:${jobId}`,
    });
    const ids = extractBackendIds(token);
    expect(ids.workflowRunBackendId).toBe(runId);
    expect(ids.workflowJobRunBackendId).toBe(jobId);
  });

  it("handles scp with Actions.Results as the only scope", () => {
    const token = buildJwt({ scp: `Actions.Results:${runId}:${jobId}` });
    const ids = extractBackendIds(token);
    expect(ids.workflowRunBackendId).toBe(runId);
    expect(ids.workflowJobRunBackendId).toBe(jobId);
  });

  // A-2: throws when scp has no Actions.Results segment
  it("throws when scp has no Actions.Results scope", () => {
    const token = buildJwt({ scp: "Actions.ExampleScope Actions.Admin" });
    expect(() => extractBackendIds(token)).toThrow(
      'No "Actions.Results:" scope found',
    );
  });

  // A-3: throws when JWT payload cannot be decoded
  it("throws on an empty string", () => {
    expect(() => extractBackendIds("")).toThrow("Expected a JWT with 3");
  });

  it("throws on a token with fewer than 3 segments", () => {
    expect(() => extractBackendIds("header.payload")).toThrow(
      "Expected a JWT with 3 segments, got 2",
    );
  });

  it("throws when payload is not valid base64url", () => {
    expect(() => extractBackendIds("h.!!!.s")).toThrow("not valid JSON");
  });

  it("throws when payload is not valid JSON", () => {
    const badPayload = Buffer.from("not-json").toString("base64url");
    expect(() => extractBackendIds(`h.${badPayload}.s`)).toThrow(
      "not valid JSON",
    );
  });

  it("throws when scp claim is missing", () => {
    const token = buildJwt({ sub: "test" });
    expect(() => extractBackendIds(token)).toThrow(
      '"scp" claim to be a string',
    );
  });

  it("throws when scp claim is not a string", () => {
    const token = buildJwt({ scp: 42 });
    expect(() => extractBackendIds(token)).toThrow(
      '"scp" claim to be a string',
    );
  });

  it("throws when Actions.Results has wrong part count", () => {
    const token = buildJwt({ scp: `Actions.Results:${runId}` });
    expect(() => extractBackendIds(token)).toThrow("got 2 parts");
  });

  it("throws when backend IDs are empty strings", () => {
    const token = buildJwt({ scp: "Actions.Results::" });
    expect(() => extractBackendIds(token)).toThrow("must not be empty");
  });
});
