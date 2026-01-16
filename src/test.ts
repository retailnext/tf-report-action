import { test } from 'node:test';
import assert from 'node:assert';
import { analyzeSteps, generateCommentBody, getWorkspaceMarker, getInput } from './index';

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
  assert.deepStrictEqual(result.failedSteps, ['build', 'test']);
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

test('analyzeSteps - uses outcome if conclusion not present', () => {
  const steps = {
    'step1': { outcome: 'success' },
    'step2': { outcome: 'failure' }
  };

  const result = analyzeSteps(steps);

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.totalSteps, 2);
  assert.deepStrictEqual(result.failedSteps, ['step2']);
});

test('analyzeSteps - empty steps', () => {
  const steps = {};

  const result = analyzeSteps(steps);

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.totalSteps, 0);
  assert.strictEqual(result.failedSteps.length, 0);
});

test('analyzeSteps - cancelled steps are failures', () => {
  const steps = {
    'step1': { conclusion: 'success' },
    'step2': { conclusion: 'cancelled' }
  };

  const result = analyzeSteps(steps);

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.failedSteps.length, 1);
  assert.deepStrictEqual(result.failedSteps, ['step2']);
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
    failedSteps: ['build', 'test'],
    totalSteps: 5
  };

  const comment = generateCommentBody(workspace, analysis);

  assert.ok(comment.includes('<!-- tf-report-action:dev -->'));
  assert.ok(comment.includes('## OpenTofu Workflow Report - `dev`'));
  assert.ok(comment.includes('### ❌ Failed'));
  assert.ok(comment.includes('2 of 5 step(s) failed'));
  assert.ok(comment.includes('- ❌ `build`'));
  assert.ok(comment.includes('- ❌ `test`'));
});

test('generateCommentBody - includes workspace marker', () => {
  const workspace = 'staging';
  const analysis = {
    success: true,
    failedSteps: [],
    totalSteps: 1
  };

  const comment = generateCommentBody(workspace, analysis);

  assert.ok(comment.startsWith('<!-- tf-report-action:staging -->'));
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

test('comment body format - single step success', () => {
  const analysis = {
    success: true,
    failedSteps: [],
    totalSteps: 1
  };

  const comment = generateCommentBody('test', analysis);

  assert.ok(comment.includes('All 1 step(s) completed successfully'));
});

test('comment body format - single step failure', () => {
  const analysis = {
    success: false,
    failedSteps: ['only-step'],
    totalSteps: 1
  };

  const comment = generateCommentBody('test', analysis);

  assert.ok(comment.includes('1 of 1 step(s) failed'));
  assert.ok(comment.includes('- ❌ `only-step`'));
});
