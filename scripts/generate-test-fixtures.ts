/**
 * Script to generate test fixtures with both direct and file-based outputs
 * This demonstrates both the old exec-action behavior (stdout/stderr) and
 * the new behavior (stdout_file/stderr_file)
 *
 * Run with: npx tsx scripts/generate-test-fixtures.ts
 */

import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const fixturesDir = join(__dirname, '..', '__fixtures__')
const outputDir = join(fixturesDir, 'exec-action-outputs')

// Create output directory for file-based outputs
mkdirSync(outputDir, { recursive: true })

// Sample outputs for different scenarios
const scenarios = {
  planSuccess: {
    stdout: `OpenTofu will perform the following actions:

  # aws_instance.example will be created
  + resource "aws_instance" "example" {
      + ami           = "ami-12345678"
      + instance_type = "t2.micro"
    }

Plan: 1 to add, 0 to change, 0 to destroy.`,
    stderr: ''
  },
  planFailure: {
    stdout: '',
    stderr: `Error: Invalid configuration

  on main.tf line 5:
  5:   instance_type = "invalid.type"

The instance type "invalid.type" is not valid.`
  },
  applySuccess: {
    stdout: `aws_instance.example: Creating...
aws_instance.example: Creation complete after 30s [id=i-1234567890abcdef0]

Apply complete! Resources: 1 added, 0 changed, 0 destroyed.`,
    stderr: ''
  }
}

// Generate fixtures with direct outputs (old behavior)
const directOutputFixtures = {
  'steps-with-direct-outputs.json': {
    init: {
      outcome: 'success',
      conclusion: 'success',
      outputs: {
        stdout:
          'Initializing the backend...\n\nOpenTofu has been successfully initialized!',
        stderr: '',
        exit_code: '0'
      }
    },
    plan: {
      outcome: 'success',
      conclusion: 'success',
      outputs: {
        stdout: scenarios.planSuccess.stdout,
        stderr: scenarios.planSuccess.stderr,
        exit_code: '0'
      }
    }
  },
  'steps-with-direct-outputs-failure.json': {
    init: {
      outcome: 'success',
      conclusion: 'success',
      outputs: {
        stdout:
          'Initializing the backend...\n\nOpenTofu has been successfully initialized!',
        stderr: '',
        exit_code: '0'
      }
    },
    plan: {
      outcome: 'failure',
      conclusion: 'failure',
      outputs: {
        stdout: scenarios.planFailure.stdout,
        stderr: scenarios.planFailure.stderr,
        exit_code: '1'
      }
    }
  }
}

// Write direct output fixtures
for (const [filename, content] of Object.entries(directOutputFixtures)) {
  const filePath = join(fixturesDir, filename)
  writeFileSync(filePath, JSON.stringify(content, null, 2))
  console.log(`✓ Generated ${filename} (direct outputs)`)
}

// Generate file-based outputs (new behavior)
const fileOutputs = {
  'init-stdout.txt':
    'Initializing the backend...\n\nOpenTofu has been successfully initialized!',
  'init-stderr.txt': '',
  'plan-success-stdout.txt': scenarios.planSuccess.stdout,
  'plan-success-stderr.txt': scenarios.planSuccess.stderr,
  'plan-failure-stdout.txt': scenarios.planFailure.stdout,
  'plan-failure-stderr.txt': scenarios.planFailure.stderr,
  'apply-success-stdout.txt': scenarios.applySuccess.stdout,
  'apply-success-stderr.txt': scenarios.applySuccess.stderr
}

// Write file-based outputs
for (const [filename, content] of Object.entries(fileOutputs)) {
  const filePath = join(outputDir, filename)
  writeFileSync(filePath, content)
  console.log(`✓ Generated exec-action-outputs/${filename}`)
}

// Generate fixtures with file-based outputs (new behavior)
const fileBasedFixtures = {
  'steps-with-file-outputs.json': {
    init: {
      outcome: 'success',
      conclusion: 'success',
      outputs: {
        stdout_file: join(outputDir, 'init-stdout.txt'),
        stderr_file: join(outputDir, 'init-stderr.txt'),
        exit_code: '0'
      }
    },
    plan: {
      outcome: 'success',
      conclusion: 'success',
      outputs: {
        stdout_file: join(outputDir, 'plan-success-stdout.txt'),
        stderr_file: join(outputDir, 'plan-success-stderr.txt'),
        exit_code: '0'
      }
    }
  },
  'steps-with-file-outputs-failure.json': {
    init: {
      outcome: 'success',
      conclusion: 'success',
      outputs: {
        stdout_file: join(outputDir, 'init-stdout.txt'),
        stderr_file: join(outputDir, 'init-stderr.txt'),
        exit_code: '0'
      }
    },
    plan: {
      outcome: 'failure',
      conclusion: 'failure',
      outputs: {
        stdout_file: join(outputDir, 'plan-failure-stdout.txt'),
        stderr_file: join(outputDir, 'plan-failure-stderr.txt'),
        exit_code: '1'
      }
    }
  },
  'steps-with-mixed-outputs.json': {
    init: {
      outcome: 'success',
      conclusion: 'success',
      outputs: {
        stdout:
          'Initializing the backend...\n\nOpenTofu has been successfully initialized!',
        stderr: '',
        exit_code: '0'
      }
    },
    plan: {
      outcome: 'success',
      conclusion: 'success',
      outputs: {
        stdout_file: join(outputDir, 'plan-success-stdout.txt'),
        stderr_file: join(outputDir, 'plan-success-stderr.txt'),
        exit_code: '0'
      }
    },
    apply: {
      outcome: 'success',
      conclusion: 'success',
      outputs: {
        stdout_file: join(outputDir, 'apply-success-stdout.txt'),
        stderr_file: join(outputDir, 'apply-success-stderr.txt'),
        exit_code: '0'
      }
    }
  }
}

// Write file-based fixtures
for (const [filename, content] of Object.entries(fileBasedFixtures)) {
  const filePath = join(fixturesDir, filename)
  writeFileSync(filePath, JSON.stringify(content, null, 2))
  console.log(`✓ Generated ${filename} (file-based outputs)`)
}

console.log('\n✓ All test fixtures generated successfully!')
console.log('\nFixture types:')
console.log(
  '  - Direct outputs: steps-with-direct-outputs*.json (old exec-action behavior)'
)
console.log(
  '  - File-based outputs: steps-with-file-outputs*.json (new exec-action behavior)'
)
console.log(
  '  - Mixed outputs: steps-with-mixed-outputs.json (both behaviors in one workflow)'
)
