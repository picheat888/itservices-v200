// Contract round 2 (CON-1 CON-3 CON-6 CON-11 CON-15): end date is not overdue, overdue heads the action queue, picker pages on the server, cancel says why.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = join(import.meta.dirname, '../../resources/js');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

test('the end date reads "ends today" in amber, overdue only from the next day', () => {
    const page = read('modules/contract/pages/index.tsx');
    assert.match(page, /if \(days === 0\) return <StatusBadge tone="amber">\{t\('contract_due_today'\)\}<\/StatusBadge>;/);
    assert.match(page, /if \(status === 'overdue'\) return <StatusBadge tone="red">\{t\('contract_overdue'\)\}<\/StatusBadge>;/);
    assert.doesNotMatch(page, /days <= 0/);
    assert.doesNotMatch(read('modules/contract/components/contract-detail-drawer.tsx'), /days <= 0/);
    assert.doesNotMatch(read('modules/asset/components/contract-peek-dialog.tsx'), /days <= 0/);

    const bell = read('modules/notification/lib/notification-text.ts');
    assert.match(bell, /if \(days === 0\) return t\('notif_contract_due_today'\);/);
    for (const lang of ['th', 'en']) assert.match(read(`lang/${lang}/notification.ts`), /notif_contract_due_today: '/);
});

test('the report pill and the 30-day tile read the end date as "ends today" in amber', () => {
    const pill = read('modules/report/components/contract-left-pill.tsx');
    assert.match(pill, /if \(days === 0\) return <StatusBadge tone="amber">\{t\('contract_due_today'\)\}<\/StatusBadge>;/);
    const cards = read('modules/report/components/contract-renewals-cards.tsx');
    assert.match(cards, /t\(soon\.nearest\.days === 0 \? 'rep_cren_k_soon_foot_today' : 'rep_cren_k_soon_foot'\)/);
    for (const lang of ['th', 'en']) assert.match(read(`lang/${lang}/report.ts`), /rep_cren_k_soon_foot_today: '[^']*\{code\}/);
});

test('the action queue pill says overdue in red, ends today, or days left', () => {
    const page = read('modules/contract/pages/index.tsx');
    assert.match(page, /c\.days < 0\s*\? 'bg-red-500\/10 text-red-700 dark:text-red-400'/);
    assert.match(page, /c\.days < 0\s*\? t\('contract_days_overdue_short'\)/);
    assert.match(page, /min-w-16/);
});

test('the link picker searches and pages on the server and names a kept write-off', () => {
    const form = read('modules/contract/components/contract-form-drawer.tsx');
    assert.match(form, /assetApi\.linkable\(\{ contract_id: editing\?\.id, search: assetQueryText \|\| undefined, page: assetPage \}\)/);
    assert.match(form, /useDebouncedSearch\(assetSearch\)/);
    assert.doesNotMatch(form, /matchesAllWords/);
    assert.match(form, /locked && a\.on_contract &&/);
    for (const lang of ['th', 'en']) assert.match(read(`lang/${lang}/contract.ts`), /contract_link_asset_on_contract: '/);
});

test('the cancel reason stops at 500 characters and a refusal shows its own words', () => {
    const dialog = read('modules/contract/components/contract-cancel-dialog.tsx');
    assert.match(dialog, /const REASON_MAX = 500;/);
    assert.match(dialog, /maxLength=\{REASON_MAX\}/);
    assert.match(dialog, /reasonWords\(e, t, 'contract_refusal_'\) \?\? t\('contract_cancel_failed'\)/);
    for (const lang of ['th', 'en']) {
        const words = read(`lang/${lang}/contract.ts`);
        for (const code of ['term_ended', 'term_running', 'assets_pending']) assert.match(words, new RegExp(`contract_refusal_${code}: '`));
    }
});
