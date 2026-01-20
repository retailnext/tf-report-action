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
    action: 'noop' | 'create' | 'read' | 'update' | 'replace' | 'delete' | 'move'
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
 * Parsed result containing all messages
 */
export interface ParsedJsonLines {
  messages: JsonLineMessage[]
  diagnostics: DiagnosticMessage[]
  plannedChanges: PlannedChangeMessage[]
  changeSummary?: ChangeSummaryMessage
  resourceDrifts: ResourceDriftMessage[]
  outputs?: OutputsMessage
  hasErrors: boolean
}

/**
 * Check if a string appears to be JSON Lines format
 */
export function isJsonLines(text: string): boolean {
  if (!text || text.trim().length === 0) {
    return false
  }

  const lines = text.split('\n').filter((line) => line.trim().length > 0)

  // Need at least one line
  if (lines.length === 0) {
    return false
  }

  // Check if first few lines are valid JSON objects with required fields
  const samplesToCheck = Math.min(lines.length, 3)
  let validJsonCount = 0

  for (let i = 0; i < samplesToCheck; i++) {
    try {
      const parsed = JSON.parse(lines[i])
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
  }

  // If at least one line is valid JSON with required fields, consider it JSON Lines
  return validJsonCount > 0
}

/**
 * Parse JSON Lines output into structured messages
 */
export function parseJsonLines(text: string): ParsedJsonLines {
  const lines = text.split('\n').filter((line) => line.trim().length > 0)

  const messages: JsonLineMessage[] = []
  const diagnostics: DiagnosticMessage[] = []
  const plannedChanges: PlannedChangeMessage[] = []
  const resourceDrifts: ResourceDriftMessage[] = []
  let changeSummary: ChangeSummaryMessage | undefined
  let outputs: OutputsMessage | undefined
  let hasErrors = false

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as JsonLineMessage

      messages.push(parsed)

      // Categorize by type
      switch (parsed.type) {
        case 'diagnostic':
          diagnostics.push(parsed as DiagnosticMessage)
          if (parsed.diagnostic.severity === 'error') {
            hasErrors = true
          }
          break
        case 'planned_change':
          plannedChanges.push(parsed as PlannedChangeMessage)
          break
        case 'change_summary':
          changeSummary = parsed as ChangeSummaryMessage
          break
        case 'resource_drift':
          resourceDrifts.push(parsed as ResourceDriftMessage)
          break
        case 'outputs':
          outputs = parsed as OutputsMessage
          break
      }
    } catch {
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
  }
}

/**
 * Get emoji for a change action
 */
function getActionEmoji(
  action: string
): ':heavy_plus_sign:' | '🔄' | ':heavy_minus_sign:' | '±' | '📖' | '🚚' | '⚪' {
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
 * Format a planned change for display
 */
function formatPlannedChange(change: PlannedChangeMessage): string {
  const emoji = getActionEmoji(change.change.action)
  const resource = change.change.resource
  const addr = resource.addr || `${resource.resource_type}.${resource.resource_name}`

  return `${emoji} **${addr}** (${change.change.action})`
}

/**
 * Format a diagnostic message for display
 */
function formatDiagnostic(diag: DiagnosticMessage): string {
  const icon =
    diag.diagnostic.severity === 'error'
      ? '❌'
      : diag.diagnostic.severity === 'warning'
        ? '⚠️'
        : 'ℹ️'

  let result = `${icon} **${diag.diagnostic.summary}**`

  if (diag.diagnostic.detail) {
    result += `\n\n${diag.diagnostic.detail}`
  }

  if (diag.diagnostic.range) {
    result += `\n\n📄 \`${diag.diagnostic.range.filename}:${diag.diagnostic.range.start.line}\``
  }

  if (diag.diagnostic.snippet?.code) {
    result += '\n\n```hcl\n' + diag.diagnostic.snippet.code + '\n```'
  }

  return result
}

/**
 * Format change summary for display
 */
function formatChangeSummary(summary: ChangeSummaryMessage): string {
  const { add, change, remove } = summary.changes
  const operation =
    summary.changes.operation.charAt(0).toUpperCase() +
    summary.changes.operation.slice(1)

  const parts: string[] = []
  if (add > 0) parts.push(`**${add}** to add :heavy_plus_sign:`)
  if (change > 0) parts.push(`**${change}** to change 🔄`)
  if (remove > 0) parts.push(`**${remove}** to remove :heavy_minus_sign:`)

  if (parts.length === 0) {
    return `**${operation}:** No changes.`
  }

  return `**${operation}:** ${parts.join(', ')}`
}

/**
 * Format parsed JSON Lines into a markdown comment
 */
export function formatJsonLines(parsed: ParsedJsonLines): string {
  let result = ''

  // Show change summary first (outside of any collapsing)
  if (parsed.changeSummary) {
    result += formatChangeSummary(parsed.changeSummary) + '\n\n'
  }

  // Show diagnostics (errors and warnings)
  if (parsed.diagnostics.length > 0) {
    const errors = parsed.diagnostics.filter(
      (d) => d.diagnostic.severity === 'error'
    )
    const warnings = parsed.diagnostics.filter(
      (d) => d.diagnostic.severity === 'warning'
    )

    if (errors.length > 0) {
      result += '### ❌ Errors\n\n'
      for (const error of errors) {
        result += formatDiagnostic(error) + '\n\n'
      }
    }

    if (warnings.length > 0) {
      result += '### ⚠️ Warnings\n\n'
      for (const warning of warnings) {
        result += formatDiagnostic(warning) + '\n\n'
      }
    }
  }

  // Show planned changes in a collapsible section
  if (parsed.plannedChanges.length > 0) {
    result += '<details>\n<summary>📋 Planned Changes</summary>\n\n'
    for (const change of parsed.plannedChanges) {
      result += formatPlannedChange(change) + '\n'
    }
    result += '\n</details>\n\n'
  }

  // Show resource drifts if any
  if (parsed.resourceDrifts.length > 0) {
    result += '<details>\n<summary>🔀 Resource Drift</summary>\n\n'
    for (const drift of parsed.resourceDrifts) {
      const emoji = getActionEmoji(drift.change.action)
      const addr =
        drift.change.resource.addr ||
        `${drift.change.resource.resource_type}.${drift.change.resource.resource_name}`
      result += `${emoji} **${addr}** (${drift.change.action})\n`
    }
    result += '\n</details>\n\n'
  }

  return result.trim()
}
