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
    { file: 'modules/employee/pages/index.tsx', marks: 6, refresh: 1, focus: 2, openRefetch: 2 },
    { file: 'modules/employee/components/sections-tab.tsx', refresh: 1, focus: 1 },
    { file: 'modules/employee/components/edit-employee-dialog.tsx', refresh: 3, flagRemoved: 2, rebase: 1 },
    { file: 'modules/employee/components/add-employee-drawer.tsx', refresh: 4, flagRemoved: 2 },
    { file: 'modules/employee/components/section-modal.tsx', refresh: 1, flagRemoved: 1, seedOnce: 1, rebase: 1 },
    { file: 'modules/employee/components/position-modal.tsx', seedOnce: 1, rebase: 1 },
    { file: 'modules/employee/components/department-modal.tsx', seedOnce: 1, rebase: 1 },
    { file: 'modules/employee/components/employee-view-drawer.tsx', marks: 6, openRefetch: 1 },
    { file: 'modules/employee/components/department-members-dialog.tsx', openRefetch: 1 },
    { file: 'modules/employee/components/position-members-dialog.tsx', openRefetch: 1 },
    { file: 'modules/employee/components/section-members-dialog.tsx', openRefetch: 1 },
    { file: 'modules/employee/components/resign-modal.tsx', openRefetch: 1 },
    { file: 'modules/profile/components/profile-drawer.tsx', marks: 1, openRefetch: 1, rebase: 1 },
    { file: 'modules/profile/hooks/use-my-devices.ts', freshView: 1 },
    { file: 'modules/access/hooks/use-access.ts', freshView: 7 },
    { file: 'modules/access/pages/index.tsx', marks: 5 },
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

test('employee dialogs open rows through seedRowCopy and query only while open', () => {
    assert.ok(read('modules/employee/pages/index.tsx').includes("seedRowCopy(qc, ['employee', emp.id], emp)"));
    assert.ok(read('modules/employee/components/employee-view-drawer.tsx').includes('useApprovalChain(current?.id ?? null, open)'));
    assert.ok(read('modules/employee/components/department-members-dialog.tsx').includes('useDepartmentMembers(view?.id ?? null, openId != null)'));
    assert.ok(read('modules/employee/components/resign-modal.tsx').includes('useEmployeeAssets(current?.id ?? null, employee != null)'));
});

test('employee dialogs key their queries on the record being opened, not the one kept for the exit animation', () => {
    for (const file of ['modules/employee/components/employee-view-drawer.tsx', 'modules/employee/components/resign-modal.tsx']) {
        const src = read(file);
        assert.ok(src.includes('const current = employee ?? shown;'), file);
        assert.ok(!/use\w+\(shown\?\.id/.test(src), `${file} keys a query on the retained record`);
    }
});

test('the position modal rebases one form state, never values from an earlier render', () => {
    const src = read('modules/employee/components/position-modal.tsx');
    assert.ok(src.includes('const [form, setForm] = useState('));
    assert.ok(!src.includes('update({ title, allowSpecial })'));
});

test('the profile drawer marks no polling query', () => {
    const src = read('modules/profile/components/profile-drawer.tsx');
    assert.ok(!src.includes('[assetsQuery]'));
    assert.ok(!src.includes('[devicesQuery]'));
    assert.ok(src.includes("useKeyFreshness(['my-login-events'])"));
});

test('the sections tab watches only its own list', () => {
    const page = read('modules/employee/pages/index.tsx');
    assert.ok(page.includes("useKeyFreshness(['sections', 'all'])"));
    assert.ok(!page.includes("useKeyFreshness(['sections'])"));
});

test('the department members dialog asks for its section count again on open', () => {
    assert.ok(
        read('modules/employee/components/department-members-dialog.tsx').includes('useRefetchOnOpen(openId != null, membersQuery, sectionsQuery)'),
    );
});

test('plan 5 files carry no history comments', () => {
    assert.ok(!read('modules/employee/hooks/use-employees.ts').includes('now comes'));
    assert.ok(!read('modules/access/hooks/use-access.ts').includes('now comes'));
    assert.ok(!read('modules/employee/components/edit-employee-dialog.tsx').includes('as it stood when the dialog opened'));
});

test('forms with a parent and child select take the child out with a note when the server moves the parent', () => {
    const forms: [string, string, string][] = [
        ['modules/employee/components/edit-employee-dialog.tsx', "child: 'sectionId', parent: 'departmentId'", 'sectionGone&&!form.sectionId'],
        ['modules/asset/components/asset-form-drawer.tsx', "child: 'model_id', parent: 'brand_id'", 'modelGone&&!form.model_id'],
        ['modules/stock/components/stock-item-modal.tsx', "child: 'model_id', parent: 'brand_id'", 'modelGone&&form.model_id==null'],
    ];
    for (const [file, link, note] of forms) {
        const src = read(file);
        assert.ok(src.includes(link), `${file} links the pair`);
        assert.ok(src.includes('onDrop:'), `${file} hears about a taken-out child`);
        assert.ok(src.replace(/\s+/g, '').includes(`note={${note}`), `${file} shows the note on the child select`);
    }
    for (const lang of ['th', 'en']) {
        assert.ok(read(`lang/${lang}/employee.ts`).includes('emp_section_gone:'), `${lang} employee`);
        assert.ok(read(`lang/${lang}/asset.ts`).includes('asset_model_gone:'), `${lang} asset`);
        assert.ok(read(`lang/${lang}/stock.ts`).includes('stock_model_gone:'), `${lang} stock`);
    }
    assert.ok(read('shared/components/searchable-select.tsx').includes('note?: string | null;'));
});
