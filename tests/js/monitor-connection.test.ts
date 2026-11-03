// Monitor TV header: the stale-data warning shows only after two failed polls in a row.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { monitor as th } from '../../resources/js/lang/th/monitor.ts';
import { connectionLabel } from '../../resources/js/modules/monitor/components/connection-label.ts';

const t = (key: string) => th[key];
const at = (hhmmss: string) => new Date(`2026-01-14T${hhmmss}`).getTime();

test('one missed poll is not worth a warning', () => {
    assert.equal(connectionLabel(0, at('10:42:15'), t), null);
    assert.equal(connectionLabel(1, at('10:42:15'), t), null);
});

test('two missed polls say when the data is from', () => {
    assert.equal(connectionLabel(2, at('10:42:15'), t), 'ขาดการเชื่อมต่อ ข้อมูลล่าสุด 10:42:15');
});

test('no board yet has no time to show', () => {
    assert.equal(connectionLabel(3, null, t), null);
});
