// UAT TKT-15-07: a TV that loses its network keeps polling, so the failures add up and "ขาดการเชื่อมต่อ ข้อมูลเมื่อ <เวลา>" shows.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const hook = readFileSync(join(import.meta.dirname, '../../resources/js/modules/monitor/hooks/use-monitor.ts'), 'utf8');

test('the board query polls even while the browser says it is offline', () => {
    const board = hook.slice(hook.indexOf('export function useMonitorBoard'), hook.indexOf('export function useMonitorBoard') + 1600);
    assert.match(board, /networkMode: 'always',/);
    assert.match(board, /failures\.current \+= 1;/);
});
