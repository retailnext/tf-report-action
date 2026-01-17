# Create Unit Test(s)

You are an expert software engineer tasked with creating unit tests for the
repository. Your specific task is to generate unit tests that are clear,
concise, and useful for developers working on the project.

## Guidelines

Ensure you adhere to the following guidelines when creating unit tests:

- Use a clear and consistent format for the unit tests
- Include a summary of the functionality being tested
- Use descriptive test names that clearly convey their purpose
- Ensure tests cover both the main path of success and edge cases
- Use proper assertions to validate the expected outcomes
- Use Jest for writing and running tests
- Place unit tests in the `src/test.ts` file
- Export testable functions from `src/index.ts` for testing
- Use `@jest/globals` for test imports

## Example

Use the following as an example of how to structure your unit tests:

```typescript
/**
 * Unit tests for the action's functionality
 */
import { describe, expect, test } from '@jest/globals'
import { analyzeSteps, generateCommentBody, getWorkspaceMarker } from './index'

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
})

describe('generateCommentBody', () => {
  test('handles step outputs', () => {
    const workspace = 'production'
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
})
```

## Testing Commands

Run tests with:

```bash
npm test
```

Run tests for CI with:

```bash
npm run ci-test
```

Build and test together:

```bash
npm run build && npm test
```

## Key Testing Principles

- Use Jest's `describe` blocks to group related tests
- Use `test` for individual test cases
- Use `expect` for assertions with appropriate matchers
- Test both success and failure paths
- Test edge cases and boundary conditions
- Keep tests focused and independent
