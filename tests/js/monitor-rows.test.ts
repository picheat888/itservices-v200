// Monitor TV rows: pages that fit the list height, new arrivals and the popup order.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boardChanges, newArrivals, paginateRows, popupOrder } from '../../resources/js/modules/monitor/lib/monitor-rows.ts';
import type { MonitorBoard, MonitorRow } from '../../resources/js/modules/monitor/types.ts';

let nextId = 1;
const row = (group: MonitorRow['group'], due: string, clock: MonitorRow['clock'] = group === 'waiting' ? 'response' : 'resolve'): MonitorRow => ({
    id: nextId++,
    ticket_no: `TKT-${nextId}`,
    subject: 'Case',
    priority: 'high',
    department: null,
    requester: null,
    group,
    clock,
    due_at: due,
    created_at: '2026-01-14T09:00:00+07:00',
    assignee: null,
});

const board = (rows: MonitorRow[]): MonitorBoard => ({
    generated_at: '2026-01-14T12:00:00+07:00',
    sound: { key: 'pluck', enabled: true },
    kpis: {
        waiting: 0,
        waiting_oldest_at: null,
        in_progress: 0,
        busy_staff: 0,
        overdue: 0,
        overdue_response: 0,
        overdue_resolve: 0,
        near_due: 0,
        closed_today: 0,
        closed_today_met: 0,
    },
    rows,
    team: [],
});

test('rows split into pages that fit, repeating the group head on a new page', () => {
    const rows = [
        ...[1, 2, 3].map(() => row('overdue', '2026-01-14T10:00:00+07:00')),
        ...[1, 2].map(() => row('near', '2026-01-14T12:30:00+07:00')),
        ...[1, 2, 3, 4, 5, 6].map(() => row('waiting', '2026-01-14T13:00:00+07:00')),
    ];

    const pages = paginateRows(rows);

    assert.equal(pages.length, 2);
    assert.deepEqual(
        pages[0].map((e) => (e.kind === 'head' ? `head:${e.group}` : 'row')),
        ['head:overdue', 'row', 'row', 'row', 'head:near', 'row', 'row', 'head:waiting', 'row'],
    );
    assert.deepEqual(pages[1][0], { kind: 'head', group: 'waiting', count: 6 });
    assert.equal(pages[1].filter((e) => e.kind === 'row').length, 5);
});

test('no rows gives no pages', () => {
    assert.deepEqual(paginateRows([]), []);
});

test('the first board never counts as new', () => {
    assert.deepEqual(newArrivals(null, board([row('waiting', '2026-01-14T13:00:00+07:00')])), []);
});

test('only untaken cases the screen has not seen are new', () => {
    const seen = row('waiting', '2026-01-14T13:00:00+07:00');
    const fresh = row('waiting', '2026-01-14T13:10:00+07:00');
    const taken = row('near', '2026-01-14T12:30:00+07:00');

    assert.deepEqual(newArrivals(new Set([seen.id]), board([seen, fresh, taken])), [fresh]);
});

test('the popup lists the least time left first', () => {
    const later = row('waiting', '2026-01-14T13:30:00+07:00');
    const sooner = row('waiting', '2026-01-14T12:14:00+07:00');

    assert.deepEqual(popupOrder([later, sooner]), [sooner, later]);
});

test('no previous board means nothing new and nothing just overdue', () => {
    const a = row('waiting', '2026-01-14T13:00:00+07:00');
    assert.deepEqual(boardChanges(null, board([a])), { freshIds: [], justOverdueIds: [] });
});

test('rows absent from the previous board are fresh, any group', () => {
    const kept = row('near', '2026-01-14T12:30:00+07:00');
    const newWaiting = row('waiting', '2026-01-14T13:00:00+07:00');
    const newWork = row('near', '2026-01-14T12:40:00+07:00');
    assert.deepEqual(boardChanges(board([kept]), board([kept, newWaiting, newWork])).freshIds, [newWaiting.id, newWork.id]);
});

test('a row that moved into overdue since the previous board is just overdue', () => {
    const was = row('near', '2026-01-14T12:30:00+07:00');
    const stillLate = row('overdue', '2026-01-14T10:00:00+07:00');
    const now = { ...was, group: 'overdue' as const };
    assert.deepEqual(boardChanges(board([was, stillLate]), board([now, stillLate])).justOverdueIds, [was.id]);
});
