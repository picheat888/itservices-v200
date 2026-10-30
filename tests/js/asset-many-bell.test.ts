// The bulk hand-over and recall bells (AST-16): a count heading, a count message, and their words in both languages.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { notification as en } from '../../resources/js/lang/en/notification.ts';
import { notification as th } from '../../resources/js/lang/th/notification.ts';

const text = readFileSync(new URL('../../resources/js/modules/notification/lib/notification-text.ts', import.meta.url), 'utf8');

test('a bell carrying a count is headed by the count, before the one-machine heading', () => {
    const many = text.indexOf("t('notif_assets_count_title')");
    const one = text.indexOf('return `${n.data.asset_model} (${n.data.asset_tag})`');
    assert.ok(many > 0 && one > many);
    assert.match(text, /\(n\.data\.type === 'asset_assigned' \|\| n\.data\.type === 'asset_recalled'\) && n\.data\.count/);
});

test('the message switches to the many wording when there is a count', () => {
    assert.match(text, /type === 'asset_assigned' && n\.data\.count\) return t\('notif_asset_assigned_many'\)/);
    assert.match(text, /type === 'asset_recalled' && n\.data\.count\) return t\('notif_asset_recalled_many'\)/);
});

test('the words match the mockup and exist in both languages', () => {
    assert.equal(th.notif_assets_count_title, 'ทรัพย์สิน {n} เครื่อง');
    assert.equal(th.notif_asset_assigned_many, 'IT โอนทรัพย์สินให้คุณ {n} เครื่อง กดรับมอบในโปรไฟล์ของฉัน');
    assert.equal(th.notif_asset_recalled_many, 'IT เรียกคืนทรัพย์สิน {n} เครื่องแล้ว');
    for (const dict of [th, en] as Record<string, string>[]) {
        for (const key of ['notif_assets_count_title', 'notif_asset_assigned_many', 'notif_asset_recalled_many']) {
            assert.ok(dict[key]?.includes('{n}'), key);
            assert.ok(!dict[key].includes(' - ') && !dict[key].includes(' · '), key);
        }
        for (const bell of ['asset_assigned_many', 'asset_recalled_many']) {
            for (const part of ['name', 'when', 'who']) assert.ok(dict[`notification_${part}_${bell}`], `${part} ${bell}`);
        }
    }
});
