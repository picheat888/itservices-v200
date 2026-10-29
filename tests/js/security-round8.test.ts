// Round 8 security: the contract Overview tab follows its permission, and the new refusal codes have words.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = join(import.meta.dirname, '../../resources/js');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

test('the contract Overview tab needs contracts.view_dashboard', () => {
    const page = read('modules/contract/pages/index.tsx');
    assert.match(page, /const canViewOverview = can\('contracts\.view_dashboard'\);/);
    assert.match(page, /useTabParam\(isContractTab, canViewOverview \? 'overview' : 'all'\)/);
    assert.match(page, /\.filter\(\(tb\) => tb\.id !== 'overview' \|\| canViewOverview\)/);
    assert.match(page, /if \(tab === 'overview' && !canViewOverview\) \{\s*setTab\('all', \{ replace: true \}\);/);
});

test('the contract summary type splits the alert counts from the overview', () => {
    const types = read('shared/types/index.ts');
    assert.match(types, /export interface ContractAlertCounts \{\s*expiring: number;\s*overdue: number;\s*\}/);
    assert.match(types, /export type ContractSummary = ContractAlertCounts & \{/);
});

test('onboarding failures and resign refusals are worded in both languages', () => {
    assert.match(read('modules/employee/components/add-employee-drawer.tsx'), /request_failed: 'emp_onboarding_request_failed'/);
    assert.match(read('modules/employee/pages/index.tsx'), /=== 'super_account' \? t\('cancel_resign_err_super_account'\)/);
    for (const lang of ['en', 'th']) {
        const words = read(`lang/${lang}/employee.ts`);
        for (const key of [
            'emp_onboarding_request_failed',
            'resign_err_own_account',
            'resign_err_last_super_admin',
            'cancel_resign_err_super_account',
        ]) {
            assert.match(words, new RegExp(`\\b${key}: `), `${lang} misses ${key}`);
        }
    }
});
