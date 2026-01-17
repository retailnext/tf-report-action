import { describe, expect, test } from '@jest/globals'
import {
  analyzeSteps,
  generateCommentBody,
  getWorkspaceMarker,
  getInput,
  truncateOutput
} from './index'

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
})

describe('generateCommentBody', () => {
  test('success case', () => {
    const workspace = 'production'
    const analysis = {
      success: true,
      failedSteps: [],
      totalSteps: 3
    }

    const comment = generateCommentBody(workspace, analysis)

    expect(comment).toContain('<!-- tf-report-action:production -->')
    expect(comment).toContain('## OpenTofu Workflow Report - `production`')
    expect(comment).toContain('### ✅ Success')
    expect(comment).toContain('All 3 step(s) completed successfully')
  })

  test('failure case', () => {
    const workspace = 'dev'
    const analysis = {
      success: false,
      failedSteps: [
        { name: 'build', conclusion: 'failure' },
        { name: 'test', conclusion: 'failure' }
      ],
      totalSteps: 5
    }

    const comment = generateCommentBody(workspace, analysis)

    expect(comment).toContain('<!-- tf-report-action:dev -->')
    expect(comment).toContain('## OpenTofu Workflow Report - `dev`')
    expect(comment).toContain('### ❌ Failed')
    expect(comment).toContain('2 of 5 step(s) failed')
    expect(comment).toContain('#### ❌ Step: `build`')
    expect(comment).toContain('#### ❌ Step: `test`')
  })

  test('includes step outputs', () => {
    const workspace = 'staging'
    const analysis = {
      success: false,
      failedSteps: [
        {
          name: 'tofu-plan',
          conclusion: 'failure',
          stdout: 'Plan output here',
          stderr: 'Error details here',
          exitCode: '1'
        }
      ],
      totalSteps: 2
    }

    const comment = generateCommentBody(workspace, analysis)

    expect(comment).toContain('#### ❌ Step: `tofu-plan`')
    expect(comment).toContain('**Exit Code:** 1')
    expect(comment).toContain('📄 Output')
    expect(comment).toContain('Plan output here')
    expect(comment).toContain('⚠️ Errors')
    expect(comment).toContain('Error details here')
  })

  test('handles empty outputs', () => {
    const workspace = 'test'
    const analysis = {
      success: false,
      failedSteps: [{ name: 'step1', conclusion: 'failure' }],
      totalSteps: 1
    }

    const comment = generateCommentBody(workspace, analysis)

    expect(comment).toContain('#### ❌ Step: `step1`')
    expect(comment).not.toContain('📄 Output')
    expect(comment).not.toContain('⚠️ Errors')
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
})

describe('getWorkspaceMarker', () => {
  test('returns correct marker', () => {
    const marker1 = getWorkspaceMarker('production')
    const marker2 = getWorkspaceMarker('dev')

    expect(marker1).toBe('<!-- tf-report-action:production -->')
    expect(marker2).toBe('<!-- tf-report-action:dev -->')
  })

  test('workspace markers are unique per workspace', () => {
    const marker1 = getWorkspaceMarker('workspace1')
    const marker2 = getWorkspaceMarker('workspace2')

    expect(marker1).not.toBe(marker2)
    expect(marker1).toContain('workspace1')
    expect(marker2).toContain('workspace2')
  })
})

describe('getInput', () => {
  test('reads from environment variables', () => {
    process.env.INPUT_TEST_VALUE = 'hello'
    const value = getInput('test-value')
    expect(value).toBe('hello')
    delete process.env.INPUT_TEST_VALUE
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
      totalSteps: 1
    }

    const comment = generateCommentBody('test', analysis)

    expect(comment).toContain('<details>')
    expect(comment).toContain('</details>')
    expect(comment).toContain('<summary>')
    expect(comment).toContain('</summary>')
  })
})
