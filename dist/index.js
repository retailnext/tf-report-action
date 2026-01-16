"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInput = getInput;
exports.setFailed = setFailed;
exports.truncateOutput = truncateOutput;
exports.analyzeSteps = analyzeSteps;
exports.generateCommentBody = generateCommentBody;
exports.getWorkspaceMarker = getWorkspaceMarker;
const https = __importStar(require("https"));
const fs = __importStar(require("fs"));
// GitHub comment max size is 65536 characters
const MAX_COMMENT_SIZE = 60000;
const MAX_OUTPUT_PER_STEP = 20000;
function getInput(name) {
    const val = process.env[`INPUT_${name.replace(/[ -]/g, '_').toUpperCase()}`] || '';
    return val.trim();
}
function setFailed(message) {
    console.error(`::error::${message}`);
    process.exit(1);
}
async function httpsRequest(options, data) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
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
            'Authorization': `token ${token}`,
            'User-Agent': 'tf-report-action',
            'Accept': 'application/vnd.github.v3+json'
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
            'Authorization': `token ${token}`,
            'User-Agent': 'tf-report-action',
            'Accept': 'application/vnd.github.v3+json'
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
            'Authorization': `token ${token}`,
            'User-Agent': 'tf-report-action',
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        }
    };
    const payload = JSON.stringify({ body });
    await httpsRequest(options, payload);
}
function truncateOutput(text, maxLength) {
    if (text.length <= maxLength)
        return text;
    const halfLength = Math.floor(maxLength / 2);
    return text.substring(0, halfLength) +
        '\n\n... [output truncated] ...\n\n' +
        text.substring(text.length - halfLength);
}
function analyzeSteps(steps) {
    const stepEntries = Object.entries(steps);
    const totalSteps = stepEntries.length;
    const failedSteps = [];
    for (const [stepName, stepData] of stepEntries) {
        const conclusion = stepData.conclusion || stepData.outcome || '';
        if (conclusion && conclusion !== 'success' && conclusion !== 'skipped') {
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
    return {
        success: failedSteps.length === 0,
        failedSteps,
        totalSteps
    };
}
function generateCommentBody(workspace, analysis) {
    const { success, failedSteps, totalSteps } = analysis;
    const marker = `<!-- tf-report-action:${workspace} -->`;
    const statusIcon = success ? '✅' : '❌';
    const statusText = success ? 'Success' : 'Failed';
    let comment = `${marker}\n\n`;
    comment += `## OpenTofu Workflow Report - \`${workspace}\`\n\n`;
    comment += `### ${statusIcon} ${statusText}\n\n`;
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
            if (step.stdout) {
                const truncatedStdout = truncateOutput(step.stdout, MAX_OUTPUT_PER_STEP);
                comment += `<details>\n<summary>📄 Output</summary>\n\n\`\`\`\n${truncatedStdout}\n\`\`\`\n</details>\n\n`;
            }
            if (step.stderr) {
                const truncatedStderr = truncateOutput(step.stderr, MAX_OUTPUT_PER_STEP);
                comment += `<details>\n<summary>⚠️ Errors</summary>\n\n\`\`\`\n${truncatedStderr}\n\`\`\`\n</details>\n\n`;
            }
        }
    }
    // Final safety check
    if (comment.length > MAX_COMMENT_SIZE) {
        const availableSpace = MAX_COMMENT_SIZE - 1000;
        comment = comment.substring(0, availableSpace) + '\n\n... [comment truncated] ...\n';
    }
    return comment;
}
function getWorkspaceMarker(workspace) {
    return `<!-- tf-report-action:${workspace} -->`;
}
async function run() {
    try {
        const stepsInput = getInput('steps');
        const workspace = getInput('workspace');
        const token = getInput('github-token');
        if (!stepsInput) {
            setFailed('steps input is required');
            return;
        }
        if (!workspace) {
            setFailed('workspace input is required');
            return;
        }
        if (!token) {
            setFailed('github-token input is required');
            return;
        }
        let steps;
        try {
            steps = JSON.parse(stepsInput);
        }
        catch (error) {
            setFailed(`Failed to parse steps input as JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return;
        }
        console.log(`Analyzing ${Object.keys(steps).length} steps for workspace: ${workspace}`);
        const analysis = analyzeSteps(steps);
        console.log(`Analysis complete: ${analysis.success ? 'Success' : `Failed (${analysis.failedSteps.length} failures)`}`);
        const context = {
            repo: process.env.GITHUB_REPOSITORY || '',
            eventName: process.env.GITHUB_EVENT_NAME || ''
        };
        if (!context.repo) {
            console.log('GITHUB_REPOSITORY not set, skipping comment');
            return;
        }
        const [owner, repo] = context.repo.split('/');
        let issueNumber;
        if (context.eventName === 'pull_request' || context.eventName === 'pull_request_target') {
            const eventPath = process.env.GITHUB_EVENT_PATH;
            if (eventPath) {
                try {
                    const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
                    issueNumber = event.pull_request?.number;
                }
                catch (error) {
                    console.log(`Failed to read GitHub event file: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }
        }
        if (!issueNumber) {
            console.log('Not a pull request event, skipping comment');
            return;
        }
        const commentBody = generateCommentBody(workspace, analysis);
        const marker = getWorkspaceMarker(workspace);
        console.log(`Comment body length: ${commentBody.length} characters`);
        const existingComments = await getExistingComments(token, repo, owner, issueNumber);
        for (const comment of existingComments) {
            if (comment.body && comment.body.includes(marker)) {
                console.log(`Deleting previous comment for workspace: ${workspace}`);
                await deleteComment(token, repo, owner, comment.id);
            }
        }
        console.log(`Posting new comment for workspace: ${workspace}`);
        await postComment(token, repo, owner, issueNumber, commentBody);
        console.log('Comment posted successfully');
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
if (require.main === module) {
    run();
}
