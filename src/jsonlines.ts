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

import { Readable } from 'stream'

/**
 * Diagnostic detail for stream formatting
 */
interface DiagnosticDetail {
  severity: 'error' | 'warning'
  summary: string
  detail?: string
  filename?: string
  line?: number
  code?: string
}

/**
 * Change detail for stream formatting
 */
interface ChangeDetail {
  action: string
  addr: string
}

/**
 * Base interface for all JSON messages
 */
interface BaseMessage {
  '@level': 'info' | 'warn' | 'error'
  '@message': string
  '@module': string
  '@timestamp': string
  type: string
}

/**
 * Version message - indicates the version of the JSON format
 */
export interface VersionMessage extends BaseMessage {
  type: 'version'
  tofu: string
  ui: string
}

/**
 * Log message - unstructured human-readable log lines
 */
export interface LogMessage extends BaseMessage {
  type: 'log'
}

/**
 * Diagnostic message - errors, warnings, and info messages
 */
export interface DiagnosticMessage extends BaseMessage {
  type: 'diagnostic'
  diagnostic: {
    severity: 'error' | 'warning' | 'info'
    summary: string
    detail: string
    range?: {
      filename: string
      start: { line: number; column: number; byte: number }
      end: { line: number; column: number; byte: number }
    }
    snippet?: {
      context?: string
      code: string
      start_line: number
      highlight_start_offset: number
      highlight_end_offset: number
      values?: Array<{ traversal: string; statement: string }>
    }
  }
}

/**
 * Resource drift message - resources that have changed outside of Terraform
 */
export interface ResourceDriftMessage extends BaseMessage {
  type: 'resource_drift'
  change: {
    resource: {
      addr: string
      module: string
      resource: string
      implied_provider: string
      resource_type: string
      resource_name: string
      resource_key: string | null
    }
    action: 'update' | 'delete' | 'create' | 'read' | 'noop'
  }
}

/**
 * Planned change message - describes a change that will be made
 */
export interface PlannedChangeMessage extends BaseMessage {
  type: 'planned_change'
  change: {
    resource: {
      addr: string
      module: string
      resource: string
      implied_provider: string
      resource_type: string
      resource_name: string
      resource_key: string | number | null
    }
    previous_resource?: {
      addr: string
      module: string
      resource: string
      implied_provider: string
      resource_type: string
      resource_name: string
      resource_key: string | number | null
    }
    action:
      | 'noop'
      | 'create'
      | 'read'
      | 'update'
      | 'replace'
      | 'delete'
      | 'move'
    reason?:
      | 'tainted'
      | 'requested'
      | 'cannot_update'
      | 'delete_because_no_resource_config'
      | 'delete_because_wrong_repetition'
      | 'delete_because_count_index'
      | 'delete_because_each_key'
      | 'delete_because_no_module'
  }
  prior_state?: unknown
  config?: unknown
}

/**
 * Change summary message - summarizes the changes that will be made
 */
export interface ChangeSummaryMessage extends BaseMessage {
  type: 'change_summary'
  changes: {
    add: number
    change: number
    remove: number
    import: number
    operation: 'plan' | 'apply' | 'destroy'
  }
}

/**
 * Outputs message - shows output values
 */
export interface OutputsMessage extends BaseMessage {
  type: 'outputs'
  outputs: {
    [key: string]: {
      sensitive: boolean
      type: string | string[]
      value: unknown
    }
  }
}

/**
 * Apply start message
 */
export interface ApplyStartMessage extends BaseMessage {
  type: 'apply_start'
  hook: {
    resource: {
      addr: string
      module: string
      resource: string
      implied_provider: string
      resource_type: string
      resource_name: string
      resource_key: string | number | null
    }
    action: string
    id_key?: string
    id_value?: string
  }
}

/**
 * Apply progress message
 */
export interface ApplyProgressMessage extends BaseMessage {
  type: 'apply_progress'
  hook: {
    resource: {
      addr: string
      module: string
      resource: string
      implied_provider: string
      resource_type: string
      resource_name: string
      resource_key: string | number | null
    }
    action: string
    elapsed_seconds: number
  }
}

/**
 * Apply complete message
 */
export interface ApplyCompleteMessage extends BaseMessage {
  type: 'apply_complete'
  hook: {
    resource: {
      addr: string
      module: string
      resource: string
      implied_provider: string
      resource_type: string
      resource_name: string
      resource_key: string | number | null
    }
    action: string
    id_key?: string
    id_value?: string
    elapsed_seconds: number
  }
}

/**
 * Apply errored message
 */
export interface ApplyErroredMessage extends BaseMessage {
  type: 'apply_errored'
  hook: {
    resource: {
      addr: string
      module: string
      resource: string
      implied_provider: string
      resource_type: string
      resource_name: string
      resource_key: string | number | null
    }
    action: string
  }
}

/**
 * Provision start message
 */
export interface ProvisionStartMessage extends BaseMessage {
  type: 'provision_start'
  hook: {
    resource: {
      addr: string
      module: string
      resource: string
      implied_provider: string
      resource_type: string
      resource_name: string
      resource_key: string | number | null
    }
    provisioner: string
  }
}

/**
 * Provision progress message
 */
export interface ProvisionProgressMessage extends BaseMessage {
  type: 'provision_progress'
  hook: {
    resource: {
      addr: string
      module: string
      resource: string
      implied_provider: string
      resource_type: string
      resource_name: string
      resource_key: string | number | null
    }
    provisioner: string
    output: string
  }
}

/**
 * Provision complete message
 */
export interface ProvisionCompleteMessage extends BaseMessage {
  type: 'provision_complete'
  hook: {
    resource: {
      addr: string
      module: string
      resource: string
      implied_provider: string
      resource_type: string
      resource_name: string
      resource_key: string | number | null
    }
    provisioner: string
  }
}

/**
 * Provision errored message
 */
export interface ProvisionErroredMessage extends BaseMessage {
  type: 'provision_errored'
  hook: {
    resource: {
      addr: string
      module: string
      resource: string
      implied_provider: string
      resource_type: string
      resource_name: string
      resource_key: string | number | null
    }
    provisioner: string
  }
}

/**
 * Refresh start message
 */
export interface RefreshStartMessage extends BaseMessage {
  type: 'refresh_start'
  hook: {
    resource: {
      addr: string
      module: string
      resource: string
      implied_provider: string
      resource_type: string
      resource_name: string
      resource_key: string | number | null
    }
    id_key?: string
    id_value?: string
  }
}

/**
 * Refresh complete message
 */
export interface RefreshCompleteMessage extends BaseMessage {
  type: 'refresh_complete'
  hook: {
    resource: {
      addr: string
      module: string
      resource: string
      implied_provider: string
      resource_type: string
      resource_name: string
      resource_key: string | number | null
    }
    id_key?: string
    id_value?: string
  }
}

/**
 * Test abstract message - summary of test files and tests found
 */
export interface TestAbstractMessage extends BaseMessage {
  type: 'test_abstract'
  test_abstract: {
    [filename: string]: string[]
  }
}

/**
 * Test file message - summary of test file execution
 */
export interface TestFileMessage extends BaseMessage {
  type: 'test_file'
  test_file: {
    path: string
    status: string
  }
}

/**
 * Test run message - summary of test execution
 */
export interface TestRunMessage extends BaseMessage {
  type: 'test_run'
  test_run: {
    path: string
    run: string
    status: string
  }
}

/**
 * Test summary message - summary of overall test file execution
 */
export interface TestSummaryMessage extends BaseMessage {
  type: 'test_summary'
  test_summary: {
    status: string
    passed: number
    failed: number
    errored: number
    skipped: number
  }
}

/**
 * Union type of all message types
 */
export type JsonLineMessage =
  | VersionMessage
  | LogMessage
  | DiagnosticMessage
  | ResourceDriftMessage
  | PlannedChangeMessage
  | ChangeSummaryMessage
  | OutputsMessage
  | ApplyStartMessage
  | ApplyProgressMessage
  | ApplyCompleteMessage
  | ApplyErroredMessage
  | ProvisionStartMessage
  | ProvisionProgressMessage
  | ProvisionCompleteMessage
  | ProvisionErroredMessage
  | RefreshStartMessage
  | RefreshCompleteMessage
  | TestAbstractMessage
  | TestFileMessage
  | TestRunMessage
  | TestSummaryMessage

/**
 * Check if a stream appears to be JSON Lines format by checking first few lines.
 * Does not accumulate data beyond what's needed for detection.
 */
export async function isJsonLinesStream(
  stream: Readable | undefined
): Promise<boolean> {
  if (!stream) {
    return false
  }

  let buffer = ''
  let linesChecked = 0
  let validJsonCount = 0
  const samplesToCheck = 3

  return new Promise((resolve) => {
    stream.on('data', (chunk) => {
      buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8')

      // Process complete lines
      let newlineIndex
      while (
        (newlineIndex = buffer.indexOf('\n')) !== -1 &&
        linesChecked < samplesToCheck
      ) {
        const line = buffer.substring(0, newlineIndex).trim()
        buffer = buffer.substring(newlineIndex + 1)

        if (!line) continue

        linesChecked++

        try {
          const parsed = JSON.parse(line)
          // Check for required fields in OpenTofu/Terraform JSON output
          if (
            parsed &&
            typeof parsed === 'object' &&
            'type' in parsed &&
            '@message' in parsed
          ) {
            validJsonCount++
          }
        } catch {
          // Not valid JSON, continue checking other lines
        }

        if (linesChecked >= samplesToCheck) {
          stream.destroy()
          resolve(validJsonCount > 0)
          return
        }
      }
    })

    stream.on('end', () => {
      resolve(validJsonCount > 0)
    })

    stream.on('error', () => {
      resolve(false)
    })
  })
}

/**
 * Get emoji for a change action
 */
function getActionEmoji(
  action: string
):
  | ':heavy_plus_sign:'
  | '🔄'
  | ':heavy_minus_sign:'
  | '±'
  | '📖'
  | '🚚'
  | '⚪' {
  switch (action) {
    case 'create':
      return ':heavy_plus_sign:'
    case 'update':
      return '🔄'
    case 'delete':
    case 'remove':
      return ':heavy_minus_sign:'
    case 'replace':
      return '±'
    case 'read':
      return '📖'
    case 'move':
      return '🚚'
    case 'noop':
    default:
      return '⚪'
  }
}

/**
 * Format JSON Lines from a stream directly without accumulating messages.
 * Limits based on formatted output size, not message count.
 * Stops accumulating when formatted output reaches size limit.
 */
export async function formatJsonLinesStream(
  stream: Readable | undefined,
  maxOutputSize: number = 20000
): Promise<string> {
  if (!stream) {
    return ''
  }

  // Reserves space for important summaries. Always includes change_summary which may appear at end of stream.
  const SUMMARY_RESERVE_CHARS = 1000
  const effectiveLimit = maxOutputSize - SUMMARY_RESERVE_CHARS

  let buffer = ''

  // Build output incrementally, checking size as we go
  let formattedOutput = ''

  // Accumulate only important details temporarily for formatting
  const errorDetails: DiagnosticDetail[] = []
  const warningDetails: DiagnosticDetail[] = []
  const plannedChangeDetails: ChangeDetail[] = []
  const applyCompleteDetails: ChangeDetail[] = []
  const driftDetails: ChangeDetail[] = []

  // Single values
  let changeSummaryMessage: string | undefined
  let operationType: 'plan' | 'apply' | 'destroy' | 'unknown' = 'unknown'

  // Helper function to process a single parsed JSON message
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processMessage = (parsed: any) => {
    switch (parsed.type) {
      case 'diagnostic':
        if (parsed.diagnostic) {
          const detail: DiagnosticDetail = {
            severity: parsed.diagnostic.severity,
            summary: parsed.diagnostic.summary,
            detail: parsed.diagnostic.detail,
            filename: parsed.diagnostic.range?.filename,
            line: parsed.diagnostic.range?.start?.line,
            code: parsed.diagnostic.snippet?.code
          }

          if (detail.severity === 'error') {
            errorDetails.push(detail)
          } else if (detail.severity === 'warning') {
            warningDetails.push(detail)
          }
        }
        break

      case 'change_summary':
        changeSummaryMessage = parsed['@message']
        if (parsed.changes) {
          operationType = parsed.changes.operation || 'unknown'
        }
        break

      case 'planned_change':
        if (parsed.change) {
          const resource = parsed.change.resource
          plannedChangeDetails.push({
            action: parsed.change.action,
            addr:
              resource?.addr ||
              `${resource?.resource_type}.${resource?.resource_name}`
          })
        }
        break

      case 'apply_complete':
        if (parsed.hook) {
          const resource = parsed.hook.resource
          applyCompleteDetails.push({
            action: parsed.hook.action,
            addr:
              resource?.addr ||
              `${resource?.resource_type}.${resource?.resource_name}`
          })
        }
        break

      case 'resource_drift':
        if (parsed.change) {
          const resource = parsed.change.resource
          driftDetails.push({
            action: parsed.change.action,
            addr:
              resource?.addr ||
              `${resource?.resource_type}.${resource?.resource_name}`
          })
        }
        break
    }
  }

  return new Promise((resolve) => {
    stream.on('data', (chunk) => {
      buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8')

      // Process complete lines
      let newlineIndex
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.substring(0, newlineIndex).trim()
        buffer = buffer.substring(newlineIndex + 1)

        if (!line) continue

        try {
          const parsed = JSON.parse(line)
          processMessage(parsed)
        } catch {
          // Skip lines that aren't valid JSON
        }
      }
    })

    stream.on('end', () => {
      // Process any remaining buffer content (last line without trailing newline)
      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer)
          processMessage(parsed)
        } catch {
          // Skip if final buffer isn't valid JSON
        }
      }

      formattedOutput = buildFormattedOutput(
        changeSummaryMessage,
        operationType,
        errorDetails,
        warningDetails,
        plannedChangeDetails,
        applyCompleteDetails,
        driftDetails,
        effectiveLimit
      )
      resolve(formattedOutput)
    })

    stream.on('error', () => {
      formattedOutput = buildFormattedOutput(
        changeSummaryMessage,
        operationType,
        errorDetails,
        warningDetails,
        plannedChangeDetails,
        applyCompleteDetails,
        driftDetails,
        effectiveLimit
      )
      resolve(formattedOutput)
    })
  })
}

/**
 * Build formatted output from accumulated details, limiting by output size
 */
function buildFormattedOutput(
  changeSummaryMessage: string | undefined,
  operationType: 'plan' | 'apply' | 'destroy' | 'unknown',
  errorDetails: DiagnosticDetail[],
  warningDetails: DiagnosticDetail[],
  plannedChangeDetails: ChangeDetail[],
  applyCompleteDetails: ChangeDetail[],
  driftDetails: ChangeDetail[],
  maxSize?: number
): string {
  let result = ''

  // Show change summary first
  if (changeSummaryMessage) {
    result += `${changeSummaryMessage}\n\n`
  }

  // Format diagnostics, checking size as we add each one
  if (errorDetails.length > 0) {
    let diagnosticsSection = '<details>\n<summary>❌ Errors</summary>\n\n'
    let errorCount = 0

    for (const err of errorDetails) {
      const errorText =
        `❌ **${err.summary}**` +
        (err.detail ? `\n\n${err.detail}` : '') +
        (err.filename && err.line
          ? `\n\n📄 \`${err.filename}:${err.line}\``
          : '') +
        (err.code ? '\n\n```hcl\n' + err.code + '\n```' : '') +
        '\n\n'

      if (
        maxSize &&
        (result + diagnosticsSection + errorText).length > maxSize
      ) {
        break
      }
      diagnosticsSection += errorText
      errorCount++
    }

    if (errorCount < errorDetails.length) {
      diagnosticsSection += `... (showing ${errorCount} of ${errorDetails.length} errors)\n\n`
    }
    diagnosticsSection += '</details>\n\n'

    if (!maxSize || (result + diagnosticsSection).length <= maxSize) {
      result += diagnosticsSection
    }
  }

  if (warningDetails.length > 0 && (!maxSize || result.length < maxSize)) {
    let diagnosticsSection = '<details>\n<summary>⚠️ Warnings</summary>\n\n'
    let warnCount = 0

    for (const warn of warningDetails) {
      const warnText =
        `⚠️ **${warn.summary}**` +
        (warn.detail ? `\n\n${warn.detail}` : '') +
        (warn.filename && warn.line
          ? `\n\n📄 \`${warn.filename}:${warn.line}\``
          : '') +
        (warn.code ? '\n\n```hcl\n' + warn.code + '\n```' : '') +
        '\n\n'

      if (
        maxSize &&
        (result + diagnosticsSection + warnText).length > maxSize
      ) {
        break
      }
      diagnosticsSection += warnText
      warnCount++
    }

    if (warnCount < warningDetails.length) {
      diagnosticsSection += `... (showing ${warnCount} of ${warningDetails.length} warnings)\n\n`
    }
    diagnosticsSection += '</details>\n\n'

    if (!maxSize || (result + diagnosticsSection).length <= maxSize) {
      result += diagnosticsSection
    }
  }

  // Format changes, checking size
  const hasChanges =
    plannedChangeDetails.length > 0 || applyCompleteDetails.length > 0

  if (hasChanges && (!maxSize || result.length < maxSize)) {
    if (operationType === 'plan' && plannedChangeDetails.length > 0) {
      let changesSection =
        '<details>\n<summary>📋 Planned Changes</summary>\n\n'
      let changeCount = 0

      for (const change of plannedChangeDetails) {
        const emoji = getActionEmoji(change.action)
        const changeText = `${emoji} **${change.addr}** (${change.action})\n`

        if (
          maxSize &&
          (result + changesSection + changeText).length > maxSize
        ) {
          break
        }
        changesSection += changeText
        changeCount++
      }

      if (changeCount < plannedChangeDetails.length) {
        changesSection += `\n... (showing ${changeCount} of ${plannedChangeDetails.length} changes)\n`
      }
      changesSection += '\n</details>\n\n'

      if (!maxSize || (result + changesSection).length <= maxSize) {
        result += changesSection
      }
    } else if (operationType === 'apply' && applyCompleteDetails.length > 0) {
      let changesSection =
        '<details>\n<summary>✅ Applied Changes</summary>\n\n'
      let changeCount = 0

      for (const change of applyCompleteDetails) {
        const emoji = getActionEmoji(change.action)
        const changeText = `${emoji} **${change.addr}** (${change.action})\n`

        if (
          maxSize &&
          (result + changesSection + changeText).length > maxSize
        ) {
          break
        }
        changesSection += changeText
        changeCount++
      }

      if (changeCount < applyCompleteDetails.length) {
        changesSection += `\n... (showing ${changeCount} of ${applyCompleteDetails.length} changes)\n`
      }
      changesSection += '\n</details>\n\n'

      if (!maxSize || (result + changesSection).length <= maxSize) {
        result += changesSection
      }
    } else if (operationType === 'unknown' && plannedChangeDetails.length > 0) {
      let changesSection =
        '<details>\n<summary>📋 Planned Changes</summary>\n\n'
      let changeCount = 0

      for (const change of plannedChangeDetails) {
        const emoji = getActionEmoji(change.action)
        const changeText = `${emoji} **${change.addr}** (${change.action})\n`

        if (
          maxSize &&
          (result + changesSection + changeText).length > maxSize
        ) {
          break
        }
        changesSection += changeText
        changeCount++
      }

      if (changeCount < plannedChangeDetails.length) {
        changesSection += `\n... (showing ${changeCount} of ${plannedChangeDetails.length} changes)\n`
      }
      changesSection += '\n</details>\n\n'

      if (!maxSize || (result + changesSection).length <= maxSize) {
        result += changesSection
      }
    }
  }

  // Format drifts
  if (driftDetails.length > 0 && (!maxSize || result.length < maxSize)) {
    let driftsSection = '<details>\n<summary>🔀 Resource Drift</summary>\n\n'
    let driftCount = 0

    for (const drift of driftDetails) {
      const emoji = getActionEmoji(drift.action)
      const driftText = `${emoji} **${drift.addr}** (${drift.action})\n`

      if (maxSize && (result + driftsSection + driftText).length > maxSize) {
        break
      }
      driftsSection += driftText
      driftCount++
    }

    if (driftCount < driftDetails.length) {
      driftsSection += `\n... (showing ${driftCount} of ${driftDetails.length} drifts)\n`
    }
    driftsSection += '\n</details>\n\n'

    if (!maxSize || (result + driftsSection).length <= maxSize) {
      result += driftsSection
    }
  }

  return result.trim()
}
