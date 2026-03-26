import { describe, expect, it } from "vitest";
import { ActionsError } from "../../../src/http/errors.js";

describe("ActionsError", () => {
  it("has name, message, and statusCode", () => {
    const err = new ActionsError("not found", 404);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ActionsError");
    expect(err.message).toBe("not found");
    expect(err.statusCode).toBe(404);
  });

  it("statusCode is undefined when omitted", () => {
    const err = new ActionsError("network failure");
    expect(err.statusCode).toBeUndefined();
  });
});
