// Fresh-data rollout inventory: every wired dropdown, tab bar, dialog and edit form in scope uses the kit (source scan).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = join(import.meta.dirname, '../../resources/js');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

type Site = {
    file: string;
    freshList?: number;
    freshView?: number;
    refresh?: number;
    marks?: number;
    openRefetch?: number;
    rebase?: number;
    seedOnce?: number;
    flagRemoved?: number;
    focus?: number;
};

const NEEDLES: Record<Exclude<keyof Site, 'file'>, string> = {
    freshList: '...FRESH_LIST',
    freshView: '...FRESH_VIEW',
    refresh: 'refresh={',
    marks: 'refresh: marks',
    openRefetch: 'useRefetchOnOpen(',
    rebase: 'useFormRebase(',
    seedOnce: 'useSeedOnce(',
    flagRemoved: 'flagRemoved',
    focus: 'refetchOnWindowFocus: true',
};

const SITES: Site[] = [
    { file: 'modules/settings/hooks/use-master-data.ts', freshList: 8 },
    { file: 'modules/employee/hooks/use-departments.ts', freshList: 1, freshView: 1 },
    { file: 'modules/employee/hooks/use-positions.ts', freshList: 1, freshView: 1 },
    { file: 'modules/employee/hooks/use-sections.ts', freshList: 1, freshView: 1 },
    { file: 'modules/employee/hooks/use-employees.ts', freshView: 9 },
    { file: 'modules/employee/pages/index.tsx', marks: 6, refresh: 1, focus: 2 },
    { file: 'modules/employee/components/sections-tab.tsx', refresh: 1, focus: 1 },
    { file: 'modules/employee/hooks/use-locations.ts', freshList: 1 },
    { file: 'modules/ticket/hooks/use-tickets.ts', freshView: 2, freshList: 1 },
    { file: 'modules/ticket/pages/index.tsx', marks: 1, freshView: 2, openRefetch: 2 },
    { file: 'modules/ticket/components/ticket-detail-drawer.tsx', marks: 3 },
    { file: 'modules/ticket/components/edit-ticket-drawer.tsx', rebase: 1, seedOnce: 1 },
    { file: 'modules/ticket/components/assign-ticket-modal.tsx', refresh: 1 },
    { file: 'modules/ticket/components/forward-ticket-modal.tsx', refresh: 1 },
    { file: 'modules/asset/hooks/use-assets.ts', freshView: 5, freshList: 2 },
    { file: 'modules/asset/pages/index.tsx', marks: 1, refresh: 2, openRefetch: 2 },
    { file: 'modules/asset/components/asset-detail-drawer.tsx', marks: 3 },
    { file: 'modules/asset/components/contract-peek-dialog.tsx', marks: 2, openRefetch: 1 },
    { file: 'modules/contract/hooks/use-contracts.ts', freshView: 3 },
    { file: 'modules/contract/pages/index.tsx', marks: 2, openRefetch: 2 },
    {
        file: 'modules/contract/components/contract-form-drawer.tsx',
        refresh: 1,
        flagRemoved: 1,
        freshList: 1,
        openRefetch: 1,
        seedOnce: 1,
        rebase: 1,
    },
    { file: 'modules/contract/components/contract-detail-drawer.tsx', marks: 4 },
    { file: 'modules/asset/components/asset-form-drawer.tsx', refresh: 6, flagRemoved: 4, seedOnce: 1, rebase: 1 },
    { file: 'modules/asset/components/asset-location-dialog.tsx', refresh: 1, seedOnce: 1, rebase: 1 },
    { file: 'modules/asset/components/asset-receive-modal.tsx', refresh: 1 },
    { file: 'modules/asset/components/asset-writeoff-dialog.tsx', refresh: 1, flagRemoved: 1 },
    { file: 'modules/asset/components/asset-transfer-dialog.tsx', refresh: 1, openRefetch: 1 },
    { file: 'modules/stock/hooks/use-stock.ts', freshView: 9, freshList: 1 },
    { file: 'modules/stock/pages/index.tsx', marks: 1, refresh: 2, openRefetch: 1 },
    { file: 'modules/stock/components/stock-item-modal.tsx', refresh: 5, flagRemoved: 4, seedOnce: 1, rebase: 1 },
    { file: 'modules/stock/components/request-drawer.tsx', refresh: 1, flagRemoved: 1 },
    { file: 'modules/stock/components/movement-drawer.tsx', refresh: 4, flagRemoved: 1 },
    { file: 'modules/stock/pages/tabs/counting-tab.tsx', refresh: 2 },
    { file: 'modules/stock/components/stock-item-detail-modal.tsx', marks: 4, openRefetch: 1 },
    { file: 'modules/stock/pages/tabs/requests-tab.tsx', seedOnce: 1, openRefetch: 1 },
    { file: 'modules/stock/pages/tabs/movements-tab.tsx', openRefetch: 1 },
];

const count = (text: string, needle: string) => text.split(needle).length - 1;

for (const site of SITES) {
    test(`${site.file} uses the fresh-data kit`, () => {
        const text = read(site.file);
        for (const key of Object.keys(NEEDLES) as (keyof typeof NEEDLES)[]) {
            const expected = site[key];
            if (expected !== undefined) {
                assert.equal(count(text, NEEDLES[key]), expected, `${key} (${NEEDLES[key]})`);
            }
        }
    });
}

test('employee search waits five seconds', () => {
    const text = read('modules/employee/hooks/use-employee-pickers.ts');
    assert.ok(text.includes('staleTime: FRESH_MS'));
    assert.ok(!text.includes('30_000'));
});

test('ticket asset search waits five seconds', () => {
    const text = read('modules/ticket/hooks/use-tickets.ts');
    assert.ok(!text.includes('30_000'));
    assert.ok(text.includes('staleTime: FRESH_MS'));
});

test('the ticket edit drawer never rebases its attachments', () => {
    assert.ok(read('modules/ticket/components/edit-ticket-drawer.tsx').includes("skip: ['existing']"));
});

test('an asset row opens the detail through seedRowCopy under the drawer key', () => {
    const page = read('modules/asset/pages/index.tsx');
    assert.ok(page.includes("seedRowCopy(qc, ['asset', a.id], a)"));
    assert.ok(!page.includes("'asset', 'view'"));
});

test('a background refetch never blanks a wired table into skeleton rows', () => {
    for (const site of SITES) {
        const text = read(site.file);
        assert.ok(!/[A-Za-z]*[Ll]oading \|\| [A-Za-z]*[Ff]etching/.test(text), `${site.file} shows skeleton rows while it refreshes`);
    }
});

test('the contract edit form decides it is refused from the copy it opened with', () => {
    const page = read('modules/contract/pages/index.tsx');
    assert.ok(page.includes('const editRefused = editing != null &&'));
});

test('tab bars keep no room for the mark on idle tabs', () => {
    for (const file of ['shared/components/page-tabs.tsx', 'shared/components/dialog-tabs.tsx']) {
        assert.ok(!read(file).includes("'pr-8"), `${file} reserves room on every tab`);
    }
    assert.ok(!read('shared/components/tab-refresh-mark.tsx').includes('absolute'));
});

test('stock dialogs follow the kit rules', () => {
    assert.ok(read('modules/stock/pages/tabs/movements-tab.tsx').includes('useRefetchOnOpen(moveOpen,'));
    assert.ok(read('modules/stock/components/stock-item-detail-modal.tsx').includes('isRecordMissing('));
    assert.ok(!read('modules/stock/hooks/use-stock.ts').includes('now comes'));
});

test('dialogs that keep their last record for the exit animation query it only while open', () => {
    assert.ok(read('modules/stock/pages/tabs/counting-tab.tsx').includes('useStockCount(shownId, sheetOpen)'));
    assert.ok(read('modules/stock/pages/tabs/requests-tab.tsx').includes('useStockItem(fulfillReq?.stock_item_id ?? null, fulfillOpen)'));
    assert.ok(read('modules/stock/pages/tabs/movements-tab.tsx').includes('useMovementSerials(viewMove?.id ?? null, moveOpen)'));
    assert.ok(read('modules/asset/components/contract-peek-dialog.tsx').includes('useAssetContract(shownAssetId, open)'));
});
