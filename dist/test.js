"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const index_1 = require("./index");
(0, node_test_1.test)('analyzeSteps - all steps successful', () => {
    const steps = {
        'checkout': { conclusion: 'success' },
        'setup': { conclusion: 'success' },
        'build': { conclusion: 'success' }
    };
    const result = (0, index_1.analyzeSteps)(steps);
    node_assert_1.default.strictEqual(result.success, true);
    node_assert_1.default.strictEqual(result.totalSteps, 3);
    node_assert_1.default.strictEqual(result.failedSteps.length, 0);
});
(0, node_test_1.test)('analyzeSteps - some steps failed', () => {
    const steps = {
        'checkout': { conclusion: 'success' },
        'build': { conclusion: 'failure' },
        'test': { conclusion: 'failure' }
    };
    const result = (0, index_1.analyzeSteps)(steps);
    node_assert_1.default.strictEqual(result.success, false);
    node_assert_1.default.strictEqual(result.totalSteps, 3);
    node_assert_1.default.strictEqual(result.failedSteps.length, 2);
    node_assert_1.default.deepStrictEqual(result.failedSteps, ['build', 'test']);
});
(0, node_test_1.test)('analyzeSteps - skipped steps are not failures', () => {
    const steps = {
        'checkout': { conclusion: 'success' },
        'optional': { conclusion: 'skipped' },
        'build': { conclusion: 'success' }
    };
    const result = (0, index_1.analyzeSteps)(steps);
    node_assert_1.default.strictEqual(result.success, true);
    node_assert_1.default.strictEqual(result.totalSteps, 3);
    node_assert_1.default.strictEqual(result.failedSteps.length, 0);
});
(0, node_test_1.test)('analyzeSteps - uses outcome if conclusion not present', () => {
    const steps = {
        'step1': { outcome: 'success' },
        'step2': { outcome: 'failure' }
    };
    const result = (0, index_1.analyzeSteps)(steps);
    node_assert_1.default.strictEqual(result.success, false);
    node_assert_1.default.strictEqual(result.totalSteps, 2);
    node_assert_1.default.deepStrictEqual(result.failedSteps, ['step2']);
});
(0, node_test_1.test)('analyzeSteps - empty steps', () => {
    const steps = {};
    const result = (0, index_1.analyzeSteps)(steps);
    node_assert_1.default.strictEqual(result.success, true);
    node_assert_1.default.strictEqual(result.totalSteps, 0);
    node_assert_1.default.strictEqual(result.failedSteps.length, 0);
});
(0, node_test_1.test)('analyzeSteps - cancelled steps are failures', () => {
    const steps = {
        'step1': { conclusion: 'success' },
        'step2': { conclusion: 'cancelled' }
    };
    const result = (0, index_1.analyzeSteps)(steps);
    node_assert_1.default.strictEqual(result.success, false);
    node_assert_1.default.strictEqual(result.failedSteps.length, 1);
    node_assert_1.default.deepStrictEqual(result.failedSteps, ['step2']);
});
(0, node_test_1.test)('generateCommentBody - success case', () => {
    const workspace = 'production';
    const analysis = {
        success: true,
        failedSteps: [],
        totalSteps: 3
    };
    const comment = (0, index_1.generateCommentBody)(workspace, analysis);
    node_assert_1.default.ok(comment.includes('<!-- tf-report-action:production -->'));
    node_assert_1.default.ok(comment.includes('## OpenTofu Workflow Report - `production`'));
    node_assert_1.default.ok(comment.includes('### ✅ Success'));
    node_assert_1.default.ok(comment.includes('All 3 step(s) completed successfully'));
});
(0, node_test_1.test)('generateCommentBody - failure case', () => {
    const workspace = 'dev';
    const analysis = {
        success: false,
        failedSteps: ['build', 'test'],
        totalSteps: 5
    };
    const comment = (0, index_1.generateCommentBody)(workspace, analysis);
    node_assert_1.default.ok(comment.includes('<!-- tf-report-action:dev -->'));
    node_assert_1.default.ok(comment.includes('## OpenTofu Workflow Report - `dev`'));
    node_assert_1.default.ok(comment.includes('### ❌ Failed'));
    node_assert_1.default.ok(comment.includes('2 of 5 step(s) failed'));
    node_assert_1.default.ok(comment.includes('- ❌ `build`'));
    node_assert_1.default.ok(comment.includes('- ❌ `test`'));
});
(0, node_test_1.test)('generateCommentBody - includes workspace marker', () => {
    const workspace = 'staging';
    const analysis = {
        success: true,
        failedSteps: [],
        totalSteps: 1
    };
    const comment = (0, index_1.generateCommentBody)(workspace, analysis);
    node_assert_1.default.ok(comment.startsWith('<!-- tf-report-action:staging -->'));
});
(0, node_test_1.test)('getWorkspaceMarker - returns correct marker', () => {
    const marker1 = (0, index_1.getWorkspaceMarker)('production');
    const marker2 = (0, index_1.getWorkspaceMarker)('dev');
    node_assert_1.default.strictEqual(marker1, '<!-- tf-report-action:production -->');
    node_assert_1.default.strictEqual(marker2, '<!-- tf-report-action:dev -->');
});
(0, node_test_1.test)('getInput - reads from environment variables', () => {
    process.env.INPUT_TEST_VALUE = 'hello';
    const value = (0, index_1.getInput)('test-value');
    node_assert_1.default.strictEqual(value, 'hello');
    delete process.env.INPUT_TEST_VALUE;
});
(0, node_test_1.test)('getInput - handles spaces in input names', () => {
    process.env.INPUT_MY_TEST_VALUE = 'world';
    const value = (0, index_1.getInput)('my test value');
    node_assert_1.default.strictEqual(value, 'world');
    delete process.env.INPUT_MY_TEST_VALUE;
});
(0, node_test_1.test)('getInput - trims whitespace', () => {
    process.env.INPUT_TRIMMED = '  trimmed  ';
    const value = (0, index_1.getInput)('trimmed');
    node_assert_1.default.strictEqual(value, 'trimmed');
    delete process.env.INPUT_TRIMMED;
});
(0, node_test_1.test)('getInput - returns empty string if not set', () => {
    const value = (0, index_1.getInput)('nonexistent');
    node_assert_1.default.strictEqual(value, '');
});
(0, node_test_1.test)('workspace markers are unique per workspace', () => {
    const marker1 = (0, index_1.getWorkspaceMarker)('workspace1');
    const marker2 = (0, index_1.getWorkspaceMarker)('workspace2');
    node_assert_1.default.notStrictEqual(marker1, marker2);
    node_assert_1.default.ok(marker1.includes('workspace1'));
    node_assert_1.default.ok(marker2.includes('workspace2'));
});
(0, node_test_1.test)('comment body format - single step success', () => {
    const analysis = {
        success: true,
        failedSteps: [],
        totalSteps: 1
    };
    const comment = (0, index_1.generateCommentBody)('test', analysis);
    node_assert_1.default.ok(comment.includes('All 1 step(s) completed successfully'));
});
(0, node_test_1.test)('comment body format - single step failure', () => {
    const analysis = {
        success: false,
        failedSteps: ['only-step'],
        totalSteps: 1
    };
    const comment = (0, index_1.generateCommentBody)('test', analysis);
    node_assert_1.default.ok(comment.includes('1 of 1 step(s) failed'));
    node_assert_1.default.ok(comment.includes('- ❌ `only-step`'));
});
