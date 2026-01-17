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
- Use Node.js built-in `test` runner for writing and running tests
- Place unit tests in the `src/test.ts` file
- Export testable functions from `src/index.ts` for testing
- Avoid mocking when possible; test actual implementations
- Test with real data structures that match GitHub Actions context

## Example

Use the following as an example of how to structure your unit tests:

```typescript
/**
 * Unit tests for the action's functionality
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { analyzeSteps, generateCommentBody, getWorkspaceMarker } from './index';

test('analyzeSteps - all steps successful', () => {
  const steps = {
    'checkout': { conclusion: 'success' },
    'setup': { conclusion: 'success' },
    'build': { conclusion: 'success' }
  };

  const result = analyzeSteps(steps);

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.totalSteps, 3);
  assert.strictEqual(result.failedSteps.length, 0);
});

test('analyzeSteps - some steps failed', () => {
  const steps = {
    'checkout': { conclusion: 'success' },
    'build': { conclusion: 'failure' },
    'test': { conclusion: 'failure' }
  };

  const result = analyzeSteps(steps);

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.totalSteps, 3);
  assert.strictEqual(result.failedSteps.length, 2);
  assert.strictEqual(result.failedSteps[0].name, 'build');
  assert.strictEqual(result.failedSteps[1].name, 'test');
});

test('generateCommentBody - handles step outputs', () => {
  const workspace = 'production';
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
  };

  const comment = generateCommentBody(workspace, analysis);

  assert.ok(comment.includes('#### ❌ Step: `tofu-plan`'));
  assert.ok(comment.includes('**Exit Code:** 1'));
  assert.ok(comment.includes('📄 Output'));
  assert.ok(comment.includes('Plan output here'));
  assert.ok(comment.includes('⚠️ Errors'));
  assert.ok(comment.includes('Error details here'));
});
```

## Testing Commands

Run tests with:

```bash
npm test
```

Build and test together:

```bash
npm run build && npm test
```

## Key Differences from Jest

This project uses Node.js built-in test runner instead of Jest:

- Use `import { test } from 'node:test'` instead of `describe/it` blocks
- Use `import assert from 'node:assert'` for assertions
- No need for mocking frameworks; test actual function behavior
- Tests run with `node --test dist/test.js`
- All test functions should be at the top level (no nested describes)
