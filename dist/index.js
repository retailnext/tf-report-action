import * as https from 'https';
import * as fs from 'fs';

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
 * Check if a string appears to be JSON Lines format
 */
function isJsonLines(text) {
    if (!text || text.trim().length === 0) {
        return false;
    }
    const lines = text.split('\n').filter((line) => line.trim().length > 0);
    // Need at least one line
    if (lines.length === 0) {
        return false;
    }
    // Check if first few lines are valid JSON objects with required fields
    const samplesToCheck = Math.min(lines.length, 3);
    let validJsonCount = 0;
    for (let i = 0; i < samplesToCheck; i++) {
        try {
            const parsed = JSON.parse(lines[i]);
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
    }
    // If at least one line is valid JSON with required fields, consider it JSON Lines
    return validJsonCount > 0;
}
/**
 * Parse JSON Lines output into structured messages
 */
function parseJsonLines(text) {
    const lines = text.split('\n').filter((line) => line.trim().length > 0);
    const messages = [];
    const diagnostics = [];
    const plannedChanges = [];
    const resourceDrifts = [];
    let changeSummary;
    let outputs;
    let hasErrors = false;
    for (const line of lines) {
        try {
            const parsed = JSON.parse(line);
            messages.push(parsed);
            // Categorize by type
            switch (parsed.type) {
                case 'diagnostic':
                    diagnostics.push(parsed);
                    if (parsed.diagnostic.severity === 'error') {
                        hasErrors = true;
                    }
                    break;
                case 'planned_change':
                    plannedChanges.push(parsed);
                    break;
                case 'change_summary':
                    changeSummary = parsed;
                    break;
                case 'resource_drift':
                    resourceDrifts.push(parsed);
                    break;
                case 'outputs':
                    outputs = parsed;
                    break;
            }
        }
        catch {
            // Skip lines that aren't valid JSON
        }
    }
    return {
        messages,
        diagnostics,
        plannedChanges,
        changeSummary,
        resourceDrifts,
        outputs,
        hasErrors
    };
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
 * Format a planned change for display
 */
function formatPlannedChange(change) {
    const emoji = getActionEmoji(change.change.action);
    const resource = change.change.resource;
    const addr = resource.addr || `${resource.resource_type}.${resource.resource_name}`;
    return `${emoji} **${addr}** (${change.change.action})`;
}
/**
 * Format a diagnostic message for display
 */
function formatDiagnostic(diag) {
    const icon = diag.diagnostic.severity === 'error'
        ? '❌'
        : diag.diagnostic.severity === 'warning'
            ? '⚠️'
            : 'ℹ️';
    let result = `${icon} **${diag.diagnostic.summary}**`;
    if (diag.diagnostic.detail) {
        result += `\n\n${diag.diagnostic.detail}`;
    }
    if (diag.diagnostic.range) {
        result += `\n\n📄 \`${diag.diagnostic.range.filename}:${diag.diagnostic.range.start.line}\``;
    }
    if (diag.diagnostic.snippet?.code) {
        result += '\n\n```hcl\n' + diag.diagnostic.snippet.code + '\n```';
    }
    return result;
}
/**
 * Format change summary for display
 */
function formatChangeSummary(summary) {
    const { add, change, remove } = summary.changes;
    const operation = summary.changes.operation.charAt(0).toUpperCase() +
        summary.changes.operation.slice(1);
    const parts = [];
    if (add > 0)
        parts.push(`**${add}** to add :heavy_plus_sign:`);
    if (change > 0)
        parts.push(`**${change}** to change 🔄`);
    if (remove > 0)
        parts.push(`**${remove}** to remove :heavy_minus_sign:`);
    if (parts.length === 0) {
        return `**${operation}:** No changes.`;
    }
    return `**${operation}:** ${parts.join(', ')}`;
}
/**
 * Format parsed JSON Lines into a markdown comment
 */
function formatJsonLines(parsed) {
    let result = '';
    // Show change summary first (outside of any collapsing)
    if (parsed.changeSummary) {
        result += formatChangeSummary(parsed.changeSummary) + '\n\n';
    }
    // Show diagnostics (errors and warnings)
    if (parsed.diagnostics.length > 0) {
        const errors = parsed.diagnostics.filter((d) => d.diagnostic.severity === 'error');
        const warnings = parsed.diagnostics.filter((d) => d.diagnostic.severity === 'warning');
        if (errors.length > 0) {
            result += '### ❌ Errors\n\n';
            for (const error of errors) {
                result += formatDiagnostic(error) + '\n\n';
            }
        }
        if (warnings.length > 0) {
            result += '### ⚠️ Warnings\n\n';
            for (const warning of warnings) {
                result += formatDiagnostic(warning) + '\n\n';
            }
        }
    }
    // Show planned changes in a collapsible section
    if (parsed.plannedChanges.length > 0) {
        result += '<details>\n<summary>📋 Planned Changes</summary>\n\n';
        for (const change of parsed.plannedChanges) {
            result += formatPlannedChange(change) + '\n';
        }
        result += '\n</details>\n\n';
    }
    // Show resource drifts if any
    if (parsed.resourceDrifts.length > 0) {
        result += '<details>\n<summary>🔀 Resource Drift</summary>\n\n';
        for (const drift of parsed.resourceDrifts) {
            const emoji = getActionEmoji(drift.change.action);
            const addr = drift.change.resource.addr ||
                `${drift.change.resource.resource_type}.${drift.change.resource.resource_name}`;
            result += `${emoji} **${addr}** (${drift.change.action})\n`;
        }
        result += '\n</details>\n\n';
    }
    return result.trim();
}

// GitHub comment max size is 65536 characters
const MAX_COMMENT_SIZE = 60000;
const MAX_OUTPUT_PER_STEP = 20000;
const COMMENT_TRUNCATION_BUFFER = 1000;
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
async function httpsRequest(options, data) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
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
 * Get the GitHub job logs URL
 */
function getJobLogsUrl() {
    const repo = process.env.GITHUB_REPOSITORY || '';
    const runId = process.env.GITHUB_RUN_ID || '';
    const runAttempt = process.env.GITHUB_RUN_ATTEMPT || '1';
    if (repo && runId) {
        return `https://github.com/${repo}/actions/runs/${runId}/attempts/${runAttempt}`;
    }
    return '';
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
function analyzeSteps(steps, targetStep) {
    const stepEntries = Object.entries(steps);
    const totalSteps = stepEntries.length;
    const failedSteps = [];
    let targetStepResult;
    for (const [stepName, stepData] of stepEntries) {
        const conclusion = stepData.conclusion || stepData.outcome || '';
        // Check if this is the target step
        if (targetStep && stepName === targetStep) {
            targetStepResult = {
                name: stepName,
                found: true,
                conclusion,
                stdout: stepData.outputs?.stdout,
                stderr: stepData.outputs?.stderr,
                exitCode: stepData.outputs?.exit_code
            };
        }
        // Treat as failure if not success, skipped, cancelled, or neutral
        if (conclusion &&
            conclusion !== 'success' &&
            conclusion !== 'skipped' &&
            conclusion !== 'cancelled' &&
            conclusion !== 'neutral') {
            const failure = {
                name: stepName,
                conclusion,
                stdout: stepData.outputs?.stdout,
                stderr: stepData.outputs?.stderr,
                exitCode: stepData.outputs?.exit_code
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
        targetStepResult
    };
}
function generateCommentBody(workspace, analysis) {
    const { success, failedSteps, totalSteps, targetStepResult } = analysis;
    const marker = `<!-- tf-report-action:"${workspace}" -->`;
    let title = '';
    let statusIcon = '';
    let statusText = '';
    if (targetStepResult) {
        // Target step mode
        // Show as failure if target step didn't run or overall workflow failed
        const showAsFailure = !targetStepResult.found || !success;
        statusIcon = showAsFailure ? '❌' : '✅';
        statusText = showAsFailure ? 'Failed' : 'Succeeded';
        title = `## ${statusIcon} \`${workspace}\` \`${targetStepResult.name}\` ${statusText}`;
    }
    else {
        // Normal mode
        statusIcon = success ? '✅' : '❌';
        statusText = success ? 'Succeeded' : 'Failed';
        title = `## ${statusIcon} \`${workspace}\` ${statusText}`;
    }
    let comment = `${marker}\n\n${title}\n\n`;
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
            // Success case - show stdout/stderr if available
            const stdout = targetStepResult.stdout;
            const stderr = targetStepResult.stderr;
            const { formattedContent } = formatOutput(stdout, stderr);
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
            if (targetStepResult.exitCode) {
                comment += `**Exit Code:** ${targetStepResult.exitCode}\n`;
            }
            comment += '\n';
            const stdout = targetStepResult.stdout;
            const stderr = targetStepResult.stderr;
            const { formattedContent } = formatOutput(stdout, stderr);
            if (!formattedContent) {
                comment += `> [!NOTE]\n> Failed with no output.\n\n`;
            }
            else {
                comment += formattedContent;
            }
        }
    }
    else {
        // Normal mode - show all failed steps
        if (success) {
            comment += `All ${totalSteps} step(s) completed successfully.\n`;
        }
        else {
            comment += `${failedSteps.length} of ${totalSteps} step(s) failed:\n\n`;
            for (const step of failedSteps) {
                comment += `#### ❌ Step: \`${step.name}\`\n\n`;
                comment += `**Status:** ${step.conclusion}\n`;
                if (step.exitCode) {
                    comment += `**Exit Code:** ${step.exitCode}\n`;
                }
                comment += '\n';
                const { formattedContent } = formatOutput(step.stdout, step.stderr);
                if (!formattedContent) {
                    comment += `> [!NOTE]\n> Failed with no output.\n\n`;
                }
                else {
                    comment += formattedContent;
                }
            }
        }
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
    return `<!-- tf-report-action:"${workspace}" -->`;
}
/**
 * Format output, detecting and handling JSON Lines format
 */
function formatOutput(stdout, stderr) {
    const hasStdout = stdout && stdout.trim().length > 0;
    const hasStderr = stderr && stderr.trim().length > 0;
    // Check if stdout is JSON Lines format
    if (hasStdout && stdout && isJsonLines(stdout)) {
        const parsed = parseJsonLines(stdout);
        const formatted = formatJsonLines(parsed);
        if (formatted.trim().length > 0) {
            return { formattedContent: formatted, isJsonLines: true };
        }
    }
    // Fall back to standard output formatting
    let content = '';
    if (!hasStdout && !hasStderr) {
        return { formattedContent: '', isJsonLines: false };
    }
    if (hasStdout && stdout) {
        const truncated = truncateOutput(stdout, MAX_OUTPUT_PER_STEP, true);
        content += `<details>\n<summary>📄 Output</summary>\n\n\`\`\`\n${truncated}\n\`\`\`\n</details>\n\n`;
    }
    if (hasStderr && stderr) {
        const truncated = truncateOutput(stderr, MAX_OUTPUT_PER_STEP, true);
        content += `<details>\n<summary>⚠️ Errors</summary>\n\n\`\`\`\n${truncated}\n\`\`\`\n</details>\n\n`;
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
        const analysis = analyzeSteps(steps, targetStep);
        info(`Analysis complete: ${analysis.success ? 'Success' : `Failed (${analysis.failedSteps.length} failures)`}`);
        const context = {
            repo: process.env.GITHUB_REPOSITORY || '',
            eventName: process.env.GITHUB_EVENT_NAME || ''
        };
        if (!context.repo) {
            info('GITHUB_REPOSITORY not set, skipping comment');
            return;
        }
        const repoParts = context.repo.split('/');
        if (repoParts.length !== 2) {
            info(`Invalid GITHUB_REPOSITORY format: ${context.repo}, skipping comment`);
            return;
        }
        const [owner, repo] = repoParts;
        let issueNumber;
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
        if (!issueNumber) {
            setFailed('Not a pull request event - cannot post comment. This action must run in a pull_request event.');
            return;
        }
        const token = getInput('github-token');
        if (!token) {
            setFailed('github-token input is required to post comments. Use: github-token: ${{ github.token }}');
            return;
        }
        const commentBody = generateCommentBody(workspace, analysis);
        const marker = getWorkspaceMarker(workspace);
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

export { analyzeSteps, generateCommentBody, getInput, getJobLogsUrl, getWorkspaceMarker, setFailed, truncateOutput };
//# sourceMappingURL=index.js.map
