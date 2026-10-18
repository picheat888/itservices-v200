// Audit log words: event names map to audit_ev_* keys, fields to audit_field_*, unknown ones show as stored.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { permission as en } from '../../resources/js/lang/en/permission.ts';
import { permission as th } from '../../resources/js/lang/th/permission.ts';
import {
    auditEventKey,
    auditEventLabel,
    auditFieldKey,
    auditFieldText,
    isAssetSubject,
} from '../../resources/js/modules/permission/lib/audit-words.ts';

const dict: Record<string, string> = { audit_ev_signed_in: 'เข้าสู่ระบบ', audit_field_owner: 'ผู้ถือครอง', audit_field_owner_employee_id: 'เจ้าของ' };
const t = (key: string) => dict[key] ?? key;

test('an action becomes its slug key', () => {
    assert.equal(auditEventKey('Signed in'), 'audit_ev_signed_in');
    assert.equal(auditEventKey('Force-recalled asset'), 'audit_ev_force_recalled_asset');
    assert.equal(auditEventKey('Stock adjust_up'), 'audit_ev_stock_adjust_up');
    assert.equal(auditEventKey('Updated SLA settings'), 'audit_ev_updated_sla_settings');
    assert.equal(auditEventKey('  Cancelled asset write-off. '), 'audit_ev_cancelled_asset_write_off');
});

test('a known action is translated and an unknown one shows as stored', () => {
    assert.equal(auditEventLabel('Signed in', t), 'เข้าสู่ระบบ');
    assert.equal(auditEventLabel('Launched rocket', t), 'Launched rocket');
});

test('owner_employee_id reads as holder on an asset and owner elsewhere', () => {
    assert.equal(isAssetSubject('App\\Models\\Asset\\Asset'), true);
    assert.equal(isAssetSubject('asset'), true);
    assert.equal(isAssetSubject('email_group'), false);
    assert.equal(isAssetSubject('App\\Models\\Asset\\AssetTransfer'), false);
    assert.equal(isAssetSubject(null), false);
    assert.equal(auditFieldKey('owner_employee_id', 'App\\Models\\Asset\\Asset'), 'audit_field_owner');
    assert.equal(auditFieldKey('owner_employee_id', 'file_share'), 'audit_field_owner_employee_id');
    assert.equal(auditFieldKey('owner_employee_id'), 'audit_field_owner_employee_id');
    assert.equal(auditFieldText('owner_employee_id', t, 'App\\Models\\Asset\\Asset'), 'ผู้ถือครอง');
    assert.equal(auditFieldText('owner_employee_id', t, 'email_group'), 'เจ้าของ');
    assert.equal(auditFieldText('mystery_col', t), 'mystery_col');
});

const APP_DIR = new URL('../../app/', import.meta.url);

/** The first argument of a call whose '(' sits at `open`: up to the first comma outside quotes and brackets. */
function firstArgument(source: string, open: number): string {
    let depth = 0;
    let quote: string | null = null;
    for (let i = open + 1; i < source.length; i++) {
        const c = source[i];
        if (quote) {
            if (c === '\\') i++;
            else if (c === quote) quote = null;
            continue;
        }
        if (c === "'" || c === '"') quote = c;
        else if ('([{'.includes(c)) depth++;
        else if (')]}'.includes(c)) {
            if (depth === 0) return source.slice(open + 1, i);
            depth--;
        } else if (c === ',' && depth === 0) return source.slice(open + 1, i);
    }
    throw new Error('unterminated call');
}

const literals = (code: string) => [...code.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]);

/** The keys of a PHP array constant, e.g. StockMovementController::TYPE_PERMISSION. */
function constantKeys(file: string, name: string): string[] {
    const source = readFileSync(new URL(file, APP_DIR), 'utf8');
    const body = source.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`))?.[1] ?? '';
    return [...body.matchAll(/'([^']+)'\s*=>/g)].map((m) => m[1]);
}

/** Every action string AuditLog::record / recordDeleted can write, read from the PHP sources under app/. */
function appAuditActions(): Set<string> {
    const actions = new Set<string>();
    const files = (readdirSync(APP_DIR, { recursive: true }) as string[]).filter((f) => f.endsWith('.php'));
    for (const file of files) {
        const source = readFileSync(new URL(file.replaceAll('\\', '/'), APP_DIR), 'utf8');
        for (const call of source.matchAll(/AuditLog::(?:record|recordDeleted)\(/g)) {
            const arg = firstArgument(source, (call.index ?? 0) + call[0].length - 1).trim();
            if (arg.startsWith('string $action')) continue;
            if (arg === "'Stock '.$type") {
                for (const type of constantKeys('Http/Controllers/Api/Stock/StockMovementController.php', 'TYPE_PERMISSION'))
                    actions.add(`Stock ${type}`);
                continue;
            }
            // A ternary's branches; a condition's own strings are not actions
            const branches = arg.includes('?') ? arg.slice(arg.indexOf('?')) : arg;
            const found = literals(branches);
            assert.ok(found.length > 0 && !/['"]\s*\.|\.\s*['"$]/.test(branches), `${file}: action not read from \`${arg}\``);
            found.forEach((action) => actions.add(action));
        }
    }
    return actions;
}

// Written only by the perf / demo data generators
const GENERATED_ACTIONS = ['Bulk asset writeoff', 'Stock issue', 'Stock adjust_up', 'Stock adjust_down'];
// Written by the app but still waiting for approved words
const AWAITING_WORDS = ['Duplicated role'];

test('every action the app writes has a word in both languages', () => {
    const actions = [...appAuditActions(), ...GENERATED_ACTIONS].filter((action) => !AWAITING_WORDS.includes(action));
    assert.ok(actions.length >= 150, `only ${actions.length} actions found; the scan missed calls`);
    for (const [lang, words] of Object.entries({ th, en })) {
        const missing = actions.filter((action) => !words[auditEventKey(action)]);
        assert.deepEqual(missing, [], `${lang}: no audit_ev_* word`);
    }
});
