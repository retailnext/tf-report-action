import { describe, it, expect } from "vitest";
import { determineAction } from "../../../src/builder/action.js";

describe("determineAction", () => {
  it("maps ['create'] to 'create'", () => {
    expect(determineAction(["create"])).toBe("create");
  });

  it("maps ['delete'] to 'delete'", () => {
    expect(determineAction(["delete"])).toBe("delete");
  });

  it("maps ['update'] to 'update'", () => {
    expect(determineAction(["update"])).toBe("update");
  });

  it("maps ['no-op'] to 'no-op'", () => {
    expect(determineAction(["no-op"])).toBe("no-op");
  });

  it("maps ['read'] to 'read'", () => {
    expect(determineAction(["read"])).toBe("read");
  });

  it("maps ['forget'] to 'forget'", () => {
    expect(determineAction(["forget"])).toBe("forget");
  });

  it("maps ['create','delete'] to 'replace'", () => {
    expect(determineAction(["create", "delete"])).toBe("replace");
  });

  it("maps ['delete','create'] to 'replace'", () => {
    expect(determineAction(["delete", "create"])).toBe("replace");
  });

  it("maps ['create','forget'] to 'replace'", () => {
    expect(determineAction(["create", "forget"])).toBe("replace");
  });

  it("maps unknown single action to 'unknown'", () => {
    // Cast to test unknown handling
    expect(
      determineAction(["open"] as Parameters<typeof determineAction>[0]),
    ).toBe("unknown");
  });

  it("maps unrecognized two-action combination to 'replace' (fallback)", () => {
    // ["update","delete"] is not a valid ChangeActions but any two-element
    // array maps to "replace" at runtime since all valid 2-tuples are replace variants.
    expect(
      determineAction(["update", "delete"] as Parameters<
        typeof determineAction
      >[0]),
    ).toBe("replace");
  });

  it("maps empty actions array to 'unknown'", () => {
    expect(
      determineAction([] as unknown as Parameters<typeof determineAction>[0]),
    ).toBe("unknown");
  });
});
