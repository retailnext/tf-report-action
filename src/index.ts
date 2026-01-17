import * as https from 'https'
import * as fs from 'fs'

interface StepData {
  conclusion?: string
  outcome?: string
  outputs?: {
    stdout?: string
    stderr?: string
    exit_code?: string
    [key: string]: unknown
  }
}

interface Steps {
  [key: string]: StepData
}

interface StepFailure {
  name: string
  conclusion: string
  stdout?: string
  stderr?: string
  exitCode?: string
}

interface AnalysisResult {
  success: boolean
  failedSteps: StepFailure[]
  totalSteps: number
}

// GitHub comment max size is 65536 characters
const MAX_COMMENT_SIZE = 60000
const MAX_OUTPUT_PER_STEP = 20000
const COMMENT_TRUNCATION_BUFFER = 1000

/**
 * Get an input value from the environment
 */
export function getInput(name: string): string {
  const val =
    process.env[`INPUT_${name.replace(/[ -]/g, '_').toUpperCase()}`] || ''
  return val.trim()
}

/**
 * Log an informational message
 */
function info(message: string): void {
  console.log(message)
}

/**
 * Set the action as failed and exit
 */
export function setFailed(message: string): void {
  console.error(`::error::${message}`)
  process.exit(1)
}

async function httpsRequest(
  options: https.RequestOptions,
  data?: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body)
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`))
        }
      })
    })
    req.on('error', reject)
    if (data) {
      req.write(data)
    }
    req.end()
  })
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
      Authorization: `Bearer ${token}`,
      'User-Agent': 'tf-report-action',
      Accept: 'application/vnd.github+json'
    }
  }

  const response = await httpsRequest(options)
  return JSON.parse(response)
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
      Authorization: `Bearer ${token}`,
      'User-Agent': 'tf-report-action',
      Accept: 'application/vnd.github+json'
    }
  }

  await httpsRequest(options)
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
      Authorization: `Bearer ${token}`,
      'User-Agent': 'tf-report-action',
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json'
    }
  }

  const payload = JSON.stringify({ body })
  await httpsRequest(options, payload)
}

export function truncateOutput(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text

  const truncationMessage = '\n\n... [output truncated] ...\n\n'
  const availableLength = maxLength - truncationMessage.length

  if (availableLength <= 0) {
    return text.substring(0, maxLength)
  }

  const halfLength = Math.floor(availableLength / 2)
  return (
    text.substring(0, halfLength) +
    truncationMessage +
    text.substring(text.length - halfLength)
  )
}

export function analyzeSteps(steps: Steps): AnalysisResult {
  const stepEntries = Object.entries(steps)
  const totalSteps = stepEntries.length
  const failedSteps: StepFailure[] = []

  for (const [stepName, stepData] of stepEntries) {
    const conclusion = stepData.conclusion || stepData.outcome || ''
    // Treat as failure if not success, skipped, cancelled, or neutral
    if (
      conclusion &&
      conclusion !== 'success' &&
      conclusion !== 'skipped' &&
      conclusion !== 'cancelled' &&
      conclusion !== 'neutral'
    ) {
      const failure: StepFailure = {
        name: stepName,
        conclusion,
        stdout: stepData.outputs?.stdout as string | undefined,
        stderr: stepData.outputs?.stderr as string | undefined,
        exitCode: stepData.outputs?.exit_code as string | undefined
      }
      failedSteps.push(failure)
    }
  }

  return {
    success: failedSteps.length === 0,
    failedSteps,
    totalSteps
  }
}

export function generateCommentBody(
  workspace: string,
  analysis: AnalysisResult
): string {
  const { success, failedSteps, totalSteps } = analysis
  const marker = `<!-- tf-report-action:${workspace} -->`
  const statusIcon = success ? '✅' : '❌'
  const statusText = success ? 'Success' : 'Failed'

  let comment = `${marker}\n\n`
  comment += `## OpenTofu Workflow Report - \`${workspace}\`\n\n`
  comment += `### ${statusIcon} ${statusText}\n\n`

  if (success) {
    comment += `All ${totalSteps} step(s) completed successfully.\n`
  } else {
    comment += `${failedSteps.length} of ${totalSteps} step(s) failed:\n\n`

    for (const step of failedSteps) {
      comment += `#### ❌ Step: \`${step.name}\`\n\n`
      comment += `**Status:** ${step.conclusion}\n`

      if (step.exitCode) {
        comment += `**Exit Code:** ${step.exitCode}\n`
      }

      comment += '\n'

      if (step.stdout) {
        const truncatedStdout = truncateOutput(step.stdout, MAX_OUTPUT_PER_STEP)
        comment += `<details>\n<summary>📄 Output</summary>\n\n\`\`\`\n${truncatedStdout}\n\`\`\`\n</details>\n\n`
      }

      if (step.stderr) {
        const truncatedStderr = truncateOutput(step.stderr, MAX_OUTPUT_PER_STEP)
        comment += `<details>\n<summary>⚠️ Errors</summary>\n\n\`\`\`\n${truncatedStderr}\n\`\`\`\n</details>\n\n`
      }
    }
  }

  // Final safety check
  if (comment.length > MAX_COMMENT_SIZE) {
    const availableSpace = MAX_COMMENT_SIZE - COMMENT_TRUNCATION_BUFFER
    comment =
      comment.substring(0, availableSpace) + '\n\n... [comment truncated] ...\n'
  }

  return comment
}

export function getWorkspaceMarker(workspace: string): string {
  return `<!-- tf-report-action:${workspace} -->`
}

async function run(): Promise<void> {
  try {
    const stepsInput = getInput('steps')
    const workspace = getInput('workspace')

    if (!stepsInput) {
      setFailed('steps input is required')
      return
    }

    if (!workspace) {
      setFailed('workspace input is required')
      return
    }

    let steps: Steps
    try {
      steps = JSON.parse(stepsInput)
    } catch (error) {
      setFailed(
        `Failed to parse steps input as JSON: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
      return
    }

    info(
      `Analyzing ${Object.keys(steps).length} steps for workspace: ${workspace}`
    )

    const analysis = analyzeSteps(steps)

    info(
      `Analysis complete: ${analysis.success ? 'Success' : `Failed (${analysis.failedSteps.length} failures)`}`
    )

    const context = {
      repo: process.env.GITHUB_REPOSITORY || '',
      eventName: process.env.GITHUB_EVENT_NAME || ''
    }

    if (!context.repo) {
      info('GITHUB_REPOSITORY not set, skipping comment')
      return
    }

    const repoParts = context.repo.split('/')
    if (repoParts.length !== 2) {
      info(
        `Invalid GITHUB_REPOSITORY format: ${context.repo}, skipping comment`
      )
      return
    }

    const [owner, repo] = repoParts

    let issueNumber: number | undefined

    if (
      context.eventName === 'pull_request' ||
      context.eventName === 'pull_request_target'
    ) {
      const eventPath = process.env.GITHUB_EVENT_PATH
      if (eventPath) {
        try {
          const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'))
          issueNumber = event.pull_request?.number
        } catch (error) {
          info(
            `Failed to read GitHub event file: ${error instanceof Error ? error.message : 'Unknown error'}`
          )
        }
      }
    }

    if (!issueNumber) {
      info('Not a pull request event, skipping comment')
      return
    }

    const token = getInput('github-token')
    if (!token) {
      info(
        'github-token not provided, cannot post comment (use github-token: ${{ github.token }})'
      )
      return
    }

    const commentBody = generateCommentBody(workspace, analysis)
    const marker = getWorkspaceMarker(workspace)

    info(`Comment body length: ${commentBody.length} characters`)

    const existingComments = await getExistingComments(
      token,
      repo,
      owner,
      issueNumber
    )

    for (const comment of existingComments) {
      if (comment.body && comment.body.includes(marker)) {
        info(`Deleting previous comment for workspace: ${workspace}`)
        await deleteComment(token, repo, owner, comment.id)
      }
    }

    info(`Posting new comment for workspace: ${workspace}`)
    await postComment(token, repo, owner, issueNumber, commentBody)

    info('Comment posted successfully')
  } catch (error) {
    if (error instanceof Error) {
      setFailed(error.message)
    } else {
      setFailed('An unknown error occurred')
    }
  }
}

// Run the action if this is the main module
if (
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1])
) {
  run()
}
