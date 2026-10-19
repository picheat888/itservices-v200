// Role Template card model: the server layout must reproduce today's count specs, cascade edges, lock states, sections and (i) rows.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
    bareAria,
    cardCountSpec,
    cardRows,
    cardSections,
    countingHas,
    pageCards,
    rowShowsInfo,
    type CardLayout,
} from '../../resources/js/modules/permission/lib/card-layout.ts';
import { specEdges } from '../../resources/js/modules/permission/lib/draft-rebase.ts';
import { countGranted, type CountSpec } from '../../resources/js/modules/permission/lib/permission-count.ts';

const layout: CardLayout[] = JSON.parse(readFileSync(join(import.meta.dirname, '../Fixtures/permission-layout.json'), 'utf8'));
const card = (module: string): CardLayout => {
    const found = layout.find((c) => c.module === module);
    assert.ok(found, `card ${module} missing`);
    return found;
};
const holds = (keys: string[]) => (key: string) => keys.includes(key);

// Every card's count spec, frozen as literals (today's counting and cascade)
const SPECS: Record<string, CountSpec> = {
    dashboard: { free: ['dashboard.view_it', 'dashboard.view_requests', 'dashboard.view_contracts', 'dashboard.view_hr', 'dashboard.view_activity'] },
    tickets: {
        master: 'tickets.module',
        groups: [
            { view: 'tickets.view_dashboard', children: [] },
            { view: 'tickets.jobs', children: [] },
            { view: 'tickets.view_all', children: ['tickets.resolve', 'tickets.forward', 'tickets.assign', 'tickets.set_work_class'] },
        ],
        gated: [
            'tickets.level_hardware',
            'tickets.level_software',
            'tickets.level_network',
            'tickets.level_cctv',
            'tickets.level_telephone',
            'tickets.level_other',
        ],
        standalone: [{ view: 'tickets.create', children: ['tickets.edit_own'] }],
        free: ['tickets.my'],
    },
    requests: {
        master: 'requests.module',
        groups: [
            { view: 'requests.complete', children: [] },
            {
                view: 'requests.submit',
                children: [
                    'requests.submit_computer',
                    'requests.submit_hardware',
                    'requests.submit_mobile',
                    'requests.submit_email',
                    'requests.submit_social',
                    'requests.submit_fileshare',
                    'requests.submit_software',
                    'requests.submit_recovery',
                    'requests.submit_mailgroup',
                    'requests.submit_telephone',
                    'requests.submit_network',
                    'requests.submit_cctv',
                    'requests.submit_other',
                ],
                fillOnGrant: true,
            },
            { view: 'requests.view_all', children: ['requests.cancel_any'] },
        ],
        gated: ['requests.notify_approved', 'requests.notify_stalled'],
    },
    assets: {
        master: 'assets.module',
        groups: [
            { view: 'assets.view_dashboard', children: [] },
            { view: 'assets.view', children: ['assets.register', 'assets.edit', 'assets.delete'] },
            { view: 'assets.manage', children: ['assets.transfer', 'assets.receive', 'assets.retire'] },
            { view: 'assets.special', children: ['assets.force_recall', 'assets.cancel_writeoff'] },
        ],
    },
    contracts: {
        master: 'contracts.module',
        groups: [
            { view: 'contracts.view_dashboard', children: [] },
            { view: 'contracts.alerts', children: [] },
            { view: 'contracts.view', children: ['contracts.create', 'contracts.edit', 'contracts.delete'] },
            { view: 'contracts.view_lifecycle', children: ['contracts.cancel', 'contracts.expire', 'contracts.reactivate'] },
        ],
    },
    stock: {
        master: 'stock.module',
        groups: [
            { view: 'stock.view_dashboard', children: [] },
            { view: 'stock.view_count', children: [] },
            { view: 'stock.view_events', children: [] },
            { view: 'stock.view', children: ['stock.manage_items', 'stock.delete', 'stock.receive', 'stock.return', 'stock.transfer'] },
            { view: 'stock.view_request', children: ['stock.request', 'stock.approve', 'stock.fulfill'] },
        ],
    },
    employees: {
        master: 'employees.module',
        groups: [
            { view: 'employees.view_dashboard', children: [] },
            { view: 'employees.view_org', children: [] },
            {
                view: 'employees.view',
                children: [
                    'employees.add',
                    'employees.import',
                    'employees.edit',
                    'employees.reset_password',
                    'employees.resign',
                    'employees.cancel_resign',
                    'employees.set_credentials',
                    'employees.delete',
                ],
            },
            { view: 'employees.view_section', children: ['employees.section_add', 'employees.section_edit', 'employees.section_delete'] },
            { view: 'employees.view_department', children: ['employees.department_add', 'employees.department_edit', 'employees.department_delete'] },
            {
                view: 'employees.view_position',
                children: ['employees.position_add', 'employees.position_edit', 'employees.position_delete', 'employees.position_special'],
            },
        ],
    },
    access: {
        master: 'access.module',
        groups: [
            { view: 'access.overview', children: [] },
            { view: 'access.email_view', children: ['access.email_add', 'access.email_edit', 'access.email_delete'] },
            { view: 'access.file_view', children: ['access.file_add', 'access.file_edit', 'access.file_delete'] },
            { view: 'access.social_view', children: ['access.social_add', 'access.social_edit', 'access.social_delete'] },
            { view: 'access.software_view', children: ['access.software_add', 'access.software_edit', 'access.software_delete'] },
        ],
    },
    profile: { free: ['profile.edit', 'profile.return_assets'] },
    reports: {
        master: 'reports.module',
        gated: [
            'reports.tickets',
            'reports.assets',
            'reports.contracts',
            'reports.stock',
            'reports.requests',
            'reports.employees',
            'reports.access',
            'reports.export',
            'reports.schedule',
            'reports.schedule_manage',
        ],
    },
    workflows: { master: 'workflows.module', gated: ['workflows.manage'] },
    permissions: { master: 'system.manage_permissions', gated: ['system.manage_roles', 'system.manage_groups', 'system.view_audit'] },
    notifications: {
        master: 'notifications.module',
        groups: [{ view: 'notifications.logs', children: [] }],
        gated: [
            'notifications.email_edit',
            'notifications.email_toggle',
            'notifications.email_test',
            'notifications.inapp_edit',
            'notifications.inapp_toggle',
            'notifications.inapp_test',
        ],
    },
    settings: {
        master: 'settings.access',
        gated: [
            'settings.company',
            'settings.system',
            'settings.masterdata',
            'settings.email',
            'settings.sla',
            'settings.requestdata',
            'settings.assets',
            'settings.security',
        ],
    },
};

test('every card of the layout has a frozen spec', () => {
    assert.deepEqual(
        layout.map((c) => c.module),
        Object.keys(SPECS),
    );
});

test("the count spec of every card equals today's spec", () => {
    for (const module of Object.keys(SPECS)) {
        assert.deepEqual(cardCountSpec(card(module)), SPECS[module], module);
    }
});

test('rebase edges are unchanged', () => {
    const sorted = (spec: CountSpec) =>
        specEdges(spec)
            .map((e) => `${e.parent}>${e.child}`)
            .sort();
    for (const module of Object.keys(SPECS)) {
        assert.deepEqual(sorted(cardCountSpec(card(module))), sorted(SPECS[module]), module);
    }
});

test('ticket self-service stays usable with the master off', () => {
    const rows = cardRows(card('tickets'), holds(['tickets.create']), false).cells.flatMap((c) => c.rows);
    const get = (key: string) => rows.find((r) => r.key === key);
    assert.deepEqual([get('tickets.create')?.on, get('tickets.create')?.locked], [true, false]);
    assert.equal(get('tickets.edit_own')?.locked, false);
    assert.equal(get('tickets.view_all')?.locked, true);
    assert.equal(get('tickets.view_all')?.lockedBy, 'tickets.module');
});

test('a child waits on its group view', () => {
    const rows = cardRows(card('stock'), holds(['stock.module']), false).cells.flatMap((c) => c.rows);
    const del = rows.find((r) => r.key === 'stock.delete');
    assert.equal(del?.locked, true);
    assert.equal(del?.lockedBy, 'stock.view');
});

test('a role-wide lock locks every row and names no switch', () => {
    const rows = cardRows(card('tickets'), holds(['tickets.module']), true).cells.flatMap((c) => c.rows);
    assert.ok(rows.length > 0);
    assert.ok(rows.every((r) => r.locked && r.lockedBy === null));
});

test('an unknown catalogue module becomes a plain Other card', () => {
    const catalog: Record<string, string[]> = { backup: ['run', 'restore'] };
    for (const c of layout) {
        for (const key of [...(c.master ? [c.master.key] : []), ...c.cells.flatMap((cell) => (cell.kind === 'group' ? [cell.view] : cell.keys))]) {
            const [module, action] = key.split('.');
            (catalog[module] ??= []).push(action);
        }
    }

    const cards = pageCards(layout, catalog);
    assert.equal(cards.length, layout.length + 1, 'only the unknown module adds a card');
    assert.deepEqual(cards.at(-1), {
        module: 'backup',
        master: null,
        note: null,
        cells: [{ kind: 'plain', keys: ['backup.run', 'backup.restore'], coming_soon_aware: true }],
    });
    assert.deepEqual(cardCountSpec(cards.at(-1)!), { free: ['backup.run', 'backup.restore'] });

    const sections = cardSections(cards).map((s) => [s.label, s.cards.map((c) => c.module)]);
    assert.deepEqual(sections, [
        ['nav_overview', ['dashboard']],
        ['nav_workspace', ['tickets', 'requests', 'assets', 'contracts', 'stock', 'employees', 'access', 'profile']],
        ['nav_admin', ['reports', 'workflows', 'permissions', 'notifications', 'settings']],
        ['perm_other', ['backup']],
    ]);
    assert.ok(!cardSections(layout).some((s) => s.label === 'perm_other'), 'no Other section while every module has a card');
});

test('coming-soon keys keep their tag and stay out of live counts', () => {
    const isLive = (key: string) => key !== 'dashboard.view_hr' && key !== 'settings.sla' && key !== 'profile.edit';
    const all = () => true;

    const dashboard = card('dashboard');
    const rows = cardRows(dashboard, all, false, isLive).cells.flatMap((c) => c.rows);
    const hr = rows.find((r) => r.key === 'dashboard.view_hr');
    assert.deepEqual([hr?.comingSoon, hr?.on, hr?.locked], [true, false, true]);
    assert.ok(rows.filter((r) => r.key !== 'dashboard.view_hr').every((r) => !r.comingSoon && r.on && !r.locked));
    assert.deepEqual(countGranted(cardCountSpec(dashboard), countingHas(dashboard, all, isLive)), { on: 4, total: 5 });

    // A super role still sees a coming-soon key off and locked
    const superHr = cardRows(dashboard, all, true, isLive).cells[0].rows.find((r) => r.key === 'dashboard.view_hr');
    assert.deepEqual([superHr?.comingSoon, superHr?.on, superHr?.locked], [true, false, true]);

    const settings = card('settings');
    assert.deepEqual(countGranted(cardCountSpec(settings), countingHas(settings, all, isLive)), { on: 8, total: 9 });
    const sla = cardRows(settings, all, false, isLive).cells[0].rows.find((r) => r.key === 'settings.sla');
    assert.equal(sla?.comingSoon, true);

    // My Profile is not coming-soon aware: every switch works and counts
    const profile = card('profile');
    const profileRows = cardRows(profile, all, false, isLive).cells[0].rows;
    assert.ok(profileRows.every((r) => !r.comingSoon && r.on && !r.locked));
    assert.deepEqual(countGranted(cardCountSpec(profile), countingHas(profile, all, isLive)), { on: 2, total: 2 });

    // Tree cards never consult the live set
    const tickets = card('tickets');
    assert.equal(countingHas(tickets, all, () => false)('tickets.module'), true);
    assert.ok(
        cardRows(tickets, all, false, () => false)
            .cells.flatMap((c) => c.rows)
            .every((r) => !r.comingSoon),
    );
});

const described = new Set(
    [...readFileSync(join(import.meta.dirname, '../../resources/js/lang/th/permission.ts'), 'utf8').matchAll(/'perm_desc_([a-z_]+\.[a-z_]+)'/g)].map(
        (m) => m[1],
    ),
);

test('every row has its (i) where lang has a description', () => {
    assert.ok(described.size > 0, 'the lang scan found no descriptions');
    const missing: string[] = [];
    for (const c of layout) {
        if (c.master && described.has(c.master.key) && !rowShowsInfo(c, null, c.master.key)) missing.push(c.master.key);
        for (const cell of c.cells) {
            const keys = cell.kind === 'group' ? [cell.view, ...cell.children, ...cell.solo] : cell.keys;
            for (const key of keys) if (described.has(key) && !rowShowsInfo(c, cell, key)) missing.push(key);
        }
    }
    // Today's gaps: master bands other than stock and employees, and the ticket self-service head
    assert.deepEqual(missing.sort(), ['access.module', 'assets.module', 'requests.module', 'tickets.create', 'workflows.module']);
});

test('the (i) rule: masters of stock and employees, no ticket level or self-service head', () => {
    assert.equal(rowShowsInfo(card('stock'), null, 'stock.module'), true);
    assert.equal(rowShowsInfo(card('employees'), null, 'employees.module'), true);
    assert.equal(rowShowsInfo(card('settings'), null, 'settings.access'), false);

    const tickets = card('tickets');
    const levels = tickets.cells.find((cell) => cell.kind === 'set')!;
    const selfService = tickets.cells.find((cell) => cell.kind === 'group' && cell.outside_master)!;
    assert.equal(rowShowsInfo(tickets, levels, 'tickets.level_cctv'), false);
    assert.equal(rowShowsInfo(tickets, selfService, 'tickets.create'), false);
    assert.equal(rowShowsInfo(tickets, selfService, 'tickets.edit_own'), true);
    assert.equal(rowShowsInfo(tickets, selfService, 'tickets.my'), true);

    const dashboard = card('dashboard');
    assert.equal(rowShowsInfo(dashboard, dashboard.cells[0], 'dashboard.view_it'), true);
});

test('set rows speak their heading except Ticket Level and request notifications', () => {
    const bare = layout.flatMap((c) => c.cells.filter((cell) => cell.kind === 'set' && bareAria(c, cell)).map(() => c.module));
    assert.deepEqual(bare, ['tickets', 'requests']);
    assert.equal(bareAria(card('stock'), card('stock').cells[1]), false);
});
