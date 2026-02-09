/**
 * Script to demonstrate JSON Lines formatting with real OpenTofu outputs
 * Run with: npx tsx scripts/demonstrate-formatting.ts
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { Readable } from 'stream'
// Import from index which re-exports jsonlines functions
import { formatJsonLines } from '../src/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const fixturesDir = join(__dirname, '..', '__fixtures__')

const examples = [
  {
    name: 'Plan with Changes',
    file: 'plan-with-changes-real.jsonl',
    description: 'Shows resources being created from real OpenTofu output'
  },
  {
    name: 'Plan with No Changes',
    file: 'plan-no-changes-real.jsonl',
    description: 'Shows when infrastructure matches configuration'
  },
  {
    name: 'Plan with Errors',
    file: 'plan-with-errors-real.jsonl',
    description: 'Shows configuration errors from real OpenTofu output'
  },
  {
    name: 'Apply Success',
    file: 'apply-success-real.jsonl',
    description: 'Shows successful resource creation from real OpenTofu output'
  }
]

console.log('# OpenTofu JSON Lines Formatting Examples\n')
console.log('Generated from real OpenTofu outputs using the action code\n')
console.log('---\n')

for (let i = 0; i < examples.length; i++) {
  const example = examples[i]
  const filePath = join(fixturesDir, example.file)

  try {
    const content = readFileSync(filePath, 'utf8')
    const lineCount = content.split('\n').filter((l) => l.trim()).length

    // Create a stream from the file content
    const stream = Readable.from(content)
    const formatted = await formatJsonLines(stream)

    console.log(`## Example ${i + 1}: ${example.name}\n`)
    console.log(`${example.description}\n`)
    console.log(`### Input File ${i + 1}\n`)
    console.log(`\`${example.file}\` contains ${lineCount} JSON lines\n`)

    console.log(`### Formatted Output ${i + 1}\n`)
    if (formatted) {
      console.log(formatted)
    } else {
      console.log(
        '*(No formatted output - would fall back to standard formatting)*'
      )
    }
    console.log('\n---\n')
  } catch (error) {
    console.log(
      `Error processing ${example.name}: ${error instanceof Error ? error.message : String(error)}\n`
    )
    console.log('---\n')
  }
}

console.log('## Key Features Demonstrated\n')
console.log(
  '1. Change summaries displayed prominently outside collapsing sections'
)
console.log('1. Emoji annotations for visual clarity')
console.log('   (:heavy_plus_sign: :heavy_minus_sign: 🔄 ±)')
console.log('1. Diagnostic messages with detailed formatting')
console.log(
  '1. Progress messages (apply_start, apply_progress, apply_complete) are'
)
console.log('   filtered out')
console.log('1. Falls back to standard formatting when JSON Lines not detected')
