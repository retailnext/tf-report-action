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
  let heading;
  if (isFailed) {
    heading = `\`${stepId}\` failed`;
  } else if (diagnostic) {
    heading = `\`${stepId}\`: output could not be parsed`;
  } else {
    heading = `\`${stepId}\` ${outcome}`;
  }
  const stdoutRead = readStepStdout(step, readerOpts);
  const stderrRead = readStepStderr(step, readerOpts);
  const stderrContent = stderrRead.content !== void 0 && stderrRead.content.trim().length > 0 ? stderrRead.content : void 0;
  const issue = {
    id: stepId,
    heading,
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

// src/model/status-icons.ts
var STATUS_SUCCESS = "\u2705";
var STATUS_FAILURE = "\u274C";
var DIAGNOSTIC_ERROR = "\u{1F6A8}";
var DIAGNOSTIC_WARNING = "\u26A0\uFE0F";
var MODULE_ICON = "\u{1F4E6}";
var DRIFT_ICON = "\u{1F500}";
var INFO_ICON = "\u2139\uFE0F";
var ARTIFACT_ICON = "\u{1F4CE}";

// src/builder/title.ts
function buildTitle(report) {
  const wsPrefix = report.workspace ? `\`${report.workspace}\` ` : "";
  if (report.error !== void 0) {
    return `${STATUS_FAILURE} ${wsPrefix}Report Generation Failed`;
  }
  const hasIacStepFailure = hasIacFailure(report);
  const hasAnyStepFailure = hasAnyFailure(report);
  if (hasIacStepFailure) {
    const op = operationLabel(report.operation);
    const label = op ? `${op} Failed` : "Failed";
    return `${STATUS_FAILURE} ${wsPrefix}${label}`;
  }
  if (report.summary) {
    return buildSummaryTitle(
      report.summary,
      report.operation ?? "plan",
      wsPrefix,
      hasAnyStepFailure
    );
  }
  if (report.operationOutcome === "skipped") {
    const op = operationLabel(report.operation);
    const label = op ? `${op} Skipped` : "Skipped";
    return `${DIAGNOSTIC_WARNING} ${wsPrefix}${label}`;
  }
  if (report.steps.length > 0 && report.steps.every((s) => s.outcome === "skipped")) {
    return `${DIAGNOSTIC_WARNING} ${wsPrefix}All Steps Skipped`;
  }
  if (hasAnyStepFailure || report.issues.some((i) => i.isFailed)) {
    const failLabel = singleFailedStepLabel(report);
    return `${STATUS_FAILURE} ${wsPrefix}${failLabel}`;
  }
  const opLabel = report.operation ? `${operationLabel(report.operation)} ` : "";
  return `${STATUS_SUCCESS} ${wsPrefix}${opLabel}Succeeded`;
}
function buildPlanCountParts(summary) {
  const counts = /* @__PURE__ */ new Map();
  for (const group of summary.actions) {
    const label = planActionLabel(group.action);
    counts.set(label, (counts.get(label) ?? 0) + group.total);
  }
  return formatCountParts(counts, "to ");
}
function buildApplyCountParts(summary) {
  const counts = /* @__PURE__ */ new Map();
  for (const group of summary.actions) {
    const label = applyActionLabel(group.action);
    counts.set(label, (counts.get(label) ?? 0) + group.total);
  }
  return formatCountParts(counts, "");
}
function buildFailureCountParts(summary) {
  const total = summary.failures.reduce((sum, g) => sum + g.total, 0);
  if (total === 0) return [];
  return [`${String(total)} failed`];
}
function buildSummaryTitle(summary, operation, wsPrefix, hasAnyStepFailure) {
  const hasFailures = summary.failures.length > 0;
  const icon = hasFailures || hasAnyStepFailure ? STATUS_FAILURE : STATUS_SUCCESS;
  if (operation === "apply" || operation === "destroy") {
    const parts2 = buildApplyCountParts(summary);
    if (hasFailures) {
      const failParts = buildFailureCountParts(summary);
      return `${icon} ${wsPrefix}Apply Failed: ${[...failParts, ...parts2].join(", ")}`;
    }
    if (parts2.length === 0) {
      return `${icon} ${wsPrefix}Apply Complete`;
    }
    return `${icon} ${wsPrefix}Apply: ${parts2.join(", ")}`;
  }
  const totalActions = summary.actions.reduce((sum, g) => sum + g.total, 0);
  if (totalActions === 0 && !hasFailures && !hasAnyStepFailure) {
    return `${icon} ${wsPrefix}No Changes`;
  }
  if (hasFailures || hasAnyStepFailure) {
    return `${icon} ${wsPrefix}Plan Failed`;
  }
  const parts = buildPlanCountParts(summary);
  return `${icon} ${wsPrefix}Plan: ${parts.join(", ")}`;
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
      return "";
  }
}
function hasIacFailure(report) {
  const iacRoles = /* @__PURE__ */ new Set(["plan", "apply", "show-plan", "validate", "init"]);
  return report.steps.some((s) => s.outcome === "failure" && iacRoles.has(s.id)) || report.issues.some((i) => i.isFailed && iacRoles.has(i.id));
}
function hasAnyFailure(report) {
  return report.steps.some((s) => s.outcome === "failure");
}
function singleFailedStepLabel(report) {
  const failedSteps = report.steps.filter((s) => s.outcome === "failure");
  if (failedSteps.length === 1) {
    const name = failedSteps[0]?.id ?? "unknown";
    return `\`${name}\` Failed`;
  }
  return "Failed";
}
function formatCountParts(counts, prefix) {
  const parts = [];
  for (const [label, count] of counts) {
    parts.push(`${String(count)} ${prefix}${label}`);
  }
  return parts;
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
function addScannerWarnings(report, scan, stepLabel) {
  if (scan.unparseableLines > 0) {
    report.warnings.push(
      `${String(scan.unparseableLines)} line(s) in ${stepLabel} output could not be parsed as JSON`
    );
  }
  if (scan.unknownTypeLines > 0) {
    report.warnings.push(
      `${String(scan.unknownTypeLines)} line(s) in ${stepLabel} output had unrecognized message types`
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
    for (const [key, child] of Object.entries(value)) {
      if (child !== void 0) {
        flattenInto(child, prefix === "" ? key : `${prefix}.${key}`, result);
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
  if (trimmed.startsWith("{") || trimmed.startsWith("[") || trimmed.startsWith("<")) {
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
    title: "",
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
      report.warnings.push(`show-plan stdout: ${read.error}`);
    } else if (read.noFile) {
      report.warnings.push("show-plan: stdout_file output missing in steps");
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
        report.warnings.push(
          `Apply output from step \`${applyStepId}\` could not be parsed; using plan data only.`
        );
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
      report.warnings.push(`plan stdout: ${read.error}`);
    } else if (read.noFile) {
      report.warnings.push("plan: stdout_file output missing in steps");
    }
  }
}
function enrichFromPlanJsonl(filePath, report, readerOpts, showPlanParsed) {
  let scan;
  try {
    scan = scanFile(filePath, readerOpts.maxFileSize);
  } catch {
    report.warnings.push("Plan JSONL file could not be scanned");
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
      report.warnings.push(`apply stdout: ${read.error}`);
    } else if (read.noFile) {
      report.warnings.push("apply: stdout_file output missing in steps");
    }
  }
  report.operation = "apply";
}
function enrichFromApplyJsonl(filePath, report, readerOpts, showPlanParsed) {
  let scan;
  try {
    scan = scanFile(filePath, readerOpts.maxFileSize);
  } catch {
    report.warnings.push("Apply JSONL file could not be scanned");
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

// src/builder/report-from-steps.ts
import { tmpdir } from "node:os";
function createEmptyReport() {
  return {
    title: "",
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
    report.warnings.push(
      `This report was generated without \`${expectedCommand(tool, "show-plan")}\` output. Resource attribute details are not available.`
    );
  } else if (!showPlanParsed && report.rawStdout.length > 0) {
    report.warnings.push(
      `Report limited because \`${expectedCommand(tool, "show-plan")}\` output was not available. Showing raw command output.`
    );
  }
  if (showPlanParsed && report.operation === "apply" && !report.stateEnriched && hasUnresolvedKnownAfterApply(report)) {
    report.warnings.push(
      `Some attribute values could not be resolved because \`${expectedCommand(tool, "state")}\` output was not available. Add a \`state\` step after apply to see the actual values.`
    );
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

// src/raw-formatter/jsonl.ts
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
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
function formatJsonLinesMessage(msg) {
  const level = typeof msg["@level"] === "string" ? msg["@level"] : "info";
  const message = typeof msg["@message"] === "string" ? msg["@message"] : "(no message)";
  const icon = levelIcon(level);
  const prefix = icon ? `${icon} ` : "";
  const typeStr = typeof msg.type === "string" ? msg.type : "";
  const fields = flattenJsonFields(
    msg,
    ENVELOPE_KEYS
  );
  if (fields.length === 0) {
    const typeSuffix2 = typeStr ? ` \`type=${typeStr}\`` : "";
    return `${prefix}\`${message}\`${typeSuffix2}`;
  }
  const escapedMsg = escapeHtml(message);
  const typeSuffix = typeStr ? ` <code>type=${escapeHtml(typeStr)}</code>` : "";
  const fieldLines = fields.join("\n\n");
  return `<details>
<summary>${prefix}<code>${escapedMsg}</code>${typeSuffix}</summary>
<br>

${fieldLines}

</details>`;
}
function tryFormatJsonLines(content) {
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
    parts.push(formatJsonLinesMessage(msg));
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
  return parts.join("\n\n") + "\n";
}

// src/renderer/writer.ts
var MarkdownWriter = class {
  lines = [];
  /** Appends a heading at the given level. */
  heading(text, level) {
    this.lines.push(`${"#".repeat(level)} ${text}`);
    this.lines.push("");
    return this;
  }
  /** Appends a paragraph (text followed by a blank line). */
  paragraph(text) {
    this.lines.push(text);
    this.lines.push("");
    return this;
  }
  /** Appends blockquote lines (> prefix on every line). */
  blockquote(text) {
    for (const line of text.split("\n")) {
      this.lines.push(`> ${line}`);
    }
    return this;
  }
  /** Appends a blank line. */
  blankLine() {
    this.lines.push("");
    return this;
  }
  /** Appends a table header row with separator. */
  tableHeader(columns) {
    this.lines.push(`| ${columns.join(" | ")} |`);
    this.lines.push(`| ${columns.map(() => "---").join(" | ")} |`);
    return this;
  }
  /** Appends a table data row. */
  tableRow(cells) {
    this.lines.push(`| ${cells.join(" | ")} |`);
    return this;
  }
  /**
   * Opens a `<details>` block with an HTML-escaped `<summary>` line.
   * Use `detailsOpenHtml()` when the summary contains intentional HTML markup.
   */
  detailsOpen(summary, open = false) {
    this.lines.push(open ? "<details open>" : "<details>");
    this.lines.push(`<summary>${escapeHtml(summary)}</summary>`);
    this.lines.push("");
    return this;
  }
  /**
   * Opens a `<details>` block with a pre-escaped HTML `<summary>` line.
   * Caller is responsible for ensuring `htmlSummary` is safe (all
   * user-controlled content must be HTML-escaped before interpolation).
   */
  detailsOpenHtml(htmlSummary, open = false) {
    this.lines.push(open ? "<details open>" : "<details>");
    this.lines.push(`<summary>${htmlSummary}</summary>`);
    this.lines.push("");
    return this;
  }
  /** Closes a `<details>` block. */
  detailsClose() {
    this.lines.push("</details>");
    this.lines.push("");
    return this;
  }
  /** Appends a fenced code block. */
  codeFence(content, language = "") {
    this.lines.push(`\`\`\`${language}`);
    this.lines.push(content);
    this.lines.push("```");
    this.lines.push("");
    return this;
  }
  /** Appends raw text verbatim (no trailing newline added). */
  raw(text) {
    this.lines.push(text);
    return this;
  }
  /**
   * Post-processes and returns the accumulated markdown string.
   * 1. Collapses runs of 3+ blank lines to 2 blank lines.
   * 2. Ensures a blank line before each # heading.
   */
  build() {
    let text = this.lines.join("\n");
    text = text.replace(/\n{3,}/g, "\n\n");
    text = text.replace(/([^\n])\n(#{1,6} )/g, "$1\n\n$2");
    return text;
  }
  /** Escapes pipe characters in table cells (Markdown context, not HTML). */
  static escapeCell(value) {
    return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
  }
  /**
   * Escapes a value for use inside HTML tags within a Markdown table cell.
   * Uses HTML entity encoding for pipe characters instead of Markdown backslash
   * escaping, since backslash escapes are not interpreted inside HTML tags.
   */
  static escapeHtmlCell(value) {
    return escapeHtml(value).replace(/\|/g, "&#124;");
  }
  /**
   * Escape characters that have special meaning in HTML.
   * Delegates to the shared `escapeHtml` utility from `raw-formatter/jsonl`.
   */
  static escapeHtml(text) {
    return escapeHtml(text);
  }
  /** Wraps value in `<code>` tags, HTML-escaping the content. */
  static inlineCode(value) {
    return `<code>${escapeHtml(value)}</code>`;
  }
  /**
   * Wraps value in `<code>` tags with HTML escaping and table-safe pipe encoding.
   * Use instead of `inlineCode(escapeCell(...))` in table cell contexts.
   */
  static inlineCodeCell(value) {
    return `<code>${escapeHtml(value).replace(/\|/g, "&#124;")}</code>`;
  }
};

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

// src/renderer/summary.ts
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
function renderSummary(summary, writer, isApply = false) {
  const labels = isApply ? APPLY_LABELS : PLAN_LABELS;
  const hasContent = summary.actions.length > 0 || summary.failures.length > 0;
  if (!hasContent) {
    writer.paragraph("_No changes._");
    return;
  }
  writer.tableHeader(["Action", "Resource", "Count"]);
  for (const group of summary.actions) {
    renderActionGroup(group, labels, ACTION_SYMBOLS[group.action], writer);
  }
  for (const group of summary.failures) {
    renderActionGroup(group, FAILURE_LABELS, STATUS_FAILURE, writer);
  }
  writer.blankLine();
}
function renderActionGroup(group, labels, symbol, writer) {
  const label = labels[group.action] ?? group.action;
  for (let i = 0; i < group.resourceTypes.length; i++) {
    const rt = group.resourceTypes[i];
    if (!rt) continue;
    const actionCell = i === 0 ? `${symbol} ${label}` : "";
    writer.tableRow([actionCell, rt.type, String(rt.count)]);
  }
  writer.tableRow(["", `**${label}**`, `**${String(group.total)}**`]);
}

// src/renderer/diagnostics.ts
function renderDiagnostics(diagnostics, writer, headingLevel = 3) {
  const errors = diagnostics.filter((d) => d.severity === "error");
  const warnings = diagnostics.filter((d) => d.severity === "warning");
  if (errors.length > 0) {
    writer.heading("Errors", headingLevel);
    for (const diag of errors) {
      renderDiagnostic(diag, writer);
    }
  }
  if (warnings.length > 0) {
    writer.heading("Warnings", headingLevel);
    for (const diag of warnings) {
      renderDiagnostic(diag, writer);
    }
  }
}
function renderDiagnostic(diag, writer) {
  const prefix = diag.severity === "error" ? DIAGNOSTIC_ERROR : DIAGNOSTIC_WARNING;
  const addressSuffix = diag.address !== void 0 ? ` \u2014 \`${diag.address}\`` : "";
  writer.paragraph(`${prefix} **${escapeHtml(diag.summary)}**${addressSuffix}`);
  if (diag.detail) {
    writer.blockquote(escapeHtml(diag.detail));
  }
  if (diag.snippet !== void 0) {
    renderSnippet(diag.snippet, diag.range?.filename, writer);
  }
  if (diag.detail || diag.snippet !== void 0) {
    writer.blankLine();
  }
}
function renderSnippet(snippet, filename, writer) {
  const location = filename !== void 0 ? `\`${snippet.code}\` in ${escapeHtml(snippet.context)} (\`${filename}\`:${String(snippet.start_line)})` : `\`${snippet.code}\` in ${escapeHtml(snippet.context)}`;
  writer.blockquote(location);
  if (snippet.values.length > 0) {
    for (const val of snippet.values) {
      writer.blockquote(
        `${escapeHtml(val.traversal)} = ${escapeHtml(val.statement)}`
      );
    }
  }
}

// src/renderer/apply-context.ts
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
function buildApplyContextFn(report) {
  if (!isApplyReport(report)) return void 0;
  const failedAddresses = buildFailedSet(report);
  const diagByAddress = buildDiagnosticMap(report);
  return (addr) => buildApplyContext(addr, failedAddresses, diagByAddress);
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

// src/renderer/diff-format.ts
function formatDiff(before, after, format) {
  const b = before ?? "";
  const a = after ?? "";
  if (b === "" && a === "") return "";
  if (b === a) {
    return MarkdownWriter.inlineCodeCell(b);
  }
  if (format === "simple") {
    const parts = [];
    if (b !== "")
      parts.push(
        `- ${MarkdownWriter.escapeCell(MarkdownWriter.escapeHtml(b))}`
      );
    if (a !== "")
      parts.push(
        `+ ${MarkdownWriter.escapeCell(MarkdownWriter.escapeHtml(a))}`
      );
    return parts.join("<br>");
  }
  const beforeLines = b.split("\n");
  const afterLines = a.split("\n");
  const maxLen = Math.max(beforeLines.length, afterLines.length);
  const resultLines = [];
  for (let i = 0; i < maxLen; i++) {
    let flushBuffers2 = function() {
      if (delBuf) {
        line += `<del style="background:#fdd">${MarkdownWriter.escapeHtmlCell(delBuf)}</del>`;
        delBuf = "";
      }
      if (insBuf) {
        line += `<ins style="background:#dfd">${MarkdownWriter.escapeHtmlCell(insBuf)}</ins>`;
        insBuf = "";
      }
    };
    var flushBuffers = flushBuffers2;
    const bl = beforeLines[i] ?? "";
    const al = afterLines[i] ?? "";
    if (bl === al) {
      resultLines.push(MarkdownWriter.escapeHtmlCell(bl));
      continue;
    }
    const charDiff = buildCharDiff(bl, al);
    let line = "";
    let delBuf = "";
    let insBuf = "";
    for (const entry of charDiff) {
      if (entry.kind === "removed") {
        if (insBuf) {
          flushBuffers2();
        }
        delBuf += entry.value;
      } else if (entry.kind === "added") {
        insBuf += entry.value;
      } else {
        flushBuffers2();
        line += MarkdownWriter.escapeHtmlCell(entry.value);
      }
    }
    flushBuffers2();
    resultLines.push(line);
  }
  return `<code>${resultLines.join("<br>")}</code>`;
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

// src/renderer/large-value.ts
function renderLargeValue(name, before, after, cache) {
  const bVal = before ? prettyPrint(before) : null;
  const aVal = after ? prettyPrint(after) : null;
  if (bVal === null && aVal === null) return "";
  if (bVal !== null && aVal === null) {
    return buildDetailsBlock(name, `\`\`\`
${bVal}
\`\`\``, 0, 0);
  }
  if (bVal === null && aVal !== null) {
    return buildDetailsBlock(name, `\`\`\`
${aVal}
\`\`\``, 0, 0);
  }
  if (bVal === null || aVal === null) {
    return "";
  }
  const diff = buildLineDiff(bVal, aVal, cache);
  const addedLines = diff.filter((e) => e.kind === "added").length;
  const removedLines = diff.filter((e) => e.kind === "removed").length;
  const codeContent = diff.map((e) => {
    const prefix = e.kind === "removed" ? "-" : e.kind === "added" ? "+" : " ";
    return `${prefix} ${e.value}`;
  }).join("\n");
  const fenced = `\`\`\`diff
${codeContent}
\`\`\``;
  return buildDetailsBlock(name, fenced, addedLines, removedLines);
}
function buildDetailsBlock(name, content, addedLines, removedLines) {
  const escapedName = escapeHtml(name);
  const hasDiff = addedLines > 0 || removedLines > 0;
  const suffix = hasDiff ? ` (large value; +${String(addedLines)}, -${String(removedLines)})` : " (large value)";
  return `<details>
<summary>${escapedName}${suffix}</summary>

${content}

</details>
`;
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

// src/diff/context-diff.ts
var CONTEXT_LINES = 3;
function renderLargeValueContextDiff(name, before, after, cache) {
  const bVal = before ? prettyPrint2(before) : null;
  const aVal = after ? prettyPrint2(after) : null;
  if (bVal === null && aVal === null) return "";
  if (bVal === null && aVal !== null) {
    return buildBlock(name, `\`\`\`
${aVal}
\`\`\``, 0, 0);
  }
  if (bVal !== null && aVal === null) {
    return buildBlock(name, `\`\`\`
${bVal}
\`\`\``, 0, 0);
  }
  if (bVal === null || aVal === null) return "";
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
  if (addedLines === 0 && removedLines === 0) return "";
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
  const fenced = `\`\`\`diff
${lines.join("\n")}
\`\`\``;
  return buildBlock(name, fenced, addedLines, removedLines);
}
function buildBlock(name, content, addedLines, removedLines) {
  const escapedName = escapeHtml(name);
  const hasDiff = addedLines > 0 || removedLines > 0;
  const suffix = hasDiff ? ` (large value; +${String(addedLines)}, -${String(removedLines)})` : " (large value)";
  return `<details>
<summary>${escapedName}${suffix}</summary>

${content}

</details>
`;
}
function prettyPrint2(value) {
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

// src/renderer/address.ts
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

// src/renderer/resource.ts
function renderResource(resource, writer, options, diffCache, mode = "full", applyContext) {
  const symbol = ACTION_SYMBOLS[resource.action];
  const changedAttrs = resource.attributes.filter(
    (a) => !a.isSensitive && !a.isKnownAfterApply && a.before !== a.after
  ).map((a) => a.name);
  let summaryText = `${symbol} <strong>${MarkdownWriter.escapeHtml(resource.type)}</strong> ${MarkdownWriter.escapeHtml(deriveInstanceName(resource.address, resource.type))}`;
  if (resource.action === "update" && changedAttrs.length > 0) {
    const hint = changedAttrs.slice(0, 5).join(", ");
    summaryText += ` \u2014 changed: ${MarkdownWriter.escapeHtml(hint)}`;
  }
  if (applyContext?.failed) {
    summaryText += ` ${STATUS_FAILURE}`;
  }
  const shouldOpen = applyContext !== void 0 && (applyContext.failed || applyContext.diagnostics.length > 0);
  writer.detailsOpenHtml(summaryText, shouldOpen);
  writer.codeFence(resource.address);
  if (resource.importId !== null) {
    writer.paragraph(
      `**Import ID:** ${MarkdownWriter.inlineCode(resource.importId)}`
    );
  }
  if (resource.movedFromAddress !== null) {
    writer.paragraph(
      `**Moved from:** ${MarkdownWriter.inlineCode(resource.movedFromAddress)}`
    );
  }
  if (mode !== "compact") {
    renderAttributes(resource, writer, options, diffCache, mode);
  }
  if (applyContext && applyContext.diagnostics.length > 0) {
    renderInlineDiagnostics(applyContext.diagnostics, writer);
  }
  writer.detailsClose();
}
function renderAttributes(resource, writer, options, diffCache, mode) {
  const smallAttrs = resource.attributes.filter((a) => !a.isLarge);
  const largeAttrs = resource.attributes.filter((a) => a.isLarge);
  const useCharDiff = mode === "attrs-char-diff" || mode === "full";
  const diffFormat = options.diffFormat ?? "inline";
  if (resource.allUnknownAfterApply) {
    writer.paragraph("_(all values known after apply)_");
  } else if (resource.attributes.length === 0 && resource.hasAttributeDetail) {
    writer.paragraph("_No attribute changes._");
  } else if (resource.attributes.length > 0) {
    if (smallAttrs.length > 0) {
      writer.tableHeader(["Attribute", "Before", "After"]);
      for (const attr of smallAttrs) {
        const skipDiff = attr.isSensitive || attr.isKnownAfterApply;
        const beforeCell = skipDiff ? MarkdownWriter.inlineCodeCell(attr.before ?? "") : `<code>${MarkdownWriter.escapeHtmlCell(attr.before ?? "").replace(/\n/g, "<br>")}</code>`;
        const afterCell = skipDiff || !useCharDiff ? MarkdownWriter.inlineCodeCell(attr.after ?? "") : formatDiff(attr.before, attr.after, diffFormat);
        writer.tableRow([
          MarkdownWriter.escapeCell(MarkdownWriter.escapeHtml(attr.name)),
          beforeCell,
          afterCell
        ]);
      }
      writer.blankLine();
    }
    for (const attr of largeAttrs) {
      const block = mode === "full" ? renderLargeValue(attr.name, attr.before, attr.after, diffCache) : renderLargeValueContextDiff(
        attr.name,
        attr.before,
        attr.after,
        diffCache
      );
      if (block) {
        writer.raw(block);
      }
    }
  }
}
function renderInlineDiagnostics(diagnostics, writer) {
  const errors = diagnostics.filter((d) => d.severity === "error");
  const warnings = diagnostics.filter((d) => d.severity === "warning");
  for (const diag of [...errors, ...warnings]) {
    const prefix = diag.severity === "error" ? DIAGNOSTIC_ERROR : DIAGNOSTIC_WARNING;
    writer.paragraph(
      `${prefix} **${MarkdownWriter.escapeHtml(diag.summary)}**`
    );
    if (diag.detail) {
      writer.codeFence(diag.detail);
    }
  }
}

// src/renderer/module-section.ts
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
function moduleLabel(moduleAddress) {
  return moduleAddress === "" ? "root" : `\`${moduleAddress}\``;
}
function renderModuleSection(moduleGroup, writer, options, diffCache, mode, applyContextFn) {
  const label = moduleLabel(moduleGroup.moduleAddress);
  writer.heading(`${MODULE_ICON} Module: ${label}`, 3);
  for (const resource of moduleGroup.resources) {
    const applyContext = applyContextFn?.(resource.address);
    renderResource(resource, writer, options, diffCache, mode, applyContext);
  }
}

// src/renderer/outputs.ts
function renderOutputs(outputs, writer, options, diffCache, mode = "full") {
  if (mode === "compact") return;
  const useDiff = mode === "attrs-char-diff" || mode === "full";
  const diffFormat = options.diffFormat ?? "inline";
  const smallOutputs = outputs.filter(
    (o) => !o.isLarge || o.isSensitive || o.isKnownAfterApply
  );
  const largeOutputs = outputs.filter(
    (o) => o.isLarge && !o.isSensitive && !o.isKnownAfterApply
  );
  if (smallOutputs.length > 0) {
    writer.tableHeader(["Output", "Action", "Before", "After"]);
    for (const output of smallOutputs) {
      const symbol = ACTION_SYMBOLS[output.action];
      const skipDiff = output.isSensitive || output.isKnownAfterApply || !useDiff;
      const before = output.isSensitive ? MarkdownWriter.inlineCode("(sensitive)") : output.before !== null ? skipDiff ? MarkdownWriter.inlineCodeCell(output.before) : `<code>${MarkdownWriter.escapeHtmlCell(output.before).replace(/\n/g, "<br>")}</code>` : "";
      const after = output.isSensitive ? MarkdownWriter.inlineCode("(sensitive)") : skipDiff ? MarkdownWriter.inlineCodeCell(output.after ?? "") : formatDiff(output.before, output.after, diffFormat);
      writer.tableRow([
        MarkdownWriter.escapeCell(output.name),
        symbol,
        before,
        after
      ]);
    }
    writer.blankLine();
  }
  for (const output of largeOutputs) {
    const symbol = ACTION_SYMBOLS[output.action];
    const label = `${symbol} ${output.name}`;
    const block = mode === "full" ? renderLargeValue(label, output.before, output.after, diffCache) : renderLargeValueContextDiff(
      label,
      output.before,
      output.after,
      diffCache
    );
    if (block) {
      writer.raw(block);
    }
  }
}

// src/renderer/index.ts
function ensureTrailingBlankLine(content) {
  const trimmed = content.replace(/\n+$/, "");
  return trimmed + "\n\n";
}
function renderStructuredSections(report, options = {}) {
  const diffCache = /* @__PURE__ */ new Map();
  const isApply = isApplyReport(report);
  const summaryHeading = isApply ? "Apply Summary" : "Plan Summary";
  const summary = report.summary;
  const resources = report.resources ?? [];
  const outputs = report.outputs ?? [];
  const driftResources = report.driftResources ?? [];
  const sections = [];
  const failedAddresses = buildFailedSet(report);
  const diagByAddress = buildDiagnosticMap(report);
  const nonResourceDiags = extractNonResourceDiagnostics(report);
  const applyContextFn = isApply ? (addr) => buildApplyContext(addr, failedAddresses, diagByAddress) : void 0;
  if (options.title) {
    sections.push({
      id: "user-title",
      full: `## ${options.title}

`,
      fixed: true
    });
  }
  {
    const writer = new MarkdownWriter();
    writer.heading(summaryHeading, 2);
    if (summary) {
      renderSummary(summary, writer, isApply);
    }
    sections.push({
      id: "summary",
      full: ensureTrailingBlankLine(writer.build()),
      fixed: true
    });
  }
  if (nonResourceDiags.length > 0) {
    const writer = new MarkdownWriter();
    renderDiagnostics(nonResourceDiags, writer, 2);
    sections.push({
      id: "non-resource-diagnostics",
      full: ensureTrailingBlankLine(writer.build()),
      fixed: true
    });
  }
  if (driftResources.length > 0) {
    sections.push(...renderDriftSections(driftResources, options, diffCache));
  }
  const moduleGroups = groupByModule(resources);
  if (moduleGroups.length > 0) {
    sections.push(
      ...renderResourceSections(
        moduleGroups,
        options,
        diffCache,
        applyContextFn
      )
    );
  }
  if (outputs.length > 0) {
    const writer = new MarkdownWriter();
    writer.heading("Output Changes", 2);
    renderOutputs(outputs, writer, options, diffCache);
    sections.push({
      id: "outputs",
      full: ensureTrailingBlankLine(writer.build())
    });
  }
  return sections;
}
function renderResourceSections(moduleGroups, options, diffCache, applyContextFn) {
  const sections = [];
  const hw = new MarkdownWriter();
  hw.heading("Resource Changes", 2);
  sections.push({
    id: "resource-changes-heading",
    full: ensureTrailingBlankLine(hw.build()),
    fixed: true
  });
  for (const moduleGroup of moduleGroups) {
    const label = moduleLabel(moduleGroup.moduleAddress);
    const mw = new MarkdownWriter();
    renderModuleSection(
      moduleGroup,
      mw,
      options,
      diffCache,
      "full",
      applyContextFn
    );
    sections.push({
      id: `module-${moduleGroup.moduleAddress || "root"}`,
      full: ensureTrailingBlankLine(mw.build()),
      compact: `### ${label}

_(details omitted)_

`
    });
  }
  return sections;
}
function renderDriftSections(driftResources, options, diffCache) {
  const sections = [];
  const hw = new MarkdownWriter();
  hw.heading(
    `${DRIFT_ICON} Resource Drift (${String(driftResources.length)} detected)`,
    2
  );
  sections.push({
    id: "drift-heading",
    full: ensureTrailingBlankLine(hw.build()),
    fixed: true
  });
  const driftModules = groupByModule(driftResources);
  for (const moduleGroup of driftModules) {
    const label = moduleLabel(moduleGroup.moduleAddress);
    const mw = new MarkdownWriter();
    renderModuleSection(moduleGroup, mw, options, diffCache, "full");
    sections.push({
      id: `drift-module-${moduleGroup.moduleAddress || "root"}`,
      full: ensureTrailingBlankLine(mw.build()),
      compact: `### ${label}

_(details omitted)_

`
    });
  }
  return sections;
}

// src/renderer/title.ts
function renderTitle(report) {
  return {
    id: "title",
    full: `## ${report.title}

`,
    fixed: true
  };
}
function renderWorkspaceMarker(report) {
  const workspace = getWorkspace(report);
  if (workspace === void 0) return void 0;
  return {
    id: "marker",
    full: `<!-- tf-report-action:"${escapeMarkerWorkspace(workspace)}" -->
`,
    fixed: true
  };
}
function getWorkspace(report) {
  return report.workspace;
}
function escapeMarkerWorkspace(workspace) {
  return workspace.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/--/g, "-\u200B-");
}

// src/raw-formatter/validate.ts
function tryFormatValidateOutput(content) {
  let parsed;
  try {
    parsed = JSON.parse(content);
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
      const severity = typeof diag["severity"] === "string" ? diag["severity"] : "error";
      const icon = severity === "warning" ? DIAGNOSTIC_WARNING : DIAGNOSTIC_ERROR;
      const summary = typeof diag["summary"] === "string" ? diag["summary"] : "(unknown)";
      const detail = typeof diag["detail"] === "string" ? diag["detail"] : "";
      output += `${icon} **${escapeHtml(summary)}**
`;
      if (detail) {
        const detailLines = escapeHtml(detail).split("\n").map((l) => `> ${l}`).join("\n");
        output += `${detailLines}
`;
      }
      const snippet = diag["snippet"];
      if (snippet && typeof snippet["code"] === "string") {
        const lineInfo = typeof snippet["start_line"] === "number" ? ` (line ${String(snippet["start_line"])})` : "";
        const ctx = typeof snippet["context"] === "string" ? ` in ${escapeHtml(snippet["context"])}` : "";
        output += `> \`${snippet["code"]}\`${ctx}${lineInfo}
`;
      }
      output += "\n";
    }
  }
  output += `<details>
<summary>Show raw JSON</summary>

\`\`\`json
${content}
\`\`\`

</details>`;
  return output;
}

// src/raw-formatter/index.ts
function formatRawOutput(content) {
  const trimmed = content.trim();
  if (trimmed === "") return "```\n(empty)\n```";
  const validateResult = tryFormatValidateOutput(trimmed);
  if (validateResult !== void 0) return validateResult;
  const jsonlResult = tryFormatJsonLines(trimmed);
  if (jsonlResult !== void 0) return jsonlResult;
  return `\`\`\`\`
${content}
\`\`\`\``;
}

// src/renderer/step-issue.ts
function renderStepIssue(issue) {
  const icon = issue.isFailed ? STATUS_FAILURE : DIAGNOSTIC_WARNING;
  let content = `### ${icon} ${issue.heading}

`;
  if (issue.exitCode !== void 0) {
    content += `Exit code: \`${issue.exitCode}\`

`;
  }
  if (issue.diagnostic !== void 0) {
    content += `> ${issue.diagnostic}

`;
  }
  if (issue.stdout !== void 0) {
    const formatted = formatRawOutput(issue.stdout);
    content += `<details open>
<summary>stdout</summary>

${formatted}

</details>

`;
  } else if (issue.stdoutError !== void 0) {
    content += `> ${DIAGNOSTIC_WARNING} stdout not available: ${issue.stdoutError}

`;
  }
  if (issue.stderr !== void 0) {
    const formattedStderr = formatRawOutput(issue.stderr);
    content += `<details open>
<summary>stderr</summary>

${formattedStderr}

</details>

`;
  } else if (issue.stderrError !== void 0) {
    content += `> ${DIAGNOSTIC_WARNING} stderr not available: ${issue.stderrError}

`;
  }
  if (issue.stdout === void 0 && issue.stderr === void 0 && issue.stdoutError === void 0 && issue.stderrError === void 0) {
    content += "No output captured.\n\n";
  }
  return {
    id: `issue-${issue.id}`,
    full: content,
    compact: `### ${icon} ${issue.heading}

`
  };
}

// src/renderer/text-fallback.ts
function renderTextFallbackBody(report) {
  const sections = [];
  for (const raw of report.rawStdout) {
    sections.push({
      id: `raw-${raw.stepId}`,
      full: `### ${raw.label}

${formatRawOutput(raw.content)}

`,
      compact: `### ${raw.label}

_(omitted due to size)_

`
    });
  }
  return sections;
}

// src/renderer/step-table.ts
function renderStepStatusTable(steps, excludeIds) {
  const filtered = excludeIds ? steps.filter((s) => !excludeIds.has(s.id)) : steps;
  if (filtered.length === 0) return "";
  const hasExitCodes = filtered.some((s) => s.exitCode !== void 0);
  if (hasExitCodes) {
    let table2 = "| Step | Outcome | Exit Code |\n|------|--------|----------|\n";
    for (const step of filtered) {
      const exitCode = step.exitCode !== void 0 ? `\`${step.exitCode}\`` : "";
      table2 += `| \`${step.id}\` | ${step.outcome} | ${exitCode} |
`;
    }
    return table2 + "\n";
  }
  let table = "| Step | Outcome |\n|------|--------|\n";
  for (const step of filtered) {
    table += `| \`${step.id}\` | ${step.outcome} |
`;
  }
  return table + "\n";
}

// src/renderer/workflow.ts
function renderWorkflowBody(report) {
  const stepTable = renderStepStatusTable(report.steps);
  return [{ id: "step-table", full: `### Steps

${stepTable}` }];
}

// src/renderer/error.ts
function renderErrorBody(report) {
  const sections = [];
  if (report.error !== void 0) {
    sections.push({ id: "message", full: `${report.error}

` });
  }
  if (report.steps.length > 0) {
    const stepTable = renderStepStatusTable(report.steps);
    if (stepTable.length > 0) {
      sections.push({ id: "step-statuses", full: `### Steps

${stepTable}` });
    }
  }
  return sections;
}

// src/renderer/report-sections.ts
function renderReportSections(report, options) {
  const sections = [];
  const marker = renderWorkspaceMarker(report);
  if (marker !== void 0) {
    sections.push(marker);
  }
  sections.push(renderTitle(report));
  for (const [i, warning] of report.warnings.entries()) {
    sections.push({
      id: `warning-${String(i)}`,
      full: `> ${DIAGNOSTIC_WARNING} **Warning:** ${warning}

`,
      fixed: true
    });
  }
  for (const issue of report.issues) {
    sections.push(renderStepIssue(issue));
  }
  if (report.error !== void 0) {
    sections.push(...renderErrorBody(report));
  } else if (report.summary !== void 0 || report.resources !== void 0) {
    const { title: _discardTitle, ...renderOptsNoTitle } = options ?? {};
    sections.push(...renderStructuredSections(report, renderOptsNoTitle));
    sections.push(...renderRawStdoutSections(report));
  } else if (report.rawStdout.length > 0) {
    sections.push(...renderTextFallbackBody(report));
  } else if (report.steps.length > 0) {
    sections.push(...renderWorkflowBody(report));
  }
  return sections;
}
function renderRawStdoutSections(report) {
  const sections = [];
  for (const raw of report.rawStdout) {
    const formatted = formatRawOutput(raw.content);
    const escapedLabel = MarkdownWriter.escapeHtml(raw.label);
    const full = `<details><summary>${escapedLabel}</summary>

${formatted}

</details>

`;
    sections.push({ id: `raw-${raw.stepId}`, full });
  }
  return sections;
}

// src/compose/listing.ts
function renderResourceListing(heading, resources, maxLength) {
  const lines = resources.map(
    (r) => `${ACTION_SYMBOLS[r.action]} ${r.address}`
  );
  return buildListing(heading, lines, maxLength);
}
function renderOutputListing(heading, outputs, maxLength) {
  const lines = outputs.map((o) => {
    const suffix = o.isSensitive ? " (sensitive)" : "";
    return `${ACTION_SYMBOLS[o.action]} ${o.name}${suffix}`;
  });
  return buildListing(heading, lines, maxLength);
}
function buildListing(heading, lines, maxLength) {
  const headerLine = `## ${heading}
`;
  const fenceOpen = "```\n";
  const fenceClose = "\n```\n";
  if (maxLength === void 0) {
    return headerLine + fenceOpen + lines.join("\n") + fenceClose;
  }
  const overhead = headerLine.length + fenceOpen.length + fenceClose.length;
  let remaining = maxLength - overhead;
  const shown = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === void 0) continue;
    const lineLen = shown.length > 0 ? line.length + 1 : line.length;
    const moreItems = lines.length - (i + 1);
    const omittedSuffix = moreItems > 0 ? `
... and ${String(moreItems)} more` : "";
    const neededForRest = omittedSuffix.length;
    if (lineLen + neededForRest <= remaining) {
      shown.push(line);
      remaining -= lineLen;
    } else {
      const totalOmitted = lines.length - shown.length;
      if (totalOmitted > 0) {
        shown.push(`... and ${String(totalOmitted)} more`);
      }
      break;
    }
  }
  return headerLine + fenceOpen + shown.join("\n") + fenceClose;
}

// src/compose/category-renderer.ts
function tierToMode(tier) {
  switch (tier) {
    case 1:
      return "compact";
    case 2:
      return "compact";
    case 3:
      return "attrs-no-diff";
    case 4:
      return "attrs-char-diff";
    case 5:
      return "full";
  }
}
function renderCategoryAtTier(category, tier, report, options, diffCache, maxLength) {
  switch (category) {
    case "resources":
      return renderResourcesAtTier(tier, report, options, diffCache, maxLength);
    case "outputs":
      return renderOutputsAtTier(tier, report, options, diffCache, maxLength);
    case "drift":
      return renderDriftAtTier(tier, report, options, diffCache, maxLength);
  }
}
function renderResourcesAtTier(tier, report, options, diffCache, maxLength) {
  const resources = report.resources ?? [];
  if (resources.length === 0) return "";
  if (tier === 1) {
    return renderResourceListing("Resource Changes", resources, maxLength);
  }
  const mode = tierToMode(tier);
  const moduleGroups = groupByModule(resources);
  const applyContextFn = buildApplyContextFn(report);
  const writer = new MarkdownWriter();
  writer.heading("Resource Changes", 2);
  for (const moduleGroup of moduleGroups) {
    renderModuleSection(
      moduleGroup,
      writer,
      options,
      diffCache,
      mode,
      applyContextFn
    );
  }
  return ensureTrailingBlankLine(writer.build());
}
function renderOutputsAtTier(tier, report, options, diffCache, maxLength) {
  const outputs = report.outputs ?? [];
  if (outputs.length === 0) return "";
  if (tier === 1) {
    return renderOutputListing("Output Changes", outputs, maxLength);
  }
  const mode = tierToMode(tier);
  const writer = new MarkdownWriter();
  writer.heading("Output Changes", 2);
  renderOutputs(outputs, writer, options, diffCache, mode);
  return ensureTrailingBlankLine(writer.build());
}
function renderDriftAtTier(tier, report, options, diffCache, maxLength) {
  const driftResources = report.driftResources ?? [];
  if (driftResources.length === 0) return "";
  if (tier === 1) {
    return renderResourceListing(
      `${DRIFT_ICON} Resource Drift (${String(driftResources.length)} detected)`,
      driftResources,
      maxLength
    );
  }
  const mode = tierToMode(tier);
  const moduleGroups = groupByModule(driftResources);
  const writer = new MarkdownWriter();
  writer.heading(
    `${DRIFT_ICON} Resource Drift (${String(driftResources.length)} detected)`,
    2
  );
  for (const moduleGroup of moduleGroups) {
    renderModuleSection(moduleGroup, writer, options, diffCache, mode);
  }
  return ensureTrailingBlankLine(writer.build());
}

// src/compose/progressive.ts
var UPGRADE_PRIORITY = ["resources", "outputs", "drift"];
var DISPLAY_ORDER = ["drift", "resources", "outputs"];
var TIERS = [1, 2, 3, 4, 5];
function composeProgressively(prefix, suffix, report, options, budget) {
  const diffCache = /* @__PURE__ */ new Map();
  const fixedLen = prefix.length + suffix.length;
  const activeCategories = UPGRADE_PRIORITY.filter(
    (c) => categoryHasContent(c, report)
  );
  if (activeCategories.length === 0) {
    return { markdown: prefix + suffix, wasTruncated: false };
  }
  const tierMap = /* @__PURE__ */ new Map();
  const contentMap = /* @__PURE__ */ new Map();
  for (const cat of activeCategories) {
    tierMap.set(cat, 1);
    contentMap.set(cat, "");
  }
  for (const cat of activeCategories) {
    contentMap.set(
      cat,
      renderCategoryAtTier(cat, 1, report, options, diffCache)
    );
  }
  const tier1Total = fixedLen + [...contentMap.values()].reduce((s, c) => s + c.length, 0);
  if (tier1Total > budget) {
    const categoryBudget = budget - fixedLen;
    let spent = 0;
    for (const cat of activeCategories) {
      const available = Math.max(0, categoryBudget - spent);
      const content = renderCategoryAtTier(
        cat,
        1,
        report,
        options,
        diffCache,
        available
      );
      contentMap.set(cat, content);
      spent += content.length;
    }
  }
  for (const targetTier of TIERS.slice(1)) {
    const candidates = /* @__PURE__ */ new Map();
    let allFit = true;
    for (const cat of activeCategories) {
      const currentTier = tierMap.get(cat) ?? 1;
      if (currentTier >= targetTier) continue;
      const candidateContent = renderCategoryAtTier(
        cat,
        targetTier,
        report,
        options,
        diffCache
      );
      const otherContent = totalContentExcluding(contentMap, cat);
      const totalSize = fixedLen + otherContent + candidateContent.length;
      if (totalSize <= budget) {
        candidates.set(cat, candidateContent);
      } else {
        allFit = false;
        break;
      }
    }
    if (!allFit) break;
    for (const [cat, content] of candidates) {
      tierMap.set(cat, targetTier);
      contentMap.set(cat, content);
    }
  }
  for (const targetTier of TIERS.slice(1)) {
    for (const cat of activeCategories) {
      const currentTier = tierMap.get(cat) ?? 1;
      if (currentTier >= targetTier) continue;
      const candidateContent = renderCategoryAtTier(
        cat,
        targetTier,
        report,
        options,
        diffCache
      );
      const otherContent = totalContentExcluding(contentMap, cat);
      const totalSize = fixedLen + otherContent + candidateContent.length;
      if (totalSize <= budget) {
        tierMap.set(cat, targetTier);
        contentMap.set(cat, candidateContent);
      }
    }
  }
  const parts = [prefix];
  for (const cat of DISPLAY_ORDER) {
    const content = contentMap.get(cat);
    if (content) parts.push(content);
  }
  parts.push(suffix);
  const markdown = parts.join("");
  const wasTruncated = activeCategories.some(
    (cat) => (tierMap.get(cat) ?? 1) < 5
  );
  return { markdown, wasTruncated };
}
function categoryHasContent(category, report) {
  switch (category) {
    case "resources":
      return (report.resources ?? []).length > 0;
    case "outputs":
      return (report.outputs ?? []).length > 0;
    case "drift":
      return (report.driftResources ?? []).length > 0;
  }
}
function totalContentExcluding(contentMap, exclude) {
  let total = 0;
  for (const [cat, content] of contentMap) {
    if (cat !== exclude) total += content.length;
  }
  return total;
}

// src/compose/notices.ts
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

// src/compose/index.ts
function composeWithBudget(sections, report, options, budget) {
  const hasCategories = (report.resources?.length ?? 0) > 0 || (report.outputs?.length ?? 0) > 0 || (report.driftResources?.length ?? 0) > 0;
  if (hasCategories) {
    const { prefix, suffix } = splitAroundCategories(sections);
    return composeProgressively(prefix, suffix, report, options, budget);
  }
  const full = sections.map((s) => s.full).join("");
  if (full.length <= budget) {
    return { markdown: full, wasTruncated: false };
  }
  return { markdown: full.slice(0, budget), wasTruncated: true };
}
function isCategorySection(section) {
  const { id } = section;
  return id === "resource-changes-heading" || id === "drift-heading" || id === "outputs" || id.startsWith("module-") || id.startsWith("drift-module-");
}
function splitAroundCategories(sections) {
  let firstCat = -1;
  let lastCat = -1;
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (s !== void 0 && isCategorySection(s)) {
      if (firstCat === -1) firstCat = i;
      lastCat = i;
    }
  }
  const prefix = sections.slice(0, firstCat === -1 ? sections.length : firstCat).map((s) => s.full).join("");
  const suffix = lastCat === -1 ? "" : sections.slice(lastCat + 1).map((s) => s.full).join("");
  return { prefix, suffix };
}

// src/pipelines/steps.ts
var DEFAULT_MAX_OUTPUT_LENGTH = 64512;
function reportFromSteps(stepsJson, options) {
  try {
    const maxOutputLength = options?.maxOutputLength ?? DEFAULT_MAX_OUTPUT_LENGTH;
    const report = buildReportFromSteps(stepsJson, options);
    const sections = renderReportSections(report, options);
    const fullMarkdown = sections.map((s) => s.full).join("");
    const result = composeWithBudget(
      sections,
      report,
      options ?? {},
      maxOutputLength
    );
    return {
      markdown: result.markdown,
      fullMarkdown,
      wasTruncated: result.wasTruncated,
      ...report.operation !== void 0 && { operation: report.operation },
      hasUnresolvedFailures: report.hasUnresolvedFailures ?? false
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const errorMarkdown = `## ${STATUS_FAILURE} Report Generation Failed

An unexpected error occurred while generating the report:

\`\`\`
${message}
\`\`\`
`;
    return {
      markdown: errorMarkdown,
      fullMarkdown: errorMarkdown,
      wasTruncated: false,
      hasUnresolvedFailures: false
    };
  }
}

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

// src/http/errors.ts
var ActionsError = class extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = "ActionsError";
  }
};

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
import * as http from "node:http";
import * as https from "node:https";
import * as tls from "node:tls";
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
  <title>${escapeHtml2(pageTitle)}</title>
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
function escapeHtml2(s) {
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
    const htmlFragment = await params.renderMarkdown({
      text: params.fullMarkdown,
      mode: "gfm",
      context: params.repoContext
    });
    const dotIndex = params.artifactName.lastIndexOf(".");
    const pageTitle = dotIndex > 0 ? params.artifactName.slice(0, dotIndex) : params.artifactName;
    const htmlPage = buildHtmlPage(htmlFragment, pageTitle);
    const filename = params.artifactName;
    const serverUrl = params.env["GITHUB_SERVER_URL"];
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
    return `${artifactServerUrl}/${params.repoContext}/actions/runs/${runId}/artifacts/${String(result.id)}`;
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
      maxOutputLength: 0,
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
    const result = reportFromSteps(inputs.steps, {
      ...reportOptions,
      maxOutputLength: fullBudget
    });
    let { markdown } = result;
    const { fullMarkdown, wasTruncated, operation, hasUnresolvedFailures } = result;
    const shouldUpload = wasTruncated || inputs.alwaysUploadReport;
    let artifactUrl;
    if (shouldUpload) {
      const workspacePart = inputs.workspace ? `${sanitizeArtifactSegment(inputs.workspace)}-` : "";
      const opPart = operation !== void 0 ? `${operation}-` : "";
      const artifactName = `${workspacePart}${opPart}report.html`;
      artifactUrl = await tryUpload({
        fullMarkdown,
        renderMarkdown: client.renderMarkdown.bind(client),
        env,
        repoContext: `${owner}/${repo}`,
        artifactName,
        logger,
        deps: { transport }
      });
    }
    if (wasTruncated) {
      const truncationNotice = buildTruncation(artifactUrl, logsUrl);
      const reducedBudget = Math.max(0, fullBudget - truncationNotice.length);
      ({ markdown } = reportFromSteps(inputs.steps, {
        ...reportOptions,
        maxOutputLength: reducedBudget
      }));
      markdown += truncationNotice;
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
