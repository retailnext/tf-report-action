import { test } from 'node:test';
import assert from 'node:assert';
import { analyzeSteps, generateCommentBody, getWorkspaceMarker, getInput, truncateOutput } from './index';

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

test('analyzeSteps - skipped steps are not failures', () => {
  const steps = {
    'checkout': { conclusion: 'success' },
    'optional': { conclusion: 'skipped' },
    'build': { conclusion: 'success' }
  };

  const result = analyzeSteps(steps);

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.totalSteps, 3);
  assert.strictEqual(result.failedSteps.length, 0);
});

test('analyzeSteps - captures step outputs', () => {
  const steps = {
    'step1': { 
      conclusion: 'failure',
      outputs: {
        stdout: 'Some output',
        stderr: 'Some error',
        exit_code: '1'
      }
    }
  };

  const result = analyzeSteps(steps);

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.failedSteps.length, 1);
  assert.strictEqual(result.failedSteps[0].stdout, 'Some output');
  assert.strictEqual(result.failedSteps[0].stderr, 'Some error');
  assert.strictEqual(result.failedSteps[0].exitCode, '1');
});

test('generateCommentBody - success case', () => {
  const workspace = 'production';
  const analysis = {
    success: true,
    failedSteps: [],
    totalSteps: 3
  };

  const comment = generateCommentBody(workspace, analysis);

  assert.ok(comment.includes('<!-- tf-report-action:production -->'));
  assert.ok(comment.includes('## OpenTofu Workflow Report - `production`'));
  assert.ok(comment.includes('### ✅ Success'));
  assert.ok(comment.includes('All 3 step(s) completed successfully'));
});

test('generateCommentBody - failure case', () => {
  const workspace = 'dev';
  const analysis = {
    success: false,
    failedSteps: [
      { name: 'build', conclusion: 'failure' },
      { name: 'test', conclusion: 'failure' }
    ],
    totalSteps: 5
  };

  const comment = generateCommentBody(workspace, analysis);

  assert.ok(comment.includes('<!-- tf-report-action:dev -->'));
  assert.ok(comment.includes('## OpenTofu Workflow Report - `dev`'));
  assert.ok(comment.includes('### ❌ Failed'));
  assert.ok(comment.includes('2 of 5 step(s) failed'));
  assert.ok(comment.includes('#### ❌ Step: `build`'));
  assert.ok(comment.includes('#### ❌ Step: `test`'));
});

test('generateCommentBody - includes step outputs', () => {
  const workspace = 'staging';
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

test('truncateOutput - short text unchanged', () => {
  const text = 'This is a short text';
  const result = truncateOutput(text, 1000);
  assert.strictEqual(result, text);
});

test('truncateOutput - long text is truncated', () => {
  const text = 'A'.repeat(1000);
  const result = truncateOutput(text, 100);
  
  assert.ok(result.length < text.length);
  assert.ok(result.includes('... [output truncated] ...'));
  assert.ok(result.startsWith('AAA'));
  assert.ok(result.endsWith('AAA'));
});

test('getWorkspaceMarker - returns correct marker', () => {
  const marker1 = getWorkspaceMarker('production');
  const marker2 = getWorkspaceMarker('dev');

  assert.strictEqual(marker1, '<!-- tf-report-action:production -->');
  assert.strictEqual(marker2, '<!-- tf-report-action:dev -->');
});

test('getInput - reads from environment variables', () => {
  process.env.INPUT_TEST_VALUE = 'hello';
  const value = getInput('test-value');
  assert.strictEqual(value, 'hello');
  delete process.env.INPUT_TEST_VALUE;
});

test('getInput - handles spaces in input names', () => {
  process.env.INPUT_MY_TEST_VALUE = 'world';
  const value = getInput('my test value');
  assert.strictEqual(value, 'world');
  delete process.env.INPUT_MY_TEST_VALUE;
});

test('getInput - trims whitespace', () => {
  process.env.INPUT_TRIMMED = '  trimmed  ';
  const value = getInput('trimmed');
  assert.strictEqual(value, 'trimmed');
  delete process.env.INPUT_TRIMMED;
});

test('getInput - returns empty string if not set', () => {
  const value = getInput('nonexistent');
  assert.strictEqual(value, '');
});

test('workspace markers are unique per workspace', () => {
  const marker1 = getWorkspaceMarker('workspace1');
  const marker2 = getWorkspaceMarker('workspace2');

  assert.notStrictEqual(marker1, marker2);
  assert.ok(marker1.includes('workspace1'));
  assert.ok(marker2.includes('workspace2'));
});

test('comment uses collapsible details for output', () => {
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
  };

  const comment = generateCommentBody('test', analysis);

  assert.ok(comment.includes('<details>'));
  assert.ok(comment.includes('</details>'));
  assert.ok(comment.includes('<summary>'));
  assert.ok(comment.includes('</summary>'));
});

test('generateCommentBody - handles empty outputs', () => {
  const workspace = 'test';
  const analysis = {
    success: false,
    failedSteps: [
      { name: 'step1', conclusion: 'failure' }
    ],
    totalSteps: 1
  };

  const comment = generateCommentBody(workspace, analysis);

  assert.ok(comment.includes('#### ❌ Step: `step1`'));
  assert.ok(!comment.includes('📄 Output'));
  assert.ok(!comment.includes('⚠️ Errors'));
});
