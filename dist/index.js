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
const https = __importStar(require("https"));
function getInput(name) {
    const val = process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] || '';
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
function analyzeSteps(steps) {
    const stepEntries = Object.entries(steps);
    const totalSteps = stepEntries.length;
    const failedSteps = [];
    for (const [stepName, stepData] of stepEntries) {
        const conclusion = stepData.conclusion || stepData.outcome;
        if (conclusion && conclusion !== 'success' && conclusion !== 'skipped') {
            failedSteps.push(stepName);
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
    let comment = `${marker}\n\n`;
    comment += `## OpenTofu Workflow Report - \`${workspace}\`\n\n`;
    if (success) {
        comment += `### ✅ Success\n\n`;
        comment += `All ${totalSteps} step(s) completed successfully.\n`;
    }
    else {
        comment += `### ❌ Failed\n\n`;
        comment += `${failedSteps.length} of ${totalSteps} step(s) failed:\n\n`;
        for (const step of failedSteps) {
            comment += `- ❌ \`${step}\`\n`;
        }
    }
    return comment;
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
        const steps = JSON.parse(stepsInput);
        const analysis = analyzeSteps(steps);
        const commentBody = generateCommentBody(workspace, analysis);
        const context = {
            repo: process.env.GITHUB_REPOSITORY || '',
            eventName: process.env.GITHUB_EVENT_NAME || '',
            sha: process.env.GITHUB_SHA || '',
            ref: process.env.GITHUB_REF || '',
            workflow: process.env.GITHUB_WORKFLOW || '',
            action: process.env.GITHUB_ACTION || '',
            actor: process.env.GITHUB_ACTOR || '',
            job: process.env.GITHUB_JOB || '',
            runNumber: process.env.GITHUB_RUN_NUMBER || '',
            runId: process.env.GITHUB_RUN_ID || ''
        };
        if (!context.repo) {
            setFailed('GITHUB_REPOSITORY environment variable is not set');
            return;
        }
        const [owner, repo] = context.repo.split('/');
        let issueNumber;
        if (context.eventName === 'pull_request' || context.eventName === 'pull_request_target') {
            const eventPath = process.env.GITHUB_EVENT_PATH;
            if (eventPath) {
                const fs = require('fs');
                const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
                issueNumber = event.pull_request?.number;
            }
        }
        if (!issueNumber) {
            console.log('Not a pull request event, skipping comment');
            return;
        }
        const marker = `<!-- tf-report-action:${workspace} -->`;
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
run();
