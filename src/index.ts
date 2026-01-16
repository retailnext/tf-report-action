import * as https from 'https';

interface StepData {
  conclusion?: string;
  outcome?: string;
  outputs?: Record<string, unknown>;
}

interface Steps {
  [key: string]: StepData;
}

interface AnalysisResult {
  success: boolean;
  failedSteps: string[];
  totalSteps: number;
}

export function getInput(name: string): string {
  const val = process.env[`INPUT_${name.replace(/[ -]/g, '_').toUpperCase()}`] || '';
  return val.trim();
}

export function setFailed(message: string): void {
  console.error(`::error::${message}`);
  process.exit(1);
}

async function httpsRequest(options: https.RequestOptions, data?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body);
        } else {
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

async function getExistingComments(
  token: string,
  repo: string,
  owner: string,
  issueNumber: number
): Promise<Array<{ id: number; body: string }>> {
  const options: https.RequestOptions = {
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

async function deleteComment(
  token: string,
  repo: string,
  owner: string,
  commentId: number
): Promise<void> {
  const options: https.RequestOptions = {
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

async function postComment(
  token: string,
  repo: string,
  owner: string,
  issueNumber: number,
  body: string
): Promise<void> {
  const options: https.RequestOptions = {
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

export function analyzeSteps(steps: Steps): AnalysisResult {
  const stepEntries = Object.entries(steps);
  const totalSteps = stepEntries.length;
  const failedSteps: string[] = [];

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

export function generateCommentBody(workspace: string, analysis: AnalysisResult): string {
  const { success, failedSteps, totalSteps } = analysis;
  const marker = `<!-- tf-report-action:${workspace} -->`;
  
  let comment = `${marker}\n\n`;
  comment += `## OpenTofu Workflow Report - \`${workspace}\`\n\n`;
  
  if (success) {
    comment += `### ✅ Success\n\n`;
    comment += `All ${totalSteps} step(s) completed successfully.\n`;
  } else {
    comment += `### ❌ Failed\n\n`;
    comment += `${failedSteps.length} of ${totalSteps} step(s) failed:\n\n`;
    for (const step of failedSteps) {
      comment += `- ❌ \`${step}\`\n`;
    }
  }
  
  return comment;
}

export function getWorkspaceMarker(workspace: string): string {
  return `<!-- tf-report-action:${workspace} -->`;
}

async function run(): Promise<void> {
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

    const steps: Steps = JSON.parse(stepsInput);
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

    let issueNumber: number | undefined;
    
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

    const marker = getWorkspaceMarker(workspace);
    
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
  } catch (error) {
    if (error instanceof Error) {
      setFailed(error.message);
    } else {
      setFailed('An unknown error occurred');
    }
  }
}

if (require.main === module) {
  run();
}
