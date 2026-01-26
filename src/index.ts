import * as fs from 'fs'
import { isJsonLines, parseJsonLines, formatJsonLines } from './jsonlines.js'
import {
  getExistingComments,
  deleteComment,
  postComment,
  searchIssues,
  createIssue,
  updateIssue
} from './github.js'

// Re-export jsonlines functions for use by scripts and tests
export { isJsonLines, parseJsonLines, formatJsonLines }

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
]

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
  successfulSteps: number
  skippedSteps: number
  targetStepResult?: {
    name: string
    found: boolean
    conclusion?: string
    stdout?: string
    stderr?: string
    exitCode?: string
    isJsonLines?: boolean
    operationType?: 'plan' | 'apply' | 'destroy' | 'unknown'
    hasChanges?: boolean
    hasErrors?: boolean
    changeSummaryMessage?: string
  }
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
    process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] || ''
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

/**
 * Get the GitHub workflow run logs URL
 */
export function getJobLogsUrl(): string {
  const repo = process.env.GITHUB_REPOSITORY || ''
  const runId = process.env.GITHUB_RUN_ID || ''

  if (repo && runId) {
    const runAttempt = process.env.GITHUB_RUN_ATTEMPT || '1'
    return `https://github.com/${repo}/actions/runs/${runId}/attempts/${runAttempt}`
  }
  return ''
}

/**
 * Format a date in a human-friendly format in UTC with 24-hour time
 * Example: "January 22, 2026 at 19:05 UTC"
 */
export function formatTimestamp(date: Date): string {
  const month = MONTH_NAMES[date.getUTCMonth()]
  const day = date.getUTCDate()
  const year = date.getUTCFullYear()

  const hours = date.getUTCHours()
  const minutes = date.getUTCMinutes()

  const hoursStr = hours < 10 ? `0${hours}` : `${hours}`
  const minutesStr = minutes < 10 ? `0${minutes}` : `${minutes}`

  return `${month} ${day}, ${year} at ${hoursStr}:${minutesStr} UTC`
}

export function truncateOutput(
  text: string,
  maxLength: number,
  includeLogLink = false
): string {
  if (text.length <= maxLength) return text

  const logLink = includeLogLink ? getJobLogsUrl() : ''
  const truncationMessage = logLink
    ? `\n\n... [output truncated - [view full logs](${logLink})] ...\n\n`
    : '\n\n... [output truncated] ...\n\n'
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

export function analyzeSteps(
  steps: Steps,
  targetStep?: string
): AnalysisResult {
  const stepEntries = Object.entries(steps)
  const totalSteps = stepEntries.length
  const failedSteps: StepFailure[] = []
  let successfulSteps = 0
  let skippedSteps = 0
  let targetStepResult

  for (const [stepName, stepData] of stepEntries) {
    // Use outcome instead of conclusion as per requirements
    const outcome = stepData.outcome || stepData.conclusion || ''

    // Check if this is the target step
    if (targetStep && stepName === targetStep) {
      const stdout = stepData.outputs?.stdout as string | undefined

      // Analyze JSON Lines output if present
      let isJsonLinesOutput = false
      let operationType: 'plan' | 'apply' | 'destroy' | 'unknown' = 'unknown'
      let hasChangesValue = false
      let hasErrorsValue = false
      let changeSummaryMsg: string | undefined

      if (stdout && isJsonLines(stdout)) {
        isJsonLinesOutput = true
        const parsed = parseJsonLines(stdout)
        hasErrorsValue = parsed.hasErrors

        if (parsed.changeSummary) {
          operationType = parsed.changeSummary.changes.operation
          changeSummaryMsg = parsed.changeSummary['@message']
          const {
            add,
            change,
            remove,
            import: importCount
          } = parsed.changeSummary.changes
          hasChangesValue =
            add > 0 || change > 0 || remove > 0 || importCount > 0
        }
      }

      targetStepResult = {
        name: stepName,
        found: true,
        conclusion: outcome,
        stdout,
        stderr: stepData.outputs?.stderr as string | undefined,
        exitCode: stepData.outputs?.exit_code as string | undefined,
        isJsonLines: isJsonLinesOutput,
        operationType,
        hasChanges: hasChangesValue,
        hasErrors: hasErrorsValue,
        changeSummaryMessage: changeSummaryMsg
      }
    }

    // Count step outcomes
    if (outcome === 'success') {
      successfulSteps++
    } else if (outcome === 'skipped') {
      skippedSteps++
    } else if (outcome && outcome !== 'cancelled' && outcome !== 'neutral') {
      // Treat as failure if not success, skipped, cancelled, or neutral
      const failure: StepFailure = {
        name: stepName,
        conclusion: outcome,
        stdout: stepData.outputs?.stdout as string | undefined,
        stderr: stepData.outputs?.stderr as string | undefined,
        exitCode: stepData.outputs?.exit_code as string | undefined
      }
      failedSteps.push(failure)
    }
  }

  // If target step was specified but not found
  if (targetStep && !targetStepResult) {
    targetStepResult = {
      name: targetStep,
      found: false
    }
  }

  return {
    success: failedSteps.length === 0,
    failedSteps,
    totalSteps,
    successfulSteps,
    skippedSteps,
    targetStepResult
  }
}

export function generateCommentBody(
  workspace: string,
  analysis: AnalysisResult,
  includeLogLink = false,
  timestamp?: Date
): string {
  const {
    success,
    failedSteps,
    totalSteps,
    successfulSteps,
    skippedSteps,
    targetStepResult
  } = analysis
  const marker = `<!-- tf-report-action:"${workspace}" -->`
  const title = generateTitle(workspace, analysis)

  let comment = `${marker}\n\n## ${title}\n\n`

  if (targetStepResult) {
    // Target step focused comment
    if (!targetStepResult.found) {
      if (failedSteps.length > 0) {
        // If there are failed steps, focus on reporting those failures
        comment += `${failedSteps.length} of ${totalSteps} step(s) failed:\n\n`
        for (const step of failedSteps) {
          comment += `- ❌ \`${step.name}\` (${step.conclusion})\n`
        }
      } else {
        // Only mention step not found if no other failures
        comment += `### Did Not Run\n\n`
        comment += `\`${targetStepResult.name}\` was not found in the workflow steps.\n\n`
      }
    } else if (targetStepResult.conclusion === 'success') {
      // Success case - show stdout/stderr if available
      const stdout = targetStepResult.stdout
      const stderr = targetStepResult.stderr
      const { formattedContent } = formatOutput(stdout, stderr)

      if (!formattedContent) {
        comment += `> [!NOTE]\n> Completed successfully with no output.\n\n`
      } else {
        comment += formattedContent
      }
    } else {
      // Target step failed or has other status
      comment += `**Status:** ${targetStepResult.conclusion}\n`

      if (targetStepResult.exitCode) {
        comment += `**Exit Code:** ${targetStepResult.exitCode}\n`
      }

      comment += '\n'

      const stdout = targetStepResult.stdout
      const stderr = targetStepResult.stderr
      const { formattedContent } = formatOutput(stdout, stderr)

      if (!formattedContent) {
        comment += `> [!NOTE]\n> Failed with no output.\n\n`
      } else {
        comment += formattedContent
      }
    }
  } else {
    // Normal mode - show all failed steps or success summary
    if (success) {
      // Check if all steps were skipped
      if (skippedSteps === totalSteps) {
        comment += `All ${totalSteps} step(s) were skipped.\n`
      } else {
        // Generate summary based on step counts
        const parts: string[] = []
        if (successfulSteps > 0) {
          parts.push(`${successfulSteps} succeeded`)
        }
        if (skippedSteps > 0) {
          parts.push(`${skippedSteps} skipped`)
        }

        if (parts.length > 0) {
          comment += `${parts.join(', ')} (${totalSteps} total)\n`
        } else {
          comment += `${totalSteps} step(s) completed\n`
        }
      }
    } else {
      // Focus on failures
      comment += `${failedSteps.length} of ${totalSteps} step(s) failed:\n\n`

      for (const step of failedSteps) {
        comment += `#### ❌ Step: \`${step.name}\`\n\n`
        comment += `**Status:** ${step.conclusion}\n`

        if (step.exitCode) {
          comment += `**Exit Code:** ${step.exitCode}\n`
        }

        comment += '\n'

        const { formattedContent } = formatOutput(step.stdout, step.stderr)

        if (!formattedContent) {
          comment += `> [!NOTE]\n> Failed with no output.\n\n`
        } else {
          comment += formattedContent
        }
      }
    }
  }

  // Add footer for status issues (non-PR context)
  if (includeLogLink) {
    const logUrl = getJobLogsUrl()
    const formattedTime = timestamp ? formatTimestamp(timestamp) : ''

    comment += `\n---\n\n`

    if (logUrl) {
      comment += `[View logs](${logUrl})`
    }

    if (formattedTime) {
      if (logUrl) {
        comment += ` • `
      }
      comment += `Last updated: ${formattedTime}`
    }

    comment += `\n`
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
  // Escape characters that could break HTML comments or search queries
  // Replace: double quotes, HTML comment end sequences (both --> and --!>), and backslashes
  const escapedWorkspace = workspace
    .replace(/\\/g, '\\\\') // Escape backslashes first
    .replace(/"/g, '\\"') // Escape double quotes
    .replace(/--[!>]/g, (match) => `--\\${match.charAt(2)}`) // Escape HTML comment end sequences
  return `<!-- tf-report-action:"${escapedWorkspace}" -->`
}

/**
 * Generate title for PR comments (dynamic with status icons)
 */
export function generateTitle(
  workspace: string,
  analysis: AnalysisResult
): string {
  const { success, targetStepResult } = analysis
  let statusIcon = ''
  let statusText = ''

  if (targetStepResult) {
    // Target step mode
    // Show as failure if target step didn't run or overall workflow failed
    const showAsFailure = !targetStepResult.found || !success

    // Check for "No Changes" case for successful plan with no changes
    if (
      !showAsFailure &&
      targetStepResult.isJsonLines &&
      targetStepResult.operationType === 'plan' &&
      !targetStepResult.hasChanges &&
      !targetStepResult.hasErrors
    ) {
      statusIcon = '✅'
      statusText = 'No Changes'
      return `${statusIcon} \`${workspace}\` \`${targetStepResult.name}\` ${statusText}`
    }

    // For successful plan/apply with changes, use the change summary
    if (
      !showAsFailure &&
      targetStepResult.isJsonLines &&
      targetStepResult.changeSummaryMessage &&
      (targetStepResult.operationType === 'plan' ||
        targetStepResult.operationType === 'apply')
    ) {
      statusIcon = '✅'
      // Strip the prefix from the change summary message
      let summary = targetStepResult.changeSummaryMessage
      if (summary.startsWith('Plan: ')) {
        summary = summary.substring('Plan: '.length)
      } else if (summary.startsWith('Apply complete! Resources: ')) {
        summary = summary.substring('Apply complete! Resources: '.length)
      }
      // Remove trailing period if present
      if (summary.endsWith('.')) {
        summary = summary.slice(0, -1)
      }
      return `${statusIcon} \`${workspace}\` \`${targetStepResult.name}\`: ${summary}`
    }

    statusIcon = showAsFailure ? '❌' : '✅'
    statusText = showAsFailure ? 'Failed' : 'Succeeded'
    return `${statusIcon} \`${workspace}\` \`${targetStepResult.name}\` ${statusText}`
  } else {
    // Normal mode
    statusIcon = success ? '✅' : '❌'
    statusText = success ? 'Succeeded' : 'Failed'
    return `${statusIcon} \`${workspace}\` ${statusText}`
  }
}

/**
 * Generate static title for status issues (fixed format)
 */
export function generateStatusIssueTitle(workspace: string): string {
  return `:bar_chart: \`${workspace}\` Status`
}

/**
 * Format output, detecting and handling JSON Lines format
 */
function formatOutput(
  stdout: string | undefined,
  stderr: string | undefined
): { formattedContent: string; isJsonLines: boolean } {
  const hasStdout = stdout && stdout.trim().length > 0
  const hasStderr = stderr && stderr.trim().length > 0

  // Check if stdout is JSON Lines format
  if (hasStdout && stdout && isJsonLines(stdout)) {
    const parsed = parseJsonLines(stdout)
    const formatted = formatJsonLines(parsed)

    if (formatted.trim().length > 0) {
      return { formattedContent: formatted, isJsonLines: true }
    }
  }

  // Fall back to standard output formatting
  let content = ''

  if (!hasStdout && !hasStderr) {
    return { formattedContent: '', isJsonLines: false }
  }

  if (hasStdout && stdout) {
    const truncated = truncateOutput(stdout, MAX_OUTPUT_PER_STEP, true)
    content += `<details>\n<summary>📄 Output</summary>\n\n\`\`\`\n${truncated}\n\`\`\`\n</details>\n\n`
  }

  if (hasStderr && stderr) {
    const truncated = truncateOutput(stderr, MAX_OUTPUT_PER_STEP, true)
    content += `<details>\n<summary>⚠️ Errors</summary>\n\n\`\`\`\n${truncated}\n\`\`\`\n</details>\n\n`
  }

  return { formattedContent: content, isJsonLines: false }
}

async function run(): Promise<void> {
  try {
    const stepsInput = getInput('steps')
    let workspace = getInput('workspace')
    const targetStep = getInput('target-step')

    if (!stepsInput) {
      setFailed('steps input is required')
      return
    }

    // If workspace is not provided, use workflow name and job name
    if (!workspace) {
      const workflowName = process.env.GITHUB_WORKFLOW || 'Workflow'
      const jobName = process.env.GITHUB_JOB || 'Job'
      workspace = `${workflowName}/${jobName}`
      info(`No workspace provided, using: \`${workspace}\``)
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
      `Analyzing ${Object.keys(steps).length} steps for workspace: \`${workspace}\`${targetStep ? ` (target: \`${targetStep}\`)` : ''}`
    )

    const analysis = analyzeSteps(steps, targetStep)

    info(
      `Analysis complete: ${analysis.success ? 'Success' : `Failed (${analysis.failedSteps.length} failures)`}`
    )

    const context = {
      repo: process.env.GITHUB_REPOSITORY || '',
      eventName: process.env.GITHUB_EVENT_NAME || ''
    }

    if (!context.repo) {
      info('GITHUB_REPOSITORY not set, skipping comment/issue')
      return
    }

    const repoParts = context.repo.split('/')
    if (repoParts.length !== 2) {
      info(
        `Invalid GITHUB_REPOSITORY format: ${context.repo}, skipping comment/issue`
      )
      return
    }

    const [owner, repo] = repoParts

    const token = getInput('github-token')
    if (!token) {
      setFailed(
        'github-token input is required to post comments/issues. Use: github-token: ${{ github.token }}'
      )
      return
    }

    const marker = getWorkspaceMarker(workspace)

    info(`Comment/Issue body length calculation in progress...`)

    let issueNumber: number | undefined

    // Check if this is a pull request event
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

    if (issueNumber) {
      // PR context: post as comment (don't include log link)
      info('Running in PR context - posting as comment')

      const commentBody = generateCommentBody(workspace, analysis, false)

      info(`Comment body length: ${commentBody.length} characters`)

      const existingComments = await getExistingComments(
        token,
        repo,
        owner,
        issueNumber
      )

      for (const comment of existingComments) {
        if (comment.body && comment.body.includes(marker)) {
          info(`Deleting previous comment for workspace: \`${workspace}\``)
          await deleteComment(token, repo, owner, comment.id)
        }
      }

      info(`Posting new comment for workspace: \`${workspace}\``)
      await postComment(token, repo, owner, issueNumber, commentBody)

      info('Comment posted successfully')
    } else {
      // Non-PR context: use status issue (include log link and timestamp)
      info('Not in PR context - using status issue')

      const timestamp = new Date()
      const statusIssueBody = generateCommentBody(
        workspace,
        analysis,
        true,
        timestamp
      )
      const statusIssueTitle = generateStatusIssueTitle(workspace)

      info(`Status issue title: "${statusIssueTitle}"`)
      info(`Status issue body length: ${statusIssueBody.length} characters`)

      // Search for existing status issue with the marker in body
      const query = `repo:${owner}/${repo} is:issue in:body "${marker}"`
      const existingIssues = await searchIssues(token, repo, owner, query)

      let statusIssueNumber: number | undefined

      // Find the issue that matches our workspace marker
      for (const issue of existingIssues) {
        if (issue.body && issue.body.includes(marker)) {
          statusIssueNumber = issue.number
          info(
            `Found existing status issue #${statusIssueNumber} for workspace: \`${workspace}\``
          )
          break
        }
      }

      if (statusIssueNumber) {
        // Update existing issue
        info(`Updating status issue #${statusIssueNumber}`)
        await updateIssue(
          token,
          repo,
          owner,
          statusIssueNumber,
          statusIssueTitle,
          statusIssueBody
        )
        info('Status issue updated successfully')
      } else {
        // Create new issue
        info(`Creating new status issue for workspace: \`${workspace}\``)
        statusIssueNumber = await createIssue(
          token,
          repo,
          owner,
          statusIssueTitle,
          statusIssueBody
        )
        info(`Status issue #${statusIssueNumber} created successfully`)
      }
    }
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
