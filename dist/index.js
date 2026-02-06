import * as fs from 'fs';
import { Readable } from 'stream';
import * as https from 'https';

/**
 * OpenTofu/Terraform JSON Lines Output Parser
 *
 * Implements parsing and formatting of machine-readable JSON output as documented at:
 * https://opentofu.org/docs/internals/machine-readable-ui/
 *
 * DOCUMENTATION SOURCE (for future updates):
 * https://github.com/opentofu/opentofu/blob/main/website/docs/internals/machine-readable-ui.mdx
 *
 * This module defines TypeScript interfaces for all message types and provides
 * functions to detect, parse, and format JSON Lines output from OpenTofu/Terraform
 * commands run with the -json flag.
 */
/**
 * Check if a stream appears to be JSON Lines format by checking first few lines.
 * Does not accumulate data beyond what's needed for detection.
 */
async function isJsonLinesStream(stream) {
    if (!stream) {
        return false;
    }
    let buffer = '';
    let linesChecked = 0;
    let validJsonCount = 0;
    const samplesToCheck = 3;
    return new Promise((resolve) => {
        stream.on('data', (chunk) => {
            buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
            // Process complete lines
            let newlineIndex;
            while ((newlineIndex = buffer.indexOf('\n')) !== -1 &&
                linesChecked < samplesToCheck) {
                const line = buffer.substring(0, newlineIndex).trim();
                buffer = buffer.substring(newlineIndex + 1);
                if (!line)
                    continue;
                linesChecked++;
                try {
                    const parsed = JSON.parse(line);
                    // Check for required fields in OpenTofu/Terraform JSON output
                    if (parsed &&
                        typeof parsed === 'object' &&
                        'type' in parsed &&
                        '@message' in parsed) {
                        validJsonCount++;
                    }
                }
                catch {
                    // Not valid JSON, continue checking other lines
                }
                if (linesChecked >= samplesToCheck) {
                    stream.destroy();
                    resolve(validJsonCount > 0);
                    return;
                }
            }
        });
        stream.on('end', () => {
            resolve(validJsonCount > 0);
        });
        stream.on('error', () => {
            resolve(false);
        });
    });
}
/**
 * Get emoji for a change action
 */
function getActionEmoji(action) {
    switch (action) {
        case 'create':
            return ':heavy_plus_sign:';
        case 'update':
            return '🔄';
        case 'delete':
        case 'remove':
            return ':heavy_minus_sign:';
        case 'replace':
            return '±';
        case 'read':
            return '📖';
        case 'move':
            return '🚚';
        case 'noop':
        default:
            return '⚪';
    }
}
/**
 * Format JSON Lines from a stream directly without accumulating messages.
 * Limits based on formatted output size, not message count.
 * Stops accumulating when formatted output reaches size limit.
 */
async function formatJsonLinesStream(stream, maxOutputSize = 20000) {
    if (!stream) {
        return '';
    }
    // Reserves space for important summaries. Always includes change_summary which may appear at end of stream.
    const SUMMARY_RESERVE_CHARS = 1000;
    const effectiveLimit = maxOutputSize - SUMMARY_RESERVE_CHARS;
    let buffer = '';
    // Build output incrementally, checking size as we go
    let formattedOutput = '';
    // Accumulate only important details temporarily for formatting
    const errorDetails = [];
    const warningDetails = [];
    const plannedChangeDetails = [];
    const applyCompleteDetails = [];
    const driftDetails = [];
    // Single values
    let changeSummaryMessage;
    let operationType = 'unknown';
    // Helper function to process a single parsed JSON message
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const processMessage = (parsed) => {
        switch (parsed.type) {
            case 'diagnostic':
                if (parsed.diagnostic) {
                    const detail = {
                        severity: parsed.diagnostic.severity,
                        summary: parsed.diagnostic.summary,
                        detail: parsed.diagnostic.detail,
                        filename: parsed.diagnostic.range?.filename,
                        line: parsed.diagnostic.range?.start?.line,
                        code: parsed.diagnostic.snippet?.code
                    };
                    if (detail.severity === 'error') {
                        errorDetails.push(detail);
                    }
                    else if (detail.severity === 'warning') {
                        warningDetails.push(detail);
                    }
                }
                break;
            case 'change_summary':
                changeSummaryMessage = parsed['@message'];
                if (parsed.changes) {
                    operationType = parsed.changes.operation || 'unknown';
                }
                break;
            case 'planned_change':
                if (parsed.change) {
                    const resource = parsed.change.resource;
                    plannedChangeDetails.push({
                        action: parsed.change.action,
                        addr: resource?.addr ||
                            `${resource?.resource_type}.${resource?.resource_name}`
                    });
                }
                break;
            case 'apply_complete':
                if (parsed.hook) {
                    const resource = parsed.hook.resource;
                    applyCompleteDetails.push({
                        action: parsed.hook.action,
                        addr: resource?.addr ||
                            `${resource?.resource_type}.${resource?.resource_name}`
                    });
                }
                break;
            case 'resource_drift':
                if (parsed.change) {
                    const resource = parsed.change.resource;
                    driftDetails.push({
                        action: parsed.change.action,
                        addr: resource?.addr ||
                            `${resource?.resource_type}.${resource?.resource_name}`
                    });
                }
                break;
        }
    };
    return new Promise((resolve) => {
        stream.on('data', (chunk) => {
            buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
            // Process complete lines
            let newlineIndex;
            while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                const line = buffer.substring(0, newlineIndex).trim();
                buffer = buffer.substring(newlineIndex + 1);
                if (!line)
                    continue;
                try {
                    const parsed = JSON.parse(line);
                    processMessage(parsed);
                }
                catch {
                    // Skip lines that aren't valid JSON
                }
            }
        });
        stream.on('end', () => {
            // Process any remaining buffer content (last line without trailing newline)
            if (buffer.trim()) {
                try {
                    const parsed = JSON.parse(buffer);
                    processMessage(parsed);
                }
                catch {
                    // Skip if final buffer isn't valid JSON
                }
            }
            formattedOutput = buildFormattedOutput(changeSummaryMessage, operationType, errorDetails, warningDetails, plannedChangeDetails, applyCompleteDetails, driftDetails, effectiveLimit);
            resolve(formattedOutput);
        });
        stream.on('error', () => {
            formattedOutput = buildFormattedOutput(changeSummaryMessage, operationType, errorDetails, warningDetails, plannedChangeDetails, applyCompleteDetails, driftDetails, effectiveLimit);
            resolve(formattedOutput);
        });
    });
}
/**
 * Build formatted output from accumulated details, limiting by output size
 */
function buildFormattedOutput(changeSummaryMessage, operationType, errorDetails, warningDetails, plannedChangeDetails, applyCompleteDetails, driftDetails, maxSize) {
    let result = '';
    // Show change summary first
    if (changeSummaryMessage) {
        result += `${changeSummaryMessage}\n\n`;
    }
    // Format diagnostics, checking size as we add each one
    if (errorDetails.length > 0) {
        let diagnosticsSection = '<details>\n<summary>❌ Errors</summary>\n\n';
        let errorCount = 0;
        for (const err of errorDetails) {
            const errorText = `❌ **${err.summary}**` +
                (err.detail ? `\n\n${err.detail}` : '') +
                (err.filename && err.line
                    ? `\n\n📄 \`${err.filename}:${err.line}\``
                    : '') +
                (err.code ? '\n\n```hcl\n' + err.code + '\n```' : '') +
                '\n\n';
            if (maxSize &&
                (result + diagnosticsSection + errorText).length > maxSize) {
                break;
            }
            diagnosticsSection += errorText;
            errorCount++;
        }
        if (errorCount < errorDetails.length) {
            diagnosticsSection += `... (showing ${errorCount} of ${errorDetails.length} errors)\n\n`;
        }
        diagnosticsSection += '</details>\n\n';
        if (!maxSize || (result + diagnosticsSection).length <= maxSize) {
            result += diagnosticsSection;
        }
    }
    if (warningDetails.length > 0 && (!maxSize || result.length < maxSize)) {
        let diagnosticsSection = '<details>\n<summary>⚠️ Warnings</summary>\n\n';
        let warnCount = 0;
        for (const warn of warningDetails) {
            const warnText = `⚠️ **${warn.summary}**` +
                (warn.detail ? `\n\n${warn.detail}` : '') +
                (warn.filename && warn.line
                    ? `\n\n📄 \`${warn.filename}:${warn.line}\``
                    : '') +
                (warn.code ? '\n\n```hcl\n' + warn.code + '\n```' : '') +
                '\n\n';
            if (maxSize &&
                (result + diagnosticsSection + warnText).length > maxSize) {
                break;
            }
            diagnosticsSection += warnText;
            warnCount++;
        }
        if (warnCount < warningDetails.length) {
            diagnosticsSection += `... (showing ${warnCount} of ${warningDetails.length} warnings)\n\n`;
        }
        diagnosticsSection += '</details>\n\n';
        if (!maxSize || (result + diagnosticsSection).length <= maxSize) {
            result += diagnosticsSection;
        }
    }
    // Format changes, checking size
    const hasChanges = plannedChangeDetails.length > 0 || applyCompleteDetails.length > 0;
    if (hasChanges && (!maxSize || result.length < maxSize)) {
        if (operationType === 'plan' && plannedChangeDetails.length > 0) {
            let changesSection = '<details>\n<summary>📋 Planned Changes</summary>\n\n';
            let changeCount = 0;
            for (const change of plannedChangeDetails) {
                const emoji = getActionEmoji(change.action);
                const changeText = `${emoji} **${change.addr}** (${change.action})\n`;
                if (maxSize &&
                    (result + changesSection + changeText).length > maxSize) {
                    break;
                }
                changesSection += changeText;
                changeCount++;
            }
            if (changeCount < plannedChangeDetails.length) {
                changesSection += `\n... (showing ${changeCount} of ${plannedChangeDetails.length} changes)\n`;
            }
            changesSection += '\n</details>\n\n';
            if (!maxSize || (result + changesSection).length <= maxSize) {
                result += changesSection;
            }
        }
        else if (operationType === 'apply' && applyCompleteDetails.length > 0) {
            let changesSection = '<details>\n<summary>✅ Applied Changes</summary>\n\n';
            let changeCount = 0;
            for (const change of applyCompleteDetails) {
                const emoji = getActionEmoji(change.action);
                const changeText = `${emoji} **${change.addr}** (${change.action})\n`;
                if (maxSize &&
                    (result + changesSection + changeText).length > maxSize) {
                    break;
                }
                changesSection += changeText;
                changeCount++;
            }
            if (changeCount < applyCompleteDetails.length) {
                changesSection += `\n... (showing ${changeCount} of ${applyCompleteDetails.length} changes)\n`;
            }
            changesSection += '\n</details>\n\n';
            if (!maxSize || (result + changesSection).length <= maxSize) {
                result += changesSection;
            }
        }
        else if (operationType === 'unknown' && plannedChangeDetails.length > 0) {
            let changesSection = '<details>\n<summary>📋 Planned Changes</summary>\n\n';
            let changeCount = 0;
            for (const change of plannedChangeDetails) {
                const emoji = getActionEmoji(change.action);
                const changeText = `${emoji} **${change.addr}** (${change.action})\n`;
                if (maxSize &&
                    (result + changesSection + changeText).length > maxSize) {
                    break;
                }
                changesSection += changeText;
                changeCount++;
            }
            if (changeCount < plannedChangeDetails.length) {
                changesSection += `\n... (showing ${changeCount} of ${plannedChangeDetails.length} changes)\n`;
            }
            changesSection += '\n</details>\n\n';
            if (!maxSize || (result + changesSection).length <= maxSize) {
                result += changesSection;
            }
        }
    }
    // Format drifts
    if (driftDetails.length > 0 && (!maxSize || result.length < maxSize)) {
        let driftsSection = '<details>\n<summary>🔀 Resource Drift</summary>\n\n';
        let driftCount = 0;
        for (const drift of driftDetails) {
            const emoji = getActionEmoji(drift.action);
            const driftText = `${emoji} **${drift.addr}** (${drift.action})\n`;
            if (maxSize && (result + driftsSection + driftText).length > maxSize) {
                break;
            }
            driftsSection += driftText;
            driftCount++;
        }
        if (driftCount < driftDetails.length) {
            driftsSection += `\n... (showing ${driftCount} of ${driftDetails.length} drifts)\n`;
        }
        driftsSection += '\n</details>\n\n';
        if (!maxSize || (result + driftsSection).length <= maxSize) {
            result += driftsSection;
        }
    }
    return result.trim();
}

// Default implementation using the real https module
let requestImpl = https.request;
/**
 * Make an HTTPS request to the GitHub API
 */
async function httpsRequest(options, data) {
    return new Promise((resolve, reject) => {
        const req = requestImpl(options, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const body = Buffer.concat(chunks).toString('utf8');
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(body);
                }
                else {
                    reject(new Error(`HTTP ${res.statusCode}: ${body}`));
                }
            });
        });
        req.on('error', reject);
        if (data) {
            req.write(data);
        }
        req.end();
    });
}
/**
 * Get existing comments on an issue or pull request
 */
async function getExistingComments(token, repo, owner, issueNumber) {
    const options = {
        hostname: 'api.github.com',
        path: `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`,
            'User-Agent': 'tf-report-action',
            Accept: 'application/vnd.github+json'
        }
    };
    const response = await httpsRequest(options);
    return JSON.parse(response);
}
/**
 * Delete a comment from an issue or pull request
 */
async function deleteComment(token, repo, owner, commentId) {
    const options = {
        hostname: 'api.github.com',
        path: `/repos/${owner}/${repo}/issues/comments/${commentId}`,
        method: 'DELETE',
        headers: {
            Authorization: `Bearer ${token}`,
            'User-Agent': 'tf-report-action',
            Accept: 'application/vnd.github+json'
        }
    };
    await httpsRequest(options);
}
/**
 * Post a comment to an issue or pull request
 */
async function postComment(token, repo, owner, issueNumber, body) {
    const options = {
        hostname: 'api.github.com',
        path: `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'User-Agent': 'tf-report-action',
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json'
        }
    };
    const payload = JSON.stringify({ body });
    await httpsRequest(options, payload);
}
/**
 * Search for issues in a repository
 */
async function searchIssues(token, repo, owner, query) {
    const encodedQuery = encodeURIComponent(query);
    const options = {
        hostname: 'api.github.com',
        path: `/search/issues?q=${encodedQuery}`,
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`,
            'User-Agent': 'tf-report-action',
            Accept: 'application/vnd.github+json'
        }
    };
    const response = await httpsRequest(options);
    try {
        const result = JSON.parse(response);
        return result.items || [];
    }
    catch (error) {
        throw new Error(`Failed to parse search issues response: ${error.message}`);
    }
}
/**
 * Create a new issue
 */
async function createIssue(token, repo, owner, title, body) {
    const options = {
        hostname: 'api.github.com',
        path: `/repos/${owner}/${repo}/issues`,
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'User-Agent': 'tf-report-action',
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json'
        }
    };
    const payload = JSON.stringify({ title, body });
    const response = await httpsRequest(options, payload);
    try {
        const issue = JSON.parse(response);
        if (!issue.number) {
            throw new Error('API response missing issue number');
        }
        return issue.number;
    }
    catch (error) {
        throw new Error(`Failed to parse create issue response: ${error.message}`);
    }
}
/**
 * Update an existing issue
 */
async function updateIssue(token, repo, owner, issueNumber, title, body) {
    const options = {
        hostname: 'api.github.com',
        path: `/repos/${owner}/${repo}/issues/${issueNumber}`,
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${token}`,
            'User-Agent': 'tf-report-action',
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json'
        }
    };
    const payload = JSON.stringify({ title, body });
    await httpsRequest(options, payload);
}

// Month names for timestamp formatting
const MONTH_NAMES = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
];
/**
 * Provides lazy access to step output streams.
 * Avoids eagerly reading large outputs into memory.
 */
class StepOutputs {
    outputs;
    exitCode;
    constructor(outputs, exitCode) {
        this.outputs = outputs;
        this.exitCode = exitCode;
    }
    /**
     * Get a readable stream for stdout.
     * Returns a fresh stream each time.
     */
    getStdoutStream() {
        return getStepOutputStream(this.outputs, 'stdout');
    }
    /**
     * Get a readable stream for stderr.
     * Returns a fresh stream each time.
     */
    getStderrStream() {
        return getStepOutputStream(this.outputs, 'stderr');
    }
    /**
     * Get the exit code
     */
    getExitCode() {
        return this.exitCode;
    }
}
// GitHub comment max size is 65536 characters
const MAX_COMMENT_SIZE = 60000;
const MAX_OUTPUT_PER_STEP = 20000;
const COMMENT_TRUNCATION_BUFFER = 1000;
/**
 * Get a readable stream for step output data, supporting both file-based and direct outputs.
 * This is file-centric: file paths are used directly, while direct outputs are wrapped
 * in a Readable stream shim for consistent handling.
 */
function getStepOutputStream(stepOutputs, outputType) {
    if (!stepOutputs) {
        return undefined;
    }
    // Check for file-based output first (primary/expected format)
    const fileOutputKey = outputType === 'stdout'
        ? 'stdout_file'
        : 'stderr_file';
    const filePath = stepOutputs[fileOutputKey];
    if (filePath) {
        // Return a readable stream from the file
        try {
            return fs.createReadStream(filePath, { encoding: 'utf8' });
        }
        catch (error) {
            console.error(`Failed to create read stream for ${outputType} from file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return undefined;
        }
    }
    // Fall back to direct output (legacy format) - wrap in Readable stream
    const directOutput = stepOutputs[outputType];
    if (directOutput !== undefined) {
        return Readable.from([directOutput]);
    }
    return undefined;
}
/**
 * Analyze a JSON Lines stream incrementally, extracting only metadata.
 * Processes messages one at a time without accumulating them.
 */
async function analyzeJsonLinesStream(stream) {
    if (!stream) {
        return {
            isJsonLines: false,
            operationType: 'unknown',
            hasChanges: false,
            hasErrors: false
        };
    }
    let operationType = 'unknown';
    let hasChanges = false;
    let hasErrors = false;
    let changeSummaryMessage;
    let buffer = '';
    let foundJsonLine = false;
    return new Promise((resolve) => {
        stream.on('data', (chunk) => {
            buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
            // Process complete lines
            let newlineIndex;
            while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                const line = buffer.substring(0, newlineIndex).trim();
                buffer = buffer.substring(newlineIndex + 1);
                if (!line)
                    continue;
                try {
                    const parsed = JSON.parse(line);
                    foundJsonLine = true;
                    // Extract metadata from JSON Lines messages
                    // Process one message at a time without accumulation
                    if (parsed.type === 'diagnostic' && parsed['@level'] === 'error') {
                        hasErrors = true;
                    }
                    if (parsed.type === 'change_summary') {
                        const changes = parsed.changes || {};
                        operationType = changes.operation || 'unknown';
                        changeSummaryMessage = parsed['@message'];
                        const { add = 0, change: chg = 0, remove = 0, import: imp = 0 } = changes;
                        hasChanges = add > 0 || chg > 0 || remove > 0 || imp > 0;
                    }
                }
                catch {
                    // Not JSON, ignore
                }
            }
        });
        stream.on('end', () => {
            resolve({
                isJsonLines: foundJsonLine,
                operationType,
                hasChanges,
                hasErrors,
                changeSummaryMessage
            });
        });
        stream.on('error', () => {
            resolve({
                isJsonLines: foundJsonLine,
                operationType,
                hasChanges,
                hasErrors,
                changeSummaryMessage
            });
        });
    });
}
/**
 * Read limited content from a stream for comment/status message assembly.
 * Reads incrementally with size limit to avoid unbounded memory usage.
 */
async function readLimitedStreamContent(stream, maxBytes) {
    if (!stream) {
        return '';
    }
    const chunks = [];
    let totalLength = 0;
    return new Promise((resolve) => {
        stream.on('data', (chunk) => {
            const chunkStr = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
            const chunkLength = Buffer.byteLength(chunkStr, 'utf8');
            if (totalLength + chunkLength <= maxBytes) {
                chunks.push(chunkStr);
                totalLength += chunkLength;
            }
            else {
                // Reached limit, take only what fits
                const remaining = maxBytes - totalLength;
                if (remaining > 0) {
                    chunks.push(chunkStr.substring(0, remaining));
                }
                stream.destroy(); // Stop reading
                resolve(chunks.join(''));
            }
        });
        stream.on('end', () => {
            resolve(chunks.join(''));
        });
        stream.on('error', (error) => {
            console.error(`Error reading stream: ${error.message}`);
            resolve(chunks.join('')); // Return what we have
        });
    });
}
/**
 * Get an input value from the environment
 */
function getInput(name) {
    const val = process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] || '';
    return val.trim();
}
/**
 * Log an informational message
 */
function info(message) {
    console.log(message);
}
/**
 * Set the action as failed and exit
 */
function setFailed(message) {
    console.error(`::error::${message}`);
    process.exit(1);
}
/**
 * Get the GitHub workflow run logs URL
 */
function getJobLogsUrl() {
    const repo = process.env.GITHUB_REPOSITORY || '';
    const runId = process.env.GITHUB_RUN_ID || '';
    if (repo && runId) {
        const runAttempt = process.env.GITHUB_RUN_ATTEMPT || '1';
        return `https://github.com/${repo}/actions/runs/${runId}/attempts/${runAttempt}`;
    }
    return '';
}
/**
 * Format a date in a human-friendly format in UTC with 24-hour time
 * Example: "January 22, 2026 at 19:05 UTC"
 */
function formatTimestamp(date) {
    const month = MONTH_NAMES[date.getUTCMonth()];
    const day = date.getUTCDate();
    const year = date.getUTCFullYear();
    const hours = date.getUTCHours();
    const minutes = date.getUTCMinutes();
    const hoursStr = hours < 10 ? `0${hours}` : `${hours}`;
    const minutesStr = minutes < 10 ? `0${minutes}` : `${minutes}`;
    return `${month} ${day}, ${year} at ${hoursStr}:${minutesStr} UTC`;
}
function truncateOutput(text, maxLength, includeLogLink = false) {
    if (text.length <= maxLength)
        return text;
    const logLink = includeLogLink ? getJobLogsUrl() : '';
    const truncationMessage = logLink
        ? `\n\n... [output truncated - [view full logs](${logLink})] ...\n\n`
        : '\n\n... [output truncated] ...\n\n';
    const availableLength = maxLength - truncationMessage.length;
    if (availableLength <= 0) {
        return text.substring(0, maxLength);
    }
    const halfLength = Math.floor(availableLength / 2);
    return (text.substring(0, halfLength) +
        truncationMessage +
        text.substring(text.length - halfLength));
}
async function analyzeSteps(steps, targetStep) {
    const stepEntries = Object.entries(steps);
    const totalSteps = stepEntries.length;
    const failedSteps = [];
    let successfulSteps = 0;
    let skippedSteps = 0;
    let targetStepResult;
    for (const [stepName, stepData] of stepEntries) {
        // Use outcome instead of conclusion as per requirements
        const outcome = stepData.outcome || stepData.conclusion || '';
        // Check if this is the target step
        if (targetStep && stepName === targetStep) {
            const stepOutputs = new StepOutputs(stepData.outputs, stepData.outputs?.exit_code);
            // Analyze stdout stream incrementally for metadata only
            const stdoutStream = stepOutputs.getStdoutStream();
            const analysis = await analyzeJsonLinesStream(stdoutStream);
            targetStepResult = {
                name: stepName,
                found: true,
                conclusion: outcome,
                outputs: stepOutputs,
                isJsonLines: analysis.isJsonLines,
                operationType: analysis.operationType,
                hasChanges: analysis.hasChanges,
                hasErrors: analysis.hasErrors,
                changeSummaryMessage: analysis.changeSummaryMessage
            };
        }
        // Count step outcomes
        if (outcome === 'success') {
            successfulSteps++;
        }
        else if (outcome === 'skipped') {
            skippedSteps++;
        }
        else if (outcome && outcome !== 'cancelled' && outcome !== 'neutral') {
            // Treat as failure if not success, skipped, cancelled, or neutral
            const failure = {
                name: stepName,
                conclusion: outcome,
                outputs: new StepOutputs(stepData.outputs, stepData.outputs?.exit_code)
            };
            failedSteps.push(failure);
        }
    }
    // If target step was specified but not found
    if (targetStep && !targetStepResult) {
        targetStepResult = {
            name: targetStep,
            found: false
        };
    }
    return {
        success: failedSteps.length === 0,
        failedSteps,
        totalSteps,
        successfulSteps,
        skippedSteps,
        targetStepResult
    };
}
async function generateCommentBody(workspace, analysis, includeLogLink = false, timestamp) {
    const { success, failedSteps, totalSteps, successfulSteps, skippedSteps, targetStepResult } = analysis;
    const marker = `<!-- tf-report-action:"${workspace}" -->`;
    const title = generateTitle(workspace, analysis);
    let comment = `${marker}\n\n## ${title}\n\n`;
    if (targetStepResult) {
        // Target step focused comment
        if (!targetStepResult.found) {
            if (failedSteps.length > 0) {
                // If there are failed steps, focus on reporting those failures
                comment += `${failedSteps.length} of ${totalSteps} step(s) failed:\n\n`;
                for (const step of failedSteps) {
                    comment += `- ❌ \`${step.name}\` (${step.conclusion})\n`;
                }
            }
            else {
                // Only mention step not found if no other failures
                comment += `### Did Not Run\n\n`;
                comment += `\`${targetStepResult.name}\` was not found in the workflow steps.\n\n`;
            }
        }
        else if (targetStepResult.conclusion === 'success') {
            // Success case - show stdout/stderr if available (pass stream getters)
            const { formattedContent } = await formatOutput(targetStepResult.outputs
                ? () => targetStepResult.outputs.getStdoutStream()
                : undefined, targetStepResult.outputs
                ? () => targetStepResult.outputs.getStderrStream()
                : undefined, MAX_OUTPUT_PER_STEP);
            if (!formattedContent) {
                comment += `> [!NOTE]\n> Completed successfully with no output.\n\n`;
            }
            else {
                comment += formattedContent;
            }
        }
        else {
            // Target step failed or has other status
            comment += `**Status:** ${targetStepResult.conclusion}\n`;
            const exitCode = targetStepResult.outputs?.getExitCode();
            if (exitCode) {
                comment += `**Exit Code:** ${exitCode}\n`;
            }
            comment += '\n';
            const { formattedContent } = await formatOutput(targetStepResult.outputs
                ? () => targetStepResult.outputs.getStdoutStream()
                : undefined, targetStepResult.outputs
                ? () => targetStepResult.outputs.getStderrStream()
                : undefined, MAX_OUTPUT_PER_STEP);
            if (!formattedContent) {
                comment += `> [!NOTE]\n> Failed with no output.\n\n`;
            }
            else {
                comment += formattedContent;
            }
        }
    }
    else {
        // Normal mode - show all failed steps or success summary
        if (success) {
            // Check if all steps were skipped
            if (skippedSteps === totalSteps) {
                comment += `All ${totalSteps} step(s) were skipped.\n`;
            }
            else {
                // Generate summary based on step counts
                const parts = [];
                if (successfulSteps > 0) {
                    parts.push(`${successfulSteps} succeeded`);
                }
                if (skippedSteps > 0) {
                    parts.push(`${skippedSteps} skipped`);
                }
                if (parts.length > 0) {
                    comment += `${parts.join(', ')} (${totalSteps} total)\n`;
                }
                else {
                    comment += `${totalSteps} step(s) completed\n`;
                }
            }
        }
        else {
            // Focus on failures
            comment += `${failedSteps.length} of ${totalSteps} step(s) failed:\n\n`;
            for (const step of failedSteps) {
                comment += `#### ❌ Step: \`${step.name}\`\n\n`;
                comment += `**Status:** ${step.conclusion}\n`;
                const exitCode = step.outputs.getExitCode();
                if (exitCode) {
                    comment += `**Exit Code:** ${exitCode}\n`;
                }
                comment += '\n';
                const { formattedContent } = await formatOutput(() => step.outputs.getStdoutStream(), () => step.outputs.getStderrStream(), MAX_OUTPUT_PER_STEP);
                if (!formattedContent) {
                    comment += `> [!NOTE]\n> Failed with no output.\n\n`;
                }
                else {
                    comment += formattedContent;
                }
            }
        }
    }
    // Add footer with logs link and optional timestamp
    if (includeLogLink) {
        const logUrl = getJobLogsUrl();
        const formattedTime = timestamp ? formatTimestamp(timestamp) : '';
        comment += `\n---\n\n`;
        if (logUrl) {
            comment += `[View logs](${logUrl})`;
        }
        if (formattedTime) {
            if (logUrl) {
                comment += ` • `;
            }
            comment += `Last updated: ${formattedTime}`;
        }
        comment += `\n`;
    }
    // Final safety check
    if (comment.length > MAX_COMMENT_SIZE) {
        const availableSpace = MAX_COMMENT_SIZE - COMMENT_TRUNCATION_BUFFER;
        comment =
            comment.substring(0, availableSpace) + '\n\n... [comment truncated] ...\n';
    }
    return comment;
}
function getWorkspaceMarker(workspace) {
    // Escape characters that could break HTML comments or search queries
    // Replace: double quotes, HTML comment end sequences (both --> and --!>), and backslashes
    const escapedWorkspace = workspace
        .replace(/\\/g, '\\\\') // Escape backslashes first
        .replace(/"/g, '\\"') // Escape double quotes
        .replace(/--[!>]/g, (match) => `--\\${match.charAt(2)}`); // Escape HTML comment end sequences
    return `<!-- tf-report-action:"${escapedWorkspace}" -->`;
}
/**
 * Generate title for PR comments (dynamic with status icons)
 */
function generateTitle(workspace, analysis) {
    const { success, targetStepResult } = analysis;
    let statusIcon = '';
    let statusText = '';
    if (targetStepResult) {
        // Target step mode
        // Show as failure if target step didn't run or overall workflow failed
        const showAsFailure = !targetStepResult.found || !success;
        // Check for "No Changes" case for successful plan with no changes
        if (!showAsFailure &&
            targetStepResult.isJsonLines &&
            targetStepResult.operationType === 'plan' &&
            !targetStepResult.hasChanges &&
            !targetStepResult.hasErrors) {
            statusIcon = '✅';
            statusText = 'No Changes';
            return `${statusIcon} \`${workspace}\` \`${targetStepResult.name}\` ${statusText}`;
        }
        // For successful plan/apply with changes, use the change summary
        if (!showAsFailure &&
            targetStepResult.isJsonLines &&
            targetStepResult.changeSummaryMessage &&
            (targetStepResult.operationType === 'plan' ||
                targetStepResult.operationType === 'apply')) {
            statusIcon = '✅';
            // Strip the prefix from the change summary message
            let summary = targetStepResult.changeSummaryMessage;
            if (summary.startsWith('Plan: ')) {
                summary = summary.substring('Plan: '.length);
            }
            else if (summary.startsWith('Apply complete! Resources: ')) {
                summary = summary.substring('Apply complete! Resources: '.length);
            }
            // Remove trailing period if present
            if (summary.endsWith('.')) {
                summary = summary.slice(0, -1);
            }
            return `${statusIcon} \`${workspace}\` \`${targetStepResult.name}\`: ${summary}`;
        }
        statusIcon = showAsFailure ? '❌' : '✅';
        statusText = showAsFailure ? 'Failed' : 'Succeeded';
        return `${statusIcon} \`${workspace}\` \`${targetStepResult.name}\` ${statusText}`;
    }
    else {
        // Normal mode
        statusIcon = success ? '✅' : '❌';
        statusText = success ? 'Succeeded' : 'Failed';
        return `${statusIcon} \`${workspace}\` ${statusText}`;
    }
}
/**
 * Generate static title for status issues (fixed format)
 */
function generateStatusIssueTitle(workspace) {
    return `:bar_chart: \`${workspace}\` Status`;
}
/**
 * Format output from streams, detecting and handling JSON Lines format.
 * Limits based on formatted output size.
 */
async function formatOutput(getStdoutStream, getStderrStream, maxSize = MAX_OUTPUT_PER_STEP) {
    // Check if stdout is JSON Lines format (with fresh stream for detection)
    if (getStdoutStream) {
        const detectionStream = getStdoutStream();
        const isJsonLinesFormat = await isJsonLinesStream(detectionStream);
        if (isJsonLinesFormat) {
            // Get a fresh stream for formatting
            const formattingStream = getStdoutStream();
            const formatted = await formatJsonLinesStream(formattingStream, maxSize);
            if (formatted.trim().length > 0) {
                return { formattedContent: formatted, isJsonLines: true };
            }
        }
    }
    // Fall back to standard output formatting with limited reading
    let content = '';
    if (getStdoutStream) {
        const stdoutStream = getStdoutStream();
        const stdout = await readLimitedStreamContent(stdoutStream, maxSize);
        if (stdout && stdout.trim().length > 0) {
            const truncated = truncateOutput(stdout, maxSize, true);
            content += `<details>\n<summary>📄 Output</summary>\n\n\`\`\`\n${truncated}\n\`\`\`\n</details>\n\n`;
        }
    }
    if (getStderrStream) {
        const stderrStream = getStderrStream();
        const stderr = await readLimitedStreamContent(stderrStream, maxSize);
        if (stderr && stderr.trim().length > 0) {
            const truncated = truncateOutput(stderr, maxSize, true);
            content += `<details>\n<summary>⚠️ Errors</summary>\n\n\`\`\`\n${truncated}\n\`\`\`\n</details>\n\n`;
        }
    }
    if (!content) {
        return { formattedContent: '', isJsonLines: false };
    }
    return { formattedContent: content, isJsonLines: false };
}
async function run() {
    try {
        const stepsInput = getInput('steps');
        let workspace = getInput('workspace');
        const targetStep = getInput('target-step');
        if (!stepsInput) {
            setFailed('steps input is required');
            return;
        }
        // If workspace is not provided, use workflow name and job name
        if (!workspace) {
            const workflowName = process.env.GITHUB_WORKFLOW || 'Workflow';
            const jobName = process.env.GITHUB_JOB || 'Job';
            workspace = `${workflowName}/${jobName}`;
            info(`No workspace provided, using: \`${workspace}\``);
        }
        let steps;
        try {
            steps = JSON.parse(stepsInput);
        }
        catch (error) {
            setFailed(`Failed to parse steps input as JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return;
        }
        info(`Analyzing ${Object.keys(steps).length} steps for workspace: \`${workspace}\`${targetStep ? ` (target: \`${targetStep}\`)` : ''}`);
        const analysis = await analyzeSteps(steps, targetStep);
        info(`Analysis complete: ${analysis.success ? 'Success' : `Failed (${analysis.failedSteps.length} failures)`}`);
        const context = {
            repo: process.env.GITHUB_REPOSITORY || '',
            eventName: process.env.GITHUB_EVENT_NAME || ''
        };
        if (!context.repo) {
            info('GITHUB_REPOSITORY not set, skipping comment/issue');
            return;
        }
        const repoParts = context.repo.split('/');
        if (repoParts.length !== 2) {
            info(`Invalid GITHUB_REPOSITORY format: ${context.repo}, skipping comment/issue`);
            return;
        }
        const [owner, repo] = repoParts;
        const token = getInput('github-token');
        if (!token) {
            setFailed('github-token input is required to post comments/issues. Use: github-token: ${{ github.token }}');
            return;
        }
        const marker = getWorkspaceMarker(workspace);
        info(`Comment/Issue body length calculation in progress...`);
        let issueNumber;
        // Check if this is a pull request event
        if (context.eventName === 'pull_request' ||
            context.eventName === 'pull_request_target') {
            const eventPath = process.env.GITHUB_EVENT_PATH;
            if (eventPath) {
                try {
                    const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
                    issueNumber = event.pull_request?.number;
                }
                catch (error) {
                    info(`Failed to read GitHub event file: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }
        }
        if (issueNumber) {
            // PR context: post as comment
            // Include log link when there are changes planned or applied
            const hasChanges = analysis.targetStepResult?.hasChanges ||
                analysis.targetStepResult?.operationType === 'apply';
            const includeLogLink = !!hasChanges;
            info(`Running in PR context - posting as comment${includeLogLink ? ' with logs link' : ''}`);
            const commentBody = await generateCommentBody(workspace, analysis, includeLogLink);
            info(`Comment body length: ${commentBody.length} characters`);
            const existingComments = await getExistingComments(token, repo, owner, issueNumber);
            for (const comment of existingComments) {
                if (comment.body && comment.body.includes(marker)) {
                    info(`Deleting previous comment for workspace: \`${workspace}\``);
                    await deleteComment(token, repo, owner, comment.id);
                }
            }
            info(`Posting new comment for workspace: \`${workspace}\``);
            await postComment(token, repo, owner, issueNumber, commentBody);
            info('Comment posted successfully');
        }
        else {
            // Non-PR context: use status issue (include log link and timestamp)
            info('Not in PR context - using status issue');
            const timestamp = new Date();
            const statusIssueBody = await generateCommentBody(workspace, analysis, true, timestamp);
            const statusIssueTitle = generateStatusIssueTitle(workspace);
            info(`Status issue title: "${statusIssueTitle}"`);
            info(`Status issue body length: ${statusIssueBody.length} characters`);
            // Search for existing status issue with the marker in body
            const query = `repo:${owner}/${repo} is:issue in:body "${marker}"`;
            const existingIssues = await searchIssues(token, repo, owner, query);
            let statusIssueNumber;
            // Find the issue that matches our workspace marker
            for (const issue of existingIssues) {
                if (issue.body && issue.body.includes(marker)) {
                    statusIssueNumber = issue.number;
                    info(`Found existing status issue #${statusIssueNumber} for workspace: \`${workspace}\``);
                    break;
                }
            }
            if (statusIssueNumber) {
                // Update existing issue
                info(`Updating status issue #${statusIssueNumber}`);
                await updateIssue(token, repo, owner, statusIssueNumber, statusIssueTitle, statusIssueBody);
                info('Status issue updated successfully');
            }
            else {
                // Create new issue
                info(`Creating new status issue for workspace: \`${workspace}\``);
                statusIssueNumber = await createIssue(token, repo, owner, statusIssueTitle, statusIssueBody);
                info(`Status issue #${statusIssueNumber} created successfully`);
            }
        }
    }
    catch (error) {
        if (error instanceof Error) {
            setFailed(error.message);
        }
        else {
            setFailed('An unknown error occurred');
        }
    }
}
// Run the action if this is the main module
if (import.meta.url === `file://${process.argv[1]}` ||
    import.meta.url.endsWith(process.argv[1])) {
    run();
}

export { StepOutputs, analyzeSteps, formatJsonLinesStream, formatTimestamp, generateCommentBody, generateStatusIssueTitle, generateTitle, getInput, getJobLogsUrl, getStepOutputStream, getWorkspaceMarker, isJsonLinesStream, setFailed, truncateOutput };
//# sourceMappingURL=index.js.map
