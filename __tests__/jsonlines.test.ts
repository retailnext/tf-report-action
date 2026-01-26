/**
 * Tests for OpenTofu JSON Lines Parser
 *
 * Tests validation against examples from OpenTofu documentation:
 * https://github.com/opentofu/opentofu/blob/main/website/docs/internals/machine-readable-ui.mdx
 */

import { describe, expect, test } from '@jest/globals'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { isJsonLines, parseJsonLines, formatJsonLines } from '../src/jsonlines'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const fixturesDir = path.join(__dirname, '..', '__fixtures__')

function readFixture(filename: string): string {
  return fs.readFileSync(path.join(fixturesDir, filename), 'utf8')
}

describe('isJsonLines', () => {
  test('detects valid JSON Lines', () => {
    const fixture = readFixture('plan-with-changes.jsonl')
    expect(isJsonLines(fixture)).toBe(true)
  })

  test('detects JSON Lines with errors', () => {
    const fixture = readFixture('plan-with-errors.jsonl')
    expect(isJsonLines(fixture)).toBe(true)
  })

  test('rejects empty string', () => {
    expect(isJsonLines('')).toBe(false)
  })

  test('rejects whitespace only', () => {
    expect(isJsonLines('   \n  \n  ')).toBe(false)
  })

  test('rejects plain text', () => {
    expect(isJsonLines('This is just plain text\nNot JSON at all')).toBe(false)
  })

  test('rejects invalid JSON', () => {
    expect(isJsonLines('{ invalid json }\n{ more invalid }')).toBe(false)
  })

  test('rejects JSON without required fields', () => {
    expect(isJsonLines('{"foo":"bar"}\n{"baz":"qux"}')).toBe(false)
  })
})

describe('parseJsonLines', () => {
  test('parses plan with changes', () => {
    const fixture = readFixture('plan-with-changes.jsonl')
    const parsed = parseJsonLines(fixture)

    expect(parsed.messages.length).toBe(5)
    expect(parsed.plannedChanges.length).toBe(3)
    expect(parsed.changeSummary).toBeDefined()
    expect(parsed.changeSummary?.changes.add).toBe(1)
    expect(parsed.changeSummary?.changes.change).toBe(1)
    expect(parsed.changeSummary?.changes.remove).toBe(1)
    expect(parsed.hasErrors).toBe(false)
  })

  test('parses plan with errors', () => {
    const fixture = readFixture('plan-with-errors.jsonl')
    const parsed = parseJsonLines(fixture)

    expect(parsed.messages.length).toBe(3)
    expect(parsed.diagnostics.length).toBe(2)
    expect(parsed.hasErrors).toBe(true)

    const firstError = parsed.diagnostics[0]
    expect(firstError.diagnostic.severity).toBe('error')
    expect(firstError.diagnostic.summary).toBe('Invalid resource type')
    expect(firstError.diagnostic.range).toBeDefined()
    expect(firstError.diagnostic.range?.filename).toBe('main.tf')

    const secondError = parsed.diagnostics[1]
    expect(secondError.diagnostic.summary).toBe('Missing required argument')
  })

  test('parses plan with replace', () => {
    const fixture = readFixture('plan-with-replace.jsonl')
    const parsed = parseJsonLines(fixture)

    expect(parsed.plannedChanges.length).toBe(1)
    expect(parsed.plannedChanges[0].change.action).toBe('replace')
    expect(parsed.changeSummary).toBeDefined()
    expect(parsed.changeSummary?.changes.add).toBe(1)
    expect(parsed.changeSummary?.changes.remove).toBe(1)
  })

  test('parses plan with no changes', () => {
    const fixture = readFixture('plan-no-changes.jsonl')
    const parsed = parseJsonLines(fixture)

    expect(parsed.plannedChanges.length).toBe(0)
    expect(parsed.changeSummary).toBeDefined()
    expect(parsed.changeSummary?.changes.add).toBe(0)
    expect(parsed.changeSummary?.changes.change).toBe(0)
    expect(parsed.changeSummary?.changes.remove).toBe(0)
  })

  test('parses apply success', () => {
    const fixture = readFixture('apply-success.jsonl')
    const parsed = parseJsonLines(fixture)

    expect(parsed.changeSummary).toBeDefined()
    expect(parsed.changeSummary?.changes.operation).toBe('apply')
    expect(parsed.changeSummary?.changes.add).toBe(1)
    expect(parsed.hasErrors).toBe(false)
  })

  test('parses resource drift', () => {
    const fixture = readFixture('resource-drift.jsonl')
    const parsed = parseJsonLines(fixture)

    expect(parsed.resourceDrifts.length).toBe(1)
    expect(parsed.resourceDrifts[0].change.action).toBe('update')
    expect(parsed.resourceDrifts[0].change.resource.addr).toBe(
      'aws_s3_bucket.data'
    )
  })

  test('handles empty input', () => {
    const parsed = parseJsonLines('')

    expect(parsed.messages.length).toBe(0)
    expect(parsed.plannedChanges.length).toBe(0)
    expect(parsed.diagnostics.length).toBe(0)
    expect(parsed.hasErrors).toBe(false)
  })

  test('skips invalid JSON lines', () => {
    const input = `{"@level":"info","@message":"test","@module":"tofu","@timestamp":"2024-01-15T10:30:00.000000Z","type":"version","terraform":"1.6.0","ui":"1.2"}
not valid json
{"@level":"info","@message":"Plan complete","@module":"tofu","@timestamp":"2024-01-15T10:30:01.000000Z","type":"change_summary","changes":{"add":0,"change":0,"remove":0,"import":0,"operation":"plan"}}`

    const parsed = parseJsonLines(input)

    expect(parsed.messages.length).toBe(2)
    expect(parsed.changeSummary).toBeDefined()
  })
})

describe('formatJsonLines', () => {
  test('formats plan with changes', () => {
    const fixture = readFixture('plan-with-changes.jsonl')
    const parsed = parseJsonLines(fixture)
    const formatted = formatJsonLines(parsed)

    // Check for the @message from change_summary
    expect(formatted).toContain('Plan: 1 to add, 1 to change, 1 to destroy.')
    expect(formatted).toContain('📋 Planned Changes')
    expect(formatted).toContain(
      ':heavy_plus_sign: **aws_instance.example** (create)'
    )
    expect(formatted).toContain('🔄 **aws_s3_bucket.data** (update)')
    expect(formatted).toContain(
      ':heavy_minus_sign: **aws_security_group.old** (delete)'
    )
  })

  test('formats plan with errors', () => {
    const fixture = readFixture('plan-with-errors.jsonl')
    const parsed = parseJsonLines(fixture)
    const formatted = formatJsonLines(parsed)

    // Errors should be in collapsible section
    expect(formatted).toContain('<details>')
    expect(formatted).toContain('❌ Errors')
    expect(formatted).toContain('**Invalid resource type**')
    expect(formatted).toContain('**Missing required argument**')
    expect(formatted).toContain('📄 `main.tf:10`')
  })

  test('formats plan with replace', () => {
    const fixture = readFixture('plan-with-replace.jsonl')
    const parsed = parseJsonLines(fixture)
    const formatted = formatJsonLines(parsed)

    expect(formatted).toContain('Plan: 1 to add, 0 to change, 1 to destroy.')
    expect(formatted).toContain('± **aws_instance.web** (replace)')
  })

  test('formats plan with no changes', () => {
    const fixture = readFixture('plan-no-changes.jsonl')
    const parsed = parseJsonLines(fixture)
    const formatted = formatJsonLines(parsed)

    expect(formatted).toContain(
      'No changes. Your infrastructure matches the configuration.'
    )
    // Should not have collapsible details when there are no changes
    expect(formatted).not.toContain('<details>')
  })

  test('formats apply success', () => {
    const fixture = readFixture('apply-success.jsonl')
    const parsed = parseJsonLines(fixture)
    const formatted = formatJsonLines(parsed)

    expect(formatted).toContain(
      'Apply complete! Resources: 1 added, 0 changed, 0 destroyed.'
    )
    // Should show applied changes in collapsible section
    expect(formatted).toContain('✅ Applied Changes')
    expect(formatted).toContain(
      ':heavy_plus_sign: **aws_instance.example** (create)'
    )
  })

  test('formats resource drift', () => {
    const fixture = readFixture('resource-drift.jsonl')
    const parsed = parseJsonLines(fixture)
    const formatted = formatJsonLines(parsed)

    expect(formatted).toContain('🔀 Resource Drift')
    expect(formatted).toContain('🔄 **aws_s3_bucket.data** (update)')
  })

  test('change summary appears outside collapsing', () => {
    const fixture = readFixture('plan-with-changes.jsonl')
    const parsed = parseJsonLines(fixture)
    const formatted = formatJsonLines(parsed)

    // Change summary should appear before any <details> tags
    const summaryIndex = formatted.indexOf('Plan:')
    const detailsIndex = formatted.indexOf('<details>')

    expect(summaryIndex).toBeGreaterThan(-1)
    expect(detailsIndex).toBeGreaterThan(-1)
    expect(summaryIndex).toBeLessThan(detailsIndex)
  })

  test('handles empty parsed result', () => {
    const parsed = parseJsonLines('')
    const formatted = formatJsonLines(parsed)

    expect(formatted).toBe('')
  })
})

describe('apply_complete messages', () => {
  test('parses apply_complete messages', () => {
    const fixture = readFixture('apply-success.jsonl')
    const parsed = parseJsonLines(fixture)

    expect(parsed.applyComplete.length).toBe(1)
    expect(parsed.applyComplete[0].hook.action).toBe('create')
    expect(parsed.applyComplete[0].hook.resource.addr).toBe(
      'aws_instance.example'
    )
  })

  test('formats apply with apply_complete messages', () => {
    const fixture = readFixture('apply-success.jsonl')
    const parsed = parseJsonLines(fixture)
    const formatted = formatJsonLines(parsed)

    expect(formatted).toContain(
      'Apply complete! Resources: 1 added, 0 changed, 0 destroyed.'
    )
    expect(formatted).toContain('✅ Applied Changes')
    expect(formatted).toContain(
      ':heavy_plus_sign: **aws_instance.example** (create)'
    )
  })
})

describe('action emojis', () => {
  test('uses correct emoji for create action', () => {
    const input = `{"@level":"info","@message":"test","@module":"tofu","@timestamp":"2024-01-15T10:30:00.000000Z","type":"planned_change","change":{"resource":{"addr":"test.example","module":"","resource":"test.example","implied_provider":"test","resource_type":"test","resource_name":"example","resource_key":null},"action":"create"}}`
    const parsed = parseJsonLines(input)
    const formatted = formatJsonLines(parsed)

    expect(formatted).toContain(':heavy_plus_sign:')
  })

  test('uses correct emoji for update action', () => {
    const input = `{"@level":"info","@message":"test","@module":"tofu","@timestamp":"2024-01-15T10:30:00.000000Z","type":"planned_change","change":{"resource":{"addr":"test.example","module":"","resource":"test.example","implied_provider":"test","resource_type":"test","resource_name":"example","resource_key":null},"action":"update"}}`
    const parsed = parseJsonLines(input)
    const formatted = formatJsonLines(parsed)

    expect(formatted).toContain('🔄')
  })

  test('uses correct emoji for delete action', () => {
    const input = `{"@level":"info","@message":"test","@module":"tofu","@timestamp":"2024-01-15T10:30:00.000000Z","type":"planned_change","change":{"resource":{"addr":"test.example","module":"","resource":"test.example","implied_provider":"test","resource_type":"test","resource_name":"example","resource_key":null},"action":"delete"}}`
    const parsed = parseJsonLines(input)
    const formatted = formatJsonLines(parsed)

    expect(formatted).toContain(':heavy_minus_sign:')
  })

  test('uses correct emoji for replace action', () => {
    const input = `{"@level":"info","@message":"test","@module":"tofu","@timestamp":"2024-01-15T10:30:00.000000Z","type":"planned_change","change":{"resource":{"addr":"test.example","module":"","resource":"test.example","implied_provider":"test","resource_type":"test","resource_name":"example","resource_key":null},"action":"replace"}}`
    const parsed = parseJsonLines(input)
    const formatted = formatJsonLines(parsed)

    expect(formatted).toContain('±')
  })
})

describe('diagnostic formatting', () => {
  test('formats error with code snippet', () => {
    const input = `{"@level":"error","@message":"Error: test","@module":"tofu","@timestamp":"2024-01-15T10:30:00.000000Z","type":"diagnostic","diagnostic":{"severity":"error","summary":"Test Error","detail":"This is a test error","range":{"filename":"test.tf","start":{"line":5,"column":1,"byte":100},"end":{"line":5,"column":20,"byte":119}},"snippet":{"code":"resource \\"test\\" \\"example\\" {\\n}","start_line":5,"highlight_start_offset":0,"highlight_end_offset":20}}}`
    const parsed = parseJsonLines(input)
    const formatted = formatJsonLines(parsed)

    expect(formatted).toContain('❌ **Test Error**')
    expect(formatted).toContain('This is a test error')
    expect(formatted).toContain('📄 `test.tf:5`')
    expect(formatted).toContain('```hcl')
  })

  test('formats warning without snippet', () => {
    const input = `{"@level":"warn","@message":"Warning: test","@module":"tofu","@timestamp":"2024-01-15T10:30:00.000000Z","type":"diagnostic","diagnostic":{"severity":"warning","summary":"Test Warning","detail":"This is a test warning"}}`
    const parsed = parseJsonLines(input)
    const formatted = formatJsonLines(parsed)

    expect(formatted).toContain('⚠️ **Test Warning**')
    expect(formatted).toContain('This is a test warning')
  })
})
