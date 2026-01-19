import * as https from 'https';
import * as fs from 'fs';

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
            comment += `### Did Not Run\n\n`;
            comment += `The target step \`${targetStepResult.name}\` was not found in the workflow steps.\n\n`;
            if (failedSteps.length > 0) {
                comment += `${failedSteps.length} of ${totalSteps} step(s) failed:\n\n`;
                for (const step of failedSteps) {
                    comment += `- ❌ \`${step.name}\` (${step.conclusion})\n`;
                }
            }
        }
        else if (targetStepResult.conclusion === 'success') {
            // Success case - show stdout/stderr if available
            const hasStdout = targetStepResult.stdout && targetStepResult.stdout.trim().length > 0;
            const hasStderr = targetStepResult.stderr && targetStepResult.stderr.trim().length > 0;
            if (!hasStdout && !hasStderr) {
                comment += `> [!NOTE]\n> The step completed successfully with no output.\n\n`;
            }
            else {
                if (hasStdout) {
                    const truncated = truncateOutput(targetStepResult.stdout, MAX_OUTPUT_PER_STEP, true);
                    comment += `<details>\n<summary>📄 Output</summary>\n\n\`\`\`\n${truncated}\n\`\`\`\n</details>\n\n`;
                }
                if (hasStderr) {
                    const truncated = truncateOutput(targetStepResult.stderr, MAX_OUTPUT_PER_STEP, true);
                    comment += `<details>\n<summary>⚠️ Errors</summary>\n\n\`\`\`\n${truncated}\n\`\`\`\n</details>\n\n`;
                }
            }
        }
        else {
            // Target step failed or has other status
            comment += `**Status:** ${targetStepResult.conclusion}\n`;
            if (targetStepResult.exitCode) {
                comment += `**Exit Code:** ${targetStepResult.exitCode}\n`;
            }
            comment += '\n';
            const hasStdout = targetStepResult.stdout && targetStepResult.stdout.trim().length > 0;
            const hasStderr = targetStepResult.stderr && targetStepResult.stderr.trim().length > 0;
            if (!hasStdout && !hasStderr) {
                comment += `> [!NOTE]\n> The step failed with no output.\n\n`;
            }
            else {
                if (hasStdout) {
                    const truncated = truncateOutput(targetStepResult.stdout, MAX_OUTPUT_PER_STEP, true);
                    comment += `<details>\n<summary>📄 Output</summary>\n\n\`\`\`\n${truncated}\n\`\`\`\n</details>\n\n`;
                }
                if (hasStderr) {
                    const truncated = truncateOutput(targetStepResult.stderr, MAX_OUTPUT_PER_STEP, true);
                    comment += `<details>\n<summary>⚠️ Errors</summary>\n\n\`\`\`\n${truncated}\n\`\`\`\n</details>\n\n`;
                }
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
                const hasStdout = step.stdout && step.stdout.trim().length > 0;
                const hasStderr = step.stderr && step.stderr.trim().length > 0;
                if (!hasStdout && !hasStderr) {
                    comment += `> [!NOTE]\n> The step failed with no output.\n\n`;
                }
                else {
                    if (hasStdout) {
                        const truncated = truncateOutput(step.stdout, MAX_OUTPUT_PER_STEP, true);
                        comment += `<details>\n<summary>📄 Output</summary>\n\n\`\`\`\n${truncated}\n\`\`\`\n</details>\n\n`;
                    }
                    if (hasStderr) {
                        const truncated = truncateOutput(step.stderr, MAX_OUTPUT_PER_STEP, true);
                        comment += `<details>\n<summary>⚠️ Errors</summary>\n\n\`\`\`\n${truncated}\n\`\`\`\n</details>\n\n`;
                    }
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
            info(`No workspace provided, using: ${workspace}`);
        }
        let steps;
        try {
            steps = JSON.parse(stepsInput);
        }
        catch (error) {
            setFailed(`Failed to parse steps input as JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return;
        }
        info(`Analyzing ${Object.keys(steps).length} steps for workspace: ${workspace}${targetStep ? ` (target: ${targetStep})` : ''}`);
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
                info(`Deleting previous comment for workspace: ${workspace}`);
                await deleteComment(token, repo, owner, comment.id);
            }
        }
        info(`Posting new comment for workspace: ${workspace}`);
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
