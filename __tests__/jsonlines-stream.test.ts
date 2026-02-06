/**
 * Tests for OpenTofu JSON Lines Stream Parser
 *
 * Tests validation of streaming functions against examples from OpenTofu documentation:
 * https://github.com/opentofu/opentofu/blob/main/website/docs/internals/machine-readable-ui.mdx
 */

import { describe, expect, test } from '@jest/globals'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { Readable } from 'stream'
import { isJsonLinesStream, formatJsonLinesStream } from '../src/jsonlines.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const fixturesDir = path.join(__dirname, '..', '__fixtures__')

function readFixture(filename: string): string {
  return fs.readFileSync(path.join(fixturesDir, filename), 'utf8')
}

function createStream(content: string): Readable {
  return Readable.from(content)
}

describe('isJsonLinesStream', () => {
  test('detects valid JSON Lines from stream', async () => {
    const fixture = readFixture('plan-with-changes.jsonl')
    const stream = createStream(fixture)
    expect(await isJsonLinesStream(stream)).toBe(true)
  })

  test('detects JSON Lines with errors from stream', async () => {
    const fixture = readFixture('plan-with-errors.jsonl')
    const stream = createStream(fixture)
    expect(await isJsonLinesStream(stream)).toBe(true)
  })

  test('rejects empty stream', async () => {
    const stream = createStream('')
    expect(await isJsonLinesStream(stream)).toBe(false)
  })

  test('rejects whitespace only stream', async () => {
    const stream = createStream('   \n  \n  ')
    expect(await isJsonLinesStream(stream)).toBe(false)
  })

  test('rejects plain text stream', async () => {
    const stream = createStream('This is just plain text\nNot JSON at all')
    expect(await isJsonLinesStream(stream)).toBe(false)
  })

  test('rejects invalid JSON stream', async () => {
    const stream = createStream('{ invalid json }\n{ more invalid }')
    expect(await isJsonLinesStream(stream)).toBe(false)
  })

  test('rejects JSON without required fields stream', async () => {
    const stream = createStream('{"foo":"bar"}\n{"baz":"qux"}')
    expect(await isJsonLinesStream(stream)).toBe(false)
  })

  test('handles undefined stream', async () => {
    expect(await isJsonLinesStream(undefined)).toBe(false)
  })
})

describe('formatJsonLinesStream', () => {
  test('formats plan with changes from stream', async () => {
    const fixture = readFixture('plan-with-changes.jsonl')
    const stream = createStream(fixture)
    const formatted = await formatJsonLinesStream(stream)

    expect(formatted).toContain('Plan: 1 to add')
    expect(formatted).toContain('Planned Changes')
    expect(formatted).toContain('aws_instance.example')
  })

  test('formats plan with errors from stream', async () => {
    const fixture = readFixture('plan-with-errors.jsonl')
    const stream = createStream(fixture)
    const formatted = await formatJsonLinesStream(stream)

    expect(formatted).toContain('Errors')
    expect(formatted).toContain('❌')
  })

  test('formats plan with replace from stream', async () => {
    const fixture = readFixture('plan-with-replace.jsonl')
    const stream = createStream(fixture)
    const formatted = await formatJsonLinesStream(stream)

    expect(formatted).toContain('Plan')
    expect(formatted).toContain('Planned Changes')
  })

  test('formats plan with no changes from stream', async () => {
    const fixture = readFixture('plan-no-changes.jsonl')
    const stream = createStream(fixture)
    const formatted = await formatJsonLinesStream(stream)

    expect(formatted).toContain('No changes')
  })

  test('formats apply success from stream', async () => {
    const fixture = readFixture('apply-success.jsonl')
    const stream = createStream(fixture)
    const formatted = await formatJsonLinesStream(stream)

    expect(formatted).toContain('Apply complete')
    expect(formatted).toContain('Applied Changes')
  })

  test('formats resource drift from stream', async () => {
    const fixture = readFixture('resource-drift.jsonl')
    const stream = createStream(fixture)
    const formatted = await formatJsonLinesStream(stream)

    expect(formatted).toContain('Resource Drift')
  })

  test('change summary appears outside collapsing from stream', async () => {
    const fixture = readFixture('plan-with-changes.jsonl')
    const stream = createStream(fixture)
    const formatted = await formatJsonLinesStream(stream)

    // Change summary should appear before any <details> tags
    const summaryIndex = formatted.indexOf('Plan: 1 to add')
    const detailsIndex = formatted.indexOf('<details>')

    expect(summaryIndex).toBeGreaterThan(-1)
    // Only check order if details section exists
    expect(detailsIndex === -1 || summaryIndex < detailsIndex).toBe(true)
  })

  test('handles empty stream', async () => {
    const stream = createStream('')
    const formatted = await formatJsonLinesStream(stream)

    expect(formatted).toBe('')
  })

  test('handles undefined stream', async () => {
    const formatted = await formatJsonLinesStream(undefined)
    expect(formatted).toBe('')
  })

  test('respects size limits', async () => {
    const fixture = readFixture('plan-with-changes.jsonl')
    const stream = createStream(fixture)
    const formatted = await formatJsonLinesStream(stream, 100)

    // Should be limited in size
    expect(formatted.length).toBeLessThan(1100) // 100 + 1000 reserve
  })
})

describe('action emojis in stream formatting', () => {
  test('uses correct emoji for create action', async () => {
    const input = `{"@level":"info","@message":"random_pet.server: Creation complete","@module":"opentofu.ui","@timestamp":"2024-01-01T00:00:00.000000Z","type":"apply_complete","hook":{"resource":{"addr":"random_pet.server","module":"","resource":"random_pet.server","implied_provider":"random","resource_type":"random_pet","resource_name":"server","resource_key":null},"action":"create","id_key":"id","id_value":""}}
{"@level":"info","@message":"Apply complete! Resources: 1 added, 0 changed, 0 destroyed.","@module":"opentofu.ui","@timestamp":"2024-01-01T00:00:01.000000Z","type":"change_summary","changes":{"add":1,"change":0,"import":0,"remove":0,"operation":"apply"}}`
    const stream = createStream(input)
    const formatted = await formatJsonLinesStream(stream)

    expect(formatted).toContain(':heavy_plus_sign:')
  })

  test('uses correct emoji for update action', async () => {
    const input = `{"@level":"info","@message":"random_pet.server: Modifying...","@module":"opentofu.ui","@timestamp":"2024-01-01T00:00:00.000000Z","type":"planned_change","change":{"resource":{"addr":"random_pet.server","module":"","resource":"random_pet.server","implied_provider":"random","resource_type":"random_pet","resource_name":"server","resource_key":null},"action":"update","reason":"user"}}
{"@level":"info","@message":"Plan: 0 to add, 1 to change, 0 to destroy.","@module":"opentofu.ui","@timestamp":"2024-01-01T00:00:01.000000Z","type":"change_summary","changes":{"add":0,"change":1,"import":0,"remove":0,"operation":"plan"}}`
    const stream = createStream(input)
    const formatted = await formatJsonLinesStream(stream)

    expect(formatted).toContain('🔄')
  })

  test('uses correct emoji for delete action', async () => {
    const input = `{"@level":"info","@message":"random_pet.server: Destroying...","@module":"opentofu.ui","@timestamp":"2024-01-01T00:00:00.000000Z","type":"planned_change","change":{"resource":{"addr":"random_pet.server","module":"","resource":"random_pet.server","implied_provider":"random","resource_type":"random_pet","resource_name":"server","resource_key":null},"action":"delete","reason":"user"}}
{"@level":"info","@message":"Plan: 0 to add, 0 to change, 1 to destroy.","@module":"opentofu.ui","@timestamp":"2024-01-01T00:00:01.000000Z","type":"change_summary","changes":{"add":0,"change":0,"import":0,"remove":1,"operation":"plan"}}`
    const stream = createStream(input)
    const formatted = await formatJsonLinesStream(stream)

    expect(formatted).toContain(':heavy_minus_sign:')
  })

  test('uses correct emoji for replace action', async () => {
    const input = `{"@level":"info","@message":"random_pet.server: Replacing...","@module":"opentofu.ui","@timestamp":"2024-01-01T00:00:00.000000Z","type":"planned_change","change":{"resource":{"addr":"random_pet.server","module":"","resource":"random_pet.server","implied_provider":"random","resource_type":"random_pet","resource_name":"server","resource_key":null},"action":"replace","reason":"user"}}
{"@level":"info","@message":"Plan: 1 to add, 0 to change, 1 to destroy.","@module":"opentofu.ui","@timestamp":"2024-01-01T00:00:01.000000Z","type":"change_summary","changes":{"add":1,"change":0,"import":0,"remove":1,"operation":"plan"}}`
    const stream = createStream(input)
    const formatted = await formatJsonLinesStream(stream)

    expect(formatted).toContain('±')
  })
})

describe('diagnostic formatting from stream', () => {
  test('formats error with details', async () => {
    const input = `{"@level":"error","@message":"Error: Invalid value","@module":"opentofu.ui","@timestamp":"2024-01-01T00:00:00.000000Z","type":"diagnostic","diagnostic":{"severity":"error","summary":"Invalid value","detail":"The value provided is not valid.","range":{"filename":"main.tf","start":{"line":10,"column":5,"byte":100},"end":{"line":10,"column":20,"byte":115}}}}
{"@level":"info","@message":"Plan: 0 to add, 0 to change, 0 to destroy.","@module":"opentofu.ui","@timestamp":"2024-01-01T00:00:01.000000Z","type":"change_summary","changes":{"add":0,"change":0,"import":0,"remove":0,"operation":"plan"}}`
    const stream = createStream(input)
    const formatted = await formatJsonLinesStream(stream)

    expect(formatted).toContain('❌')
    expect(formatted).toContain('Invalid value')
    expect(formatted).toContain('The value provided is not valid')
    expect(formatted).toContain('main.tf:10')
  })

  test('formats warning without snippet', async () => {
    const input = `{"@level":"warn","@message":"Warning: Deprecated","@module":"opentofu.ui","@timestamp":"2024-01-01T00:00:00.000000Z","type":"diagnostic","diagnostic":{"severity":"warning","summary":"Deprecated","detail":"This feature is deprecated."}}
{"@level":"info","@message":"Plan: 0 to add, 0 to change, 0 to destroy.","@module":"opentofu.ui","@timestamp":"2024-01-01T00:00:01.000000Z","type":"change_summary","changes":{"add":0,"change":0,"import":0,"remove":0,"operation":"plan"}}`
    const stream = createStream(input)
    const formatted = await formatJsonLinesStream(stream)

    expect(formatted).toContain('⚠️')
    expect(formatted).toContain('Deprecated')
    expect(formatted).toContain('This feature is deprecated')
  })
})

describe('stream processing behavior', () => {
  test('processes entire stream to find change_summary at end', async () => {
    // Create a stream with many messages, change_summary at the very end
    const messages: string[] = []

    // Add 100 log messages
    for (let i = 0; i < 100; i++) {
      messages.push(
        JSON.stringify({
          '@level': 'info',
          '@message': `Log message ${i}`,
          '@module': 'opentofu.ui',
          '@timestamp': '2024-01-01T00:00:00.000000Z',
          type: 'log'
        })
      )
    }

    // Add change_summary at the end
    messages.push(
      JSON.stringify({
        '@level': 'info',
        '@message': 'Plan: 5 to add, 3 to change, 2 to destroy.',
        '@module': 'opentofu.ui',
        '@timestamp': '2024-01-01T00:00:01.000000Z',
        type: 'change_summary',
        changes: { add: 5, change: 3, import: 0, remove: 2, operation: 'plan' }
      })
    )

    const stream = createStream(messages.join('\n'))
    const formatted = await formatJsonLinesStream(stream)

    // Should find and include the change_summary even though it's at the end
    expect(formatted).toContain('Plan: 5 to add, 3 to change, 2 to destroy')
  })

  test('handles stream with mixed message types', async () => {
    const messages = [
      // Version
      JSON.stringify({
        '@level': 'info',
        '@message': 'OpenTofu version',
        '@module': 'opentofu.ui',
        '@timestamp': '2024-01-01T00:00:00.000000Z',
        type: 'version',
        tofu: '1.6.0',
        ui: '1.0'
      }),
      // Diagnostic
      JSON.stringify({
        '@level': 'warn',
        '@message': 'Warning',
        '@module': 'opentofu.ui',
        '@timestamp': '2024-01-01T00:00:01.000000Z',
        type: 'diagnostic',
        diagnostic: { severity: 'warning', summary: 'Test warning', detail: '' }
      }),
      // Planned change
      JSON.stringify({
        '@level': 'info',
        '@message': 'Creating resource',
        '@module': 'opentofu.ui',
        '@timestamp': '2024-01-01T00:00:02.000000Z',
        type: 'planned_change',
        change: {
          resource: {
            addr: 'test.resource',
            resource_type: 'test',
            resource_name: 'resource'
          },
          action: 'create'
        }
      }),
      // Change summary
      JSON.stringify({
        '@level': 'info',
        '@message': 'Plan: 1 to add, 0 to change, 0 to destroy.',
        '@module': 'opentofu.ui',
        '@timestamp': '2024-01-01T00:00:03.000000Z',
        type: 'change_summary',
        changes: { add: 1, change: 0, import: 0, remove: 0, operation: 'plan' }
      })
    ]

    const stream = createStream(messages.join('\n'))
    const formatted = await formatJsonLinesStream(stream)

    expect(formatted).toContain('Plan: 1 to add')
    expect(formatted).toContain('Test warning')
    expect(formatted).toContain('test.resource')
  })

  test('handles large streams efficiently', async () => {
    // Create a large stream with 1000 messages
    const messages: string[] = []

    for (let i = 0; i < 500; i++) {
      messages.push(
        JSON.stringify({
          '@level': 'info',
          '@message': `Creating resource ${i}`,
          '@module': 'opentofu.ui',
          '@timestamp': '2024-01-01T00:00:00.000000Z',
          type: 'planned_change',
          change: {
            resource: {
              addr: `test.resource_${i}`,
              resource_type: 'test',
              resource_name: `resource_${i}`
            },
            action: 'create'
          }
        })
      )
    }

    messages.push(
      JSON.stringify({
        '@level': 'info',
        '@message': 'Plan: 500 to add, 0 to change, 0 to destroy.',
        '@module': 'opentofu.ui',
        '@timestamp': '2024-01-01T00:00:01.000000Z',
        type: 'change_summary',
        changes: {
          add: 500,
          change: 0,
          import: 0,
          remove: 0,
          operation: 'plan'
        }
      })
    )

    const stream = createStream(messages.join('\n'))
    const startTime = Date.now()
    const formatted = await formatJsonLinesStream(stream, 10000)
    const endTime = Date.now()

    // Should complete in reasonable time (less than 5 seconds)
    expect(endTime - startTime).toBeLessThan(5000)

    // Should include change summary
    expect(formatted).toContain('Plan: 500 to add')

    // Should be size-limited
    expect(formatted.length).toBeLessThan(11000) // 10000 + 1000 reserve
  })
})
