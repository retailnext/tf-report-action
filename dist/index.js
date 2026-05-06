// src/model/step-commands.ts
function expectedCommand(tool, role) {
  const prefix = tool !== void 0 ? `${tool} ` : "";
  switch (role) {
    case "show-plan":
      return `${prefix}show -json <tfplan>`;
    case "plan":
      return `${prefix}plan -json -out=<tfplan>`;
    case "apply":
      return `${prefix}apply -json <tfplan>`;
    case "validate":
      return `${prefix}validate -json`;
    case "init":
      return `${prefix}init -json`;
    case "state":
      return `${prefix}state pull`;
  }
}

// src/renderable/html-escape.ts
function htmlEscape(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// src/builder/warnings.ts
function renderCommand(tool, role, format) {
  const cmd = expectedCommand(tool, role);
  return format === "markdown" ? `\`${cmd}\`` : `<code>${htmlEscape(cmd)}</code>`;
}
var NoShowPlanWarning = class {
  tool;
  constructor(tool) {
    this.tool = tool;
  }
  size(format) {
    return this.render(format).length;
  }
  render(format) {
    const cmd = renderCommand(this.tool, "show-plan", format);
    return `This report was generated without ${cmd} output. Resource attribute details are not available.`;
  }
};
var RawTextFallbackWarning = class {
  tool;
  constructor(tool) {
    this.tool = tool;
  }
  size(format) {
    return this.render(format).length;
  }
  render(format) {
    const cmd = renderCommand(this.tool, "show-plan", format);
    return `Report limited because ${cmd} output was not available. Showing raw command output.`;
  }
};
var NoStateWarning = class {
  tool;
  constructor(tool) {
    this.tool = tool;
  }
  size(format) {
    return this.render(format).length;
  }
  render(format) {
    const cmd = renderCommand(this.tool, "state", format);
    return `Some attribute values could not be resolved because ${cmd} output was not available. Add a state step after apply to see the actual values.`;
  }
};
var StepOutputParseWarning = class {
  stepId;
  constructor(stepId) {
    this.stepId = stepId;
  }
  size(format) {
    return this.render(format).length;
  }
  render(format) {
    const id = format === "markdown" ? `\`${this.stepId}\`` : `<code>${htmlEscape(this.stepId)}</code>`;
    return `Output from step ${id} could not be parsed; using plan data only.`;
  }
};
var StepReadErrorWarning = class {
  role;
  error;
  constructor(role, error) {
    this.role = role;
    this.error = error;
  }
  size(format) {
    return this.render(format).length;
  }
  render(format) {
    const escaped = format === "markdown" ? this.error : htmlEscape(this.error);
    return `${this.role} stdout: ${escaped}`;
  }
};
var StepOutputMissingWarning = class {
  role;
  constructor(role) {
    this.role = role;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size(_format) {
    return this.render("markdown").length;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(_format) {
    return `${this.role}: stdout_file output missing in steps`;
  }
};
var StepScanFailureWarning = class {
  role;
  constructor(role) {
    this.role = role;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size(_format) {
    return this.render("markdown").length;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(_format) {
    const label = this.role.charAt(0).toUpperCase() + this.role.slice(1);
    return `${label} JSONL file could not be scanned`;
  }
};
var UnparseableLinesWarning = class {
  count;
  role;
  constructor(count, role) {
    this.count = count;
    this.role = role;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size(_format) {
    return this.render("markdown").length;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(_format) {
    return `${String(this.count)} line(s) in ${this.role} output could not be parsed as JSON`;
  }
};
var UnknownMessageTypesWarning = class {
  count;
  role;
  constructor(count, role) {
    this.count = count;
    this.role = role;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size(_format) {
    return this.render("markdown").length;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(_format) {
    return `${String(this.count)} line(s) in ${this.role} output had unrecognized message types`;
  }
};

// src/steps/parse.ts
function parseSteps(json) {
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Steps context is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Steps context must be a JSON object");
  }
  const raw = parsed;
  const result = {};
  for (const [stepId, value] of Object.entries(raw)) {
    result[stepId] = validateStepData(stepId, value);
  }
  return result;
}
function validateStepData(stepId, raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`Steps context: step "${stepId}" must be an object`);
  }
  const obj = raw;
  const outcome = validateOptionalString(obj["outcome"], stepId, "outcome");
  const conclusion = validateOptionalString(
    obj["conclusion"],
    stepId,
    "conclusion"
  );
  const outputs = validateOutputs(obj["outputs"], stepId);
  return {
    ...outcome !== void 0 ? { outcome } : {},
    ...conclusion !== void 0 ? { conclusion } : {},
    ...outputs !== void 0 ? { outputs } : {}
  };
}
function validateOptionalString(value, stepId, field) {
  if (value === void 0 || value === null) {
    return void 0;
  }
  if (typeof value !== "string") {
    throw new Error(
      `Steps context: step "${stepId}" field "${field}" must be a string`
    );
  }
  return value;
}
function validateOutputs(value, stepId) {
  if (value === void 0 || value === null) {
    return void 0;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      `Steps context: step "${stepId}" field "outputs" must be an object`
    );
  }
  const raw = value;
  const result = {};
  for (const [key, val] of Object.entries(raw)) {
    if (typeof val === "string") {
      result[key] = val;
    }
  }
  return result;
}

// src/steps/types.ts
var DEFAULT_MAX_FILE_SIZE = 256 * 1024 * 1024;
var DEFAULT_INIT_STEP = "init";
var DEFAULT_VALIDATE_STEP = "validate";
var DEFAULT_PLAN_STEP = "plan";
var DEFAULT_SHOW_PLAN_STEP = "show-plan";
var DEFAULT_APPLY_STEP = "apply";
var DEFAULT_STATE_STEP = "state";
var OUTPUT_STDOUT_FILE = "stdout_file";
var OUTPUT_STDERR_FILE = "stderr_file";
var OUTPUT_EXIT_CODE = "exit_code";

// src/steps/outcomes.ts
function getStepOutcome(step) {
  return step.outcome ?? step.conclusion ?? "unknown";
}
function getExitCode(step) {
  return step.outputs?.[OUTPUT_EXIT_CODE] ?? void 0;
}
function buildStepOutcomes(steps, excludeIds) {
  return Object.entries(steps).filter(([id]) => !excludeIds?.has(id)).map(([id, step]) => {
    const outcome = getStepOutcome(step);
    const exitCode = getExitCode(step);
    return exitCode !== void 0 ? { id, outcome, exitCode } : { id, outcome };
  });
}

// src/steps/reader.ts
import {
  realpathSync,
  statSync,
  readFileSync,
  openSync,
  readSync,
  closeSync
} from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
function isReadError(result) {
  return "error" in result;
}
function readForParse(filePath, options) {
  const validated = validateFile(filePath, options);
  if (isReadError(validated)) {
    return validated;
  }
  const { realPath, size } = validated;
  if (size > options.maxFileSize) {
    return {
      error: `File exceeds maximum size for parsing (${formatSize(size)} > ${formatSize(options.maxFileSize)})`
    };
  }
  try {
    const content = readFileSync(realPath, "utf-8");
    return { content, truncated: false };
  } catch {
    return { error: "Failed to read file" };
  }
}
var PEEK_SIZE = 8 * 1024;
function readPeek(filePath, options) {
  const validated = validateFile(filePath, options);
  if (isReadError(validated)) {
    return validated;
  }
  const { realPath, size } = validated;
  const bytesToRead = Math.min(size, PEEK_SIZE);
  try {
    const buffer = Buffer.alloc(bytesToRead);
    const fd = openSync(realPath, "r");
    let bytesRead;
    try {
      bytesRead = readSync(fd, buffer, 0, bytesToRead, 0);
    } finally {
      closeSync(fd);
    }
    return {
      content: buffer.subarray(0, bytesRead).toString("utf-8"),
      truncated: size > PEEK_SIZE
    };
  } catch {
    return { error: "Failed to read file" };
  }
}
function getValidatedPath(filePath, options) {
  return validateFile(filePath, options);
}
function validateFile(filePath, options) {
  if (!isAbsolute(filePath)) {
    return { error: "Relative file paths are not allowed" };
  }
  const absolutePath = resolve(filePath);
  let realPath;
  try {
    realPath = realpathSync(absolutePath);
  } catch {
    return { error: "File not found or not accessible" };
  }
  const fileDir = dirname(realPath);
  const allowed = options.allowedDirs.some((dir) => {
    try {
      return fileDir === realpathSync(resolve(dir));
    } catch {
      return false;
    }
  });
  if (!allowed) {
    return { error: "File is not in an allowed directory" };
  }
  let stat;
  try {
    stat = statSync(realPath);
  } catch {
    return { error: "File not found or not accessible" };
  }
  if (!stat.isFile()) {
    return { error: "Path is not a regular file" };
  }
  return { realPath, size: stat.size };
}
function formatSize(bytes) {
  if (bytes < 1024) {
    return `${String(bytes)} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${String(Math.round(bytes / 1024))} KiB`;
  }
  return `${String(Math.round(bytes / (1024 * 1024)))} MiB`;
}

// src/steps/io.ts
function readStepFile(step, outputKey, readerOpts) {
  const filePath = step.outputs?.[outputKey];
  if (!filePath) return { noFile: true };
  const result = readForParse(filePath, readerOpts);
  if (isReadError(result)) return { error: result.error };
  return { content: result.content };
}
function readStepStdout(step, readerOpts) {
  return readStepFile(step, OUTPUT_STDOUT_FILE, readerOpts);
}
function readStepStderr(step, readerOpts) {
  return readStepFile(step, OUTPUT_STDERR_FILE, readerOpts);
}
function peekStepStdout(step, readerOpts) {
  const filePath = step.outputs?.[OUTPUT_STDOUT_FILE];
  if (!filePath) return { noFile: true };
  const result = readPeek(filePath, readerOpts);
  if (isReadError(result)) return { error: result.error };
  return { content: result.content };
}
function peekStepStderr(step, readerOpts) {
  const filePath = step.outputs?.[OUTPUT_STDERR_FILE];
  if (!filePath) return { noFile: true };
  const result = readPeek(filePath, readerOpts);
  if (isReadError(result)) return { error: result.error };
  return { content: result.content };
}
function getStepStdoutPath(step, readerOpts) {
  const filePath = step.outputs?.[OUTPUT_STDOUT_FILE];
  if (!filePath) return void 0;
  const result = getValidatedPath(filePath, readerOpts);
  if ("error" in result) return void 0;
  return result.realPath;
}

// src/builder/step-issues.ts
function buildStepIssue(step, stepId, readerOpts, diagnostic) {
  const outcome = getStepOutcome(step);
  const isFailed = outcome === "failure";
  const exitCode = getExitCode(step);
  let reason;
  let stepOutcome;
  if (isFailed) {
    reason = "failed";
  } else if (diagnostic) {
    reason = "parse-error";
  } else {
    reason = "outcome";
    stepOutcome = outcome;
  }
  const stdoutRead = readStepStdout(step, readerOpts);
  const stderrRead = readStepStderr(step, readerOpts);
  const stderrContent = stderrRead.content !== void 0 && stderrRead.content.trim().length > 0 ? stderrRead.content : void 0;
  const issue = {
    id: stepId,
    reason,
    ...stepOutcome !== void 0 ? { outcome: stepOutcome } : {},
    isFailed,
    ...exitCode !== void 0 ? { exitCode } : {},
    ...diagnostic !== void 0 ? { diagnostic } : {},
    ...stdoutRead.content !== void 0 ? { stdout: stdoutRead.content } : {},
    ...stdoutRead.error !== void 0 ? { stdoutError: stdoutRead.error } : {},
    ...stderrContent !== void 0 ? { stderr: stderrContent } : {},
    ...stderrRead.error !== void 0 ? { stderrError: stderrRead.error } : {}
  };
  return issue;
}
function shouldCreateStepIssue(step, readerOpts, diagnostic) {
  const outcome = getStepOutcome(step);
  if (outcome === "failure") return true;
  if (diagnostic !== void 0) return true;
  const stderrPeek = peekStepStderr(step, readerOpts);
  return stderrPeek.content !== void 0 && stderrPeek.content.trim().length > 0;
}

// src/builder/title.ts
function buildTitle(report) {
  const workspace = report.workspace;
  if (report.error !== void 0) {
    return {
      status: "failure",
      ...workspace !== void 0 ? { workspace } : {},
      body: { kind: "error" }
    };
  }
  const hasIacStepFailure = hasIacFailure(report);
  const hasAnyStepFailure = hasAnyFailure(report);
  if (hasIacStepFailure) {
    const op = normalizeOperation(report.operation);
    return {
      status: "failure",
      ...workspace !== void 0 ? { workspace } : {},
      body: op !== void 0 ? { kind: "operation-failed", operation: op } : { kind: "generic-failed" }
    };
  }
  if (report.summary) {
    return buildSummaryTitle(
      report.summary,
      report.operation ?? "plan",
      workspace,
      hasAnyStepFailure
    );
  }
  if (report.operationOutcome === "skipped") {
    return {
      status: "warning",
      ...workspace !== void 0 ? { workspace } : {},
      body: {
        kind: "operation-skipped",
        ...(() => {
          const op = normalizeOperation(report.operation);
          return op !== void 0 ? { operation: op } : {};
        })()
      }
    };
  }
  if (report.steps.length > 0 && report.steps.every((s) => s.outcome === "skipped")) {
    return {
      status: "warning",
      ...workspace !== void 0 ? { workspace } : {},
      body: { kind: "all-skipped" }
    };
  }
  if (hasAnyStepFailure || report.issues.some((i) => i.isFailed)) {
    return {
      status: "failure",
      ...workspace !== void 0 ? { workspace } : {},
      body: buildFailedBody(report)
    };
  }
  return {
    status: "success",
    ...workspace !== void 0 ? { workspace } : {},
    body: {
      kind: "succeeded",
      ...(() => {
        const op = normalizeOperation(report.operation);
        return op !== void 0 ? { operation: op } : {};
      })()
    }
  };
}
function buildPlanCounts(summary) {
  const counts = /* @__PURE__ */ new Map();
  for (const group of summary.actions) {
    counts.set(group.action, (counts.get(group.action) ?? 0) + group.total);
  }
  return mapToActionCounts(counts);
}
function buildApplyCounts(summary) {
  const counts = /* @__PURE__ */ new Map();
  for (const group of summary.actions) {
    counts.set(group.action, (counts.get(group.action) ?? 0) + group.total);
  }
  return mapToActionCounts(counts);
}
function buildFailureCounts(summary) {
  const total = summary.failures.reduce((sum, g) => sum + g.total, 0);
  if (total === 0) return [];
  return [{ action: "failed", count: total }];
}
function buildSummaryTitle(summary, operation, workspace, hasAnyStepFailure) {
  const hasFailures = summary.failures.length > 0;
  const status = hasFailures || hasAnyStepFailure ? "failure" : "success";
  if (operation === "apply" || operation === "destroy") {
    const counts2 = buildApplyCounts(summary);
    const failures = buildFailureCounts(summary);
    const failureTotal = summary.failures.reduce((sum, g) => sum + g.total, 0);
    if (hasFailures) {
      return {
        status,
        ...workspace !== void 0 ? { workspace } : {},
        body: {
          kind: "summary",
          operation,
          counts: counts2,
          failures,
          failureTotal,
          hasStepFailure: hasAnyStepFailure
        }
      };
    }
    return {
      status,
      ...workspace !== void 0 ? { workspace } : {},
      body: {
        kind: "summary",
        operation,
        counts: counts2,
        failures: [],
        failureTotal: 0,
        hasStepFailure: hasAnyStepFailure
      }
    };
  }
  const totalActions = summary.actions.reduce((sum, g) => sum + g.total, 0);
  if (totalActions === 0 && !hasFailures && !hasAnyStepFailure) {
    return {
      status,
      ...workspace !== void 0 ? { workspace } : {},
      body: { kind: "no-changes" }
    };
  }
  if (hasFailures || hasAnyStepFailure) {
    return {
      status,
      ...workspace !== void 0 ? { workspace } : {},
      body: {
        kind: "operation-failed",
        operation: "plan"
      }
    };
  }
  const counts = buildPlanCounts(summary);
  return {
    status,
    ...workspace !== void 0 ? { workspace } : {},
    body: {
      kind: "summary",
      operation: "plan",
      counts,
      failures: [],
      failureTotal: 0,
      hasStepFailure: false
    }
  };
}
function normalizeOperation(operation) {
  switch (operation) {
    case "apply":
    case "destroy":
    case "plan":
      return operation;
    default:
      return void 0;
  }
}
function hasIacFailure(report) {
  const iacRoles = /* @__PURE__ */ new Set(["plan", "apply", "show-plan", "validate", "init"]);
  return report.steps.some((s) => s.outcome === "failure" && iacRoles.has(s.id)) || report.issues.some((i) => i.isFailed && iacRoles.has(i.id));
}
function hasAnyFailure(report) {
  return report.steps.some((s) => s.outcome === "failure");
}
function buildFailedBody(report) {
  const failedSteps = report.steps.filter((s) => s.outcome === "failure");
  if (failedSteps.length === 1) {
    const name = failedSteps[0]?.id ?? "unknown";
    return { kind: "step-failed", stepId: name };
  }
  return { kind: "generic-failed" };
}
function mapToActionCounts(counts) {
  const result = [];
  for (const [action, count] of counts) {
    result.push({ action, count });
  }
  return result;
}

// src/parser/validate-output.ts
function parseValidateOutput(json) {
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Failed to parse validate output: input is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Validate output must be a JSON object");
  }
  const obj = parsed;
  const formatVersion = obj["format_version"];
  if (typeof formatVersion !== "string") {
    throw new Error(
      "Validate output is missing required field: format_version"
    );
  }
  const majorStr = formatVersion.split(".")[0] ?? "0";
  const major = parseInt(majorStr, 10);
  if (isNaN(major) || major > 1) {
    throw new Error(
      `Unsupported validate format_version: ${formatVersion} (major version ${String(major)} > 1)`
    );
  }
  if (typeof obj["valid"] !== "boolean") {
    throw new Error(
      "Validate output is missing required field: valid (boolean)"
    );
  }
  if (!Array.isArray(obj["diagnostics"])) {
    throw new Error(
      "Validate output is missing required field: diagnostics (array)"
    );
  }
  return parsed;
}

// src/builder/process-helpers.ts
function uiDiagnosticToModel(d, source) {
  const base = {
    severity: d.severity,
    summary: d.summary,
    detail: d.detail,
    source
  };
  if (d.address !== void 0) base["address"] = d.address;
  if (d.range !== void 0) base["range"] = d.range;
  if (d.snippet !== void 0) base["snippet"] = d.snippet;
  return base;
}
function extractJsonlResourceAddress(obj) {
  const type = obj["type"];
  if (typeof type !== "string") return void 0;
  if (type === "apply_start" || type === "apply_progress" || type === "apply_complete" || type === "apply_errored" || type === "refresh_start" || type === "refresh_complete" || type === "provision_start" || type === "provision_progress" || type === "provision_complete" || type === "provision_errored") {
    const hook = obj["hook"];
    if (typeof hook !== "object" || hook === null) return void 0;
    const resource = hook["resource"];
    if (typeof resource !== "object" || resource === null) return void 0;
    const addr = resource["addr"];
    return typeof addr === "string" ? addr : void 0;
  }
  if (type === "planned_change" || type === "resource_drift") {
    const change = obj["change"];
    if (typeof change !== "object" || change === null) return void 0;
    const resource = change["resource"];
    if (typeof resource !== "object" || resource === null) return void 0;
    const addr = resource["addr"];
    return typeof addr === "string" ? addr : void 0;
  }
  if (type === "diagnostic") {
    const diagnostic = obj["diagnostic"];
    if (typeof diagnostic !== "object" || diagnostic === null) return void 0;
    const addr = diagnostic["address"];
    return typeof addr === "string" ? addr : void 0;
  }
  return void 0;
}
function filterJsonlByAddresses(content, addresses) {
  const lines = content.split("\n");
  const filtered = [];
  for (const line of lines) {
    if (line.trim() === "") {
      filtered.push(line);
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      filtered.push(line);
      continue;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      filtered.push(line);
      continue;
    }
    const addr = extractJsonlResourceAddress(parsed);
    if (addr === void 0 || addresses.has(addr)) {
      filtered.push(line);
    }
  }
  return filtered.join("\n");
}
function filterStepIssueStdout(report, stepId, diagnostics) {
  const addresses = /* @__PURE__ */ new Set();
  for (const d of diagnostics) {
    if (d.address === void 0) return;
    addresses.add(d.address);
  }
  if (addresses.size === 0) return;
  const idx = report.issues.findIndex((i) => i.id === stepId);
  if (idx < 0) return;
  const issue = report.issues[idx];
  if (issue === void 0) return;
  if (issue.stdout === void 0) return;
  const filtered = filterJsonlByAddresses(issue.stdout, addresses);
  report.issues[idx] = { ...issue, stdout: filtered };
}
function addScannerWarnings(report, scan, role) {
  if (scan.unparseableLines > 0) {
    report.warnings.push(
      new UnparseableLinesWarning(scan.unparseableLines, role)
    );
  }
  if (scan.unknownTypeLines > 0) {
    report.warnings.push(
      new UnknownMessageTypesWarning(scan.unknownTypeLines, role)
    );
  }
}

// src/builder/process-validate.ts
function processValidateStep(step, stepId, report, readerOpts) {
  const outcome = getStepOutcome(step);
  if (outcome === "failure") {
    report.issues.push(buildStepIssue(step, stepId, readerOpts));
  }
  const stdoutRead = readStepStdout(step, readerOpts);
  if (stdoutRead.content !== void 0) {
    try {
      const validateOutput = parseValidateOutput(stdoutRead.content);
      if (validateOutput.diagnostics.length > 0) {
        const diagnostics = validateOutput.diagnostics.map(
          (d) => uiDiagnosticToModel(d, "validate")
        );
        report.diagnostics = [...report.diagnostics ?? [], ...diagnostics];
      }
    } catch {
    }
  }
}

// src/parser/plan.ts
function parsePlan(json) {
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Failed to parse plan JSON: input is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Plan JSON must be a JSON object");
  }
  const obj = parsed;
  const formatVersion = obj["format_version"];
  if (typeof formatVersion !== "string") {
    throw new Error("Plan JSON is missing required field: format_version");
  }
  const majorStr = formatVersion.split(".")[0] ?? "0";
  const major = parseInt(majorStr, 10);
  if (isNaN(major) || major > 1) {
    throw new Error(
      `Unsupported plan format_version: ${formatVersion} (major version ${String(major)} > 1)`
    );
  }
  return parsed;
}

// src/parser/detect-tool.ts
function detectToolFromPlan(plan) {
  if (plan.applyable !== void 0) return "terraform";
  if (plan.timestamp !== void 0) return "tofu";
  const version = plan.terraform_version;
  if (version !== void 0) {
    const lower = version.toLowerCase();
    if (lower.includes("tofu")) return "tofu";
  }
  return void 0;
}
function detectToolFromOutput(content) {
  if (content === void 0 || content.length === 0) return void 0;
  const versionResult = detectFromVersionMessage(content);
  if (versionResult !== void 0) return versionResult;
  return detectFromRawText(content);
}
function detectFromVersionMessage(content) {
  const lines = content.split("\n", 5);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || !trimmed.startsWith("{")) continue;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      continue;
    }
    const obj = parsed;
    if (obj["type"] !== "version") continue;
    if ("tofu" in obj) return "tofu";
    if ("terraform" in obj) return "terraform";
  }
  return void 0;
}
function detectFromRawText(content) {
  const sample = content.slice(0, 4096).toLowerCase();
  if (sample.includes("opentofu")) return "tofu";
  if (sample.includes("terraform")) return "terraform";
  return void 0;
}

// src/builder/action.ts
function determineAction(actions) {
  const [first, second] = actions;
  if (second !== void 0) {
    return "replace";
  }
  switch (first) {
    case "create":
      return "create";
    case "delete":
      return "delete";
    case "update":
      return "update";
    case "no-op":
      return "no-op";
    case "read":
      return "read";
    case "forget":
      return "forget";
  }
  return "unknown";
}

// src/flattener/index.ts
function flatten(value) {
  const result = /* @__PURE__ */ new Map();
  flattenInto(value, "", result);
  return result;
}
function flattenInto(value, prefix, result) {
  if (value === null) {
    result.set(prefix, null);
  } else if (typeof value === "string") {
    result.set(prefix, value);
  } else if (typeof value === "number") {
    result.set(prefix, String(value));
  } else if (typeof value === "boolean") {
    result.set(prefix, value ? "true" : "false");
  } else if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const child = value[i];
      if (child !== void 0) {
        flattenInto(
          child,
          prefix === "" ? `[${String(i)}]` : `${prefix}[${String(i)}]`,
          result
        );
      }
    }
  } else {
    const entries = Object.entries(value);
    if (entries.length === 0 && prefix !== "") {
      result.set(prefix, "{}");
    } else {
      for (const [key, child] of entries) {
        if (child !== void 0) {
          flattenInto(child, prefix === "" ? key : `${prefix}.${key}`, result);
        }
      }
    }
  }
}

// src/sensitivity/index.ts
function getHierarchicalPaths(key) {
  const paths = [];
  const seen = /* @__PURE__ */ new Set();
  let current = key;
  while (current.length > 0) {
    if (!seen.has(current)) {
      seen.add(current);
      paths.push(current);
    }
    const dotIdx = current.lastIndexOf(".");
    const bracketIdx = current.lastIndexOf("[");
    if (dotIdx > bracketIdx && dotIdx !== -1) {
      current = current.slice(0, dotIdx);
    } else if (bracketIdx !== -1) {
      current = current.slice(0, bracketIdx);
    } else {
      break;
    }
  }
  return paths;
}
function isSensitive(key, beforeSensitive, afterSensitive) {
  if (beforeSensitive.get("") === "true" || afterSensitive.get("") === "true") {
    return true;
  }
  for (const path of getHierarchicalPaths(key)) {
    if (beforeSensitive.get(path) === "true" || afterSensitive.get(path) === "true") {
      return true;
    }
  }
  return false;
}

// src/model/sentinels.ts
var SENSITIVE_MASK = "(sensitive)";
var KNOWN_AFTER_APPLY = "(known after apply)";
var VALUE_NOT_IN_PLAN = "(value not in plan)";

// src/builder/attributes.ts
var LARGE_LINE_THRESHOLD = 3;
function shadowToMap(shadow) {
  if (shadow === void 0) return /* @__PURE__ */ new Map();
  if (typeof shadow === "boolean") {
    const m = /* @__PURE__ */ new Map();
    m.set("", shadow ? "true" : "false");
    return m;
  }
  return flatten(shadow);
}
function isUnknownAfterApply(key, unknownMap) {
  if (unknownMap.get("") === "true") return true;
  return unknownMap.get(key) === "true";
}
function isLargeValue(value) {
  if (value === null) return false;
  const trimmed = value.trim();
  if (trimmed.length > 2 && (trimmed.startsWith("{") || trimmed.startsWith("[") || trimmed.startsWith("<"))) {
    return true;
  }
  let count = 0;
  for (const ch of value) {
    if (ch === "\n") {
      count++;
      if (count > LARGE_LINE_THRESHOLD) return true;
    }
  }
  return false;
}
function buildAttributeChanges(change, options) {
  const before = change.before ?? null;
  const after = change.after ?? null;
  const beforeSensitiveMap = shadowToMap(change.before_sensitive);
  const afterSensitiveMap = shadowToMap(change.after_sensitive);
  const unknownMap = shadowToMap(change.after_unknown);
  const allUnknown = unknownMap.get("") === "true";
  const beforeFlat = before ? flatten(before) : /* @__PURE__ */ new Map();
  const afterFlat = after ? flatten(after) : /* @__PURE__ */ new Map();
  const flatKeys = /* @__PURE__ */ new Set();
  for (const [k] of beforeFlat) flatKeys.add(k);
  for (const [k] of afterFlat) flatKeys.add(k);
  for (const [k, v] of unknownMap) {
    if (k !== "" && v === "true") flatKeys.add(k);
  }
  const result = [];
  for (const key of flatKeys) {
    const sensitive = isSensitive(key, beforeSensitiveMap, afterSensitiveMap);
    let beforeVal;
    let afterVal;
    if (sensitive) {
      beforeVal = beforeFlat.has(key) ? SENSITIVE_MASK : null;
      afterVal = afterFlat.has(key) || isUnknownAfterApply(key, unknownMap) ? SENSITIVE_MASK : null;
    } else {
      beforeVal = beforeFlat.has(key) ? beforeFlat.get(key) ?? null : null;
      if (allUnknown || isUnknownAfterApply(key, unknownMap)) {
        afterVal = KNOWN_AFTER_APPLY;
      } else {
        afterVal = afterFlat.has(key) ? afterFlat.get(key) ?? null : null;
      }
    }
    const isKnownAfterApply = !sensitive && (allUnknown || isUnknownAfterApply(key, unknownMap));
    const hasSensitiveValue = sensitive && (beforeFlat.has(key) || afterFlat.has(key));
    if (!options.showUnchangedAttributes && beforeVal === afterVal && !isKnownAfterApply && !hasSensitiveValue) {
      continue;
    }
    const large = isLargeValue(sensitive ? null : beforeVal) || isLargeValue(sensitive || isKnownAfterApply ? null : afterVal);
    result.push({
      name: key,
      before: beforeVal,
      after: afterVal,
      isSensitive: sensitive,
      isLarge: large,
      isKnownAfterApply
    });
  }
  result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}

// src/drift-filter/rules/google-artifact-registry-repository.ts
var suppressGoogleArtifactRegistryRepositoryUpdateTime = (type, _mode, attributes) => {
  if (type !== "google_artifact_registry_repository") return false;
  const changed = attributes.filter((a) => a.before !== a.after);
  return changed.length > 0 && changed.every((a) => a.name === "update_time");
};

// src/drift-filter/rules/google-compute-managed-ssl-certificate.ts
var suppressGoogleComputeManagedSslCertificateExpireTime = (type, _mode, attributes) => {
  if (type !== "google_compute_managed_ssl_certificate") return false;
  const changed = attributes.filter((a) => a.before !== a.after);
  return changed.length > 0 && changed.every((a) => a.name === "expire_time");
};

// src/drift-filter/rules/google-compute-url-map.ts
var suppressGoogleComputeUrlMapFingerprint = (type, _mode, attributes) => {
  if (type !== "google_compute_url_map") return false;
  const changed = attributes.filter((a) => a.before !== a.after);
  return changed.length > 0 && changed.every((a) => a.name === "fingerprint");
};

// src/drift-filter/rules/data-source.ts
var suppressDataSourceDrift = (_type, mode) => mode === "data";

// src/drift-filter/rules/etag-only.ts
var suppressEtagOnlyDrift = (_type, _mode, attributes) => {
  const changed = attributes.filter((a) => a.before !== a.after);
  return changed.length > 0 && changed.every((a) => a.name === "etag");
};

// src/drift-filter/rules/google-storage-managed-folder.ts
var BORING_ATTRIBUTES = /* @__PURE__ */ new Set(["metageneration", "update_time"]);
var suppressGoogleStorageManagedFolderMetaBoring = (type, _mode, attributes) => {
  if (type !== "google_storage_managed_folder") return false;
  const changed = attributes.filter((a) => a.before !== a.after);
  return changed.length > 0 && changed.every((a) => BORING_ATTRIBUTES.has(a.name));
};

// src/drift-filter/rules/google-storage-bucket.ts
var suppressGoogleStorageBucketUpdated = (type, _mode, attributes) => {
  if (type !== "google_storage_bucket") return false;
  const changed = attributes.filter((a) => a.before !== a.after);
  return changed.length > 0 && changed.every((a) => a.name === "updated");
};

// src/drift-filter/registry.ts
var DriftRuleRegistry = class {
  rules = [];
  /**
   * Registers a drift suppression rule. Returns `this` for chaining.
   */
  register(rule) {
    this.rules.push(rule);
    return this;
  }
  /**
   * Returns `true` if any registered rule indicates this drift entry should be
   * suppressed from the report.
   */
  shouldSuppressDrift(type, mode, attributes) {
    return this.rules.some((rule) => rule(type, mode, attributes));
  }
};
function createDefaultDriftRuleRegistry() {
  return new DriftRuleRegistry().register(suppressDataSourceDrift).register(suppressEtagOnlyDrift).register(suppressGoogleStorageManagedFolderMetaBoring).register(suppressGoogleComputeManagedSslCertificateExpireTime).register(suppressGoogleComputeUrlMapFingerprint).register(suppressGoogleArtifactRegistryRepositoryUpdateTime).register(suppressGoogleStorageBucketUpdated);
}

// src/builder/resources.ts
function refineAction(base, rc) {
  if (base !== "no-op") return base;
  if (rc.previous_address) return "move";
  if (rc.change.importing) return "import";
  return "no-op";
}
function buildResourceChanges(plan, options) {
  const resourceChanges = plan.resource_changes ?? [];
  const result = [];
  for (const rc of resourceChanges) {
    if (shouldSkip(rc)) continue;
    const action = refineAction(determineAction(rc.change.actions), rc);
    if (action === "no-op") continue;
    const address = rc.address ?? `${rc.type ?? "unknown"}.${rc.name ?? "unknown"}`;
    const attributes = buildAttributeChanges(rc.change, options);
    const allUnknownAfterApply = isAllUnknownAfterApply(rc, attributes);
    result.push({
      address,
      type: rc.type ?? "unknown",
      action,
      actionReason: rc.action_reason ?? null,
      attributes,
      hasAttributeDetail: true,
      importId: rc.change.importing?.id ?? null,
      movedFromAddress: rc.previous_address ?? null,
      allUnknownAfterApply
    });
  }
  return result;
}
function buildDriftChanges(plan, options) {
  const driftChanges = plan.resource_drift ?? [];
  const result = [];
  const registry = options.driftRuleRegistry ?? createDefaultDriftRuleRegistry();
  for (const rc of driftChanges) {
    const action = refineAction(determineAction(rc.change.actions), rc);
    const address = rc.address ?? `${rc.type ?? "unknown"}.${rc.name ?? "unknown"}`;
    const attributes = buildAttributeChanges(rc.change, options);
    const allAttributesForSuppression = buildAttributeChanges(rc.change, {
      ...options,
      showUnchangedAttributes: true
    });
    const allUnknownAfterApply = isAllUnknownAfterApply(rc, attributes);
    if (registry.shouldSuppressDrift(
      rc.type ?? "unknown",
      rc.mode ?? "managed",
      allAttributesForSuppression
    ))
      continue;
    if (!hasRawValueChanges(rc.change) && action !== "move" && action !== "import")
      continue;
    result.push({
      address,
      type: rc.type ?? "unknown",
      action,
      actionReason: rc.action_reason ?? null,
      attributes,
      hasAttributeDetail: true,
      importId: rc.change.importing?.id ?? null,
      movedFromAddress: rc.previous_address ?? null,
      allUnknownAfterApply
    });
  }
  return result;
}
function shouldSkip(rc) {
  if (rc.mode === "data") {
    return true;
  }
  return false;
}
function hasRawValueChanges(change) {
  const before = change.before ?? null;
  const after = change.after ?? null;
  if (before === null !== (after === null)) return true;
  if (before === null && after === null) return false;
  if (change.after_unknown === true) return true;
  if (typeof change.after_unknown === "object" && Object.keys(change.after_unknown).length > 0)
    return true;
  const beforeFlat = flatten(before);
  const afterFlat = flatten(after);
  for (const [key, beforeVal] of beforeFlat) {
    if (beforeVal === null) {
      const afterVal = afterFlat.get(key);
      if (afterVal !== void 0 && afterVal !== null) return true;
    } else if (beforeVal === "{}") {
      if (!isEmptyBlockEquivalent(key, afterFlat)) return true;
    } else {
      if (!afterFlat.has(key)) return true;
      if (beforeVal !== afterFlat.get(key)) return true;
    }
  }
  for (const [key, afterVal] of afterFlat) {
    if (!beforeFlat.has(key)) {
      if (afterVal === null) continue;
      if (afterVal === "{}") {
        if (!isEmptyBlockEquivalent(key, beforeFlat)) return true;
        continue;
      }
      return true;
    }
  }
  return false;
}
function isEmptyBlockEquivalent(emptyBlockKey, otherMap) {
  for (const [k, v] of otherMap) {
    if (isChildKey(emptyBlockKey, k) && v !== null) return false;
  }
  return true;
}
function isChildKey(parentKey, candidateKey) {
  if (!candidateKey.startsWith(parentKey)) return false;
  if (candidateKey.length <= parentKey.length) return false;
  const next = candidateKey[parentKey.length];
  return next === "." || next === "[";
}
function isAllUnknownAfterApply(rc, attributes) {
  if (rc.change.after_unknown === true) return true;
  if (attributes.length > 0 && attributes.every((a) => a.isKnownAfterApply)) {
    return true;
  }
  return false;
}
function buildResourcesFromScan(changes) {
  const result = [];
  for (const change of changes) {
    if (change.action === "no-op") continue;
    result.push({
      address: change.address,
      type: change.resourceType,
      action: change.action,
      actionReason: change.reason ?? null,
      attributes: [],
      hasAttributeDetail: false,
      importId: null,
      movedFromAddress: null,
      allUnknownAfterApply: false
    });
  }
  return result;
}

// src/builder/summary.ts
var SUMMARY_ACTIONS = [
  "create",
  "update",
  "replace",
  "delete",
  "move",
  "import",
  "forget"
];
function buildSummary(resources) {
  return {
    actions: buildActionGroups(resources, SUMMARY_ACTIONS),
    failures: []
  };
}
function buildApplySummary(resources, failedAddresses) {
  const succeeded = resources.filter((r) => !failedAddresses.has(r.address));
  const failed = resources.filter((r) => failedAddresses.has(r.address));
  return {
    actions: buildActionGroups(succeeded, SUMMARY_ACTIONS),
    failures: buildActionGroups(failed, SUMMARY_ACTIONS)
  };
}
function buildActionGroups(resources, actionOrder) {
  const buckets = /* @__PURE__ */ new Map();
  const actionSet = new Set(actionOrder);
  for (const r of resources) {
    if (!actionSet.has(r.action)) continue;
    let typeCounts = buckets.get(r.action);
    if (!typeCounts) {
      typeCounts = /* @__PURE__ */ new Map();
      buckets.set(r.action, typeCounts);
    }
    typeCounts.set(r.type, (typeCounts.get(r.type) ?? 0) + 1);
  }
  const groups = [];
  for (const action of actionOrder) {
    const typeCounts = buckets.get(action);
    if (!typeCounts) continue;
    const resourceTypes = [...typeCounts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
    const total = resourceTypes.reduce((sum, rt) => sum + rt.count, 0);
    groups.push({ action, resourceTypes, total });
  }
  return groups;
}
function buildSummaryFromScan(changes) {
  return {
    actions: buildActionGroupsFromScan(changes, SUMMARY_ACTIONS),
    failures: []
  };
}
function buildActionGroupsFromScan(changes, actionOrder) {
  const buckets = /* @__PURE__ */ new Map();
  const actionSet = new Set(actionOrder);
  for (const c of changes) {
    if (!actionSet.has(c.action)) continue;
    let typeCounts = buckets.get(c.action);
    if (!typeCounts) {
      typeCounts = /* @__PURE__ */ new Map();
      buckets.set(c.action, typeCounts);
    }
    typeCounts.set(c.resourceType, (typeCounts.get(c.resourceType) ?? 0) + 1);
  }
  const groups = [];
  for (const action of actionOrder) {
    const typeCounts = buckets.get(action);
    if (!typeCounts) continue;
    const resourceTypes = [...typeCounts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
    const total = resourceTypes.reduce((sum, rt) => sum + rt.count, 0);
    groups.push({ action, resourceTypes, total });
  }
  return groups;
}

// src/builder/outputs.ts
var LARGE_LINE_THRESHOLD2 = 3;
function buildOutputChanges(plan) {
  const outputChanges = plan.output_changes;
  if (!outputChanges) return [];
  const result = [];
  for (const [name, change] of Object.entries(outputChanges)) {
    const action = determineAction(change.actions);
    if (action === "no-op") continue;
    const isSensitive2 = change.before_sensitive === true || change.after_sensitive === true;
    const before = isSensitive2 ? null : valueToString(change.before ?? null);
    let after;
    let isKnownAfterApply = false;
    if (isSensitive2) {
      after = null;
    } else if (change.after_unknown === true) {
      after = KNOWN_AFTER_APPLY;
      isKnownAfterApply = true;
    } else {
      after = valueToString(change.after ?? null);
    }
    const isLarge = isLargeValue2(isSensitive2 ? null : before) || isLargeValue2(isSensitive2 || isKnownAfterApply ? null : after);
    result.push({
      name,
      action,
      before,
      after,
      isSensitive: isSensitive2,
      isLarge,
      isKnownAfterApply
    });
  }
  return result;
}
function valueToString(val) {
  if (val === null || val === void 0) return null;
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  return JSON.stringify(val, null, 2);
}
function isLargeValue2(value) {
  if (value === null) return false;
  const trimmed = value.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[") || trimmed.startsWith("<")) {
    return true;
  }
  let count = 0;
  for (const ch of value) {
    if (ch === "\n") {
      count++;
      if (count > LARGE_LINE_THRESHOLD2) return true;
    }
  }
  return false;
}

// src/builder/index.ts
function buildReport(plan, options = {}) {
  const resources = buildResourceChanges(plan, options);
  const driftResources = buildDriftChanges(plan, options);
  const summary = buildSummary(resources);
  const outputs = buildOutputChanges(plan);
  return {
    title: { status: "success", body: { kind: "no-changes" } },
    issues: [],
    steps: [],
    warnings: [],
    rawStdout: [],
    operation: "plan",
    ...plan.terraform_version !== void 0 ? { toolVersion: plan.terraform_version } : {},
    formatVersion: plan.format_version,
    ...plan.timestamp !== void 0 ? { timestamp: plan.timestamp } : {},
    summary,
    resources,
    outputs,
    driftResources
  };
}

// src/builder/apply.ts
function buildApplyReport(plan, scanResult, options = {}) {
  const report = buildReport(plan, options);
  const stateOnlyAddresses = extractStateOnlyAddresses(plan);
  const appliedAddresses = /* @__PURE__ */ new Set([
    ...scanResult.applyStatuses.map((s) => s.address),
    ...stateOnlyAddresses.keys()
  ]);
  const plannedAddresses = /* @__PURE__ */ new Map();
  for (const change of scanResult.plannedChanges) {
    plannedAddresses.set(change.address, change.action);
  }
  const stateOnlyStatuses = buildStateOnlyStatuses(stateOnlyAddresses);
  const diagnostics = scanResult.diagnostics.map((d) => ({
    ...d,
    source: "apply"
  }));
  filterPhantomResources(report, appliedAddresses);
  replaceKnownAfterApply(report);
  const notStartedStatuses = buildNotStartedStatuses(
    plannedAddresses,
    appliedAddresses
  );
  const allStatuses = [
    ...scanResult.applyStatuses,
    ...stateOnlyStatuses,
    ...notStartedStatuses
  ];
  if (scanResult.outputsMessage) {
    resolveOutputValues(report, scanResult.outputsMessage);
  }
  const failedAddresses = new Set(
    scanResult.applyStatuses.filter((s) => !s.success).map((s) => s.address)
  );
  report.summary = buildApplySummary(report.resources ?? [], failedAddresses);
  if (diagnostics.length > 0) {
    report.diagnostics = diagnostics;
  }
  if (allStatuses.length > 0) {
    report.applyStatuses = allStatuses;
  }
  report.operation = "apply";
  if (scanResult.tool !== void 0) {
    report.tool = scanResult.tool;
  }
  return report;
}
function extractStateOnlyAddresses(plan) {
  const addresses = /* @__PURE__ */ new Map();
  for (const rc of plan.resource_changes ?? []) {
    if (rc.mode === "data") continue;
    const actions = rc.change.actions;
    if (actions.length !== 1) continue;
    const action = actions[0];
    if (action === "forget") {
      if (rc.address) addresses.set(rc.address, "forget");
    } else if (action === "no-op") {
      if (rc.previous_address) {
        if (rc.address) addresses.set(rc.address, "move");
      } else if (rc.change.importing) {
        if (rc.address) addresses.set(rc.address, "import");
      }
    }
  }
  return addresses;
}
function buildStateOnlyStatuses(stateOnlyAddresses) {
  return [...stateOnlyAddresses.entries()].map(([address, action]) => ({
    address,
    action,
    success: true
  }));
}
function buildNotStartedStatuses(plannedAddresses, appliedAddresses) {
  const notStarted = [];
  for (const [addr, action] of plannedAddresses) {
    if (!appliedAddresses.has(addr)) {
      notStarted.push({
        address: addr,
        action,
        success: false
      });
    }
  }
  return notStarted;
}
function filterPhantomResources(report, appliedAddresses) {
  if (!report.resources) return;
  report.resources = report.resources.filter(
    (r) => appliedAddresses.has(r.address)
  );
}
function replaceKnownAfterApply(report) {
  for (const resource of report.resources ?? []) {
    for (const attr of resource.attributes) {
      if (attr.isKnownAfterApply) {
        attr.after = VALUE_NOT_IN_PLAN;
      }
    }
  }
  for (const output of report.outputs ?? []) {
    if (output.isKnownAfterApply) {
      output.after = VALUE_NOT_IN_PLAN;
    }
  }
}
function resolveOutputValues(report, outputsMessage) {
  for (const output of report.outputs ?? []) {
    const resolved = outputsMessage.outputs[output.name];
    if (!resolved) continue;
    if (output.isSensitive || resolved.sensitive) continue;
    if (output.isKnownAfterApply) {
      const val = resolved.value;
      if (val !== void 0 && val !== null) {
        output.after = typeof val === "string" ? val : JSON.stringify(val, null, 2);
      }
    }
  }
}

// src/jsonl-scanner/scan.ts
import { openSync as openSync2, readSync as readSync2, closeSync as closeSync2, fstatSync } from "node:fs";
var CHUNK_SIZE = 64 * 1024;
var SKIPPABLE_TYPES = /* @__PURE__ */ new Set([
  "log",
  "apply_start",
  "apply_progress",
  "refresh_start",
  "refresh_complete",
  "provision_start",
  "provision_progress",
  "provision_complete",
  "provision_errored",
  "test_abstract",
  "test_file",
  "test_run",
  "test_plan",
  "test_state",
  "test_cleanup",
  "test_summary",
  "test_interrupt",
  "test_status",
  "init_output"
]);
function createAccumulator() {
  return {
    plannedChanges: [],
    applyStatuses: [],
    diagnostics: [],
    driftChanges: [],
    changeSummary: void 0,
    outputsMessage: void 0,
    tool: void 0,
    totalLines: 0,
    parsedLines: 0,
    unknownTypeLines: 0,
    unparseableLines: 0
  };
}
function toScanResult(acc) {
  return {
    plannedChanges: acc.plannedChanges,
    applyStatuses: acc.applyStatuses,
    diagnostics: acc.diagnostics,
    driftChanges: acc.driftChanges,
    totalLines: acc.totalLines,
    parsedLines: acc.parsedLines,
    unknownTypeLines: acc.unknownTypeLines,
    unparseableLines: acc.unparseableLines,
    ...acc.changeSummary !== void 0 ? { changeSummary: acc.changeSummary } : {},
    ...acc.outputsMessage !== void 0 ? { outputsMessage: acc.outputsMessage } : {},
    ...acc.tool !== void 0 ? { tool: acc.tool } : {}
  };
}
function scanString(content) {
  const acc = createAccumulator();
  const lines = content.split("\n");
  for (const line of lines) {
    processLine(acc, line);
  }
  return toScanResult(acc);
}
function scanFile(filePath, maxFileSize) {
  const acc = createAccumulator();
  const fd = openSync2(filePath, "r");
  try {
    const stat = fstatSync(fd);
    if (stat.size > maxFileSize) {
      return toScanResult(acc);
    }
    const buf = Buffer.alloc(CHUNK_SIZE);
    let remainder = "";
    while (true) {
      const bytesRead = readSync2(fd, buf, 0, CHUNK_SIZE, null);
      if (bytesRead === 0) break;
      const chunk = remainder + buf.toString("utf8", 0, bytesRead);
      const lines = chunk.split("\n");
      remainder = lines.pop() ?? "";
      for (const line of lines) {
        processLine(acc, line);
      }
    }
    if (remainder.length > 0) {
      processLine(acc, remainder);
    }
  } finally {
    closeSync2(fd);
  }
  return toScanResult(acc);
}
function processLine(acc, rawLine) {
  const line = rawLine.trim();
  if (line === "") return;
  acc.totalLines++;
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    acc.unparseableLines++;
    return;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    acc.unparseableLines++;
    return;
  }
  const obj = parsed;
  const type = obj["type"];
  if (typeof type !== "string") {
    acc.unparseableLines++;
    return;
  }
  switch (type) {
    case "version":
      processVersion(acc, obj);
      break;
    case "planned_change":
      processPlannedChange(acc, obj, "plannedChanges");
      break;
    case "resource_drift":
      processPlannedChange(acc, obj, "driftChanges");
      break;
    case "change_summary":
      processChangeSummary(acc, obj);
      break;
    case "apply_complete":
      processApplyComplete(acc, obj);
      break;
    case "apply_errored":
      processApplyErrored(acc, obj);
      break;
    case "diagnostic":
      processDiagnostic(acc, obj);
      break;
    case "outputs":
      processOutputs(acc, obj);
      break;
    default:
      if (SKIPPABLE_TYPES.has(type)) {
        acc.parsedLines++;
      } else {
        acc.unknownTypeLines++;
      }
      return;
  }
  acc.parsedLines++;
}
function processVersion(acc, obj) {
  if (typeof obj["tofu"] === "string") {
    acc.tool = "tofu";
  } else if (typeof obj["terraform"] === "string") {
    acc.tool = "terraform";
  }
}
function processPlannedChange(acc, obj, target) {
  const change = obj["change"];
  if (typeof change !== "object" || change === null) return;
  const changeObj = change;
  const resource = changeObj["resource"];
  if (typeof resource !== "object" || resource === null) return;
  const resourceObj = resource;
  const addr = resourceObj["addr"];
  const resourceType = resourceObj["resource_type"];
  const module = resourceObj["module"];
  const action = changeObj["action"];
  if (typeof addr !== "string" || typeof action !== "string") return;
  const entry = {
    address: addr,
    resourceType: typeof resourceType === "string" ? resourceType : "",
    module: typeof module === "string" ? module : "",
    action: uiActionToPlanAction(action),
    ...typeof changeObj["reason"] === "string" ? { reason: changeObj["reason"] } : {}
  };
  acc[target].push(entry);
}
function processChangeSummary(acc, obj) {
  const changes = obj["changes"];
  if (typeof changes !== "object" || changes === null) return;
  acc.changeSummary = changes;
}
function processApplyComplete(acc, obj) {
  const hook = obj["hook"];
  if (typeof hook !== "object" || hook === null) return;
  const hookObj = hook;
  const resource = hookObj["resource"];
  if (typeof resource !== "object" || resource === null) return;
  const resourceObj = resource;
  const addr = resourceObj["addr"];
  const action = hookObj["action"];
  if (typeof addr !== "string" || typeof action !== "string") return;
  const status = {
    address: addr,
    action: uiActionToPlanAction(action),
    success: true,
    ...typeof hookObj["elapsed_seconds"] === "number" ? { elapsed: hookObj["elapsed_seconds"] } : {},
    ...typeof hookObj["id_key"] === "string" ? { idKey: hookObj["id_key"] } : {},
    ...typeof hookObj["id_value"] === "string" ? { idValue: hookObj["id_value"] } : {}
  };
  const existing = acc.applyStatuses.findIndex((s) => s.address === addr);
  if (existing >= 0) {
    acc.applyStatuses[existing] = status;
  } else {
    acc.applyStatuses.push(status);
  }
}
function processApplyErrored(acc, obj) {
  const hook = obj["hook"];
  if (typeof hook !== "object" || hook === null) return;
  const hookObj = hook;
  const resource = hookObj["resource"];
  if (typeof resource !== "object" || resource === null) return;
  const resourceObj = resource;
  const addr = resourceObj["addr"];
  const action = hookObj["action"];
  if (typeof addr !== "string" || typeof action !== "string") return;
  const status = {
    address: addr,
    action: uiActionToPlanAction(action),
    success: false,
    ...typeof hookObj["elapsed_seconds"] === "number" ? { elapsed: hookObj["elapsed_seconds"] } : {}
  };
  const existing = acc.applyStatuses.findIndex((s) => s.address === addr);
  if (existing >= 0) {
    acc.applyStatuses[existing] = status;
  } else {
    acc.applyStatuses.push(status);
  }
}
function processDiagnostic(acc, obj) {
  const diagnostic = obj["diagnostic"];
  if (typeof diagnostic !== "object" || diagnostic === null) return;
  const diagObj = diagnostic;
  const severity = diagObj["severity"];
  const summary = diagObj["summary"];
  if (severity !== "error" && severity !== "warning") return;
  if (typeof summary !== "string") return;
  const range = diagObj["range"];
  const snippet = diagObj["snippet"];
  const base = {
    severity,
    summary,
    detail: typeof diagObj["detail"] === "string" ? diagObj["detail"] : ""
  };
  if (typeof diagObj["address"] === "string")
    base["address"] = diagObj["address"];
  if (isRange(range)) base["range"] = range;
  if (isSnippet(snippet)) base["snippet"] = snippet;
  const diag = base;
  acc.diagnostics.push(diag);
}
function processOutputs(acc, obj) {
  acc.outputsMessage = obj;
}
function uiActionToPlanAction(action) {
  switch (action) {
    case "create":
      return "create";
    case "update":
      return "update";
    case "delete":
      return "delete";
    case "replace":
      return "replace";
    case "read":
      return "read";
    case "noop":
      return "no-op";
    case "forget":
      return "forget";
    case "remove":
      return "forget";
    case "move":
      return "move";
    case "import":
      return "import";
    default:
      return "unknown";
  }
}
function isRange(value) {
  if (typeof value !== "object" || value === null) return false;
  const obj = value;
  return typeof obj["filename"] === "string" && typeof obj["start"] === "object";
}
function isSnippet(value) {
  if (typeof value !== "object" || value === null) return false;
  const obj = value;
  return typeof obj["code"] === "string" && typeof obj["start_line"] === "number";
}

// src/builder/process-show-plan.ts
function tryProcessShowPlan(showPlanStep, showPlanStepId, applyStep, applyStepId, report, readerOpts, options, tool) {
  const read = readStepStdout(showPlanStep, readerOpts);
  if (read.content === void 0) {
    if (read.error) {
      report.warnings.push(new StepReadErrorWarning("show-plan", read.error));
    } else if (read.noFile) {
      report.warnings.push(new StepOutputMissingWarning("show-plan"));
    }
    return false;
  }
  let plan;
  try {
    plan = parsePlan(read.content);
  } catch (err) {
    const errorDetail = err instanceof Error ? err.message : "unknown error";
    const commandHint = expectedCommand(tool, "show-plan");
    report.issues.push(
      buildStepIssue(
        showPlanStep,
        showPlanStepId,
        readerOpts,
        `Plan output could not be parsed: ${errorDetail}. Expected output from \`${commandHint}\`.`
      )
    );
    return false;
  }
  let enrichedReport;
  let isApplyMode = false;
  if (applyStep && getStepOutcome(applyStep) !== "skipped") {
    isApplyMode = true;
    const applyRead = readStepStdout(applyStep, readerOpts);
    if (applyRead.content !== void 0) {
      try {
        const applyScan = scanString(applyRead.content);
        enrichedReport = buildApplyReport(plan, applyScan, options);
      } catch {
        report.warnings.push(new StepOutputParseWarning(applyStepId));
        enrichedReport = buildReport(plan, options);
      }
    } else {
      enrichedReport = buildReport(plan, options);
    }
  } else {
    enrichedReport = buildReport(plan, options);
  }
  if (enrichedReport.summary !== void 0)
    report.summary = enrichedReport.summary;
  if (enrichedReport.resources !== void 0)
    report.resources = enrichedReport.resources;
  if (enrichedReport.driftResources !== void 0)
    report.driftResources = enrichedReport.driftResources;
  if (enrichedReport.outputs !== void 0)
    report.outputs = enrichedReport.outputs;
  const mergedDiags = [
    ...report.diagnostics ?? [],
    ...enrichedReport.diagnostics ?? []
  ];
  if (mergedDiags.length > 0) report.diagnostics = mergedDiags;
  if (enrichedReport.applyStatuses !== void 0)
    report.applyStatuses = enrichedReport.applyStatuses;
  if (enrichedReport.formatVersion)
    report.formatVersion = enrichedReport.formatVersion;
  if (enrichedReport.toolVersion)
    report.toolVersion = enrichedReport.toolVersion;
  if (enrichedReport.timestamp) report.timestamp = enrichedReport.timestamp;
  report.operation = isApplyMode ? "apply" : "plan";
  const detectedTool = detectToolFromPlan(plan);
  if (detectedTool !== void 0) report.tool = detectedTool;
  return true;
}

// src/jsonl-scanner/detect.ts
function isJsonLines(firstLines) {
  for (const line of firstLines) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) && typeof parsed["type"] === "string") {
        return true;
      }
    } catch {
    }
  }
  return false;
}

// src/builder/process-plan.ts
function processPlanStep(step, stepId, report, readerOpts, showPlanParsed) {
  const outcome = getStepOutcome(step);
  if (outcome === "failure") {
    report.issues.push(buildStepIssue(step, stepId, readerOpts));
  }
  const path = getStepStdoutPath(step, readerOpts);
  if (path) {
    const peek = peekStepStdout(step, readerOpts);
    if (peek.content !== void 0) {
      const firstLines = peek.content.split("\n", 10);
      if (isJsonLines(firstLines)) {
        const diagsBefore = report.diagnostics?.length ?? 0;
        enrichFromPlanJsonl(path, report, readerOpts, showPlanParsed);
        if (outcome === "failure") {
          const newDiags = (report.diagnostics ?? []).slice(diagsBefore);
          filterStepIssueStdout(report, stepId, newDiags);
        }
        return;
      }
    }
  }
  if (outcome !== "failure") {
    const read = readStepStdout(step, readerOpts);
    if (read.content !== void 0) {
      const detectedTool = detectToolFromOutput(read.content);
      if (detectedTool !== void 0) report.tool = detectedTool;
      report.rawStdout.push({
        stepId,
        label: "Plan Output",
        content: read.content
      });
    } else if (read.error) {
      report.warnings.push(new StepReadErrorWarning("plan", read.error));
    } else if (read.noFile) {
      report.warnings.push(new StepOutputMissingWarning("plan"));
    }
  }
}
function enrichFromPlanJsonl(filePath, report, readerOpts, showPlanParsed) {
  let scan;
  try {
    scan = scanFile(filePath, readerOpts.maxFileSize);
  } catch {
    report.warnings.push(new StepScanFailureWarning("plan"));
    return;
  }
  if (scan.tool !== void 0) report.tool = scan.tool;
  if (scan.diagnostics.length > 0) {
    const planDiags = scan.diagnostics.map((d) => ({
      ...d,
      source: "plan"
    }));
    report.diagnostics = [...report.diagnostics ?? [], ...planDiags];
  }
  if (showPlanParsed) return;
  if (scan.plannedChanges.length > 0) {
    report.summary = buildSummaryFromScan(scan.plannedChanges);
    report.resources = buildResourcesFromScan(scan.plannedChanges);
  }
  if (scan.driftChanges.length > 0) {
    report.driftResources = buildResourcesFromScan(scan.driftChanges);
  }
  if (scan.changeSummary !== void 0) {
    const op = scan.changeSummary.operation;
    if (op === "apply" || op === "destroy") {
      report.operation = op;
    } else {
      report.operation = "plan";
    }
  }
  addScannerWarnings(report, scan, "plan");
}

// src/builder/process-apply.ts
function processApplyStep(step, stepId, report, readerOpts, showPlanParsed) {
  const outcome = getStepOutcome(step);
  if (outcome === "failure") {
    report.issues.push(buildStepIssue(step, stepId, readerOpts));
  }
  const path = getStepStdoutPath(step, readerOpts);
  if (path) {
    const peek = peekStepStdout(step, readerOpts);
    if (peek.content !== void 0) {
      const firstLines = peek.content.split("\n", 10);
      if (isJsonLines(firstLines)) {
        const diagsBefore = report.diagnostics?.length ?? 0;
        enrichFromApplyJsonl(path, report, readerOpts, showPlanParsed);
        if (outcome === "failure") {
          const newDiags = (report.diagnostics ?? []).slice(diagsBefore);
          filterStepIssueStdout(report, stepId, newDiags);
        }
        return;
      }
    }
  }
  if (outcome !== "failure") {
    const read = readStepStdout(step, readerOpts);
    if (read.content !== void 0) {
      const detectedTool = detectToolFromOutput(read.content);
      if (detectedTool !== void 0) report.tool = detectedTool;
      report.rawStdout.push({
        stepId,
        label: "Apply Output",
        content: read.content
      });
    } else if (read.error) {
      report.warnings.push(new StepReadErrorWarning("apply", read.error));
    } else if (read.noFile) {
      report.warnings.push(new StepOutputMissingWarning("apply"));
    }
  }
  report.operation = "apply";
}
function enrichFromApplyJsonl(filePath, report, readerOpts, showPlanParsed) {
  let scan;
  try {
    scan = scanFile(filePath, readerOpts.maxFileSize);
  } catch {
    report.warnings.push(new StepScanFailureWarning("apply"));
    return;
  }
  if (scan.tool !== void 0) report.tool = scan.tool;
  if (scan.applyStatuses.length > 0) {
    report.applyStatuses = [
      ...report.applyStatuses ?? [],
      ...scan.applyStatuses
    ];
  }
  if (scan.diagnostics.length > 0) {
    const applyDiags = scan.diagnostics.map((d) => ({
      ...d,
      source: "apply"
    }));
    report.diagnostics = [...report.diagnostics ?? [], ...applyDiags];
  }
  if (!showPlanParsed && report.resources === void 0 && scan.plannedChanges.length > 0) {
    report.summary = buildSummaryFromScan(scan.plannedChanges);
    report.resources = buildResourcesFromScan(scan.plannedChanges);
  }
  if (scan.driftChanges.length > 0 && report.driftResources === void 0) {
    report.driftResources = buildResourcesFromScan(scan.driftChanges);
  }
  if (scan.changeSummary !== void 0) {
    const op = scan.changeSummary.operation;
    if (op === "apply" || op === "destroy") {
      report.operation = op;
    }
  }
  if (report.operation === void 0 || report.operation === "plan") {
    report.operation = "apply";
  }
  addScannerWarnings(report, scan, "apply");
}

// src/builder/state-enrichment.ts
var LARGE_LINE_THRESHOLD3 = 3;
function enrichReportFromState(report, state) {
  const stateResources = state.resources;
  const hasResources = stateResources !== void 0 && stateResources.length > 0;
  const hasOutputs = state.outputs !== void 0 && Object.keys(state.outputs).length > 0;
  if (!hasResources && !hasOutputs) return;
  const instanceMap = hasResources ? buildInstanceMap(stateResources) : /* @__PURE__ */ new Map();
  let enrichedAny = false;
  for (const resource of report.resources ?? []) {
    if (!resource.hasAttributeDetail) continue;
    const flat = instanceMap.get(resource.address);
    if (flat !== void 0) {
      for (const attr of resource.attributes) {
        if (!attr.isKnownAfterApply) continue;
        if (attr.isSensitive) continue;
        if (flat.sensitiveNames.has(attr.name)) {
          attr.isSensitive = true;
          attr.after = SENSITIVE_MASK;
          attr.isKnownAfterApply = false;
          enrichedAny = true;
        } else {
          const resolved = resolveFromInstance(flat, attr.name);
          if (resolved !== void 0) {
            attr.after = resolved;
            attr.isKnownAfterApply = false;
            attr.isLarge = isLargeValue3(resolved);
            enrichedAny = true;
          }
        }
      }
    }
    resource.allUnknownAfterApply = false;
  }
  const stateOutputs = state.outputs;
  if (stateOutputs !== void 0) {
    for (const output of report.outputs ?? []) {
      if (!output.isKnownAfterApply) continue;
      if (output.isSensitive) continue;
      const stateOutput = stateOutputs[output.name];
      if (stateOutput === void 0) continue;
      if (stateOutput.sensitive === true) {
        output.isSensitive = true;
        output.after = SENSITIVE_MASK;
        output.isKnownAfterApply = false;
        enrichedAny = true;
      } else if (stateOutput.value !== void 0) {
        output.after = stringifyValue(stateOutput.value);
        output.isKnownAfterApply = false;
        output.isLarge = isLargeValue3(output.after);
        enrichedAny = true;
      }
    }
  }
  if (enrichedAny) {
    report.stateEnriched = true;
  }
}
function buildInstanceMap(resources) {
  const map = /* @__PURE__ */ new Map();
  for (const res of resources) {
    for (const inst of res.instances ?? []) {
      const address = buildAddress(res, inst);
      const rawValues = inst.attributes;
      const flatValues = rawValues !== void 0 ? flatten(rawValues) : /* @__PURE__ */ new Map();
      const sensitiveNames = extractSensitiveNames(inst);
      map.set(address, { rawValues, flatValues, sensitiveNames });
    }
  }
  return map;
}
function buildAddress(res, inst) {
  let address = "";
  if (res.module !== void 0 && res.module !== "") {
    address = `${res.module}.`;
  }
  address += `${res.type}.${res.name}`;
  if (inst.index_key !== void 0) {
    if (typeof inst.index_key === "number") {
      address += `[${String(inst.index_key)}]`;
    } else {
      address += `["${inst.index_key}"]`;
    }
  }
  return address;
}
function extractSensitiveNames(inst) {
  const names = /* @__PURE__ */ new Set();
  for (const path of inst.sensitive_attributes ?? []) {
    const first = path[0];
    if (first?.type === "get_attr") {
      names.add(first.value);
    }
  }
  return names;
}
function resolveFromInstance(inst, attrName) {
  if (inst.rawValues !== void 0 && attrName in inst.rawValues) {
    return stringifyValue(inst.rawValues[attrName]);
  }
  if (inst.flatValues.has(attrName)) {
    return inst.flatValues.get(attrName) ?? null;
  }
  return void 0;
}
function stringifyValue(value) {
  if (value === null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}
function isLargeValue3(value) {
  if (value === null) return false;
  const trimmed = value.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[") || trimmed.startsWith("<")) {
    return true;
  }
  let count = 0;
  for (const ch of value) {
    if (ch === "\n") {
      count++;
      if (count > LARGE_LINE_THRESHOLD3) return true;
    }
  }
  return false;
}

// src/parser/state.ts
function parseState(json) {
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Failed to parse state JSON: input is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("State JSON must be a JSON object");
  }
  const obj = parsed;
  const version = obj["version"];
  if (typeof version !== "number") {
    throw new Error("State JSON is missing required field: version");
  }
  if (version > 4) {
    throw new Error(
      `Unsupported state version: ${String(version)} (expected <= 4)`
    );
  }
  return parsed;
}

// src/builder/report-from-steps.ts
import { tmpdir } from "node:os";
function createEmptyReport() {
  return {
    title: { status: "success", body: { kind: "no-changes" } },
    issues: [],
    steps: [],
    warnings: [],
    rawStdout: []
  };
}
function buildReportFromSteps(stepsJson, options) {
  const env = options?.env ?? process.env;
  const workspace = options?.workspace;
  const logsUrl = buildLogsUrl(env);
  const initStepId = options?.initStepId ?? DEFAULT_INIT_STEP;
  const validateStepId = options?.validateStepId ?? DEFAULT_VALIDATE_STEP;
  const planStepId = options?.planStepId ?? DEFAULT_PLAN_STEP;
  const showPlanStepId = options?.showPlanStepId ?? DEFAULT_SHOW_PLAN_STEP;
  const applyStepId = options?.applyStepId ?? DEFAULT_APPLY_STEP;
  const stateStepId = options?.stateStepId ?? DEFAULT_STATE_STEP;
  const knownStepIds = /* @__PURE__ */ new Set([
    initStepId,
    validateStepId,
    planStepId,
    showPlanStepId,
    applyStepId,
    stateStepId
  ]);
  const readerOpts = {
    allowedDirs: options?.allowedDirs ?? [env["RUNNER_TEMP"] ?? tmpdir()],
    maxFileSize: DEFAULT_MAX_FILE_SIZE
  };
  const parseResult = parseSteps(stepsJson);
  if (typeof parseResult === "string") {
    return buildErrorReport(parseResult, workspace);
  }
  const steps = parseResult;
  const report = createEmptyReport();
  report.steps = buildStepOutcomes(steps);
  if (workspace !== void 0) report.workspace = workspace;
  if (logsUrl !== void 0) report.logsUrl = logsUrl;
  let tool = options?.tool;
  const initStep = steps[initStepId];
  const validateStep = steps[validateStepId];
  const planStep = steps[planStepId];
  const showPlanStep = steps[showPlanStepId];
  const applyStep = steps[applyStepId];
  const stateStep = steps[stateStepId];
  const hasAnyIaCStep = initStep !== void 0 || validateStep !== void 0 || planStep !== void 0 || showPlanStep !== void 0 || applyStep !== void 0;
  if (initStep && getStepOutcome(initStep) === "failure") {
    report.issues.push(buildStepIssue(initStep, initStepId, readerOpts));
  }
  if (validateStep) {
    processValidateStep(validateStep, validateStepId, report, readerOpts);
  }
  let showPlanParsed = false;
  if (showPlanStep && getStepOutcome(showPlanStep) === "success") {
    showPlanParsed = tryProcessShowPlan(
      showPlanStep,
      showPlanStepId,
      applyStep,
      applyStepId,
      report,
      readerOpts,
      options,
      tool
    );
    if (showPlanParsed) {
      tool ??= report.tool;
    }
  }
  if (planStep) {
    processPlanStep(planStep, planStepId, report, readerOpts, showPlanParsed);
    tool ??= report.tool;
  }
  if (applyStep && getStepOutcome(applyStep) !== "skipped") {
    processApplyStep(
      applyStep,
      applyStepId,
      report,
      readerOpts,
      showPlanParsed
    );
    tool ??= report.tool;
  }
  if (showPlanParsed && report.operation === "apply" && stateStep !== void 0 && getStepOutcome(stateStep) === "success") {
    const stateRead = readStepStdout(stateStep, readerOpts);
    if (stateRead.content !== void 0) {
      try {
        const state = parseState(stateRead.content);
        enrichReportFromState(report, state);
      } catch {
      }
    }
  }
  for (const [stepId, step] of Object.entries(steps)) {
    if (knownStepIds.has(stepId)) continue;
    if (shouldCreateStepIssue(step, readerOpts)) {
      report.issues.push(buildStepIssue(step, stepId, readerOpts));
    }
  }
  if (!showPlanParsed && (report.resources !== void 0 || report.summary !== void 0)) {
    report.warnings.push(new NoShowPlanWarning(tool));
  } else if (!showPlanParsed && report.rawStdout.length > 0) {
    report.warnings.push(new RawTextFallbackWarning(tool));
  }
  if (showPlanParsed && report.operation === "apply" && !report.stateEnriched && hasUnresolvedKnownAfterApply(report)) {
    report.warnings.push(new NoStateWarning(tool));
  }
  if (tool !== void 0) report.tool = tool;
  if (report.operation === void 0) {
    if (applyStep && getStepOutcome(applyStep) !== "skipped") {
      report.operation = "apply";
      report.operationOutcome = getStepOutcome(applyStep);
    } else if (applyStep && getStepOutcome(applyStep) === "skipped" && !planStep && !showPlanStep) {
      report.operation = "apply";
      report.operationOutcome = "skipped";
    } else if (planStep || showPlanStep) {
      report.operation = "plan";
      const primaryStep = planStep ?? showPlanStep;
      if (primaryStep !== void 0) {
        report.operationOutcome = getStepOutcome(primaryStep);
      }
    }
  }
  if (hasAnyIaCStep) {
    const failedUnfamiliar = new Set(
      report.issues.filter((i) => !knownStepIds.has(i.id) && i.isFailed).map((i) => i.id)
    );
    report.steps = report.steps.filter(
      (s) => knownStepIds.has(s.id) || failedUnfamiliar.has(s.id)
    );
  }
  report.title = buildTitle(report);
  report.hasUnresolvedFailures = report.issues.some(
    (i) => i.isFailed && i.stdout === void 0 && i.stderr === void 0
  );
  return report;
}
function buildErrorReport(message, workspace, steps) {
  const report = createEmptyReport();
  report.error = message;
  if (steps !== void 0) report.steps = [...steps];
  if (workspace !== void 0) report.workspace = workspace;
  report.title = buildTitle(report);
  return report;
}
function buildLogsUrl(env) {
  const repo = env["GITHUB_REPOSITORY"];
  const runId = env["GITHUB_RUN_ID"];
  if (!repo || !runId) return void 0;
  const attempt = env["GITHUB_RUN_ATTEMPT"] ?? "1";
  return `https://github.com/${repo}/actions/runs/${runId}/attempts/${attempt}`;
}
function hasUnresolvedKnownAfterApply(report) {
  for (const resource of report.resources ?? []) {
    for (const attr of resource.attributes) {
      if (attr.isKnownAfterApply) return true;
    }
  }
  for (const output of report.outputs ?? []) {
    if (output.isKnownAfterApply) return true;
  }
  return false;
}

// src/renderable/markdown-escape.ts
var ESCAPE_MAP = /* @__PURE__ */ new Map([
  // HTML entities (security-critical — GitHub renders inline HTML)
  ["&", "&amp;"],
  ["<", "&lt;"],
  [">", "&gt;"],
  // Markdown inline syntax characters (GFM spec sections 6.1–6.6)
  ["\\", "\\\\"],
  // backslash escape initiator
  ["`", "\\`"],
  // code span delimiter
  ["*", "\\*"],
  // emphasis / strong emphasis
  ["_", "\\_"],
  // emphasis / strong emphasis
  ["~", "\\~"],
  // strikethrough (GFM extension)
  ["[", "\\["],
  // link / image text start
  ["]", "\\]"],
  // link / image text end
  ["|", "\\|"]
  // GFM table cell delimiter
]);
function markdownEscape(text) {
  let result = "";
  for (const ch of text) {
    const replacement = ESCAPE_MAP.get(ch);
    result += replacement ?? ch;
  }
  return result;
}
function markdownEscapeBlock(text) {
  let escaped = markdownEscape(text);
  escaped = escaped.replace(/^([-+])(?=[ \t])/, "\\$1");
  escaped = escaped.replace(/^(\d{1,9})([.)])(?=[ \t])/, "$1\\$2");
  escaped = escaped.replace(/^(#{1,6})(?=[ \t])/, "\\$1");
  return escaped;
}

// src/renderable/primitives.ts
var Empty = class {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size(format) {
    return 0;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(format) {
    return "";
  }
};
var EMPTY = new Empty();
var Heading = class {
  text;
  level;
  constructor(text, level = 2) {
    this.text = text;
    this.level = level;
  }
  size(format) {
    return this.render(format).length;
  }
  render(format) {
    if (format === "markdown") {
      return `${"#".repeat(this.level)} ${markdownEscape(this.text)}

`;
    }
    return `<h${String(this.level)}>${htmlEscape(this.text)}</h${String(this.level)}>
`;
  }
};
var CodeBlock = class {
  content;
  language;
  constructor(content, language = "") {
    this.content = content;
    this.language = language;
  }
  size(format) {
    return this.render(format).length;
  }
  render(format) {
    if (format === "markdown") {
      return `\`\`\`${this.language}
${this.content}
\`\`\`

`;
    }
    const langAttr = this.language.length > 0 ? ` class="language-${htmlEscape(this.language)}"` : "";
    return `<pre><code${langAttr}>${htmlEscape(this.content)}</code></pre>
`;
  }
};
var Blockquote = class {
  text;
  constructor(text) {
    this.text = text;
  }
  size(format) {
    return this.render(format).length;
  }
  render(format) {
    if (format === "markdown") {
      const lines = this.text.split("\n");
      return lines.map((l) => `> ${markdownEscapeBlock(l)}`).join("\n") + "\n\n";
    }
    return `<blockquote><p>${htmlEscape(this.text).replace(/\n/g, "<br>")}</p></blockquote>
`;
  }
};
var Table = class {
  headers;
  rows;
  mdSize;
  htSize;
  constructor(headers, rows) {
    this.headers = headers;
    this.rows = rows;
    this.mdSize = this.computeMdSize();
    this.htSize = this.computeHtSize();
  }
  size(format) {
    return format === "markdown" ? this.mdSize : this.htSize;
  }
  render(format) {
    return format === "markdown" ? this.renderMarkdown() : this.renderHtml();
  }
  computeMdSize() {
    const cols = this.headers.length;
    let size = this.rowMdSize(this.headers);
    size += 6 * cols + 2;
    for (const row of this.rows) {
      size += this.rowMdSize(row.cells);
    }
    size += 1;
    return size;
  }
  /** Size of one markdown row: `| cell | cell |\n` */
  rowMdSize(cells) {
    let size = 3 * cells.length + 2;
    for (const cell of cells) {
      size += cell.size("markdown");
    }
    return size;
  }
  computeHtSize() {
    const TH_OVERHEAD = 9;
    const TD_OVERHEAD = 9;
    let size = 8;
    size += 8;
    size += 4;
    for (const h of this.headers) {
      size += TH_OVERHEAD + h.size("html");
    }
    size += 6;
    size += 9;
    size += 8;
    for (const row of this.rows) {
      size += 4;
      for (const cell of row.cells) {
        size += TD_OVERHEAD + cell.size("html");
      }
      size += 6;
    }
    size += 9;
    size += 9;
    return size;
  }
  renderMarkdown() {
    const cols = this.headers.length;
    let out = this.renderMdRow(this.headers);
    out += `| ${Array.from({ length: cols }, () => "---").join(" | ")} |
`;
    for (const row of this.rows) {
      out += this.renderMdRow(row.cells);
    }
    out += "\n";
    return out;
  }
  renderMdRow(cells) {
    const rendered = cells.map((c) => c.render("markdown"));
    return `| ${rendered.join(" | ")} |
`;
  }
  renderHtml() {
    let out = "<table>\n<thead>\n<tr>";
    for (const h of this.headers) {
      out += `<th>${h.render("html")}</th>`;
    }
    out += "</tr>\n</thead>\n<tbody>\n";
    for (const row of this.rows) {
      out += "<tr>";
      for (const cell of row.cells) {
        out += `<td>${cell.render("html")}</td>`;
      }
      out += "</tr>\n";
    }
    out += "</tbody>\n</table>\n";
    return out;
  }
};
var Details = class {
  summary;
  content;
  open;
  mdSize;
  htSize;
  constructor(summary, content, open = false) {
    this.summary = summary;
    this.content = content;
    this.open = open;
    const summaryHtmlSize = summary.size("html");
    const openTag = open ? "<details open>" : "<details>";
    const mdPre = `${openTag}
<summary>`;
    const mdMid = "</summary>\n\n";
    const mdPost = "\n\n</details>\n\n";
    this.mdSize = mdPre.length + summaryHtmlSize + mdMid.length + content.size("markdown") + mdPost.length;
    const htPre = `${openTag}
<summary>`;
    const htMid = "</summary>\n";
    const htPost = "\n</details>\n";
    this.htSize = htPre.length + summaryHtmlSize + htMid.length + content.size("html") + htPost.length;
  }
  size(format) {
    return format === "markdown" ? this.mdSize : this.htSize;
  }
  render(format) {
    const summaryHtml = this.summary.render("html");
    const openTag = this.open ? "<details open>" : "<details>";
    if (format === "markdown") {
      return `${openTag}
<summary>${summaryHtml}</summary>

${this.content.render("markdown")}

</details>

`;
    }
    return `${openTag}
<summary>${summaryHtml}</summary>
${this.content.render("html")}
</details>
`;
  }
};
var Sequence = class {
  children;
  separator;
  mdSize;
  htSize;
  constructor(children, separator = "") {
    this.children = children;
    this.separator = separator;
    const sepLen = separator.length;
    const count = children.length;
    const sepTotal = count > 1 ? sepLen * (count - 1) : 0;
    let md = sepTotal;
    let ht = sepTotal;
    for (const child of children) {
      md += child.size("markdown");
      ht += child.size("html");
    }
    this.mdSize = md;
    this.htSize = ht;
  }
  size(format) {
    return format === "markdown" ? this.mdSize : this.htSize;
  }
  render(format) {
    if (this.children.length === 0) return "";
    const first = this.children[0];
    if (this.children.length === 1 && first !== void 0) {
      return first.render(format);
    }
    return this.children.map((c) => c.render(format)).join(this.separator);
  }
};

// src/model/status-icons.ts
var STATUS_SUCCESS = "\u2705";
var STATUS_FAILURE = "\u274C";
var DIAGNOSTIC_ERROR = "\u{1F6A8}";
var DIAGNOSTIC_WARNING = "\u26A0\uFE0F";
var MODULE_ICON = "\u{1F4E6}";
var DRIFT_ICON = "\u{1F500}";
var INFO_ICON = "\u2139\uFE0F";
var ARTIFACT_ICON = "\u{1F4CE}";

// src/elements/title.ts
var TitleElement = class {
  id = "title";
  fixed = true;
  levels = 1;
  title;
  constructor(title) {
    this.title = title;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size(format, _level) {
    return renderTitle(this.title, format).length;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(format, _level) {
    return renderTitle(this.title, format);
  }
};
function renderTitle(title, format) {
  const icon = statusIcon(title.status);
  const ws = renderWorkspace(title.workspace, format);
  const bodyText = renderTitleBody(title.body, format);
  const content = [icon, ws, bodyText].filter(Boolean).join(" ");
  if (format === "markdown") {
    return `## ${content}

`;
  }
  return `<h2>${content}</h2>
`;
}
function renderWorkspace(workspace, format) {
  if (workspace === void 0) return "";
  if (format === "markdown") {
    return `\`${workspace}\``;
  }
  return `<code>${htmlEscape(workspace)}</code>`;
}
function renderTitleBody(body, format) {
  switch (body.kind) {
    case "summary":
      return renderSummaryBody(body);
    case "no-changes":
      return "No Changes";
    case "error":
      return "Report Generation Failed";
    case "operation-failed":
      return `${operationLabel(body.operation)} Failed`;
    case "step-failed":
      return renderStepFailed(body.stepId, format);
    case "generic-failed":
      return "Failed";
    case "operation-skipped":
      return body.operation !== void 0 ? `${operationLabel(body.operation)} Skipped` : "Skipped";
    case "all-skipped":
      return "All Steps Skipped";
    case "succeeded":
      return body.operation !== void 0 ? `${operationLabel(body.operation)} Succeeded` : "Succeeded";
  }
}
function renderStepFailed(stepId, format) {
  if (format === "markdown") {
    return `\`${stepId}\` Failed`;
  }
  return `<code>${htmlEscape(stepId)}</code> Failed`;
}
function renderSummaryBody(body) {
  const isApply = body.operation === "apply" || body.operation === "destroy";
  if (isApply) {
    if (body.failureTotal > 0) {
      const failParts = formatFailureParts(body.failures);
      const countParts = formatApplyCountParts(body.counts);
      return `Apply Failed: ${[...failParts, ...countParts].join(", ")}`;
    }
    const parts2 = formatApplyCountParts(body.counts);
    if (parts2.length === 0) {
      return "Apply Complete";
    }
    return `Apply: ${parts2.join(", ")}`;
  }
  const parts = formatPlanCountParts(body.counts);
  return `Plan: ${parts.join(", ")}`;
}
function formatPlanCountParts(counts) {
  return counts.map(
    (c) => `${String(c.count)} to ${planActionLabel(c.action)}`
  );
}
function formatApplyCountParts(counts) {
  return counts.map((c) => `${String(c.count)} ${applyActionLabel(c.action)}`);
}
function formatFailureParts(failures) {
  return failures.map((f) => `${String(f.count)} ${f.action}`);
}
function planActionLabel(action) {
  switch (action) {
    case "create":
      return "add";
    case "update":
      return "change";
    case "delete":
      return "destroy";
    case "replace":
      return "replace";
    case "import":
      return "import";
    case "move":
      return "move";
    case "forget":
      return "forget";
    default:
      return action;
  }
}
function applyActionLabel(action) {
  switch (action) {
    case "create":
      return "added";
    case "update":
      return "changed";
    case "delete":
      return "destroyed";
    case "replace":
      return "replaced";
    case "import":
      return "imported";
    case "move":
      return "moved";
    case "forget":
      return "forgotten";
    default:
      return action;
  }
}
function operationLabel(operation) {
  switch (operation) {
    case "apply":
      return "Apply";
    case "destroy":
      return "Destroy";
    case "plan":
      return "Plan";
    default:
      return operation;
  }
}
function statusIcon(status) {
  switch (status) {
    case "success":
      return STATUS_SUCCESS;
    case "failure":
      return STATUS_FAILURE;
    case "warning":
      return DIAGNOSTIC_WARNING;
  }
}
var MarkerElement = class {
  id = "marker";
  fixed = true;
  levels = 1;
  workspace;
  constructor(workspace) {
    this.workspace = workspace;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size(_format, _level) {
    return this.render("markdown", 0).length;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(_format, _level) {
    const escaped = escapeMarkerWorkspace(this.workspace);
    return `<!-- tf-report-action:"${escaped}" -->
`;
  }
};
var WarningElement = class {
  fixed = true;
  levels = 1;
  id;
  renderable;
  constructor(warning, index) {
    this.id = `warning-${String(index)}`;
    this.renderable = new WarningBlockquoteChrome(warning);
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size(format, _level) {
    return this.renderable.size(format);
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(format, _level) {
    return this.renderable.render(format);
  }
};
var UserTitleElement = class {
  id = "user-title";
  fixed = true;
  levels = 1;
  renderable;
  constructor(title) {
    this.renderable = new Heading(title, 2);
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size(format, _level) {
    return this.renderable.size(format);
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(format, _level) {
    return this.renderable.render(format);
  }
};
var WarningBlockquoteChrome = class {
  body;
  constructor(body) {
    this.body = body;
  }
  size(format) {
    return this.render(format).length;
  }
  render(format) {
    const text = this.body.render(format);
    if (format === "markdown") {
      return `> ${DIAGNOSTIC_WARNING} **Warning:** ${text}

`;
    }
    return `<blockquote><p>${DIAGNOSTIC_WARNING} <strong>Warning:</strong> ${text}</p></blockquote>
`;
  }
};
function escapeMarkerWorkspace(workspace) {
  return workspace.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/--/g, "-\u200B-");
}

// src/renderable/helpers.ts
function mdCodeSpan(text) {
  let maxRun = 0;
  let currentRun = 0;
  for (const ch of text) {
    currentRun = ch === "`" ? currentRun + 1 : 0;
    if (currentRun > maxRun) maxRun = currentRun;
  }
  const fence = "`".repeat(maxRun + 1);
  const needsPadding = text.startsWith("`") || text.endsWith("`");
  return needsPadding ? `${fence} ${text} ${fence}` : `${fence}${text}${fence}`;
}
function renderNote(text, format) {
  return format === "markdown" ? `_${markdownEscape(text)}_

` : `<p><em>${htmlEscape(text)}</em></p>
`;
}
function textCell(text) {
  const renderFn = (format) => format === "markdown" ? markdownEscape(text) : htmlEscape(text);
  return { size: (f) => renderFn(f).length, render: renderFn };
}
function codeSpan(text) {
  const renderFn = (format) => format === "markdown" ? mdCodeSpan(text) : `<code>${htmlEscape(text)}</code>`;
  return { size: (f) => renderFn(f).length, render: renderFn };
}
function boldSpan(text) {
  const renderFn = (format) => format === "markdown" ? `**${markdownEscape(text)}**` : `<strong>${htmlEscape(text)}</strong>`;
  return { size: (f) => renderFn(f).length, render: renderFn };
}
function htmlCodeCell(value) {
  const renderFn = (format) => {
    const escaped = htmlEscape(value);
    return format === "markdown" ? `<code>${escaped.replace(/\|/g, "&#124;")}</code>` : `<code>${escaped}</code>`;
  };
  return { size: (f) => renderFn(f).length, render: renderFn };
}
function htmlCodeCellMultiline(value) {
  const renderFn = (format) => {
    const escaped = htmlEscape(value).replace(/\n/g, "<br>");
    return format === "markdown" ? `<code>${escaped.replace(/\|/g, "&#124;")}</code>` : `<code>${escaped}</code>`;
  };
  return { size: (f) => renderFn(f).length, render: renderFn };
}
function detailsSummary(text) {
  const html = htmlEscape(text);
  return { size: () => html.length, render: () => html };
}

// src/model/plan-action.ts
var ACTION_SYMBOLS = {
  create: "\u2795",
  update: "\u{1F527}",
  delete: "\u{1F5D1}\uFE0F",
  replace: "\xB1",
  read: "\u{1F441}",
  "no-op": "\u2B1C",
  forget: "\u{1F44B}",
  move: "\u{1F69A}",
  import: "\u{1F4E5}",
  open: "\u{1F4C2}",
  unknown: "\u2753"
};

// src/elements/summary.ts
var PLAN_LABELS = {
  create: "Add",
  update: "Change",
  replace: "Replace",
  delete: "Destroy",
  move: "Move",
  import: "Import",
  forget: "Forget"
};
var APPLY_LABELS = {
  create: "Added",
  update: "Changed",
  replace: "Replaced",
  delete: "Destroyed",
  move: "Moved",
  import: "Imported",
  forget: "Forgotten"
};
var FAILURE_LABELS = {
  create: "Add failed",
  update: "Change failed",
  replace: "Replace failed",
  delete: "Destroy failed",
  move: "Move failed",
  import: "Import failed",
  forget: "Forget failed"
};
var SummaryElement = class {
  id = "summary";
  fixed = true;
  levels = 1;
  heading;
  summary;
  isApply;
  constructor(heading, summary, isApply) {
    this.heading = heading;
    this.summary = summary;
    this.isApply = isApply;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size(format, _level) {
    return this.render(format, 0).length;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(format, _level) {
    return renderSummary(this.heading, this.summary, this.isApply, format);
  }
};
function renderSummary(headingText, summary, isApply, format) {
  let result = new Heading(headingText, 2).render(format);
  if (!summary) {
    return result;
  }
  const labels = isApply ? APPLY_LABELS : PLAN_LABELS;
  const hasContent = summary.actions.length > 0 || summary.failures.length > 0;
  if (!hasContent) {
    result += renderNote("No changes.", format);
    return result;
  }
  const headers = [textCell("Action"), textCell("Resource"), textCell("Count")];
  const rows = [];
  for (const group of summary.actions) {
    addGroupRows(group, labels, ACTION_SYMBOLS[group.action], rows);
  }
  for (const group of summary.failures) {
    addGroupRows(group, FAILURE_LABELS, STATUS_FAILURE, rows);
  }
  result += new Table(headers, rows).render(format);
  return result;
}
function addGroupRows(group, labels, symbol, rows) {
  const label = labels[group.action] ?? group.action;
  for (let i = 0; i < group.resourceTypes.length; i++) {
    const rt = group.resourceTypes[i];
    if (!rt) continue;
    const actionText = i === 0 ? `${symbol} ${label}` : "";
    rows.push({
      cells: [
        textCell(actionText),
        textCell(rt.type),
        textCell(String(rt.count))
      ]
    });
  }
  rows.push({
    cells: [textCell(""), boldSpan(label), boldSpan(String(group.total))]
  });
}

// src/elements/diagnostics.ts
var DiagnosticsElement = class {
  id;
  fixed = true;
  levels = 1;
  diagnostics;
  headingLevel;
  constructor(id, diagnostics, headingLevel = 3) {
    this.id = id;
    this.diagnostics = diagnostics;
    this.headingLevel = headingLevel;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size(format, _level) {
    return this.render(format, 0).length;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(format, _level) {
    return renderDiagnostics(this.diagnostics, this.headingLevel, format);
  }
};
function renderDiagnostics(diagnostics, headingLevel, format) {
  const errors = diagnostics.filter((d) => d.severity === "error");
  const warnings = diagnostics.filter((d) => d.severity === "warning");
  let result = "";
  if (errors.length > 0) {
    result += renderPlainHeading("Errors", headingLevel, format);
    for (const diag of errors) {
      result += renderDiagnostic(diag, format);
    }
  }
  if (warnings.length > 0) {
    result += renderPlainHeading("Warnings", headingLevel, format);
    for (const diag of warnings) {
      result += renderDiagnostic(diag, format);
    }
  }
  return result;
}
function renderDiagnostic(diag, format) {
  let result = renderDiagnosticSummaryLine(
    diag.severity,
    diag.summary,
    diag.address,
    format
  );
  if (diag.detail) {
    result += new Blockquote(diag.detail).render(format);
  }
  if (diag.snippet !== void 0) {
    result += renderSnippet(diag.snippet, diag.range?.filename, format);
  }
  if (diag.detail || diag.snippet !== void 0) {
    if (format === "markdown") result += "\n";
  }
  return result;
}
function renderSnippet(snippet, filename, format) {
  let result = renderSnippetLine(
    snippet.code,
    snippet.context,
    filename,
    snippet.start_line,
    format
  );
  for (const val of snippet.values) {
    result += renderSnippetValue(val.traversal, val.statement, format);
  }
  return result;
}
function renderPlainHeading(text, level, format) {
  if (format === "markdown") {
    return `${"#".repeat(level)} ${markdownEscape(text)}

`;
  }
  return `<h${String(level)}>${htmlEscape(text)}</h${String(level)}>
`;
}
function renderDiagnosticSummaryLine(severity, summary, address, format) {
  const icon = severity === "error" ? DIAGNOSTIC_ERROR : DIAGNOSTIC_WARNING;
  if (format === "markdown") {
    const addr2 = address !== void 0 ? ` \u2014 ${mdCodeSpan(address)}` : "";
    return `${icon} **${markdownEscape(summary)}**${addr2}

`;
  }
  const addr = address !== void 0 ? ` \u2014 <code>${htmlEscape(address)}</code>` : "";
  return `<p>${icon} <strong>${htmlEscape(summary)}</strong>${addr}</p>
`;
}
function renderSnippetLine(code, context, filename, startLine, format) {
  if (format === "markdown") {
    const loc2 = filename !== void 0 ? `${mdCodeSpan(code)} in ${markdownEscape(context)} (${mdCodeSpan(filename)}:${String(startLine)})` : `${mdCodeSpan(code)} in ${markdownEscape(context)}`;
    return `> ${loc2}

`;
  }
  const loc = filename !== void 0 ? `<code>${htmlEscape(code)}</code> in ${htmlEscape(context)} (<code>${htmlEscape(filename)}</code>:${String(startLine)})` : `<code>${htmlEscape(code)}</code> in ${htmlEscape(context)}`;
  return `<blockquote><p>${loc}</p></blockquote>
`;
}
function renderSnippetValue(traversal, statement, format) {
  if (format === "markdown") {
    return `> ${markdownEscapeBlock(traversal)} = ${markdownEscape(statement)}

`;
  }
  return `<blockquote><p>${htmlEscape(traversal)} = ${htmlEscape(statement)}</p></blockquote>
`;
}

// src/elements/raw-output.ts
var ENVELOPE_KEYS = /* @__PURE__ */ new Set([
  "@level",
  "@message",
  "@module",
  "@timestamp",
  "type"
]);
function flattenJsonFields(obj, skipKeys) {
  const pairs = [];
  function walk(value, prefix) {
    if (value === null || value === void 0) {
      pairs.push([prefix, String(value)]);
    } else if (typeof value === "object" && !Array.isArray(value)) {
      const record = value;
      for (const key of Object.keys(record)) {
        walk(record[key], prefix ? `${prefix}.${key}` : key);
      }
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        walk(value[i], `${prefix}.${String(i)}`);
      }
    } else {
      let str = typeof value === "string" ? value : JSON.stringify(value);
      if (str.length > 80) {
        str = str.slice(0, 77) + "...";
      }
      pairs.push([prefix, str]);
    }
  }
  for (const [key, value] of Object.entries(obj)) {
    if (skipKeys.has(key)) continue;
    walk(value, key);
  }
  pairs.sort((a, b) => a[0].localeCompare(b[0]));
  return pairs.map(([k, v]) => `\`${k}=${v}\``);
}
function levelIcon(level) {
  switch (level) {
    case "error":
      return DIAGNOSTIC_ERROR;
    case "warn":
      return DIAGNOSTIC_WARNING;
    default:
      return "";
  }
}
function buildRawOutputRenderable(content) {
  const trimmed = content.trim();
  if (trimmed === "") return new CodeBlock("(empty)");
  const validateResult = tryBuildValidateRenderable(trimmed, content);
  if (validateResult !== void 0) return validateResult;
  const jsonlResult = tryBuildJsonLinesRenderable(trimmed);
  if (jsonlResult !== void 0) return jsonlResult;
  return new FourTickCodeBlock(content);
}
function tryBuildValidateRenderable(trimmed, raw) {
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return void 0;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return void 0;
  }
  const obj = parsed;
  if (!("valid" in obj) || typeof obj["valid"] !== "boolean" || !("diagnostics" in obj) || !Array.isArray(obj["diagnostics"])) {
    return void 0;
  }
  const valid = obj["valid"];
  const diagnostics = obj["diagnostics"].filter(
    (d) => typeof d === "object" && d !== null && !Array.isArray(d)
  );
  return new ValidateRenderable(valid, diagnostics, raw);
}
function tryBuildJsonLinesRenderable(content) {
  const lines = content.split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) return void 0;
  const messages = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return void 0;
      }
      messages.push(parsed);
    } catch {
      return void 0;
    }
  }
  if (!messages.some((m) => typeof m["@message"] === "string")) {
    return void 0;
  }
  return new JsonLinesRenderable(messages);
}
var FourTickCodeBlock = class {
  content;
  constructor(content) {
    this.content = content;
  }
  size(format) {
    return this.render(format).length;
  }
  render(format) {
    if (format === "markdown") {
      return `\`\`\`\`
${this.content}
\`\`\`\`

`;
    }
    return `<pre><code>${htmlEscape(this.content)}</code></pre>
`;
  }
};
var ValidateRenderable = class {
  valid;
  diagnostics;
  raw;
  constructor(valid, diagnostics, raw) {
    this.valid = valid;
    this.diagnostics = diagnostics;
    this.raw = raw;
  }
  size(format) {
    return this.render(format).length;
  }
  render(format) {
    if (format === "markdown") {
      return buildValidateMarkdown(this.valid, this.diagnostics, this.raw);
    }
    return buildValidateHtml(this.valid, this.diagnostics, this.raw);
  }
};
function buildValidateMarkdown(valid, diagnostics, raw) {
  let output = "";
  if (valid) {
    output += `${STATUS_SUCCESS} Configuration is valid

`;
  } else {
    output += `${STATUS_FAILURE} Configuration is **invalid**

`;
  }
  if (diagnostics.length > 0) {
    for (const diag of diagnostics) {
      output += formatValidateDiagMarkdown(diag);
    }
  }
  output += `<details>
<summary>Show raw JSON</summary>

\`\`\`json
${raw}
\`\`\`

</details>

`;
  return output;
}
function buildValidateHtml(valid, diagnostics, raw) {
  let output = "";
  if (valid) {
    output += `<p>${STATUS_SUCCESS} Configuration is valid</p>
`;
  } else {
    output += `<p>${STATUS_FAILURE} Configuration is <strong>invalid</strong></p>
`;
  }
  if (diagnostics.length > 0) {
    for (const diag of diagnostics) {
      output += formatValidateDiagHtml(diag);
    }
  }
  output += `<details>
<summary>Show raw JSON</summary>
<pre><code class="language-json">${htmlEscape(raw)}</code></pre>
</details>
`;
  return output;
}
function formatValidateDiagMarkdown(diag) {
  const severity = typeof diag["severity"] === "string" ? diag["severity"] : "error";
  const icon = severity === "warning" ? DIAGNOSTIC_WARNING : DIAGNOSTIC_ERROR;
  const summary = typeof diag["summary"] === "string" ? diag["summary"] : "(unknown)";
  const detail = typeof diag["detail"] === "string" ? diag["detail"] : "";
  let output = `${icon} **${markdownEscape(summary)}**
`;
  if (detail) {
    const detailLines = detail.split("\n").map((l) => `> ${markdownEscapeBlock(l)}`).join("\n");
    output += `${detailLines}

`;
  }
  const snippet = diag["snippet"];
  if (snippet && typeof snippet["code"] === "string") {
    const lineInfo = typeof snippet["start_line"] === "number" ? ` (line ${String(snippet["start_line"])})` : "";
    const ctx = typeof snippet["context"] === "string" ? ` in ${markdownEscape(snippet["context"])}` : "";
    output += `> \`${snippet["code"]}\`${ctx}${lineInfo}
`;
  }
  output += "\n";
  return output;
}
function formatValidateDiagHtml(diag) {
  const severity = typeof diag["severity"] === "string" ? diag["severity"] : "error";
  const icon = severity === "warning" ? DIAGNOSTIC_WARNING : DIAGNOSTIC_ERROR;
  const summary = typeof diag["summary"] === "string" ? diag["summary"] : "(unknown)";
  const detail = typeof diag["detail"] === "string" ? diag["detail"] : "";
  let output = `<p>${icon} <strong>${htmlEscape(summary)}</strong></p>
`;
  if (detail) {
    output += `<blockquote><p>${htmlEscape(detail)}</p></blockquote>
`;
  }
  const snippet = diag["snippet"];
  if (snippet && typeof snippet["code"] === "string") {
    const lineInfo = typeof snippet["start_line"] === "number" ? ` (line ${String(snippet["start_line"])})` : "";
    const ctx = typeof snippet["context"] === "string" ? ` in ${htmlEscape(snippet["context"])}` : "";
    output += `<blockquote><p><code>${htmlEscape(snippet["code"])}</code>${ctx}${lineInfo}</p></blockquote>
`;
  }
  return output;
}
var JsonLinesRenderable = class {
  messages;
  constructor(messages) {
    this.messages = messages;
  }
  size(format) {
    return this.render(format).length;
  }
  render(format) {
    if (format === "markdown") {
      return buildJsonLinesMarkdown(this.messages);
    }
    return buildJsonLinesHtml(this.messages);
  }
};
function buildJsonLinesMarkdown(messages) {
  const infoAndAbove = [];
  const debugTrace = [];
  for (const msg of messages) {
    const level = typeof msg["@level"] === "string" ? msg["@level"] : "info";
    if (level === "trace" || level === "debug") {
      debugTrace.push(msg);
    } else {
      infoAndAbove.push(msg);
    }
  }
  const parts = [];
  for (const msg of infoAndAbove) {
    parts.push(formatJsonLinesMsgMarkdown(msg));
  }
  if (debugTrace.length > 0) {
    const counts = /* @__PURE__ */ new Map();
    for (const msg of debugTrace) {
      const level = typeof msg["@level"] === "string" ? msg["@level"] : "debug";
      counts.set(level, (counts.get(level) ?? 0) + 1);
    }
    const countParts = [...counts.entries()].map(
      ([l, c]) => `${String(c)} ${l}`
    );
    const inner = debugTrace.map((msg) => {
      const message = typeof msg["@message"] === "string" ? msg["@message"] : "(no message)";
      return `\`${message}\``;
    }).join("\n\n");
    parts.push(
      `<details>
<summary>${countParts.join(", ")} message(s) omitted</summary>
<br>

${inner}

</details>`
    );
  }
  return parts.join("\n\n") + "\n\n";
}
function formatJsonLinesMsgMarkdown(msg) {
  const level = typeof msg["@level"] === "string" ? msg["@level"] : "info";
  const message = typeof msg["@message"] === "string" ? msg["@message"] : "(no message)";
  const icon = levelIcon(level);
  const prefix = icon ? `${icon} ` : "";
  const typeStr = typeof msg.type === "string" ? msg.type : "";
  const fields = flattenJsonFields(msg, ENVELOPE_KEYS);
  if (fields.length === 0) {
    const typeSuffix2 = typeStr ? ` \`type=${typeStr}\`` : "";
    return `${prefix}\`${message}\`${typeSuffix2}`;
  }
  const escapedMsg = htmlEscape(message);
  const typeSuffix = typeStr ? ` <code>type=${htmlEscape(typeStr)}</code>` : "";
  const fieldLines = fields.join("\n\n");
  return `<details>
<summary>${prefix}<code>${escapedMsg}</code>${typeSuffix}</summary>
<br>

${fieldLines}

</details>`;
}
function buildJsonLinesHtml(messages) {
  const infoAndAbove = [];
  const debugTrace = [];
  for (const msg of messages) {
    const level = typeof msg["@level"] === "string" ? msg["@level"] : "info";
    if (level === "trace" || level === "debug") {
      debugTrace.push(msg);
    } else {
      infoAndAbove.push(msg);
    }
  }
  const parts = [];
  for (const msg of infoAndAbove) {
    parts.push(formatJsonLinesMsgHtml(msg));
  }
  if (debugTrace.length > 0) {
    const counts = /* @__PURE__ */ new Map();
    for (const msg of debugTrace) {
      const level = typeof msg["@level"] === "string" ? msg["@level"] : "debug";
      counts.set(level, (counts.get(level) ?? 0) + 1);
    }
    const countParts = [...counts.entries()].map(
      ([l, c]) => `${String(c)} ${l}`
    );
    const inner = debugTrace.map((msg) => {
      const message = typeof msg["@message"] === "string" ? msg["@message"] : "(no message)";
      return `<p><code>${htmlEscape(message)}</code></p>`;
    }).join("\n");
    parts.push(
      `<details>
<summary>${countParts.join(", ")} message(s) omitted</summary>
${inner}
</details>`
    );
  }
  return parts.join("\n") + "\n";
}
function formatJsonLinesMsgHtml(msg) {
  const level = typeof msg["@level"] === "string" ? msg["@level"] : "info";
  const message = typeof msg["@message"] === "string" ? msg["@message"] : "(no message)";
  const icon = levelIcon(level);
  const prefix = icon ? `${icon} ` : "";
  const typeStr = typeof msg.type === "string" ? msg.type : "";
  const fields = flattenJsonFields(msg, ENVELOPE_KEYS);
  if (fields.length === 0) {
    const typeSuffix2 = typeStr ? ` <code>type=${htmlEscape(typeStr)}</code>` : "";
    return `<p>${prefix}<code>${htmlEscape(message)}</code>${typeSuffix2}</p>`;
  }
  const escapedMsg = htmlEscape(message);
  const typeSuffix = typeStr ? ` <code>type=${htmlEscape(typeStr)}</code>` : "";
  const fieldEntries = fields.map((f) => `<p>${f}</p>`).join("\n");
  return `<details>
<summary>${prefix}<code>${escapedMsg}</code>${typeSuffix}</summary>
${fieldEntries}
</details>`;
}

// src/elements/step-issue.ts
var StepIssueElement = class {
  id;
  fixed = false;
  levels = 2;
  issue;
  constructor(issue) {
    this.id = `issue-${issue.id}`;
    this.issue = issue;
  }
  size(format, level) {
    if (level === 0) {
      return renderIssueHeading(this.issue, format).length;
    }
    return renderFullIssue(this.issue, format).length;
  }
  render(format, level) {
    if (level === 0) {
      return renderIssueHeading(this.issue, format);
    }
    return renderFullIssue(this.issue, format);
  }
};
function renderIssueHeading(issue, format) {
  const icon = issue.isFailed ? STATUS_FAILURE : DIAGNOSTIC_WARNING;
  const suffix = issueHeadingSuffix(issue);
  const stepId = issue.id;
  if (format === "markdown") {
    return `### ${icon} ${mdCodeSpan(stepId)}${markdownEscape(suffix)}

`;
  }
  return `<h3>${icon} <code>${htmlEscape(stepId)}</code>${htmlEscape(suffix)}</h3>
`;
}
function issueHeadingSuffix(issue) {
  switch (issue.reason) {
    case "failed":
      return " failed";
    case "parse-error":
      return ": output could not be parsed";
    case "outcome":
      return issue.outcome !== void 0 ? ` ${issue.outcome}` : "";
  }
}
function renderFullIssue(issue, format) {
  let result = renderIssueHeading(issue, format);
  if (issue.exitCode !== void 0) {
    result += renderExitCode(issue.exitCode, format);
  }
  if (issue.diagnostic !== void 0) {
    result += new Blockquote(issue.diagnostic).render(format);
  }
  if (issue.stdout !== void 0) {
    const formatted = buildRawOutputRenderable(issue.stdout);
    result += new Details(detailsSummary("stdout"), formatted, true).render(
      format
    );
  } else if (issue.stdoutError !== void 0) {
    result += renderWarningBlockquote(
      `${DIAGNOSTIC_WARNING} stdout not available: ${issue.stdoutError}`,
      format
    );
  }
  if (issue.stderr !== void 0) {
    const formatted = buildRawOutputRenderable(issue.stderr);
    result += new Details(detailsSummary("stderr"), formatted, true).render(
      format
    );
  } else if (issue.stderrError !== void 0) {
    result += renderWarningBlockquote(
      `${DIAGNOSTIC_WARNING} stderr not available: ${issue.stderrError}`,
      format
    );
  }
  if (issue.stdout === void 0 && issue.stderr === void 0 && issue.stdoutError === void 0 && issue.stderrError === void 0) {
    result += renderNoOutputNotice(format);
  }
  return result;
}
function renderExitCode(exitCode, format) {
  if (format === "markdown") {
    return `Exit code: ${mdCodeSpan(exitCode)}

`;
  }
  return `<p>Exit code: <code>${htmlEscape(exitCode)}</code></p>
`;
}
function renderWarningBlockquote(text, format) {
  if (format === "markdown") {
    return `> ${markdownEscapeBlock(text)}

`;
  }
  return `<blockquote><p>${htmlEscape(text)}</p></blockquote>
`;
}
function renderNoOutputNotice(format) {
  if (format === "markdown") {
    return "No output captured.\n\n";
  }
  return "<p>No output captured.</p>\n";
}

// src/elements/text-fallback.ts
var TextFallbackElement = class {
  id;
  fixed = false;
  levels = 2;
  heading;
  full;
  noteText = "omitted due to size";
  constructor(stepId, label, content) {
    this.id = `raw-${stepId}`;
    this.heading = new Heading(label, 3);
    this.full = new Sequence([this.heading, buildRawOutputRenderable(content)]);
  }
  size(format, level) {
    if (level === 0) {
      return this.heading.size(format) + renderNote(this.noteText, format).length;
    }
    return this.full.size(format);
  }
  render(format, level) {
    if (level === 0) {
      return this.heading.render(format) + renderNote(this.noteText, format);
    }
    return this.full.render(format);
  }
};

// src/elements/step-table.ts
function buildStepTable(steps, excludeIds) {
  const filtered = excludeIds ? steps.filter((s) => !excludeIds.has(s.id)) : steps;
  if (filtered.length === 0) return EMPTY;
  return new StepOutcomes(filtered);
}
var StepOutcomes = class {
  steps;
  hasExitCodes;
  constructor(steps) {
    this.steps = steps;
    this.hasExitCodes = steps.some((s) => s.exitCode !== void 0);
  }
  size(format) {
    return this.render(format).length;
  }
  render(format) {
    if (this.hasExitCodes) {
      const headers2 = [
        textCell("Step"),
        textCell("Outcome"),
        textCell("Exit Code")
      ];
      const rows2 = this.steps.map((step) => ({
        cells: [
          codeSpan(step.id),
          textCell(step.outcome),
          step.exitCode !== void 0 ? codeSpan(step.exitCode) : EMPTY
        ]
      }));
      return new Table(headers2, rows2).render(format);
    }
    const headers = [textCell("Step"), textCell("Outcome")];
    const rows = this.steps.map((step) => ({
      cells: [codeSpan(step.id), textCell(step.outcome)]
    }));
    return new Table(headers, rows).render(format);
  }
};

// src/elements/workflow.ts
var WorkflowElement = class {
  id = "step-table";
  fixed = true;
  levels = 1;
  steps;
  constructor(steps) {
    this.steps = steps;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size(format, _level) {
    return this.render(format, 0).length;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(format, _level) {
    const table = buildStepTable(this.steps);
    if (table === EMPTY) return "";
    return new Heading("Steps", 3).render(format) + table.render(format);
  }
};

// src/elements/error.ts
var ErrorMessageElement = class {
  id = "message";
  fixed = true;
  levels = 1;
  message;
  constructor(message) {
    this.message = message;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size(format, _level) {
    return this.render(format, 0).length;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(format, _level) {
    if (format === "markdown") {
      return `${markdownEscape(this.message)}

`;
    }
    return `<p>${htmlEscape(this.message)}</p>
`;
  }
};
var ErrorStepTableElement = class {
  id = "step-statuses";
  fixed = true;
  levels = 1;
  steps;
  constructor(steps) {
    this.steps = steps;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size(format, _level) {
    return this.render(format, 0).length;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(format, _level) {
    const table = buildStepTable(this.steps);
    if (table === EMPTY) return "";
    return new Heading("Steps", 3).render(format) + table.render(format);
  }
};

// src/elements/raw-stdout.ts
var RawStdoutElement = class {
  id;
  fixed = true;
  levels = 1;
  label;
  content;
  constructor(stepId, label, content) {
    this.id = `raw-${stepId}`;
    this.label = label;
    this.content = content;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size(format, _level) {
    return this.render(format, 0).length;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(format, _level) {
    const summary = detailsSummary(this.label);
    const formatted = buildRawOutputRenderable(this.content);
    return new Details(summary, formatted).render(format);
  }
};

// src/elements/address.ts
function deriveModuleAddress(address, type) {
  const typePrefix = `${type}.`;
  if (address.startsWith(typePrefix)) return "";
  const dotType = `.${typePrefix}`;
  const idx = address.lastIndexOf(dotType);
  if (idx < 0) return "";
  return address.slice(0, idx);
}
function deriveInstanceName(address, type) {
  const typePrefix = `${type}.`;
  if (address.startsWith(typePrefix)) return address.slice(typePrefix.length);
  const dotType = `.${typePrefix}`;
  const idx = address.lastIndexOf(dotType);
  if (idx < 0) return address;
  return address.slice(idx + dotType.length);
}
function groupByModule(resources) {
  const map = /* @__PURE__ */ new Map();
  for (const resource of resources) {
    const moduleAddr = deriveModuleAddress(resource.address, resource.type);
    let group = map.get(moduleAddr);
    if (!group) {
      group = [];
      map.set(moduleAddr, group);
    }
    group.push(resource);
  }
  return [...map.entries()].sort(([a], [b]) => {
    if (a === "") return -1;
    if (b === "") return 1;
    return a.localeCompare(b);
  }).map(([moduleAddress, grouped]) => ({ moduleAddress, resources: grouped }));
}

// src/diff/lcs.ts
var MAX_LCS_CELLS = 1e7;
function computeLcsPairs(before, after) {
  const m = before.length;
  const n = after.length;
  if (m === 0 || n === 0) return [];
  if (m * n > MAX_LCS_CELLS) return [];
  const dp = Array.from(
    { length: m + 1 },
    () => new Array(n + 1).fill(0)
  );
  for (let i2 = 1; i2 <= m; i2++) {
    for (let j2 = 1; j2 <= n; j2++) {
      if (before[i2 - 1] === after[j2 - 1]) {
        dp[i2][j2] = (dp[i2 - 1]?.[j2 - 1] ?? 0) + 1;
      } else {
        dp[i2][j2] = Math.max(
          dp[i2 - 1]?.[j2] ?? 0,
          dp[i2]?.[j2 - 1] ?? 0
        );
      }
    }
  }
  const pairs = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (before[i - 1] === after[j - 1]) {
      pairs.push({ beforeIndex: i - 1, afterIndex: j - 1 });
      i--;
      j--;
    } else if ((dp[i - 1]?.[j] ?? 0) >= (dp[i]?.[j - 1] ?? 0)) {
      i--;
    } else {
      j--;
    }
  }
  pairs.reverse();
  return pairs;
}

// src/diff/line-diff.ts
function buildLineDiff(before, after, cache) {
  const cacheKey = `${before}\0${after}`;
  const cached = cache.get(cacheKey);
  if (cached !== void 0) return cached;
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const result = buildDiffFromSequences(beforeLines, afterLines);
  cache.set(cacheKey, result);
  return result;
}
function buildDiffFromSequences(before, after) {
  const pairs = computeLcsPairs(before, after);
  const result = [];
  let bi = 0;
  let ai = 0;
  let pi = 0;
  while (bi < before.length || ai < after.length) {
    const pair = pi < pairs.length ? pairs[pi] : void 0;
    if (pair?.beforeIndex === bi && pair.afterIndex === ai) {
      result.push({ kind: "unchanged", value: before[bi] ?? "" });
      bi++;
      ai++;
      pi++;
    } else if (ai >= after.length || pair !== void 0 && bi < pair.beforeIndex) {
      result.push({ kind: "removed", value: before[bi] ?? "" });
      bi++;
    } else {
      result.push({ kind: "added", value: after[ai] ?? "" });
      ai++;
    }
  }
  return result;
}

// src/diff/char-diff.ts
function buildCharDiff(before, after) {
  const beforeChars = Array.from(before);
  const afterChars = Array.from(after);
  const pairs = computeLcsPairs(beforeChars, afterChars);
  const result = [];
  let bi = 0;
  let ai = 0;
  let pi = 0;
  while (bi < beforeChars.length || ai < afterChars.length) {
    const pair = pi < pairs.length ? pairs[pi] : void 0;
    if (pair?.beforeIndex === bi && pair.afterIndex === ai) {
      result.push({ kind: "unchanged", value: beforeChars[bi] ?? "" });
      bi++;
      ai++;
      pi++;
    } else if (ai >= afterChars.length || pair !== void 0 && bi < pair.beforeIndex) {
      result.push({ kind: "removed", value: beforeChars[bi] ?? "" });
      bi++;
    } else {
      result.push({ kind: "added", value: afterChars[ai] ?? "" });
      ai++;
    }
  }
  return result;
}

// src/elements/diff-value.ts
var CONTEXT_LINES = 3;
function buildInlineDiff(before, after, format) {
  const b = before ?? "";
  const a = after ?? "";
  if (b === "" && a === "") return EMPTY;
  if (b === a) {
    return htmlCodeCell(b);
  }
  if (format === "simple") {
    return simpleDiffCell(b, a);
  }
  return new InlineCharDiffCell(b, a);
}
function buildLargeValueDiff(name, before, after, cache) {
  const bVal = before ? prettyPrint(before) : null;
  const aVal = after ? prettyPrint(after) : null;
  if (bVal === null && aVal === null) return EMPTY;
  if (bVal !== null && aVal === null) {
    return buildDetailsBlock(name, new CodeBlock(bVal), 0, 0);
  }
  if (bVal === null && aVal !== null) {
    return buildDetailsBlock(name, new CodeBlock(aVal), 0, 0);
  }
  if (bVal === null || aVal === null) return EMPTY;
  const diff = buildLineDiff(bVal, aVal, cache);
  const addedLines = diff.filter((e) => e.kind === "added").length;
  const removedLines = diff.filter((e) => e.kind === "removed").length;
  const codeContent = diff.map((e) => {
    const prefix = e.kind === "removed" ? "-" : e.kind === "added" ? "+" : " ";
    return `${prefix} ${e.value}`;
  }).join("\n");
  return buildDetailsBlock(
    name,
    new CodeBlock(codeContent, "diff"),
    addedLines,
    removedLines
  );
}
function buildLargeValueContextDiff(name, before, after, cache) {
  const bVal = before ? prettyPrint(before) : null;
  const aVal = after ? prettyPrint(after) : null;
  if (bVal === null && aVal === null) return EMPTY;
  if (bVal === null && aVal !== null) {
    return buildDetailsBlock(name, new CodeBlock(aVal), 0, 0);
  }
  if (bVal !== null && aVal === null) {
    return buildDetailsBlock(name, new CodeBlock(bVal), 0, 0);
  }
  if (bVal === null || aVal === null) return EMPTY;
  const diff = buildLineDiff(bVal, aVal, cache);
  return renderContextHunks(name, diff);
}
function renderContextHunks(name, diff) {
  const visible = new Array(diff.length).fill(false);
  let addedLines = 0;
  let removedLines = 0;
  for (let i = 0; i < diff.length; i++) {
    const entry = diff[i];
    if (entry === void 0) continue;
    if (entry.kind !== "unchanged") {
      if (entry.kind === "added") addedLines++;
      if (entry.kind === "removed") removedLines++;
      for (let j = Math.max(0, i - CONTEXT_LINES); j <= Math.min(diff.length - 1, i + CONTEXT_LINES); j++) {
        visible[j] = true;
      }
    }
  }
  if (addedLines === 0 && removedLines === 0) return EMPTY;
  const lines = [];
  let inGap = false;
  for (let i = 0; i < diff.length; i++) {
    if (!visible[i]) {
      if (!inGap) {
        lines.push("  ...");
        inGap = true;
      }
      continue;
    }
    inGap = false;
    const entry = diff[i];
    if (entry === void 0) continue;
    const prefix = entry.kind === "removed" ? "-" : entry.kind === "added" ? "+" : " ";
    lines.push(`${prefix} ${entry.value}`);
  }
  return buildDetailsBlock(
    name,
    new CodeBlock(lines.join("\n"), "diff"),
    addedLines,
    removedLines
  );
}
function buildDetailsBlock(name, content, addedLines, removedLines) {
  const hasDiff = addedLines > 0 || removedLines > 0;
  const suffix = hasDiff ? ` (large value; +${String(addedLines)}, -${String(removedLines)})` : " (large value)";
  const summary = detailsSummary(name + suffix);
  return new Details(summary, content);
}
function prettyPrint(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      return JSON.stringify(parsed, null, 2);
    } catch {
    }
  }
  return value;
}
function escapeHtmlCell(value) {
  return htmlEscape(value).replace(/\|/g, "&#124;");
}
function simpleDiffCell(before, after) {
  return {
    size(format) {
      return this.render(format).length;
    },
    render(format) {
      const parts = [];
      if (before !== "") parts.push(`- ${escapeHtmlCell(before)}`);
      if (after !== "") parts.push(`+ ${escapeHtmlCell(after)}`);
      const html = parts.join("<br>");
      if (format === "markdown") {
        return html.replace(/\|/g, "&#124;");
      }
      return html;
    }
  };
}
var InlineCharDiffCell = class {
  before;
  after;
  constructor(before, after) {
    this.before = before;
    this.after = after;
  }
  size(format) {
    return this.render(format).length;
  }
  render(format) {
    const beforeLines = this.before.split("\n");
    const afterLines = this.after.split("\n");
    const maxLen = Math.max(beforeLines.length, afterLines.length);
    const resultLines = [];
    for (let i = 0; i < maxLen; i++) {
      const bl = beforeLines[i] ?? "";
      const al = afterLines[i] ?? "";
      if (bl === al) {
        resultLines.push(escapeHtmlCell(bl));
        continue;
      }
      const charDiff = buildCharDiff(bl, al);
      let line = "";
      let delBuf = "";
      let insBuf = "";
      const flushBuffers = () => {
        if (delBuf) {
          line += `<del style="background:#fdd">${escapeHtmlCell(delBuf)}</del>`;
          delBuf = "";
        }
        if (insBuf) {
          line += `<ins style="background:#dfd">${escapeHtmlCell(insBuf)}</ins>`;
          insBuf = "";
        }
      };
      for (const entry of charDiff) {
        if (entry.kind === "removed") {
          if (insBuf) {
            flushBuffers();
          }
          delBuf += entry.value;
        } else if (entry.kind === "added") {
          insBuf += entry.value;
        } else {
          flushBuffers();
          line += escapeHtmlCell(entry.value);
        }
      }
      flushBuffers();
      resultLines.push(line);
    }
    const html = `<code>${resultLines.join("<br>")}</code>`;
    if (format === "markdown") {
      return html.replace(/\|/g, "&#124;");
    }
    return html;
  }
};

// src/elements/resource.ts
function buildResourceRenderable(resource, options, diffCache, level, applyContext) {
  if (level === 0) {
    return buildListingLine(resource);
  }
  return buildDetailsRenderable(
    resource,
    options,
    diffCache,
    level,
    applyContext
  );
}
function buildListingLine(resource) {
  return new ResourceListingLine(resource.action, resource.address);
}
function buildDetailsRenderable(resource, options, diffCache, level, applyContext) {
  const symbol = ACTION_SYMBOLS[resource.action];
  const instanceName = deriveInstanceName(resource.address, resource.type);
  const changedAttrs = resource.attributes.filter(
    (a) => !a.isSensitive && !a.isKnownAfterApply && a.before !== a.after
  ).map((a) => a.name);
  const shouldOpen = applyContext !== void 0 && (applyContext.failed || applyContext.diagnostics.length > 0);
  const summary = new ResourceDetailSummary(
    symbol,
    resource.type,
    instanceName,
    resource.action === "update" ? changedAttrs : [],
    applyContext?.failed ?? false
  );
  const parts = [];
  parts.push(new CodeBlock(resource.address));
  if (resource.importId !== null) {
    parts.push(new MetadataParagraph("Import ID", resource.importId));
  }
  if (resource.movedFromAddress !== null) {
    parts.push(new MetadataParagraph("Moved from", resource.movedFromAddress));
  }
  if (level >= 2) {
    const attrRenderable = buildAttributeRenderable(
      resource,
      options,
      diffCache,
      level
    );
    if (attrRenderable !== EMPTY) {
      parts.push(attrRenderable);
    }
  }
  if (applyContext && applyContext.diagnostics.length > 0) {
    parts.push(buildInlineDiagnostics(applyContext.diagnostics));
  }
  const content = new Sequence(parts);
  return new Details(summary, content, shouldOpen);
}
function buildAttributeRenderable(resource, options, diffCache, level) {
  const diffFormat = options.diffFormat ?? "inline";
  const useCharDiff = level >= 3;
  if (resource.allUnknownAfterApply) {
    return new NoteRenderable("all values known after apply");
  }
  if (resource.attributes.length === 0 && resource.hasAttributeDetail) {
    return new NoteRenderable("No attribute changes.");
  }
  if (resource.attributes.length === 0) {
    return EMPTY;
  }
  const parts = [];
  const smallAttrs = resource.attributes.filter((a) => !a.isLarge);
  const largeAttrs = resource.attributes.filter((a) => a.isLarge);
  if (smallAttrs.length > 0) {
    const headers = [
      textCell("Attribute"),
      textCell("Before"),
      textCell("After")
    ];
    const rows = [];
    for (const attr of smallAttrs) {
      const skipDiff = attr.isSensitive || attr.isKnownAfterApply;
      const beforeCell = skipDiff ? htmlCodeCell(attr.before ?? "") : htmlCodeCellMultiline(attr.before ?? "");
      const afterCell = skipDiff || !useCharDiff ? htmlCodeCell(attr.after ?? "") : buildInlineDiff(attr.before, attr.after, diffFormat);
      rows.push({
        cells: [textCell(attr.name), beforeCell, afterCell]
      });
    }
    parts.push(new Table(headers, rows));
  }
  for (const attr of largeAttrs) {
    const block = level === 4 ? buildLargeValueDiff(attr.name, attr.before, attr.after, diffCache) : buildLargeValueContextDiff(
      attr.name,
      attr.before,
      attr.after,
      diffCache
    );
    if (block !== EMPTY) {
      parts.push(block);
    }
  }
  if (parts.length === 0) return EMPTY;
  return new Sequence(parts);
}
function buildInlineDiagnostics(diagnostics) {
  const errors = diagnostics.filter((d) => d.severity === "error");
  const warnings = diagnostics.filter((d) => d.severity === "warning");
  const parts = [];
  for (const diag of [...errors, ...warnings]) {
    parts.push(new ResourceDiagnosticLine(diag.severity, diag.summary));
    if (diag.detail) {
      parts.push(new CodeBlock(diag.detail));
    }
  }
  return new Sequence(parts);
}
var ResourceListingLine = class {
  action;
  address;
  constructor(action, address) {
    this.action = action;
    this.address = address;
  }
  size(format) {
    return this.render(format).length;
  }
  render(format) {
    const symbol = ACTION_SYMBOLS[this.action];
    if (format === "markdown") {
      return `${symbol} ${markdownEscape(this.address)}`;
    }
    return `${symbol} ${htmlEscape(this.address)}`;
  }
};
var ResourceDetailSummary = class {
  symbol;
  type;
  instanceName;
  changedAttrs;
  failed;
  constructor(symbol, type, instanceName, changedAttrs, failed) {
    this.symbol = symbol;
    this.type = type;
    this.instanceName = instanceName;
    this.changedAttrs = changedAttrs;
    this.failed = failed;
  }
  size(format) {
    return this.render(format).length;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(_format) {
    let html = `${this.symbol} <strong>${htmlEscape(this.type)}</strong> ${htmlEscape(this.instanceName)}`;
    if (this.changedAttrs.length > 0) {
      const hint = this.changedAttrs.slice(0, 5).join(", ");
      html += ` \u2014 changed: ${htmlEscape(hint)}`;
    }
    if (this.failed) {
      html += ` ${STATUS_FAILURE}`;
    }
    return html;
  }
};
var MetadataParagraph = class {
  label;
  value;
  constructor(label, value) {
    this.label = label;
    this.value = value;
  }
  size(format) {
    return this.render(format).length;
  }
  render(format) {
    if (format === "markdown") {
      return `**${markdownEscape(this.label)}:** ${mdCodeSpan(this.value)}

`;
    }
    return `<p><strong>${htmlEscape(this.label)}:</strong> <code>${htmlEscape(this.value)}</code></p>
`;
  }
};
var ResourceDiagnosticLine = class {
  severity;
  summary;
  constructor(severity, summary) {
    this.severity = severity;
    this.summary = summary;
  }
  size(format) {
    return this.render(format).length;
  }
  render(format) {
    const icon = this.severity === "error" ? DIAGNOSTIC_ERROR : DIAGNOSTIC_WARNING;
    if (format === "markdown") {
      return `${icon} **${markdownEscape(this.summary)}**

`;
    }
    return `<p>${icon} <strong>${htmlEscape(this.summary)}</strong></p>
`;
  }
};
var NoteRenderable = class {
  text;
  constructor(text) {
    this.text = text;
  }
  size(format) {
    return renderNote(this.text, format).length;
  }
  render(format) {
    return renderNote(this.text, format);
  }
};

// src/elements/module-group.ts
function buildModuleGroupRenderable(moduleAddress, resources, options, diffCache, level, applyContextFn) {
  const heading = new ModuleHeading(moduleAddress);
  const parts = [heading];
  for (const resource of resources) {
    const applyContext = applyContextFn?.(resource.address);
    parts.push(
      buildResourceRenderable(
        resource,
        options,
        diffCache,
        level,
        applyContext
      )
    );
  }
  return new Sequence(parts);
}
var ModuleHeading = class {
  moduleAddress;
  constructor(moduleAddress) {
    this.moduleAddress = moduleAddress;
  }
  size(format) {
    return this.render(format).length;
  }
  render(format) {
    const label = this.renderLabel(format);
    if (format === "markdown") {
      return `### ${MODULE_ICON} Module: ${label}

`;
    }
    return `<h3>${MODULE_ICON} Module: ${label}</h3>
`;
  }
  renderLabel(format) {
    if (this.moduleAddress === "") return "root";
    if (format === "markdown") {
      return mdCodeSpan(this.moduleAddress);
    }
    return `<code>${htmlEscape(this.moduleAddress)}</code>`;
  }
};

// src/elements/outputs.ts
function buildOutputsRenderable(outputs, options, diffCache, level) {
  if (level <= 1) return EMPTY;
  const useDiff = level >= 3;
  const diffFormat = options.diffFormat ?? "inline";
  const smallOutputs = outputs.filter(
    (o) => !o.isLarge || o.isSensitive || o.isKnownAfterApply
  );
  const largeOutputs = outputs.filter(
    (o) => o.isLarge && !o.isSensitive && !o.isKnownAfterApply
  );
  const parts = [];
  if (smallOutputs.length > 0) {
    const headers = [
      textCell("Output"),
      textCell("Action"),
      textCell("Before"),
      textCell("After")
    ];
    const rows = [];
    for (const output of smallOutputs) {
      const symbol = ACTION_SYMBOLS[output.action];
      const skipDiff = output.isSensitive || output.isKnownAfterApply || !useDiff;
      const before = output.isSensitive ? htmlCodeCell("(sensitive)") : output.before !== null ? skipDiff ? htmlCodeCell(output.before) : htmlCodeCellMultiline(output.before) : EMPTY;
      const after = output.isSensitive ? htmlCodeCell("(sensitive)") : skipDiff ? htmlCodeCell(output.after ?? "") : buildInlineDiff(output.before, output.after, diffFormat);
      rows.push({
        cells: [textCell(output.name), textCell(symbol), before, after]
      });
    }
    parts.push(new Table(headers, rows));
  }
  for (const output of largeOutputs) {
    const symbol = ACTION_SYMBOLS[output.action];
    const label = `${symbol} ${output.name}`;
    const block = level === 4 ? buildLargeValueDiff(label, output.before, output.after, diffCache) : buildLargeValueContextDiff(
      label,
      output.before,
      output.after,
      diffCache
    );
    if (block !== EMPTY) {
      parts.push(block);
    }
  }
  if (parts.length === 0) return EMPTY;
  return new Sequence(parts);
}

// src/elements/categories.ts
var ResourceCategoryElement = class {
  id = "resources";
  fixed = false;
  levels = 5;
  levelRenderables;
  constructor(resources, options, diffCache, applyContextFn) {
    this.levelRenderables = buildResourceLevels(
      "Resource Changes",
      resources,
      options,
      diffCache,
      applyContextFn
    );
  }
  size(format, level) {
    const r = this.levelRenderables[level];
    return r ? r.size(format) : 0;
  }
  render(format, level) {
    const r = this.levelRenderables[level];
    return r ? r.render(format) : "";
  }
};
var DriftCategoryElement = class {
  fixed = false;
  levels = 5;
  id;
  levelRenderables;
  constructor(driftResources, options, diffCache) {
    this.id = "drift";
    const heading = `${DRIFT_ICON} Resource Drift (${String(driftResources.length)} detected)`;
    this.levelRenderables = buildResourceLevels(
      heading,
      driftResources,
      options,
      diffCache
    );
  }
  size(format, level) {
    const r = this.levelRenderables[level];
    return r ? r.size(format) : 0;
  }
  render(format, level) {
    const r = this.levelRenderables[level];
    return r ? r.render(format) : "";
  }
};
var OutputCategoryElement = class {
  id = "outputs";
  fixed = false;
  levels = 5;
  levelRenderables;
  constructor(outputs, options, diffCache) {
    this.levelRenderables = buildOutputLevels(outputs, options, diffCache);
  }
  size(format, level) {
    const r = this.levelRenderables[level];
    return r ? r.size(format) : 0;
  }
  render(format, level) {
    const r = this.levelRenderables[level];
    return r ? r.render(format) : "";
  }
};
function buildResourceLevels(headingText, resources, options, diffCache, applyContextFn) {
  const moduleGroups = groupByModule(resources);
  const listingLines = resources.map(
    (r) => `${ACTION_SYMBOLS[r.action]} ${r.address}`
  );
  const level0 = new Sequence([
    new Heading(headingText, 2),
    new CodeBlock(listingLines.join("\n"))
  ]);
  const levels = [level0];
  for (let lvl = 1; lvl <= 4; lvl++) {
    const parts = [new Heading(headingText, 2)];
    for (const mg of moduleGroups) {
      parts.push(
        buildModuleGroupRenderable(
          mg.moduleAddress,
          mg.resources,
          options,
          diffCache,
          lvl,
          applyContextFn
        )
      );
    }
    levels.push(new Sequence(parts));
  }
  return levels;
}
function buildOutputLevels(outputs, options, diffCache) {
  const listingLines = outputs.map((o) => {
    const suffix = o.isSensitive ? " (sensitive)" : "";
    return `${ACTION_SYMBOLS[o.action]} ${o.name}${suffix}`;
  });
  const level0 = new Sequence([
    new Heading("Output Changes", 2),
    new CodeBlock(listingLines.join("\n"))
  ]);
  const level1 = level0;
  const levels = [level0, level1];
  for (let lvl = 2; lvl <= 4; lvl++) {
    const content = buildOutputsRenderable(outputs, options, diffCache, lvl);
    if (content === EMPTY) {
      levels.push(level0);
    } else {
      levels.push(new Sequence([new Heading("Output Changes", 2), content]));
    }
  }
  return levels;
}

// src/elements/apply-context.ts
function isApplyReport(report) {
  return report.operation === "apply" || report.operation === "destroy";
}
function buildFailedSet(report) {
  const failed = /* @__PURE__ */ new Set();
  if (report.applyStatuses) {
    for (const s of report.applyStatuses) {
      if (!s.success) {
        failed.add(s.address);
      }
    }
  }
  return failed;
}
function buildDiagnosticMap(report) {
  const map = /* @__PURE__ */ new Map();
  if (report.diagnostics) {
    for (const diag of report.diagnostics) {
      if (diag.address !== void 0) {
        let list = map.get(diag.address);
        if (!list) {
          list = [];
          map.set(diag.address, list);
        }
        list.push(diag);
      }
    }
  }
  return map;
}
function extractNonResourceDiagnostics(report) {
  if (!report.diagnostics) return [];
  const resourceAddresses = new Set(
    (report.resources ?? []).map((r) => r.address)
  );
  return report.diagnostics.filter(
    (d) => d.address === void 0 || !resourceAddresses.has(d.address)
  );
}
function buildApplyContext(address, failedAddresses, diagByAddress) {
  return {
    failed: failedAddresses.has(address),
    diagnostics: diagByAddress.get(address) ?? []
  };
}

// src/elements/report-elements.ts
function buildReportElements(report, options) {
  const elements = [];
  if (report.workspace !== void 0) {
    elements.push(new MarkerElement(report.workspace));
  }
  elements.push(new TitleElement(report.title));
  for (let i = 0; i < report.warnings.length; i++) {
    const warning = report.warnings[i];
    if (warning !== void 0) {
      elements.push(new WarningElement(warning, i));
    }
  }
  for (const issue of report.issues) {
    elements.push(new StepIssueElement(issue));
  }
  if (report.error !== void 0) {
    elements.push(...buildErrorBody(report));
  } else if (report.summary !== void 0 || report.resources !== void 0) {
    elements.push(...buildStructuredBody(report, options));
    elements.push(...buildRawStdoutElements(report));
  } else if (report.rawStdout.length > 0) {
    elements.push(...buildTextFallbackBody(report));
  } else if (report.steps.length > 0) {
    elements.push(new WorkflowElement(report.steps));
  }
  return elements;
}
function buildErrorBody(report) {
  const elements = [];
  if (report.error !== void 0) {
    elements.push(new ErrorMessageElement(report.error));
  }
  if (report.steps.length > 0) {
    elements.push(new ErrorStepTableElement(report.steps));
  }
  return elements;
}
function buildStructuredBody(report, options) {
  const diffCache = /* @__PURE__ */ new Map();
  const isApply = isApplyReport(report);
  const summaryHeading = isApply ? "Apply Summary" : "Plan Summary";
  const resources = report.resources ?? [];
  const outputs = report.outputs ?? [];
  const driftResources = report.driftResources ?? [];
  const elements = [];
  const failedAddresses = buildFailedSet(report);
  const diagByAddress = buildDiagnosticMap(report);
  const nonResourceDiags = extractNonResourceDiagnostics(report);
  const applyContextFn = isApply ? (addr) => buildApplyContext(addr, failedAddresses, diagByAddress) : void 0;
  const renderOpts = {
    diffFormat: options?.diffFormat,
    showUnchangedAttributes: options?.showUnchangedAttributes
  };
  if (options?.title) {
    elements.push(new UserTitleElement(options.title));
  }
  elements.push(new SummaryElement(summaryHeading, report.summary, isApply));
  if (nonResourceDiags.length > 0) {
    elements.push(
      new DiagnosticsElement("non-resource-diagnostics", nonResourceDiags, 2)
    );
  }
  if (driftResources.length > 0) {
    elements.push(
      new DriftCategoryElement(driftResources, renderOpts, diffCache)
    );
  }
  if (resources.length > 0) {
    elements.push(
      new ResourceCategoryElement(
        resources,
        renderOpts,
        diffCache,
        applyContextFn
      )
    );
  }
  if (outputs.length > 0) {
    elements.push(new OutputCategoryElement(outputs, renderOpts, diffCache));
  }
  return elements;
}
function buildRawStdoutElements(report) {
  return report.rawStdout.map(
    (raw) => new RawStdoutElement(raw.stepId, raw.label, raw.content)
  );
}
function buildTextFallbackBody(report) {
  return report.rawStdout.map(
    (raw) => new TextFallbackElement(raw.stepId, raw.label, raw.content)
  );
}

// src/elements/composed-report.ts
var UPGRADE_PRIORITY = /* @__PURE__ */ new Map([
  ["resources", 0],
  ["outputs", 1],
  ["drift", 2]
]);
function composeReport(elements) {
  return new ComposedReportImpl(elements);
}
var ComposedReportImpl = class {
  elements;
  /** Flex entries for elements that can be degraded. */
  flexEntries;
  constructor(elements) {
    this.elements = elements;
    const flex = [];
    for (const [idx, el] of elements.entries()) {
      if (!el.fixed && el.levels > 1) {
        flex.push({ idx, el, level: 0 });
      }
    }
    this.flexEntries = flex;
  }
  fullSize(format) {
    let total = 0;
    for (const el of this.elements) {
      total += el.size(format, el.levels - 1);
    }
    return total;
  }
  render(format, limit) {
    const maxLevels = this.elements.map((el) => el.levels - 1);
    if (limit === void 0 || limit === Infinity) {
      return this.renderAtLevels(format, maxLevels, false);
    }
    let fixedCost = 0;
    for (const el of this.elements) {
      if (el.fixed || el.levels <= 1) {
        fixedCost += el.size(format, el.levels - 1);
      }
    }
    if (this.flexEntries.length === 0) {
      const truncated2 = fixedCost > limit;
      return this.renderAtLevels(format, maxLevels, truncated2);
    }
    const levels = [...maxLevels];
    const entries = this.flexEntries.map((e) => ({ ...e, level: 0 }));
    for (const entry of entries) {
      levels[entry.idx] = 0;
    }
    let currentTotal = this.totalSize(format, levels);
    if (currentTotal > limit) {
      return this.renderAtLevels(format, levels, true);
    }
    let maxFlexLevel = 0;
    for (const entry of entries) {
      const ml = entry.el.levels - 1;
      if (ml > maxFlexLevel) maxFlexLevel = ml;
    }
    for (let targetLevel = 1; targetLevel <= maxFlexLevel; targetLevel++) {
      let candidateTotal = fixedCost;
      const candidateLevels = [];
      for (const entry of entries) {
        const newLevel = Math.min(targetLevel, entry.el.levels - 1);
        candidateLevels.push(newLevel);
        candidateTotal += entry.el.size(format, newLevel);
      }
      for (const el of this.elements) {
        if (!el.fixed && el.levels <= 1) {
          candidateTotal += el.size(format, 0);
        }
      }
      if (candidateTotal <= limit) {
        for (const [i, entry] of entries.entries()) {
          const cl = candidateLevels[i];
          if (cl !== void 0) {
            entry.level = cl;
            levels[entry.idx] = cl;
          }
        }
        currentTotal = candidateTotal;
      } else {
        break;
      }
    }
    const sortedEntries = [...entries].sort((a, b) => {
      const pa = UPGRADE_PRIORITY.get(a.el.id) ?? 99;
      const pb = UPGRADE_PRIORITY.get(b.el.id) ?? 99;
      if (pa !== pb) return pa - pb;
      return a.idx - b.idx;
    });
    for (const entry of sortedEntries) {
      const maxLevel = entry.el.levels - 1;
      for (let targetLevel = entry.level + 1; targetLevel <= maxLevel; targetLevel++) {
        const oldSize = entry.el.size(format, entry.level);
        const newSize = entry.el.size(format, targetLevel);
        const delta = newSize - oldSize;
        if (currentTotal + delta <= limit) {
          entry.level = targetLevel;
          levels[entry.idx] = targetLevel;
          currentTotal += delta;
        } else {
          break;
        }
      }
    }
    const truncated = entries.some(
      (entry) => entry.level < entry.el.levels - 1
    );
    return this.renderAtLevels(format, levels, truncated);
  }
  /** Compute total size for all elements at given levels. */
  totalSize(format, levels) {
    let total = 0;
    for (const [i, el] of this.elements.entries()) {
      const level = levels[i];
      if (level !== void 0) {
        total += el.size(format, level);
      }
    }
    return total;
  }
  /** Render all elements at given levels, concatenating the output. */
  renderAtLevels(format, levels, truncated) {
    const parts = [];
    for (const [i, el] of this.elements.entries()) {
      const level = levels[i];
      if (level !== void 0) {
        const rendered = el.render(format, level);
        if (rendered.length > 0) {
          parts.push(rendered);
        }
      }
    }
    return { output: parts.join(""), truncated };
  }
};

// src/pipelines/steps.ts
function reportFromSteps(stepsJson, options) {
  try {
    const report = buildReportFromSteps(stepsJson, options);
    const elements = buildReportElements(report, options);
    const composed = composeReport(elements);
    return {
      report: composed,
      ...report.operation !== void 0 && { operation: report.operation },
      hasUnresolvedFailures: report.hasUnresolvedFailures ?? false
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const errorRenderable = new PipelineErrorRenderable(message);
    const errorReport = {
      render: (format) => ({
        output: errorRenderable.render(format),
        truncated: false
      }),
      fullSize: (format) => errorRenderable.size(format)
    };
    return {
      report: errorReport,
      hasUnresolvedFailures: false
    };
  }
}
var PipelineErrorRenderable = class {
  message;
  constructor(message) {
    this.message = message;
  }
  size(format) {
    return this.render(format).length;
  }
  render(format) {
    const heading = new Heading(
      `${STATUS_FAILURE} Report Generation Failed`,
      2
    );
    const preamble = format === "markdown" ? "An unexpected error occurred while generating the report:\n\n" : "<p>An unexpected error occurred while generating the report:</p>\n";
    const code = new CodeBlock(this.message);
    return heading.render(format) + preamble + code.render(format);
  }
};

// src/github/client.ts
var DEFAULT_BASE_URL = "https://api.github.com";
function authScheme(token) {
  return token.split(".").length === 3 ? "bearer" : "token";
}
function baseHeaders(token) {
  return {
    Authorization: `${authScheme(token)} ${token}`,
    "User-Agent": "tf-report-action",
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
}
function withJsonBody(token) {
  return {
    ...baseHeaders(token),
    "Content-Type": "application/json"
  };
}
function parseJson(body) {
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("GitHub API returned invalid JSON");
  }
}
function assertOk(res) {
  if (res.status < 200 || res.status > 299) {
    const preview = res.body.length > 200 ? res.body.slice(0, 200) + "\u2026" : res.body;
    throw new Error(
      `GitHub API request failed with status ${String(res.status)}: ${preview}`
    );
  }
}
function createGitHubClient(deps) {
  const { token, transport } = deps;
  const apiBase = deps.baseUrl ?? DEFAULT_BASE_URL;
  async function getComments(owner, repo, issueNumber) {
    const all = [];
    let page = 1;
    for (; ; ) {
      const url = `${apiBase}/repos/${owner}/${repo}/issues/${String(issueNumber)}/comments?per_page=100&page=${String(page)}`;
      const res = await transport("GET", url, baseHeaders(token));
      assertOk(res);
      const batch = parseJson(res.body);
      if (batch.length === 0) break;
      all.push(...batch);
      page++;
    }
    return all;
  }
  async function deleteComment(owner, repo, commentId) {
    const url = `${apiBase}/repos/${owner}/${repo}/issues/comments/${String(commentId)}`;
    const res = await transport("DELETE", url, baseHeaders(token));
    assertOk(res);
  }
  async function postComment(owner, repo, issueNumber, body) {
    const url = `${apiBase}/repos/${owner}/${repo}/issues/${String(issueNumber)}/comments`;
    const res = await transport(
      "POST",
      url,
      withJsonBody(token),
      JSON.stringify({ body })
    );
    assertOk(res);
  }
  async function searchIssues(query) {
    const url = `${apiBase}/search/issues?q=${encodeURIComponent(query)}`;
    const res = await transport("GET", url, baseHeaders(token));
    assertOk(res);
    const data = parseJson(res.body);
    return data.items;
  }
  async function createIssue(owner, repo, title, body) {
    const url = `${apiBase}/repos/${owner}/${repo}/issues`;
    const res = await transport(
      "POST",
      url,
      withJsonBody(token),
      JSON.stringify({ title, body })
    );
    assertOk(res);
    const data = parseJson(res.body);
    return data.number;
  }
  async function updateIssue(owner, repo, issueNumber, title, body) {
    const url = `${apiBase}/repos/${owner}/${repo}/issues/${String(issueNumber)}`;
    const res = await transport(
      "PATCH",
      url,
      withJsonBody(token),
      JSON.stringify({ title, body })
    );
    assertOk(res);
  }
  async function renderMarkdown(params) {
    const url = `${apiBase}/markdown`;
    const res = await transport(
      "POST",
      url,
      withJsonBody(token),
      JSON.stringify(params)
    );
    assertOk(res);
    return res.body;
  }
  return {
    getComments,
    deleteComment,
    postComment,
    searchIssues,
    createIssue,
    updateIssue,
    renderMarkdown
  };
}

// src/http/transport.ts
import * as http from "node:http";
import * as https from "node:https";
import * as tls from "node:tls";

// src/http/errors.ts
var ActionsError = class extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = "ActionsError";
  }
  statusCode;
};

// src/http/proxy.ts
function isLoopbackAddress(host) {
  const lower = host.toLowerCase();
  return lower === "localhost" || lower.startsWith("127.") || lower.startsWith("[::1]") || lower.startsWith("[0:0:0:0:0:0:0:1]");
}
function checkBypass(reqUrl, env) {
  if (!reqUrl.hostname) {
    return false;
  }
  if (isLoopbackAddress(reqUrl.hostname)) {
    return true;
  }
  const noProxy = env["no_proxy"] ?? env["NO_PROXY"] ?? "";
  if (!noProxy) {
    return false;
  }
  let reqPort;
  if (reqUrl.port) {
    reqPort = Number(reqUrl.port);
  } else if (reqUrl.protocol === "http:") {
    reqPort = 80;
  } else if (reqUrl.protocol === "https:") {
    reqPort = 443;
  }
  const upperHost = reqUrl.hostname.toUpperCase();
  const upperHosts = [upperHost];
  if (reqPort !== void 0) {
    upperHosts.push(`${upperHost}:${String(reqPort)}`);
  }
  for (const entry of noProxy.split(",").map((s) => s.trim().toUpperCase()).filter((s) => s !== "")) {
    if (entry === "*" || upperHosts.some(
      (h) => h === entry || h.endsWith(`.${entry}`) || entry.startsWith(".") && h.endsWith(entry)
    )) {
      return true;
    }
  }
  return false;
}
function getProxyUrl(reqUrl, env) {
  if (checkBypass(reqUrl, env)) {
    return void 0;
  }
  const proxyVar = reqUrl.protocol === "https:" ? env["https_proxy"] ?? env["HTTPS_PROXY"] : env["http_proxy"] ?? env["HTTP_PROXY"];
  if (!proxyVar) {
    return void 0;
  }
  try {
    const url = new URL(proxyVar);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url;
    }
  } catch {
  }
  try {
    return new URL(`http://${proxyVar}`);
  } catch {
    return void 0;
  }
}

// src/http/transport.ts
async function httpRequest(method, url, headers, body, options) {
  const target = new URL(url);
  const env = options?.env ?? process.env;
  const proxyUrl = getProxyUrl(target, env);
  if (!proxyUrl) {
    return directRequest(method, target, headers, body);
  }
  if (target.protocol === "https:") {
    return tunnelRequest(method, target, proxyUrl, headers, body);
  }
  return proxyPlainRequest(method, target, proxyUrl, headers, body);
}
function assertOk2(status, body, context) {
  if (status >= 200 && status < 300) {
    return;
  }
  const truncated = body.length > 200 ? body.slice(0, 200) + "\u2026" : body;
  const prefix = context ? `${context}: ` : "";
  throw new ActionsError(
    `${prefix}HTTP ${String(status)}: ${truncated}`,
    status
  );
}
function directRequest(method, target, headers, body) {
  const transport = target.protocol === "https:" ? https : http;
  return new Promise((resolve2, reject) => {
    const req = transport.request(target, { method, headers }, (res) => {
      collectResponse(res, resolve2, reject);
    });
    req.on("error", reject);
    if (body !== void 0) {
      req.write(body);
    }
    req.end();
  });
}
function proxyPlainRequest(method, target, proxyUrl, headers, body) {
  const proxyTransport = proxyUrl.protocol === "https:" ? https : http;
  const defaultPort = proxyUrl.protocol === "https:" ? 443 : 80;
  return new Promise((resolve2, reject) => {
    const req = proxyTransport.request(
      {
        hostname: proxyUrl.hostname,
        port: proxyUrl.port || defaultPort,
        method,
        path: target.href,
        headers
      },
      (res) => {
        collectResponse(res, resolve2, reject);
      }
    );
    req.on("error", reject);
    if (body !== void 0) {
      req.write(body);
    }
    req.end();
  });
}
function tunnelRequest(method, target, proxyUrl, headers, body) {
  const targetHost = target.hostname;
  const targetPort = target.port || "443";
  const proxyTransport = proxyUrl.protocol === "https:" ? https : http;
  const defaultProxyPort = proxyUrl.protocol === "https:" ? 443 : 80;
  return new Promise((resolve2, reject) => {
    const connectReq = proxyTransport.request({
      hostname: proxyUrl.hostname,
      port: proxyUrl.port || defaultProxyPort,
      method: "CONNECT",
      path: `${targetHost}:${targetPort}`
    });
    connectReq.on("connect", (connectRes, socket) => {
      const connectStatus = connectRes.statusCode ?? 0;
      if (connectStatus !== 200) {
        socket.destroy();
        reject(
          new ActionsError(
            `Proxy CONNECT failed with status ${String(connectStatus)}`,
            connectStatus
          )
        );
        return;
      }
      const tlsSocket = tls.connect(
        {
          socket,
          servername: targetHost
        },
        () => {
          const req = https.request(
            {
              hostname: targetHost,
              port: Number(targetPort),
              method,
              path: target.pathname + target.search,
              headers,
              createConnection: () => tlsSocket
            },
            (res) => {
              collectResponse(res, resolve2, reject);
            }
          );
          req.on("error", reject);
          if (body !== void 0) {
            req.write(body);
          }
          req.end();
        }
      );
      tlsSocket.on("error", reject);
    });
    connectReq.on("error", reject);
    connectReq.end();
  });
}
function collectResponse(res, resolve2, reject) {
  const chunks = [];
  res.on("data", (chunk) => {
    chunks.push(chunk);
  });
  res.on("end", () => {
    resolve2({
      status: res.statusCode ?? 0,
      headers: res.headers,
      body: Buffer.concat(chunks).toString("utf-8")
    });
  });
  res.on("error", reject);
}

// src/logger/index.ts
function actionsLogger() {
  return {
    warning(message) {
      process.stderr.write(`::warning::${message}
`);
    },
    error(message) {
      process.stderr.write(`::error::${message}
`);
    },
    info(message) {
      process.stdout.write(`${message}
`);
    }
  };
}

// src/inputs/index.ts
import { readFileSync as readFileSync2 } from "node:fs";
function readInput(env, name) {
  const key = `INPUT_${name.replace(/ /g, "_").toUpperCase()}`;
  return env[key]?.trim() ?? "";
}
function parseInputs(env) {
  const steps = readInput(env, "steps");
  if (steps === "") {
    throw new Error("Input 'steps' is required but was not provided");
  }
  const githubToken = readInput(env, "github-token");
  if (githubToken === "") {
    throw new Error("Input 'github-token' is required but was not provided");
  }
  const rawWorkspace = readInput(env, "workspace");
  const workspace = rawWorkspace !== "" ? rawWorkspace : `${env["GITHUB_WORKFLOW"] ?? "Workflow"}/${env["GITHUB_JOB"] ?? "Job"}`;
  const rawTargetStep = readInput(env, "target-step");
  const targetStep = rawTargetStep !== "" ? rawTargetStep : void 0;
  return {
    steps,
    workspace,
    targetStep,
    githubToken,
    alwaysUploadReport: readInput(env, "always-upload-report") === "true",
    initStepId: readInput(env, "init-step-id") || "init",
    validateStepId: readInput(env, "validate-step-id") || "validate",
    planStepId: readInput(env, "plan-step-id") || "plan",
    showPlanStepId: readInput(env, "show-plan-step-id") || "show-plan",
    applyStepId: readInput(env, "apply-step-id") || "apply",
    stateStepId: readInput(env, "state-step-id") || "state"
  };
}
function readPrNumber(eventPath) {
  try {
    const raw = readFileSync2(eventPath, "utf-8");
    const event = JSON.parse(raw);
    const num = event.pull_request?.number;
    return typeof num === "number" ? num : void 0;
  } catch {
    return void 0;
  }
}

// src/comment/marker.ts
function escapeMarkerWorkspace2(workspace) {
  return workspace.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/(--!?)>/g, "$1\\>");
}
function buildMarker(workspace) {
  return `<!-- tf-report-action:"${escapeMarkerWorkspace2(workspace)}" -->`;
}

// src/comment/footer.ts
var COMMENT_LIMIT = 65536;
var OVERHEAD_RESERVE = 512;
var MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];
function formatTimestamp(date) {
  const month = MONTHS[date.getUTCMonth()] ?? "January";
  const day = String(date.getUTCDate());
  const year = String(date.getUTCFullYear());
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${month} ${day}, ${year} at ${hours}:${minutes} UTC`;
}
function buildLogsUrl2(env) {
  const repo = env["GITHUB_REPOSITORY"] ?? "";
  const runId = env["GITHUB_RUN_ID"] ?? "";
  const attempt = env["GITHUB_RUN_ATTEMPT"] ?? "1";
  return `https://github.com/${repo}/actions/runs/${runId}/attempts/${attempt}`;
}
function parseRepo(env) {
  const full = env["GITHUB_REPOSITORY"];
  if (full === void 0 || full === "") return void 0;
  const slash = full.indexOf("/");
  if (slash <= 0 || slash === full.length - 1) return void 0;
  return { owner: full.slice(0, slash), repo: full.slice(slash + 1) };
}
function buildFooter(logsUrl, isPr, now = /* @__PURE__ */ new Date()) {
  if (isPr) {
    return `
---

[View logs](${logsUrl})
`;
  }
  return `
---

[View logs](${logsUrl}) \u2022 Last updated: ${formatTimestamp(now)}
`;
}
function calculateBudget(footerLength) {
  return Math.max(0, COMMENT_LIMIT - footerLength - OVERHEAD_RESERVE);
}

// src/comment/notices.ts
function buildTruncationNotice(link) {
  if (link !== void 0) {
    return `
---

> ${DIAGNOSTIC_WARNING} **Output truncated** \u2014 some details were shortened or omitted to fit within the comment size limit.
> [${link.label}](${link.url})
`;
  }
  return `
---

> ${DIAGNOSTIC_WARNING} **Output truncated** \u2014 some details were shortened or omitted to fit within the comment size limit. Check the workflow run logs for complete output.
`;
}
function buildLogsNotice(link) {
  return `
---

> ${INFO_ICON} Some step errors are not shown \u2014 see the [${link.label}](${link.url}) for details.
`;
}
function buildArtifactNotice(link) {
  return `
${ARTIFACT_ICON} [${link.label}](${link.url})
`;
}

// src/comment/body.ts
function buildTruncation(artifactUrl, logsUrl) {
  const link = artifactUrl ? { url: artifactUrl, label: "View full report" } : { url: logsUrl, label: "View full workflow run logs" };
  return buildTruncationNotice(link);
}
function assembleCommentBody(markdown, footer, options) {
  let body = markdown;
  if (options?.truncationNotice !== void 0) {
    body += options.truncationNotice;
  } else if (options?.artifactUrl !== void 0) {
    body += buildArtifactNotice({
      url: options.artifactUrl,
      label: "View/Download Report"
    });
  }
  if (options?.hasUnresolvedFailures === true && options.logsUrl !== void 0) {
    body += buildLogsNotice({
      url: options.logsUrl,
      label: "workflow run logs"
    });
  }
  body += footer;
  return body;
}

// src/artifact/upload.ts
import { createHash as nodeCreateHash } from "node:crypto";

// src/artifact/jwt.ts
function extractBackendIds(runtimeToken) {
  const segments = runtimeToken.split(".");
  if (segments.length < 3) {
    throw new Error(
      `Expected a JWT with 3 segments, got ${String(segments.length)}`
    );
  }
  const payloadSegment = segments[1];
  if (payloadSegment === void 0) {
    throw new Error("JWT payload segment is missing");
  }
  let payloadJson;
  try {
    payloadJson = Buffer.from(payloadSegment, "base64url").toString("utf-8");
  } catch {
    throw new Error("Failed to base64url-decode the JWT payload segment");
  }
  let payload;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    throw new Error("JWT payload is not valid JSON");
  }
  if (typeof payload !== "object" || payload === null) {
    throw new Error("JWT payload is not an object");
  }
  const scp = payload["scp"];
  if (typeof scp !== "string") {
    throw new Error(`Expected "scp" claim to be a string, got ${typeof scp}`);
  }
  const scopes = scp.split(" ");
  const resultsScope = scopes.find((s) => s.startsWith("Actions.Results:"));
  if (resultsScope === void 0) {
    throw new Error('No "Actions.Results:" scope found in the "scp" claim');
  }
  const parts = resultsScope.split(":");
  if (parts.length !== 3) {
    throw new Error(
      `Expected "Actions.Results:<runId>:<jobId>", got ${String(parts.length)} parts`
    );
  }
  const workflowRunBackendId = parts[1];
  const workflowJobRunBackendId = parts[2];
  if (workflowRunBackendId === void 0 || workflowJobRunBackendId === void 0 || workflowRunBackendId === "" || workflowJobRunBackendId === "") {
    throw new Error("Backend IDs in Actions.Results scope must not be empty");
  }
  return { workflowRunBackendId, workflowJobRunBackendId };
}

// src/http/retry.ts
var DEFAULT_MAX_ATTEMPTS = 5;
var DEFAULT_BASE_INTERVAL_MS = 3e3;
var DEFAULT_MULTIPLIER = 1.5;
async function withRetry(fn, isRetryable3, options) {
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseIntervalMs = options?.baseIntervalMs ?? DEFAULT_BASE_INTERVAL_MS;
  const multiplier = options?.multiplier ?? DEFAULT_MULTIPLIER;
  const sleep = options?.sleep ?? realSleep;
  let lastError;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === maxAttempts - 1;
      if (isLastAttempt || !isRetryable3(error)) {
        throw error;
      }
      const minDelay = baseIntervalMs * multiplier ** attempt;
      const maxDelay = minDelay * multiplier;
      const delay = Math.floor(
        minDelay + Math.random() * (maxDelay - minDelay)
      );
      await sleep(delay);
    }
  }
  throw lastError;
}
function realSleep(ms) {
  return new Promise((resolve2) => {
    setTimeout(resolve2, ms);
  });
}

// src/artifact/twirp.ts
var SERVICE = "github.actions.results.api.v1.ArtifactService";
var RETRYABLE_STATUS_CODES = /* @__PURE__ */ new Set([
  429,
  500,
  502,
  503,
  504
]);
async function createArtifact(deps, params) {
  const body = {
    workflow_run_backend_id: params.backendIds.workflowRunBackendId,
    workflow_job_run_backend_id: params.backendIds.workflowJobRunBackendId,
    name: params.name,
    version: 7,
    ...params.mimeType !== void 0 && { mime_type: params.mimeType }
  };
  const parsed = await twirpCall(deps, "CreateArtifact", body);
  const url = parsed["signed_upload_url"];
  if (typeof url !== "string" || url === "") {
    throw new ActionsError("CreateArtifact response missing signed_upload_url");
  }
  return { signedUploadUrl: url };
}
async function finalizeArtifact(deps, params) {
  const body = {
    workflow_run_backend_id: params.backendIds.workflowRunBackendId,
    workflow_job_run_backend_id: params.backendIds.workflowJobRunBackendId,
    name: params.name,
    size: String(params.size),
    hash: `sha256:${params.sha256Hex}`
  };
  const parsed = await twirpCall(deps, "FinalizeArtifact", body);
  const rawId = parsed["artifact_id"];
  const id = typeof rawId === "string" ? Number(rawId) : typeof rawId === "number" ? rawId : NaN;
  if (!Number.isFinite(id)) {
    throw new ActionsError(
      "FinalizeArtifact response missing or invalid artifactId"
    );
  }
  return { artifactId: id };
}
function isRetryable(error) {
  return error instanceof ActionsError && error.statusCode !== void 0 && RETRYABLE_STATUS_CODES.has(error.statusCode);
}
async function twirpCall(deps, method, body) {
  const origin = new URL(deps.resultsUrl).origin;
  const url = `${origin}/twirp/${SERVICE}/${method}`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${deps.runtimeToken}`,
    "User-Agent": "tf-report-action"
  };
  const jsonBody = JSON.stringify(body);
  const response = await withRetry(
    async () => {
      const res = await deps.transport("POST", url, headers, jsonBody);
      assertOk2(res.status, res.body, method);
      return res;
    },
    isRetryable,
    deps.sleep !== void 0 ? { sleep: deps.sleep } : void 0
  );
  try {
    return JSON.parse(response.body);
  } catch {
    throw new ActionsError(`${method}: response body is not valid JSON`);
  }
}

// src/artifact/blob-upload.ts
var RETRYABLE_STATUS_CODES2 = /* @__PURE__ */ new Set([
  429,
  500,
  502,
  503,
  504
]);
async function uploadBlob(deps) {
  const byteLength = Buffer.byteLength(deps.content, "utf-8");
  const headers = {
    "x-ms-blob-type": "BlockBlob",
    "Content-Type": deps.contentType,
    "Content-Length": String(byteLength)
  };
  await withRetry(
    async () => {
      const res = await deps.transport(
        "PUT",
        deps.signedUrl,
        headers,
        deps.content
      );
      assertOk2(res.status, res.body, "BlobUpload");
    },
    isRetryable2,
    deps.sleep !== void 0 ? { sleep: deps.sleep } : void 0
  );
}
function isRetryable2(error) {
  return error instanceof ActionsError && error.statusCode !== void 0 && RETRYABLE_STATUS_CODES2.has(error.statusCode);
}

// src/artifact/upload.ts
var ALLOWED_HOSTNAME = "github.com";
var ALLOWED_SUFFIX = ".ghe.com";
var MIME_TYPES = {
  ".html": "text/html",
  ".md": "text/markdown"
};
var DEFAULT_MIME = "application/octet-stream";
function createArtifactUploader(deps) {
  return {
    async upload(params) {
      guardGhes(deps.serverUrl);
      const backendIds = extractBackendIds(deps.runtimeToken);
      const hashFn = deps.createHash ?? nodeCreateHash;
      const sha256Hex = hashFn("sha256").update(params.content, "utf-8").digest("hex");
      const byteLength = Buffer.byteLength(params.content, "utf-8");
      const contentType = detectMimeType(params.filename);
      const transport = deps.transport ?? missingTransport;
      const { signedUploadUrl } = await createArtifact(
        {
          resultsUrl: deps.resultsUrl,
          runtimeToken: deps.runtimeToken,
          transport,
          ...deps.sleep !== void 0 && { sleep: deps.sleep }
        },
        { name: params.name, backendIds, mimeType: contentType }
      );
      await uploadBlob({
        signedUrl: signedUploadUrl,
        content: params.content,
        contentType,
        transport,
        ...deps.sleep !== void 0 && { sleep: deps.sleep }
      });
      const { artifactId } = await finalizeArtifact(
        {
          resultsUrl: deps.resultsUrl,
          runtimeToken: deps.runtimeToken,
          transport,
          ...deps.sleep !== void 0 && { sleep: deps.sleep }
        },
        {
          name: params.name,
          backendIds,
          size: byteLength,
          sha256Hex
        }
      );
      return { id: artifactId, size: byteLength, sha256: sha256Hex };
    }
  };
}
function guardGhes(serverUrl) {
  const hostname = new URL(serverUrl ?? "https://github.com").hostname;
  if (hostname === ALLOWED_HOSTNAME || hostname.endsWith(ALLOWED_SUFFIX)) {
    return;
  }
  throw new ActionsError(
    `Artifact upload is not supported on ${hostname} \u2014 only ${ALLOWED_HOSTNAME} and *${ALLOWED_SUFFIX} are supported`
  );
}
function detectMimeType(filename) {
  const dot = filename.lastIndexOf(".");
  if (dot === -1) return DEFAULT_MIME;
  const ext = filename.slice(dot).toLowerCase();
  return MIME_TYPES[ext] ?? DEFAULT_MIME;
}
function missingTransport() {
  throw new ActionsError("ArtifactUploader: no HTTP transport was provided");
}

// src/html/page.ts
var MARKDOWN_CSS = `
  .markdown-body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 16px; line-height: 1.6; color: #1f2328;
  }
  .markdown-body a { color: #0969da; text-decoration: none; }
  .markdown-body a:hover { text-decoration: underline; }
  .markdown-body h1, .markdown-body h2, .markdown-body h3,
  .markdown-body h4, .markdown-body h5, .markdown-body h6 {
    margin-top: 24px; margin-bottom: 16px; font-weight: 600; line-height: 1.25;
  }
  .markdown-body h1 { font-size: 2em; border-bottom: 1px solid #d0d7de; padding-bottom: 0.3em; }
  .markdown-body h2 { font-size: 1.5em; border-bottom: 1px solid #d0d7de; padding-bottom: 0.3em; }
  .markdown-body h3 { font-size: 1.25em; }
  .markdown-body h4 { font-size: 1em; }
  .markdown-body p { margin-top: 0; margin-bottom: 16px; }
  .markdown-body ul, .markdown-body ol { margin-top: 0; margin-bottom: 16px; padding-left: 2em; }
  .markdown-body li + li { margin-top: 0.25em; }
  .markdown-body hr {
    height: 0.25em; padding: 0; margin: 24px 0;
    background: #d0d7de; border: 0; border-radius: 6px;
  }
  .markdown-body blockquote {
    margin: 0 0 16px; padding: 0 1em;
    color: #57606a; border-left: 4px solid #d0d7de;
  }
  .markdown-body code {
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
    font-size: 0.85em; background: #afb8c133; padding: 0.2em 0.4em; border-radius: 6px;
  }
  .markdown-body pre {
    position: relative;
    background: #f6f8fa; border: 1px solid #d0d7de; border-radius: 6px;
    padding: 16px; overflow: auto; margin-bottom: 16px;
  }
  .markdown-body pre code { background: none; padding: 0; font-size: 0.875em; }
  .markdown-body table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
  .markdown-body th, .markdown-body td { border: 1px solid #d0d7de; padding: 6px 13px; }
  .markdown-body th { background: #f6f8fa; font-weight: 600; }
  .markdown-body tr:nth-child(even) { background: #f6f8fa; }
  .markdown-body details {
    margin-bottom: 8px; border: 1px solid #d0d7de; border-radius: 6px;
    padding: 8px 12px;
  }
  .markdown-body summary { cursor: pointer; font-weight: 500; }
  .markdown-body del {
    color: #cf222e; text-decoration: none; background: #ffebe9;
    padding: 0 2px; border-radius: 2px;
  }
  .markdown-body ins {
    color: #116329; text-decoration: none; background: #dafbe1;
    padding: 0 2px; border-radius: 2px;
  }
  .markdown-body img { max-width: 100%; }
  markdown-accessiblity-table, markdown-accessibility-table { display: block; }
  .copy-btn {
    position: absolute; top: 8px; right: 8px;
    padding: 4px 8px; font-size: 12px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    border: 1px solid #d0d7de; border-radius: 6px;
    background: #f6f8fa; color: #57606a; cursor: pointer;
    opacity: 0; transition: opacity 0.15s;
  }
  pre:hover .copy-btn { opacity: 1; }
  .copy-btn:hover { background: #eaeef2; }
  .copy-btn.copied { background: #dafbe1; border-color: #116329; color: #116329; opacity: 1; }
`;
var COPY_BUTTON_JS = `
  document.addEventListener("DOMContentLoaded", function() {
    document.querySelectorAll("pre").forEach(function(pre) {
      var btn = document.createElement("button");
      btn.className = "copy-btn";
      btn.textContent = "Copy";
      btn.addEventListener("click", function() {
        var code = pre.querySelector("code");
        var text = code ? code.textContent || "" : pre.firstChild.textContent || "";
        navigator.clipboard.writeText(text).then(function() {
          btn.textContent = "Copied!";
          btn.classList.add("copied");
          setTimeout(function() {
            btn.textContent = "Copy";
            btn.classList.remove("copied");
          }, 2000);
        });
      });
      pre.appendChild(btn);
    });
  });
`;
function buildHtmlPage(htmlFragment, title) {
  const pageTitle = title ?? "TF Report";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(pageTitle)}</title>
  <style>
    body { max-width: 1012px; margin: 0 auto; padding: 32px; background: #fff; }
    ${MARKDOWN_CSS}
  </style>
</head>
<body>
  <div class="markdown-body">${htmlFragment}</div>
  <script>${COPY_BUTTON_JS}</script>
</body>
</html>
`;
}
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// src/action/artifact-upload.ts
async function tryUploadFullReport(params) {
  try {
    const runtimeToken = params.env["ACTIONS_RUNTIME_TOKEN"];
    const resultsUrl = params.env["ACTIONS_RESULTS_URL"];
    const runId = params.env["GITHUB_RUN_ID"];
    if (runtimeToken === void 0 || runtimeToken === "" || resultsUrl === void 0 || resultsUrl === "" || runId === void 0 || runId === "") {
      return void 0;
    }
    const dotIndex = params.artifactName.lastIndexOf(".");
    const pageTitle = dotIndex > 0 ? params.artifactName.slice(0, dotIndex) : params.artifactName;
    const htmlPage = buildHtmlPage(params.htmlContent, pageTitle);
    const filename = params.artifactName;
    const serverUrl = params.env["GITHUB_SERVER_URL"];
    const repoContext = params.env["GITHUB_REPOSITORY"] ?? "";
    const uploader = createArtifactUploader({
      runtimeToken,
      resultsUrl,
      ...serverUrl !== void 0 && { serverUrl },
      ...params.deps?.transport !== void 0 && {
        transport: params.deps.transport
      },
      ...params.deps?.createHash !== void 0 && {
        createHash: params.deps.createHash
      },
      ...params.deps?.sleep !== void 0 && { sleep: params.deps.sleep }
    });
    const result = await uploader.upload({
      name: params.artifactName,
      filename,
      content: htmlPage
    });
    const artifactServerUrl = params.env["GITHUB_SERVER_URL"] ?? "https://github.com";
    return `${artifactServerUrl}/${repoContext}/actions/runs/${runId}/artifacts/${String(result.id)}`;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const log = params.logger;
    log.warning(`Artifact upload failed: ${msg}`);
    return void 0;
  }
}

// src/action/main.ts
async function handlePr(client, owner, repo, prNumber, marker, body) {
  const comments = await client.getComments(owner, repo, prNumber);
  const stale = comments.filter(
    (c) => c.body.startsWith(marker) && c.user?.type === "Bot"
  );
  for (const c of stale) {
    await client.deleteComment(owner, repo, c.id);
  }
  await client.postComment(owner, repo, prNumber, body);
}
async function handleIssue(client, owner, repo, workspace, marker, body) {
  const query = `repo:${owner}/${repo} is:issue in:body "${marker}"`;
  const issues = await client.searchIssues(query);
  const title = `:bar_chart: \`${workspace}\` Status`;
  if (issues.length > 0) {
    await client.updateIssue(owner, repo, issues[0].number, title, body);
  } else {
    await client.createIssue(owner, repo, title, body);
  }
}
async function run(env = process.env, deps) {
  const logger = deps?.logger ?? actionsLogger();
  const exit = deps?.exit ?? ((code) => process.exit(code));
  try {
    const clientFactory = deps?.clientFactory ?? createGitHubClient;
    const tryUpload = deps?.tryUploadFullReport ?? tryUploadFullReport;
    const inputs = parseInputs(env);
    const eventName = env["GITHUB_EVENT_NAME"] ?? "";
    const isPr = eventName === "pull_request" || eventName === "pull_request_target";
    const logsUrl = buildLogsUrl2(env);
    const footer = buildFooter(logsUrl, isPr);
    const reportOptions = {
      workspace: inputs.workspace,
      env,
      initStepId: inputs.initStepId,
      validateStepId: inputs.validateStepId,
      planStepId: inputs.planStepId,
      showPlanStepId: inputs.showPlanStepId,
      applyStepId: inputs.applyStepId,
      stateStepId: inputs.stateStepId
    };
    if (env["RUNNER_TEMP"] !== void 0 && env["RUNNER_TEMP"] !== "") {
      reportOptions.allowedDirs = [env["RUNNER_TEMP"]];
    }
    const repoInfo = parseRepo(env);
    if (repoInfo === void 0) {
      logger.info("GITHUB_REPOSITORY not set, skipping API calls");
      return;
    }
    const { owner, repo } = repoInfo;
    const marker = buildMarker(inputs.workspace);
    const transport = (method, url, headers, reqBody) => httpRequest(method, url, headers, reqBody, { env });
    const client = clientFactory({
      token: inputs.githubToken,
      ...env["GITHUB_API_URL"] !== void 0 && env["GITHUB_API_URL"] !== "" && { baseUrl: env["GITHUB_API_URL"] },
      transport
    });
    const fullBudget = calculateBudget(footer.length);
    const result = reportFromSteps(inputs.steps, reportOptions);
    const { operation, hasUnresolvedFailures } = result;
    const mdResult = result.report.render("markdown", fullBudget);
    let markdown = mdResult.output;
    const wasTruncated = mdResult.truncated;
    const shouldUpload = wasTruncated || inputs.alwaysUploadReport;
    let artifactUrl;
    if (shouldUpload) {
      const workspacePart = inputs.workspace ? `${sanitizeArtifactSegment(inputs.workspace)}-` : "";
      const opPart = operation !== void 0 ? `${operation}-` : "";
      const artifactName = `${workspacePart}${opPart}report.html`;
      const htmlResult = result.report.render("html");
      artifactUrl = await tryUpload({
        htmlContent: htmlResult.output,
        env,
        artifactName,
        logger,
        deps: { transport }
      });
    }
    if (wasTruncated) {
      const truncationNotice = buildTruncation(artifactUrl, logsUrl);
      const reducedBudget = Math.max(0, fullBudget - truncationNotice.length);
      markdown = result.report.render("markdown", reducedBudget).output + truncationNotice;
    }
    const body = assembleCommentBody(markdown, footer, {
      artifactUrl: wasTruncated ? void 0 : artifactUrl,
      logsUrl,
      hasUnresolvedFailures
    });
    if (isPr) {
      const eventPath = env["GITHUB_EVENT_PATH"] ?? "";
      const prNumber = readPrNumber(eventPath);
      if (prNumber === void 0) {
        throw new Error(
          "Could not read pull request number from event payload"
        );
      }
      await handlePr(client, owner, repo, prNumber, marker, body);
    } else {
      await handleIssue(client, owner, repo, inputs.workspace, marker, body);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(message);
    exit(1);
  }
}
function sanitizeArtifactSegment(value) {
  return value.replace(/[^A-Za-z0-9._-]/g, "-").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "");
}
if (import.meta.url === `file://${process.argv[1] ?? ""}` || import.meta.url.endsWith(process.argv[1] ?? "")) {
  void run();
}
export {
  run,
  sanitizeArtifactSegment
};
//# sourceMappingURL=index.js.map
