// Small form dialogs (types 4ข and 4ก): the shared 560 shell, its 32px close button and footer bar, and every file that must use it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const read = (rel: string) => readFileSync(join(import.meta.dirname, '../../resources/js', rel), 'utf8');

const OLD_LOOK = [
    /max-w-\[(480|520|540|576|600)px\]/,
    /max-w-(md|lg|xl)\b/,
    /bg-muted\/20/,
    /<DialogHeader\b/,
    /<DialogFooter\b/,
    /<DialogContent\b/,
];

function assertSmallForm(rel: string): void {
    const src = read(rel);
    assert.match(src, /<FormDialogContent\b/, `${rel}: FormDialogContent`);
    assert.match(src, /<FocusDialogHeader\b/, `${rel}: FocusDialogHeader`);
    assert.match(src, /<DialogFooterBar\b/, `${rel}: DialogFooterBar`);
    for (const re of OLD_LOOK) assert.doesNotMatch(src, re, `${rel}: still has ${re}`);
}

const TICKET_4B = [
    'modules/ticket/components/assign-ticket-modal.tsx',
    'modules/ticket/components/forward-ticket-modal.tsx',
    'modules/ticket/components/resolve-ticket-modal.tsx',
    'modules/ticket/components/take-case-modal.tsx',
    'modules/ticket/components/ticket-update-modal.tsx',
];
const REPORT_4B = ['modules/report/components/export-report-dialog.tsx', 'modules/report/components/schedule-report-dialog.tsx'];
const SETTINGS_4A = [
    'modules/settings/components/brand-modal.tsx',
    'modules/settings/components/model-modal.tsx',
    'modules/settings/components/category-modal.tsx',
    'modules/settings/components/vendor-modal.tsx',
    'modules/settings/components/warehouse-modal.tsx',
    'modules/settings/components/location-modal.tsx',
    'modules/settings/components/lookup-section.tsx',
    'modules/settings/components/request-data-section.tsx',
    'modules/settings/components/network-name-modal.tsx',
];
const PEOPLE_4A = [
    'modules/employee/components/department-modal.tsx',
    'modules/employee/components/position-modal.tsx',
    'modules/employee/components/section-modal.tsx',
    'modules/permission/components/role-modal.tsx',
];
const ASSET_4A = [
    'modules/asset/components/asset-location-dialog.tsx',
    'modules/asset/components/asset-return-to-vendor-dialog.tsx',
    'modules/asset/components/asset-transfer-dialog.tsx',
    'modules/asset/components/asset-writeoff-dialog.tsx',
];
const RECORD_4A = [
    'modules/contract/components/contract-cancel-dialog.tsx',
    'modules/request/components/cancel-request-dialog.tsx',
    'modules/request/components/decision-dialog.tsx',
    'modules/stock/components/request-drawer.tsx',
];
const TYPE6_4B = [
    'modules/asset/components/asset-receive-modal.tsx',
    'modules/employee/components/manage-credentials-modal.tsx',
    'modules/employee/components/set-credentials-modal.tsx',
];
const ALL = [...TICKET_4B, ...REPORT_4B, ...SETTINGS_4A, ...PEOPLE_4A, ...ASSET_4A, ...RECORD_4A, ...TYPE6_4B];

test('every listed small form uses the shared shell and the 4ข header', () => ALL.forEach(assertSmallForm));

test('31 small forms are on the shell', () => assert.equal(ALL.length, 31));

test('receive and recall name the asset in the header instead of a record box', () => {
    const src = read('modules/asset/components/asset-receive-modal.tsx');
    assert.match(src, /icon=\{Box\}/, 'assets menu icon');
    assert.match(src, /shownAsset\?\.asset_code/, 'asset code on top');
    assert.match(src, /code=\{isBulk \? undefined : shownAsset\?\.model\b/, 'model as the chip');
    assert.match(src, /t\('asset_bulk_count'\)/, 'bulk count on top');
    assert.doesNotMatch(src, /asset_from|bg-muted\/40|<Warehouse\b/, 'no record box');
    assert.match(src, /help=\{t\(isRecall \? 'asset_recall_hint' : 'asset_receive_hint'\)\}/, 'hint under the warehouse field');
});

test('account dialogs share one header: the action on top, the employee as title and code chip', () => {
    const manage = read('modules/employee/components/manage-credentials-modal.tsx');
    assert.match(manage, /eyebrow=\{t\('emp_cred_manage_title'\)\}/);
    const set = read('modules/employee/components/set-credentials-modal.tsx');
    assert.equal((set.match(/<FormDialogContent\b/g) ?? []).length, 2, 'form and reveal on the shell');
    const headers = set.match(/<FocusDialogHeader\b[\s\S]*?\/>/g) ?? [];
    assert.equal(headers.length, 2, 'form and reveal headers');
    for (const h of headers) {
        assert.match(h, /icon=\{ShieldCheck\}/);
        assert.match(h, /eyebrow=\{t\('cred_set_title'\)\}/);
        assert.match(h, /title=\{empName\}/);
        assert.match(h, /code=\{shown\?\.code\b/);
    }
});

test('the saved-account reveal says it worked and ends with a Done button like the reset result', () => {
    const src = read('modules/employee/components/set-credentials-modal.tsx');
    const reveal = src.slice(src.indexOf('open={!!savedCreds}'));
    assert.match(reveal, /role="status"[\s\S]*?t\('cred_saved_title'\)/, 'status line');
    assert.match(reveal, /t\('cred_share_hint'\)/, 'share hint');
    assert.match(reveal, /onClick=\{closeReveal\}[^>]*>\s*\{t\('emp_cred_done'\)\}/, 'Done button');
});

test('network names sit under security, with the network name as the edit chip', () => {
    const src = read('modules/settings/components/network-name-modal.tsx');
    assert.match(src, /icon=\{Shield\}/, 'Shield icon');
    assert.match(src, /eyebrow=\{t\('set_security'\)\}/, 'security eyebrow');
    assert.match(src, /code=\{network\?\.name\}/, 'edit chip');
});

test('ticket small forms use the shared shell', () => TICKET_4B.forEach(assertSmallForm));

test('settings small forms use the 4ข look', () => SETTINGS_4A.forEach(assertSmallForm));

test('write-off reasons show the assets area, units and warranty types the master-data area', () => {
    const page = read('modules/settings/pages/index.tsx');
    assert.match(page, /icon=\{Box\}/, 'write-off reasons icon');
    assert.match(page, /eyebrow=\{t\('set_assets'\)\}/, 'write-off reasons eyebrow');
    assert.equal((page.match(/eyebrow=\{t\('set_master_data'\)\}/g) ?? []).length, 2, 'units and warranty types eyebrow');
});

test('employee and role small forms use the 4ข look', () => PEOPLE_4A.forEach(assertSmallForm));

test('asset small forms use the 4ข look with natural-width footer buttons', () => {
    for (const rel of ASSET_4A) {
        assertSmallForm(rel);
        assert.doesNotMatch(read(rel), /<(Button|SaveButton)\b[^>]*className="flex-1"/, `${rel}: equal-width buttons`);
    }
});

test('contract, request and stock small forms use the 4ข look', () => {
    RECORD_4A.forEach(assertSmallForm);
    for (const rel of ['modules/request/components/cancel-request-dialog.tsx', 'modules/request/components/decision-dialog.tsx']) {
        assert.doesNotMatch(read(rel), /pr-7/, `${rel}: reference moved into the eyebrow`);
    }
});

test('export and schedule dialogs use the shared shell and keep their own body and ghost cancel', () => {
    for (const rel of REPORT_4B) {
        assertSmallForm(rel);
        const src = read(rel);
        assert.match(src, /variant="ghost"/, `${rel}: ghost cancel`);
        assert.match(src, /px-6 pb-2/, `${rel}: body unchanged`);
        assert.doesNotMatch(src, /<DialogBody\b/, `${rel}: no hairline body`);
    }
});

test('the shared shell is 560 wide, capped, with a 32px close button and the large-dialog footer bar', () => {
    const src = read('shared/ui/dialog.tsx');
    for (const part of ['max-w-[560px]', 'max-h-[calc(100dvh-4.5rem)]', 'size-8', 'top-2 right-2', 'bg-muted/30', 'border-border/60']) {
        assert.ok(src.includes(part), `dialog.tsx: ${part}`);
    }
    assert.match(src, /export \{[^}]*\bFormDialogContent\b[^}]*\}/s);
    assert.match(src, /export \{[^}]*\bDialogBody\b[^}]*\}/s);
    assert.match(src, /export \{[^}]*\bDialogFooterBar\b[^}]*\}/s);
});

test('a long edit chip truncates inside the title row instead of spilling past the dialog edge', () => {
    const src = read('shared/components/dialog-header.tsx');
    const chip = src.match(/'([^']*rounded-md px-2 py-0\.5 text-xs font-semibold[^']*)'/);
    assert.ok(chip, 'chip class string found');
    for (const part of ['max-w-full', 'truncate']) assert.ok(chip[1].split(' ').includes(part), `chip: ${part}`);
});

test('bulk asset dialogs still tell screen readers how many assets are selected', () => {
    for (const rel of ['modules/asset/components/asset-writeoff-dialog.tsx', 'modules/asset/components/asset-return-to-vendor-dialog.tsx']) {
        const src = read(rel);
        assert.match(src, /const selectedCount = t\('asset_bulk_count'\)/, `${rel}: count text`);
        assert.match(src, /srDescription=\{[^\n]*selectedCount/, `${rel}: count in the description`);
    }
});
