import { describe, it, expect } from "vitest";
import { deriveModuleAddress, deriveInstanceName } from "../../../src/renderer/address.js";

describe("deriveModuleAddress", () => {
  it("returns empty string for root-module resources", () => {
    expect(deriveModuleAddress("aws_instance.web", "aws_instance")).toBe("");
  });

  it("returns empty string for root-module resources with index", () => {
    expect(deriveModuleAddress("null_resource.item[0]", "null_resource")).toBe("");
  });

  it("extracts single-level module address", () => {
    expect(deriveModuleAddress("module.child.aws_instance.web", "aws_instance")).toBe("module.child");
  });

  it("extracts nested module address", () => {
    expect(deriveModuleAddress(
      'module.parent["1"].module.child.null_resource.item[0]',
      "null_resource",
    )).toBe('module.parent["1"].module.child');
  });

  it("extracts module address with string key", () => {
    expect(deriveModuleAddress(
      'module.vpc["primary"].aws_subnet.main',
      "aws_subnet",
    )).toBe('module.vpc["primary"]');
  });

  it("handles deeply nested modules", () => {
    expect(deriveModuleAddress(
      "module.a.module.b.module.c.aws_instance.web",
      "aws_instance",
    )).toBe("module.a.module.b.module.c");
  });

  it("returns empty string when type not found in address", () => {
    expect(deriveModuleAddress("something_else.foo", "aws_instance")).toBe("");
  });

  it("uses lastIndexOf to handle pathological type-in-module-name", () => {
    // Pathological case: module name contains the resource type string
    expect(deriveModuleAddress(
      "module.null_resource.null_resource.item",
      "null_resource",
    )).toBe("module.null_resource");
  });
});

describe("deriveInstanceName", () => {
  it("returns name for root-module resources", () => {
    expect(deriveInstanceName("aws_instance.web", "aws_instance")).toBe("web");
  });

  it("returns name with numeric index", () => {
    expect(deriveInstanceName("null_resource.item[0]", "null_resource")).toBe("item[0]");
  });

  it("returns name with string key", () => {
    expect(deriveInstanceName(
      'aws_instance.db["primary"]',
      "aws_instance",
    )).toBe('db["primary"]');
  });

  it("strips module prefix from nested address", () => {
    expect(deriveInstanceName(
      "module.child.aws_instance.web[0]",
      "aws_instance",
    )).toBe("web[0]");
  });

  it("strips deeply nested module prefix", () => {
    expect(deriveInstanceName(
      'module.parent["1"].module.child.null_resource.item[0]',
      "null_resource",
    )).toBe("item[0]");
  });

  it("strips deeply nested module prefix with string key", () => {
    expect(deriveInstanceName(
      'module.m.aws_instance.db["primary"]',
      "aws_instance",
    )).toBe('db["primary"]');
  });

  it("returns full address when type not found", () => {
    expect(deriveInstanceName("something_else.foo", "aws_instance")).toBe("something_else.foo");
  });

  it("handles pathological type-in-module-name correctly", () => {
    expect(deriveInstanceName(
      "module.null_resource.null_resource.item",
      "null_resource",
    )).toBe("item");
  });
});
