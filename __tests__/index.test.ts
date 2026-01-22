import { describe, expect, test, beforeEach, afterEach } from '@jest/globals'
import {
  analyzeSteps,
  generateCommentBody,
  getWorkspaceMarker,
  getInput,
  truncateOutput,
  getJobLogsUrl,
  generateTitle,
  generateStatusIssueTitle,
  formatTimestamp
} from '../src/index'

describe('analyzeSteps', () => {
  test('all steps successful', () => {
    const steps = {
      checkout: { conclusion: 'success' },
      setup: { conclusion: 'success' },
      build: { conclusion: 'success' }
    }

    const result = analyzeSteps(steps)

    expect(result.success).toBe(true)
    expect(result.totalSteps).toBe(3)
    expect(result.failedSteps.length).toBe(0)
    expect(result.targetStepResult).toBeUndefined()
  })

  test('some steps failed', () => {
    const steps = {
      checkout: { conclusion: 'success' },
      build: { conclusion: 'failure' },
      test: { conclusion: 'failure' }
    }

    const result = analyzeSteps(steps)

    expect(result.success).toBe(false)
    expect(result.totalSteps).toBe(3)
    expect(result.failedSteps.length).toBe(2)
    expect(result.failedSteps[0].name).toBe('build')
    expect(result.failedSteps[1].name).toBe('test')
  })

  test('skipped steps are not failures', () => {
    const steps = {
      checkout: { conclusion: 'success' },
      optional: { conclusion: 'skipped' },
      build: { conclusion: 'success' }
    }

    const result = analyzeSteps(steps)

    expect(result.success).toBe(true)
    expect(result.totalSteps).toBe(3)
    expect(result.failedSteps.length).toBe(0)
  })

  test('cancelled steps are not failures', () => {
    const steps = {
      step1: { conclusion: 'success' },
      step2: { conclusion: 'cancelled' },
      step3: { conclusion: 'success' }
    }

    const result = analyzeSteps(steps)

    expect(result.success).toBe(true)
    expect(result.failedSteps.length).toBe(0)
  })

  test('neutral steps are not failures', () => {
    const steps = {
      step1: { conclusion: 'success' },
      step2: { conclusion: 'neutral' },
      step3: { conclusion: 'success' }
    }

    const result = analyzeSteps(steps)

    expect(result.success).toBe(true)
    expect(result.failedSteps.length).toBe(0)
  })

  test('captures step outputs', () => {
    const steps = {
      step1: {
        conclusion: 'failure',
        outputs: {
          stdout: 'Some output',
          stderr: 'Some error',
          exit_code: '1'
        }
      }
    }

    const result = analyzeSteps(steps)

    expect(result.success).toBe(false)
    expect(result.failedSteps.length).toBe(1)
    expect(result.failedSteps[0].stdout).toBe('Some output')
    expect(result.failedSteps[0].stderr).toBe('Some error')
    expect(result.failedSteps[0].exitCode).toBe('1')
  })

  test('target step found and successful', () => {
    const steps = {
      init: { conclusion: 'success' },
      plan: {
        conclusion: 'success',
        outputs: {
          stdout: 'Plan output',
          stderr: 'Plan warnings'
        }
      },
      validate: { conclusion: 'success' }
    }

    const result = analyzeSteps(steps, 'plan')

    expect(result.success).toBe(true)
    expect(result.targetStepResult).toBeDefined()
    expect(result.targetStepResult?.name).toBe('plan')
    expect(result.targetStepResult?.found).toBe(true)
    expect(result.targetStepResult?.conclusion).toBe('success')
    expect(result.targetStepResult?.stdout).toBe('Plan output')
    expect(result.targetStepResult?.stderr).toBe('Plan warnings')
  })

  test('target step found and failed', () => {
    const steps = {
      init: { conclusion: 'success' },
      apply: {
        conclusion: 'failure',
        outputs: {
          stdout: 'Apply output',
          stderr: 'Apply errors',
          exit_code: '1'
        }
      }
    }

    const result = analyzeSteps(steps, 'apply')

    expect(result.success).toBe(false)
    expect(result.targetStepResult).toBeDefined()
    expect(result.targetStepResult?.name).toBe('apply')
    expect(result.targetStepResult?.found).toBe(true)
    expect(result.targetStepResult?.conclusion).toBe('failure')
    expect(result.targetStepResult?.exitCode).toBe('1')
  })

  test('target step not found', () => {
    const steps = {
      init: { conclusion: 'success' },
      validate: { conclusion: 'success' }
    }

    const result = analyzeSteps(steps, 'plan')

    expect(result.success).toBe(true)
    expect(result.targetStepResult).toBeDefined()
    expect(result.targetStepResult?.name).toBe('plan')
    expect(result.targetStepResult?.found).toBe(false)
  })

  test('target step not found with failures', () => {
    const steps = {
      init: { conclusion: 'failure' },
      validate: { conclusion: 'success' }
    }

    const result = analyzeSteps(steps, 'plan')

    expect(result.success).toBe(false)
    expect(result.failedSteps.length).toBe(1)
    expect(result.targetStepResult).toBeDefined()
    expect(result.targetStepResult?.name).toBe('plan')
    expect(result.targetStepResult?.found).toBe(false)
  })
})

describe('generateCommentBody', () => {
  test('success case without target step', () => {
    const workspace = 'production'
    const analysis = {
      success: true,
      failedSteps: [],
      totalSteps: 3,
      successfulSteps: 3,
      skippedSteps: 0
    }

    const comment = generateCommentBody(workspace, analysis)

    expect(comment).toContain('<!-- tf-report-action:"production" -->')
    expect(comment).toContain('## ✅ `production` Succeeded')
    expect(comment).toContain('3 succeeded (3 total)')
  })

  test('failure case without target step', () => {
    const workspace = 'dev'
    const analysis = {
      success: false,
      failedSteps: [
        { name: 'build', conclusion: 'failure' },
        { name: 'test', conclusion: 'failure' }
      ],
      totalSteps: 5,
      successfulSteps: 3,
      skippedSteps: 0
    }

    const comment = generateCommentBody(workspace, analysis)

    expect(comment).toContain('<!-- tf-report-action:"dev" -->')
    expect(comment).toContain('## ❌ `dev` Failed')
    expect(comment).toContain('2 of 5 step(s) failed')
    expect(comment).toContain('#### ❌ Step: `build`')
    expect(comment).toContain('#### ❌ Step: `test`')
  })

  test('includes step outputs only when non-empty', () => {
    const workspace = 'staging'
    const analysis = {
      success: false,
      failedSteps: [
        {
          name: 'plan',
          conclusion: 'failure',
          stdout: 'Plan output here',
          stderr: 'Error details here',
          exitCode: '1'
        }
      ],
      totalSteps: 2,
      successfulSteps: 1,
      skippedSteps: 0
    }

    const comment = generateCommentBody(workspace, analysis)

    expect(comment).toContain('#### ❌ Step: `plan`')
    expect(comment).toContain('**Exit Code:** 1')
    expect(comment).toContain('📄 Output')
    expect(comment).toContain('Plan output here')
    expect(comment).toContain('⚠️ Errors')
    expect(comment).toContain('Error details here')
  })

  test('shows notice when outputs are empty', () => {
    const workspace = 'test'
    const analysis = {
      success: false,
      failedSteps: [
        {
          name: 'step1',
          conclusion: 'failure',
          stdout: '',
          stderr: ''
        }
      ],
      totalSteps: 1,
      successfulSteps: 0,
      skippedSteps: 0
    }

    const comment = generateCommentBody(workspace, analysis)

    expect(comment).toContain('#### ❌ Step: `step1`')
    expect(comment).toContain('> [!NOTE]')
    expect(comment).toContain('Failed with no output')
    expect(comment).not.toContain('📄 Output')
    expect(comment).not.toContain('⚠️ Errors')
  })

  test('target step successful with outputs', () => {
    const workspace = 'prod'
    const analysis = {
      success: true,
      failedSteps: [],
      totalSteps: 3,
      successfulSteps: 3,
      skippedSteps: 0,
      targetStepResult: {
        name: 'plan',
        found: true,
        conclusion: 'success',
        stdout: 'Plan succeeded',
        stderr: 'Some warnings'
      }
    }

    const comment = generateCommentBody(workspace, analysis)

    expect(comment).toContain('<!-- tf-report-action:"prod" -->')
    expect(comment).toContain('## ✅ `prod` `plan` Succeeded')
    expect(comment).toContain('📄 Output')
    expect(comment).toContain('Plan succeeded')
    expect(comment).toContain('⚠️ Errors')
    expect(comment).toContain('Some warnings')
  })

  test('target step successful with no outputs', () => {
    const workspace = 'dev'
    const analysis = {
      success: true,
      failedSteps: [],
      totalSteps: 2,
      successfulSteps: 2,
      skippedSteps: 0,
      targetStepResult: {
        name: 'apply',
        found: true,
        conclusion: 'success',
        stdout: '',
        stderr: ''
      }
    }

    const comment = generateCommentBody(workspace, analysis)

    expect(comment).toContain('## ✅ `dev` `apply` Succeeded')
    expect(comment).toContain('> [!NOTE]')
    expect(comment).toContain('Completed successfully with no output')
  })

  test('target step failed', () => {
    const workspace = 'staging'
    const analysis = {
      success: false,
      failedSteps: [{ name: 'apply', conclusion: 'failure' }],
      totalSteps: 2,
      successfulSteps: 1,
      skippedSteps: 0,
      targetStepResult: {
        name: 'apply',
        found: true,
        conclusion: 'failure',
        stdout: 'Apply output',
        stderr: 'Apply errors',
        exitCode: '1'
      }
    }

    const comment = generateCommentBody(workspace, analysis)

    expect(comment).toContain('## ❌ `staging` `apply` Failed')
    expect(comment).toContain('**Status:** failure')
    expect(comment).toContain('**Exit Code:** 1')
  })

  test('target step not found', () => {
    const workspace = 'test'
    const analysis = {
      success: true,
      failedSteps: [],
      totalSteps: 2,
      successfulSteps: 2,
      skippedSteps: 0,
      targetStepResult: {
        name: 'plan',
        found: false
      }
    }

    const comment = generateCommentBody(workspace, analysis)

    expect(comment).toContain('## ❌ `test` `plan` Failed')
    expect(comment).toContain('### Did Not Run')
    expect(comment).toContain('`plan` was not found in the workflow steps')
  })

  test('target step not found with other failures', () => {
    const workspace = 'prod'
    const analysis = {
      success: false,
      failedSteps: [
        { name: 'init', conclusion: 'failure' },
        { name: 'validate', conclusion: 'failure' }
      ],
      totalSteps: 3,
      successfulSteps: 1,
      skippedSteps: 0,
      targetStepResult: {
        name: 'plan',
        found: false
      }
    }

    const comment = generateCommentBody(workspace, analysis)

    expect(comment).toContain('## ❌ `prod` `plan` Failed')
    // Should NOT contain "Did Not Run" when there are other failures
    expect(comment).not.toContain('### Did Not Run')
    // Should focus on the failures
    expect(comment).toContain('2 of 3 step(s) failed')
    expect(comment).toContain('- ❌ `init` (failure)')
    expect(comment).toContain('- ❌ `validate` (failure)')
  })
})

describe('truncateOutput', () => {
  test('short text unchanged', () => {
    const text = 'This is a short text'
    const result = truncateOutput(text, 1000)
    expect(result).toBe(text)
  })

  test('long text is truncated', () => {
    const text = 'A'.repeat(1000)
    const result = truncateOutput(text, 100)

    expect(result.length).toBeLessThan(text.length)
    expect(result).toContain('... [output truncated] ...')
    expect(result.startsWith('AAA')).toBe(true)
    expect(result.endsWith('AAA')).toBe(true)
  })

  test('truncation includes log link when requested', () => {
    process.env.GITHUB_REPOSITORY = 'owner/repo'
    process.env.GITHUB_RUN_ID = '12345'
    process.env.GITHUB_RUN_ATTEMPT = '1'

    const text = 'A'.repeat(1000)
    const result = truncateOutput(text, 500, true)

    expect(result).toContain('view full logs')
    expect(result).toContain(
      'https://github.com/owner/repo/actions/runs/12345/attempts/1'
    )

    delete process.env.GITHUB_REPOSITORY
    delete process.env.GITHUB_RUN_ID
    delete process.env.GITHUB_RUN_ATTEMPT
  })
})

describe('getWorkspaceMarker', () => {
  test('returns correct marker with quotes', () => {
    const marker1 = getWorkspaceMarker('production')
    const marker2 = getWorkspaceMarker('dev')

    expect(marker1).toBe('<!-- tf-report-action:"production" -->')
    expect(marker2).toBe('<!-- tf-report-action:"dev" -->')
  })

  test('workspace markers are unique per workspace', () => {
    const marker1 = getWorkspaceMarker('workspace1')
    const marker2 = getWorkspaceMarker('workspace2')

    expect(marker1).not.toBe(marker2)
    expect(marker1).toContain('workspace1')
    expect(marker2).toContain('workspace2')
  })
})

describe('getJobLogsUrl', () => {
  test('returns URL when all env vars are set', () => {
    process.env.GITHUB_REPOSITORY = 'owner/repo'
    process.env.GITHUB_RUN_ID = '12345'
    process.env.GITHUB_RUN_ATTEMPT = '2'

    const url = getJobLogsUrl()

    expect(url).toBe(
      'https://github.com/owner/repo/actions/runs/12345/attempts/2'
    )

    delete process.env.GITHUB_REPOSITORY
    delete process.env.GITHUB_RUN_ID
    delete process.env.GITHUB_RUN_ATTEMPT
  })

  test('returns empty string when env vars are missing', () => {
    const url = getJobLogsUrl()
    expect(url).toBe('')
  })
})

describe('getInput', () => {
  test('reads from environment variables', () => {
    process.env['INPUT_TEST-VALUE'] = 'hello'
    const value = getInput('test-value')
    expect(value).toBe('hello')
    delete process.env['INPUT_TEST-VALUE']
  })

  test('handles spaces in input names', () => {
    process.env.INPUT_MY_TEST_VALUE = 'world'
    const value = getInput('my test value')
    expect(value).toBe('world')
    delete process.env.INPUT_MY_TEST_VALUE
  })

  test('trims whitespace', () => {
    process.env.INPUT_TRIMMED = '  trimmed  '
    const value = getInput('trimmed')
    expect(value).toBe('trimmed')
    delete process.env.INPUT_TRIMMED
  })

  test('returns empty string if not set', () => {
    const value = getInput('nonexistent')
    expect(value).toBe('')
  })
})

describe('comment formatting', () => {
  test('uses collapsible details for output', () => {
    const analysis = {
      success: false,
      failedSteps: [
        {
          name: 'test-step',
          conclusion: 'failure',
          stdout: 'Some output',
          stderr: 'Some errors'
        }
      ],
      totalSteps: 1,
      successfulSteps: 0,
      skippedSteps: 0
    }

    const comment = generateCommentBody('test', analysis)

    expect(comment).toContain('<details>')
    expect(comment).toContain('</details>')
    expect(comment).toContain('<summary>')
    expect(comment).toContain('</summary>')
  })
})

describe('JSON Lines integration', () => {
  test('detects and formats JSON Lines in target step stdout', () => {
    const jsonLinesOutput = `{"@level":"info","@message":"OpenTofu 1.6.0","@module":"tofu.ui","@timestamp":"2024-01-15T10:30:00.000000Z","type":"version","tofu":"1.6.0","ui":"1.0"}
{"@level":"info","@message":"aws_instance.example: Plan to create","@module":"tofu.ui","@timestamp":"2024-01-15T10:30:01.000000Z","type":"planned_change","change":{"resource":{"addr":"aws_instance.example","module":"","resource":"aws_instance.example","implied_provider":"aws","resource_type":"aws_instance","resource_name":"example","resource_key":null},"action":"create"}}
{"@level":"info","@message":"Plan: 1 to add, 0 to change, 0 to destroy.","@module":"tofu.ui","@timestamp":"2024-01-15T10:30:02.000000Z","type":"change_summary","changes":{"add":1,"change":0,"remove":0,"import":0,"operation":"plan"}}`

    const steps = {
      init: { conclusion: 'success' },
      plan: {
        conclusion: 'success',
        outputs: {
          stdout: jsonLinesOutput
        }
      }
    }

    const analysis = analyzeSteps(steps, 'plan')
    const comment = generateCommentBody('test-workspace', analysis)

    // Should contain formatted JSON Lines output
    expect(comment).toContain('**Plan:**')
    expect(comment).toContain('**1** to add :heavy_plus_sign:')
    expect(comment).toContain(
      ':heavy_plus_sign: **aws_instance.example** (create)'
    )

    // Should NOT contain raw JSON
    expect(comment).not.toContain('"@level"')
    expect(comment).not.toContain('"type":"version"')
  })

  test('falls back to standard formatting for non-JSON Lines output', () => {
    const plainTextOutput = `
OpenTofu will perform the following actions:

  + aws_instance.example
      id: <computed>

Plan: 1 to add, 0 to change, 0 to destroy.
`

    const steps = {
      plan: {
        conclusion: 'success',
        outputs: {
          stdout: plainTextOutput
        }
      }
    }

    const analysis = analyzeSteps(steps, 'plan')
    const comment = generateCommentBody('test-workspace', analysis)

    // Should contain standard formatted output in collapsible
    expect(comment).toContain('<details>')
    expect(comment).toContain('📄 Output')
    expect(comment).toContain('OpenTofu will perform the following actions')

    // Should NOT contain JSON Lines formatting
    expect(comment).not.toContain('**Plan:**')
    expect(comment).not.toContain(':heavy_plus_sign:')
  })

  test('formats JSON Lines with errors in target step', () => {
    const jsonLinesWithErrors = `{"@level":"info","@message":"OpenTofu 1.6.0","@module":"tofu.ui","@timestamp":"2024-01-15T10:30:00.000000Z","type":"version","tofu":"1.6.0","ui":"1.0"}
{"@level":"error","@message":"Error: Invalid resource type","@module":"tofu.ui","@timestamp":"2024-01-15T10:30:01.000000Z","type":"diagnostic","diagnostic":{"severity":"error","summary":"Invalid resource type","detail":"The provider hashicorp/aws does not support resource type."}}`

    const steps = {
      plan: {
        conclusion: 'failure',
        outputs: {
          stdout: jsonLinesWithErrors,
          exit_code: '1'
        }
      }
    }

    const analysis = analyzeSteps(steps, 'plan')
    const comment = generateCommentBody('test-workspace', analysis)

    // Should contain error formatting
    expect(comment).toContain('### ❌ Errors')
    expect(comment).toContain('**Invalid resource type**')

    // Should NOT contain raw JSON
    expect(comment).not.toContain('"@level"')
  })

  test('formats change summary outside of collapsing', () => {
    const jsonLinesOutput = `{"@level":"info","@message":"OpenTofu 1.6.0","@module":"tofu.ui","@timestamp":"2024-01-15T10:30:00.000000Z","type":"version","tofu":"1.6.0","ui":"1.0"}
{"@level":"info","@message":"Plan: 2 to add, 1 to change, 1 to destroy.","@module":"tofu.ui","@timestamp":"2024-01-15T10:30:01.000000Z","type":"change_summary","changes":{"add":2,"change":1,"remove":1,"import":0,"operation":"plan"}}`

    const steps = {
      plan: {
        conclusion: 'success',
        outputs: {
          stdout: jsonLinesOutput
        }
      }
    }

    const analysis = analyzeSteps(steps, 'plan')
    const comment = generateCommentBody('test-workspace', analysis)

    // Change summary should always be present
    const summaryIndex = comment.indexOf('**Plan:**')
    expect(summaryIndex).toBeGreaterThan(-1)

    // If details section exists, verify summary comes first
    const detailsIndex = comment.indexOf('<details>')
    const hasSummary = summaryIndex !== -1
    const hasDetails = detailsIndex !== -1

    // Either no details, or summary comes before details
    expect(hasDetails ? summaryIndex < detailsIndex : hasSummary).toBe(true)
  })
})

describe('generateTitle', () => {
  test('success without target step', () => {
    const analysis = {
      success: true,
      failedSteps: [],
      totalSteps: 3
    }

    const title = generateTitle('production', analysis)

    expect(title).toBe('✅ `production` Succeeded')
  })

  test('failure without target step', () => {
    const analysis = {
      success: false,
      failedSteps: [{ name: 'build', conclusion: 'failure' }],
      totalSteps: 3
    }

    const title = generateTitle('dev', analysis)

    expect(title).toBe('❌ `dev` Failed')
  })

  test('target step successful', () => {
    const analysis = {
      success: true,
      failedSteps: [],
      totalSteps: 3,
      targetStepResult: {
        name: 'plan',
        found: true,
        conclusion: 'success'
      }
    }

    const title = generateTitle('staging', analysis)

    expect(title).toBe('✅ `staging` `plan` Succeeded')
  })

  test('target step failed', () => {
    const analysis = {
      success: false,
      failedSteps: [{ name: 'apply', conclusion: 'failure' }],
      totalSteps: 2,
      targetStepResult: {
        name: 'apply',
        found: true,
        conclusion: 'failure'
      }
    }

    const title = generateTitle('prod', analysis)

    expect(title).toBe('❌ `prod` `apply` Failed')
  })

  test('target step not found', () => {
    const analysis = {
      success: true,
      failedSteps: [],
      totalSteps: 3,
      targetStepResult: {
        name: 'missing',
        found: false
      }
    }

    const title = generateTitle('test', analysis)

    expect(title).toBe('❌ `test` `missing` Failed')
  })

  test('target step not found with overall failure', () => {
    const analysis = {
      success: false,
      failedSteps: [{ name: 'init', conclusion: 'failure' }],
      totalSteps: 3,
      targetStepResult: {
        name: 'plan',
        found: false
      }
    }

    const title = generateTitle('workspace', analysis)

    expect(title).toBe('❌ `workspace` `plan` Failed')
  })
})

describe('generateStatusIssueTitle', () => {
  test('generates fixed format title', () => {
    const title = generateStatusIssueTitle('production')
    expect(title).toBe(':bar_chart: `production` Status')
  })

  test('preserves workspace name', () => {
    const title = generateStatusIssueTitle('my-workspace')
    expect(title).toBe(':bar_chart: `my-workspace` Status')
  })

  test('handles special characters in workspace name', () => {
    const title = generateStatusIssueTitle('prod/us-east-1')
    expect(title).toBe(':bar_chart: `prod/us-east-1` Status')
  })
})

describe('generateCommentBody with log link', () => {
  // Set up environment for getJobLogsUrl
  const originalEnv = process.env

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      GITHUB_REPOSITORY: 'owner/repo',
      GITHUB_RUN_ID: '12345',
      GITHUB_RUN_ATTEMPT: '1'
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  test('includes log link when includeLogLink is true', () => {
    const workspace = 'production'
    const analysis = {
      success: true,
      failedSteps: [],
      totalSteps: 3,
      successfulSteps: 3,
      skippedSteps: 0
    }

    const comment = generateCommentBody(workspace, analysis, true)

    // Should still include dynamic title in body
    expect(comment).toContain('## ✅ `production` Succeeded')
    // Should include log link in markdown format
    expect(comment).toContain('[View logs](')
    expect(comment).toContain(
      'https://github.com/owner/repo/actions/runs/12345/attempts/1'
    )
  })

  test('does not include log link when includeLogLink is false', () => {
    const workspace = 'production'
    const analysis = {
      success: true,
      failedSteps: [],
      totalSteps: 3,
      successfulSteps: 3,
      skippedSteps: 0
    }

    const comment = generateCommentBody(workspace, analysis, false)

    // Should still include dynamic title in body
    expect(comment).toContain('## ✅ `production` Succeeded')
    // Should NOT include log link
    expect(comment).not.toContain('[View logs](')
  })

  test('includes log link with failure status', () => {
    const workspace = 'staging'
    const analysis = {
      success: false,
      failedSteps: [{ name: 'build', conclusion: 'failure' }],
      totalSteps: 2,
      successfulSteps: 1,
      skippedSteps: 0
    }

    const comment = generateCommentBody(workspace, analysis, true)

    // Should include dynamic failure title in body
    expect(comment).toContain('## ❌ `staging` Failed')
    // Should include log link in markdown format
    expect(comment).toContain('[View logs](')
    expect(comment).toContain(
      'https://github.com/owner/repo/actions/runs/12345/attempts/1'
    )
  })
})

describe('skipped steps handling', () => {
  test('all skipped steps should not report as success', () => {
    const steps = {
      test: {
        outputs: {},
        outcome: 'skipped',
        conclusion: 'skipped'
      },
      package: {
        outputs: {},
        outcome: 'skipped',
        conclusion: 'skipped'
      },
      'check-dist': {
        outputs: {},
        outcome: 'skipped',
        conclusion: 'skipped'
      }
    }

    const analysis = analyzeSteps(steps)

    expect(analysis.success).toBe(true) // No failures
    expect(analysis.successfulSteps).toBe(0)
    expect(analysis.skippedSteps).toBe(3)
    expect(analysis.failedSteps.length).toBe(0)
  })

  test('comment for all skipped steps shows correct counts', () => {
    const workspace = 'test'
    const analysis = {
      success: true,
      failedSteps: [],
      totalSteps: 3,
      successfulSteps: 0,
      skippedSteps: 3
    }

    const comment = generateCommentBody(workspace, analysis)

    expect(comment).toContain('All 3 step(s) were skipped.')
    expect(comment).not.toContain('succeeded')
  })

  test('mixed steps show correct counts', () => {
    const workspace = 'test'
    const analysis = {
      success: true,
      failedSteps: [],
      totalSteps: 5,
      successfulSteps: 3,
      skippedSteps: 2
    }

    const comment = generateCommentBody(workspace, analysis)

    expect(comment).toContain('3 succeeded, 2 skipped (5 total)')
  })

  test('only successful steps omit skipped count', () => {
    const workspace = 'test'
    const analysis = {
      success: true,
      failedSteps: [],
      totalSteps: 3,
      successfulSteps: 3,
      skippedSteps: 0
    }

    const comment = generateCommentBody(workspace, analysis)

    expect(comment).toContain('3 succeeded (3 total)')
    expect(comment).not.toContain('skipped')
  })

  test('with failures and successes, report focuses on failures', () => {
    const workspace = 'test'
    const analysis = {
      success: false,
      failedSteps: [
        { name: 'build', conclusion: 'failure' },
        { name: 'test', conclusion: 'failure' }
      ],
      totalSteps: 5,
      successfulSteps: 3,
      skippedSteps: 0
    }

    const comment = generateCommentBody(workspace, analysis)

    // Should focus on failures, not mention successes in the summary
    expect(comment).toContain('2 of 5 step(s) failed:')
    expect(comment).toContain('#### ❌ Step: `build`')
    expect(comment).toContain('#### ❌ Step: `test`')
    // Should NOT show success count in the summary line
    expect(comment).not.toMatch(/3 succeeded/)
  })
})

describe('formatTimestamp', () => {
  test('formats timestamp in human-friendly format in UTC', () => {
    const date = new Date('2026-01-22T19:05:47.590Z')
    const formatted = formatTimestamp(date)

    expect(formatted).toBe('January 22, 2026 at 7:05 PM UTC')
  })

  test('formats midnight correctly', () => {
    const date = new Date('2026-01-01T00:00:00.000Z')
    const formatted = formatTimestamp(date)

    expect(formatted).toBe('January 1, 2026 at 12:00 AM UTC')
  })

  test('formats noon correctly', () => {
    const date = new Date('2026-06-15T12:30:00.000Z')
    const formatted = formatTimestamp(date)

    expect(formatted).toBe('June 15, 2026 at 12:30 PM UTC')
  })

  test('pads single-digit minutes', () => {
    const date = new Date('2026-12-31T23:05:00.000Z')
    const formatted = formatTimestamp(date)

    expect(formatted).toBe('December 31, 2026 at 11:05 PM UTC')
  })
})

describe('getJobLogsUrl with job ID', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      GITHUB_REPOSITORY: 'owner/repo',
      GITHUB_RUN_ID: '12345',
      GITHUB_RUN_ATTEMPT: '1'
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  test('uses job ID when provided', () => {
    const url = getJobLogsUrl('67890')
    expect(url).toBe(
      'https://github.com/owner/repo/actions/runs/12345/job/67890'
    )
  })

  test('falls back to run attempt when job ID not provided', () => {
    const url = getJobLogsUrl()
    expect(url).toBe(
      'https://github.com/owner/repo/actions/runs/12345/attempts/1'
    )
  })
})

describe('generateCommentBody with timestamp', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      GITHUB_REPOSITORY: 'owner/repo',
      GITHUB_RUN_ID: '12345',
      GITHUB_RUN_ATTEMPT: '1'
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  test('includes timestamp in status issue footer', () => {
    const workspace = 'production'
    const analysis = {
      success: true,
      failedSteps: [],
      totalSteps: 3,
      successfulSteps: 3,
      skippedSteps: 0
    }
    const timestamp = new Date('2026-01-22T19:05:47.590Z')

    const comment = generateCommentBody(
      workspace,
      analysis,
      true,
      undefined,
      timestamp
    )

    expect(comment).toContain('[View logs](')
    expect(comment).toContain('Last updated: January 22, 2026 at 7:05 PM UTC')
  })

  test('includes both job ID and timestamp', () => {
    const workspace = 'production'
    const analysis = {
      success: true,
      failedSteps: [],
      totalSteps: 3,
      successfulSteps: 3,
      skippedSteps: 0
    }
    const jobId = '67890'
    const timestamp = new Date('2026-01-22T19:05:47.590Z')

    const comment = generateCommentBody(
      workspace,
      analysis,
      true,
      jobId,
      timestamp
    )

    expect(comment).toContain(
      '[View logs](https://github.com/owner/repo/actions/runs/12345/job/67890)'
    )
    expect(comment).toContain(' • ')
    expect(comment).toContain('Last updated: January 22, 2026 at 7:05 PM UTC')
  })
})
