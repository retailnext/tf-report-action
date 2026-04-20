import { describe, it, expect } from "vitest";
import { suppressGoogleComputeManagedSslCertificateExpireTime } from "../../../../src/drift-filter/rules/google-compute-managed-ssl-certificate.js";
import type { AttributeChange } from "../../../../src/model/attribute.js";

const TYPE = "google_compute_managed_ssl_certificate";

function changed(name: string): AttributeChange {
  return {
    name,
    before: "old",
    after: "new",
    isSensitive: false,
    isLarge: false,
    isKnownAfterApply: false,
  };
}

function unchanged(name: string): AttributeChange {
  return {
    name,
    before: "same",
    after: "same",
    isSensitive: false,
    isLarge: false,
    isKnownAfterApply: false,
  };
}

describe("suppressGoogleComputeManagedSslCertificateExpireTime", () => {
  it("returns true when the only changed attribute is expire_time", () => {
    expect(
      suppressGoogleComputeManagedSslCertificateExpireTime(TYPE, "managed", [
        changed("expire_time"),
      ]),
    ).toBe(true);
  });

  it("returns true when expire_time changed and other attributes are unchanged", () => {
    expect(
      suppressGoogleComputeManagedSslCertificateExpireTime(TYPE, "managed", [
        changed("expire_time"),
        unchanged("name"),
        unchanged("subject_alternative_names"),
      ]),
    ).toBe(true);
  });

  it("returns false when expire_time is present alongside another changed attribute", () => {
    expect(
      suppressGoogleComputeManagedSslCertificateExpireTime(TYPE, "managed", [
        changed("expire_time"),
        changed("managed"),
      ]),
    ).toBe(false);
  });

  it("returns false when attributes is empty", () => {
    expect(
      suppressGoogleComputeManagedSslCertificateExpireTime(TYPE, "managed", []),
    ).toBe(false);
  });

  it("returns false when all attributes are unchanged", () => {
    expect(
      suppressGoogleComputeManagedSslCertificateExpireTime(TYPE, "managed", [
        unchanged("expire_time"),
        unchanged("name"),
      ]),
    ).toBe(false);
  });

  it("returns false when the only changed attribute is not expire_time", () => {
    expect(
      suppressGoogleComputeManagedSslCertificateExpireTime(TYPE, "managed", [
        changed("managed"),
      ]),
    ).toBe(false);
  });

  it("returns false for a different resource type", () => {
    expect(
      suppressGoogleComputeManagedSslCertificateExpireTime(
        "google_compute_ssl_certificate",
        "managed",
        [changed("expire_time")],
      ),
    ).toBe(false);
  });

  it("ignores mode", () => {
    expect(
      suppressGoogleComputeManagedSslCertificateExpireTime(TYPE, "data", [
        changed("expire_time"),
      ]),
    ).toBe(true);
  });
});
