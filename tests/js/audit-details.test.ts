// Audit entry details: which rows expand, the one-line summary, and module words for stored enum values.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { access as enAccess } from '../../resources/js/lang/en/access.ts';
import { asset as enAsset } from '../../resources/js/lang/en/asset.ts';
import { common as enCommon } from '../../resources/js/lang/en/common.ts';
import { contract as enContract } from '../../resources/js/lang/en/contract.ts';
import { employee as enEmployee } from '../../resources/js/lang/en/employee.ts';
import { requests as enRequests } from '../../resources/js/lang/en/requests.ts';
import { common as thCommon } from '../../resources/js/lang/th/common.ts';
import {
    auditBooleanKey,
    auditDiffSummary,
    auditFacts,
    auditSubjectName,
    auditValueKey,
    decimalPlaces,
    hasAuditDetails,
    type SummaryWords,
} from '../../resources/js/modules/permission/lib/audit-details.ts';

const words: SummaryWords = { label: (field) => `[${field}]`, value: (_field, v) => String(v) };

test('an entry expands only when the panel has something to draw', () => {
    assert.equal(hasAuditDetails(null), false);
    assert.equal(hasAuditDetails({}), false);
    assert.equal(hasAuditDetails({ added: [], changes: {}, facts: {}, snapshot: {} }), false);
    assert.equal(hasAuditDetails({ added: ['tickets.view'] }), true);
    assert.equal(hasAuditDetails({ to: 'Manager' }), true);
    assert.equal(hasAuditDetails({ changes: { name: { from: 'A', to: 'B' } } }), true);
    assert.equal(hasAuditDetails({ items: ['AS-001'] }), true);
    assert.equal(hasAuditDetails({ facts: { note: 'x' } }), true);
    assert.equal(hasAuditDetails({ snapshot: { name: 'Gone' } }), true);
});

test('the summary names the first change and counts the rest', () => {
    const summary = auditDiffSummary({ changes: { name: { from: 'A', to: null }, color: { from: '#1', to: '#2' } } }, words);
    assert.equal(summary, '[name]: A → —  +1');
    assert.equal(auditDiffSummary({ added: ['a', 'b'], removed: ['c'] }, words), '+2 / −1');
    assert.equal(auditDiffSummary({ from: 'Staff', to: 'Manager' }, words), 'Staff → Manager');
    assert.equal(auditDiffSummary({ items: ['AS-1', 'AS-2', 'AS-3'] }, words), 'AS-1  +2');
    assert.equal(auditDiffSummary({ facts: { contract: 'C-9', note: 'late' } }, words), '[contract]: C-9  [note]: late');
});

test('the summary clips long values and leaves a delete snapshot to the panel', () => {
    const long = 'x'.repeat(100);
    assert.equal(auditDiffSummary({ changes: { body: { from: '', to: long } } }, words), `[body]: — → ${'x'.repeat(60)}…`);
    assert.equal(auditDiffSummary({ snapshot: { name: 'Gone', status: 'ready' } }, words), null);
    assert.equal(auditDiffSummary(null, words), null);
});

test('a subject type reads as its base name', () => {
    assert.equal(auditSubjectName('App\\Models\\Asset\\Asset'), 'asset');
    assert.equal(auditSubjectName('App\\Models\\Settings\\RequestOption'), 'requestoption');
    assert.equal(auditSubjectName('software'), 'software');
    assert.equal(auditSubjectName('email_group'), 'emailgroup');
    assert.equal(auditSubjectName(null), '');
});

test('stored enum values map to words the owning module already has', () => {
    const cases: [string, string, string, Record<string, string>][] = [
        ['status', 'pending_acceptance', 'App\\Models\\Asset\\Asset', enAsset],
        ['source', 'rented', 'App\\Models\\Asset\\Asset', enAsset],
        ['type', 'connectivity', 'App\\Models\\Contract\\Contract', enContract],
        ['billing_cycle', 'yearly', 'App\\Models\\Contract\\Contract', enContract],
        ['status', 'resigned', 'App\\Models\\Employee\\Employee', enEmployee],
        ['license_type', 'open_source', 'software', enAccess],
        ['request_type', 'mailgroup', 'App\\Models\\Settings\\RequestOption', enRequests],
    ];
    for (const [field, value, subject, dict] of cases) {
        const key = auditValueKey(field, value, subject);
        assert.ok(key && dict[key], `${subject} ${field}=${value} → ${key}`);
    }
    // The same column on another subject, an unknown value, or a non-string stays as stored
    assert.equal(auditValueKey('status', 'ready', 'App\\Models\\Ticket\\Ticket'), undefined);
    assert.equal(auditValueKey('status', 'lost', 'App\\Models\\Asset\\Asset'), undefined);
    assert.equal(auditValueKey('status', 1, 'App\\Models\\Asset\\Asset'), undefined);
    assert.equal(auditValueKey('type', 'toString', 'App\\Models\\Contract\\Contract'), undefined);
});

test('only known decimal columns count their places', () => {
    assert.equal(decimalPlaces('value', '1500.00'), 2);
    assert.equal(decimalPlaces('unit_cost', '-3.5'), 1);
    assert.equal(decimalPlaces('total_value', '12.345'), 3);
    assert.equal(decimalPlaces('value', '2026'), null);
    assert.equal(decimalPlaces('value', '1.2.3'), null);
    assert.equal(decimalPlaces('value', 1.5), null);
    // A dotted value in any other column stays as stored
    assert.equal(decimalPlaces('version', '1.10'), null);
    assert.equal(decimalPlaces('ip_address', '10.0'), null);
    assert.equal(decimalPlaces('serial', '12.50'), null);
});

test('known boolean columns read yes / no, other 0 / 1 values do not', () => {
    assert.equal(auditBooleanKey('is_system', true), 'yes');
    assert.equal(auditBooleanKey('notify_30', 1), 'yes');
    assert.equal(auditBooleanKey('active', '0'), 'no');
    assert.equal(auditBooleanKey('warranty_lifetime', false), 'no');
    assert.equal(auditBooleanKey('track_serial', 0), 'no');
    assert.equal(auditBooleanKey('allow_special_position', 'yes'), undefined);
    assert.equal(auditBooleanKey('seats', 1), undefined);
    assert.equal(auditBooleanKey('position_id', 0), undefined);
    for (const dict of [enCommon, thCommon]) assert.ok(dict.yes && dict.no);
});

test('a from with no to, and stray scalar keys, are facts', () => {
    const copy = { from: 'Admin', permissions: 12 } as Record<string, unknown>;
    assert.deepEqual(auditFacts(copy), [
        ['from', 'Admin'],
        ['permissions', '12'],
    ]);
    assert.equal(hasAuditDetails(copy), true);
    assert.equal(auditDiffSummary(copy, words), '[from]: Admin  [permissions]: 12');
    // A real before → after stays an arrow, and facts keep their order
    assert.equal(auditDiffSummary({ from: 'Staff', to: 'Manager' }, words), 'Staff → Manager');
    assert.deepEqual(auditFacts({ facts: { note: 'x' }, ticket: 'T-1' } as Record<string, unknown>), [
        ['note', 'x'],
        ['ticket', 'T-1'],
    ]);
    assert.deepEqual(auditFacts({ from: '', added: ['a'], returned: true } as Record<string, unknown>), []);
});
