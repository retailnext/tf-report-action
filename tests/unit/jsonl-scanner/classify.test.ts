import { describe, it, expect } from "vitest";
import { lineConcernInfo } from "../../../src/jsonl-scanner/classify.js";

describe("lineConcernInfo", () => {
  it("extracts severity and address from an addressed diagnostic", () => {
    const info = lineConcernInfo(
      {
        type: "diagnostic",
        diagnostic: {
          severity: "error",
          address: "module.foo.aws_instance.web",
        },
      },
      "diagnostic",
    );
    expect(info.severity).toBe("error");
    expect(info.address).toBe("module.foo.aws_instance.web");
    expect(info.isErroredHook).toBe(false);
  });

  it("extracts severity but no address from an addressless diagnostic", () => {
    const info = lineConcernInfo(
      { type: "diagnostic", diagnostic: { severity: "warning" } },
      "diagnostic",
    );
    expect(info.severity).toBe("warning");
    expect(info.address).toBeUndefined();
  });

  it("reports unknown severity verbatim (not normalized)", () => {
    const info = lineConcernInfo(
      { type: "diagnostic", diagnostic: { severity: "unknown" } },
      "diagnostic",
    );
    expect(info.severity).toBe("unknown");
    expect(info.isErroredHook).toBe(false);
  });

  it("extracts hook address from addressed hooks", () => {
    const info = lineConcernInfo(
      {
        type: "refresh_start",
        hook: { resource: { addr: "module.bar.null_resource.a" } },
      },
      "refresh_start",
    );
    expect(info.address).toBe("module.bar.null_resource.a");
    expect(info.isErroredHook).toBe(false);
    expect(info.severity).toBeUndefined();
  });

  it("flags apply_errored / provision_errored as errored hooks", () => {
    const applyErrored = lineConcernInfo(
      {
        type: "apply_errored",
        hook: { resource: { addr: "aws_db_instance.main" } },
      },
      "apply_errored",
    );
    expect(applyErrored.isErroredHook).toBe(true);
    expect(applyErrored.address).toBe("aws_db_instance.main");

    const provisionErrored = lineConcernInfo(
      {
        type: "provision_errored",
        hook: { resource: { addr: "null_resource.p" } },
      },
      "provision_errored",
    );
    expect(provisionErrored.isErroredHook).toBe(true);
  });

  it("extracts address from planned_change / resource_drift", () => {
    const planned = lineConcernInfo(
      {
        type: "planned_change",
        change: { resource: { addr: "aws_s3_bucket.logs" } },
      },
      "planned_change",
    );
    expect(planned.address).toBe("aws_s3_bucket.logs");

    const drift = lineConcernInfo(
      {
        type: "resource_drift",
        change: { resource: { addr: "aws_s3_bucket.drifted" } },
      },
      "resource_drift",
    );
    expect(drift.address).toBe("aws_s3_bucket.drifted");
  });

  it("returns no address/severity for non-addressed types", () => {
    for (const type of ["version", "change_summary", "outputs", "log"]) {
      const info = lineConcernInfo({ type }, type);
      expect(info.address).toBeUndefined();
      expect(info.severity).toBeUndefined();
      expect(info.isErroredHook).toBe(false);
    }
  });

  it("tolerates malformed hook / change / diagnostic shapes", () => {
    expect(
      lineConcernInfo({ type: "refresh_start", hook: null }, "refresh_start")
        .address,
    ).toBeUndefined();
    expect(
      lineConcernInfo(
        { type: "planned_change", change: { resource: 42 } },
        "planned_change",
      ).address,
    ).toBeUndefined();
    expect(
      lineConcernInfo(
        { type: "diagnostic", diagnostic: { severity: 5 } },
        "diagnostic",
      ).severity,
    ).toBeUndefined();
  });
});
