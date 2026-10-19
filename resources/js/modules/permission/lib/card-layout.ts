// A Role Template card as the server lays it out (GET /api/permissions), and the count spec and switch rows derived from it.
import type { CountSpec, SpecGroup } from './permission-count';

export type CardCell =
    | { kind: 'general'; keys: string[] }
    | {
          kind: 'group';
          view: string;
          children: string[];
          chip: boolean;
          outside_master: boolean;
          cluster: { title: string; hint: string } | null;
          fill_on_grant: boolean;
          note: string | null;
          solo: string[];
      }
    | { kind: 'set'; label: string; hint: string | null; keys: string[] }
    | { kind: 'plain'; keys: string[]; coming_soon_aware: boolean };

export type CardLayout = {
    module: string;
    master: { key: string; sub: string | null } | null;
    note: string | null;
    cells: CardCell[];
};

/** `comingSoon`: a key of a coming-soon-aware cell that is not live yet (tagged, off and locked). */
export type CardRow = { key: string; on: boolean; locked: boolean; lockedBy: string | null; comingSoon: boolean };
export type CardView = { masterOn: boolean; cells: { cell: CardCell; rows: CardRow[] }[] };

const toSpecGroup = (cell: Extract<CardCell, { kind: 'group' }>): SpecGroup => ({
    view: cell.view,
    children: cell.children,
    ...(cell.fill_on_grant ? { fillOnGrant: true } : {}),
});

/** The counting and cascade rules of a card. */
export function cardCountSpec(card: CardLayout): CountSpec {
    const groups: SpecGroup[] = [];
    const standalone: SpecGroup[] = [];
    const gated: string[] = [];
    const free: string[] = [];

    for (const cell of card.cells) {
        if (cell.kind === 'general') {
            groups.push(...cell.keys.map((key) => ({ view: key, children: [] })));
        } else if (cell.kind === 'group') {
            (cell.outside_master ? standalone : groups).push(toSpecGroup(cell));
            free.push(...cell.solo);
        } else if (cell.kind === 'set') {
            gated.push(...cell.keys);
        } else {
            (card.master ? gated : free).push(...cell.keys);
        }
    }

    return {
        ...(card.master ? { master: card.master.key } : {}),
        ...(groups.length ? { groups } : {}),
        ...(gated.length ? { gated } : {}),
        ...(standalone.length ? { standalone } : {}),
        ...(free.length ? { free } : {}),
    };
}

const cellKeys = (cell: CardCell): string[] => (cell.kind === 'group' ? [cell.view, ...cell.children, ...cell.solo] : cell.keys);

/** Every key of the card in display order, master first. */
export function cardKeys(card: CardLayout): string[] {
    return [...(card.master ? [card.master.key] : []), ...card.cells.flatMap(cellKeys)];
}

/** Each cell's switches with their state: on, and which switch (if any) must be on first. */
export function cardRows(
    card: CardLayout,
    has: (key: string) => boolean,
    roleLocked: boolean,
    isLive: (key: string) => boolean = () => true,
): CardView {
    const master = card.master?.key ?? null;
    const masterOn = master === null || has(master);

    const row = (key: string, lockedBy: string | null, waiting: boolean, comingSoon = false): CardRow => {
        const on = has(key) && !comingSoon;
        if (roleLocked) return { key, on, locked: true, lockedBy: null, comingSoon };
        return { key, on, locked: waiting || comingSoon, lockedBy: waiting ? lockedBy : null, comingSoon };
    };
    const underMaster = (key: string, comingSoon = false): CardRow => row(key, master, !masterOn, comingSoon);

    const rowsOf = (cell: CardCell): CardRow[] => {
        if (cell.kind !== 'group') {
            const gatedCell = cell.kind === 'set' || master !== null;
            const soon = (key: string) => cell.kind === 'plain' && cell.coming_soon_aware && !isLive(key);
            return cell.keys.map((key) => (gatedCell ? underMaster(key, soon(key)) : row(key, null, false, soon(key))));
        }
        const head = cell.outside_master ? row(cell.view, null, false) : underMaster(cell.view);
        const children = cell.children.map((key) => {
            if (!cell.outside_master && !masterOn) return row(key, master, true);
            return row(key, cell.view, !has(cell.view));
        });
        return [head, ...children, ...cell.solo.map((key) => row(key, null, false))];
    };

    return { masterOn, cells: card.cells.map((cell) => ({ cell, rows: rowsOf(cell) })) };
}

/** The has() a card counts with: a card with coming-soon-aware cells counts live keys only. */
export function countingHas(card: CardLayout, has: (key: string) => boolean, isLive: (key: string) => boolean): (key: string) => boolean {
    const liveOnly = card.cells.some((cell) => cell.kind === 'plain' && cell.coming_soon_aware);
    return liveOnly ? (key) => isLive(key) && has(key) : has;
}

const moduleOf = (key: string) => key.slice(0, key.indexOf('.'));

/** The page's cards: the server layout, then a plain card for each catalogue module no layout card holds. */
export function pageCards(layout: CardLayout[], catalog: Record<string, string[]>): CardLayout[] {
    const known = new Set(layout.flatMap((card) => cardKeys(card).map(moduleOf)));
    const unknown = Object.keys(catalog).filter((module) => !known.has(module));
    return [
        ...layout,
        ...unknown.map((module) => ({
            module,
            master: null,
            note: null,
            cells: [{ kind: 'plain' as const, keys: catalog[module].map((action) => `${module}.${action}`), coming_soon_aware: true }],
        })),
    ];
}

// Page sections, grouped like the sidebar; a card in none of them goes to "Other"
const SECTIONS: { label: string; modules: string[] }[] = [
    { label: 'nav_overview', modules: ['dashboard'] },
    { label: 'nav_workspace', modules: ['tickets', 'requests', 'assets', 'contracts', 'stock', 'employees', 'access', 'profile'] },
    { label: 'nav_admin', modules: ['reports', 'workflows', 'permissions', 'notifications', 'settings'] },
];
export const OTHER_SECTION = 'perm_other';

/** The cards by page section (section label = lang key), in card order; empty sections are left out. */
export function cardSections(cards: CardLayout[]): { label: string; cards: CardLayout[] }[] {
    const labelOf = (card: CardLayout) => SECTIONS.find((s) => s.modules.includes(card.module))?.label ?? OTHER_SECTION;
    return [...SECTIONS.map((s) => s.label), OTHER_SECTION]
        .map((label) => ({ label, cards: cards.filter((card) => labelOf(card) === label) }))
        .filter((s) => s.cards.length > 0);
}

// Cards whose master band shows its (i)
const MASTER_INFO = new Set(['stock', 'employees']);
// Cards whose set rows are named without their heading (Ticket Level, request notifications)
const BARE_SET_ROWS = new Set(['tickets', 'requests']);

/** Whether a row shows its (i); `cell` null is the master band. Self-service heads and Ticket Level rows show none. */
export function rowShowsInfo(card: CardLayout, cell: CardCell | null, key: string): boolean {
    if (cell === null) return MASTER_INFO.has(card.module);
    if (cell.kind === 'group') return !(cell.outside_master && key === cell.view);
    if (cell.kind === 'set') return card.module !== 'tickets';
    return true;
}

/** Whether a set's rows are named without their heading. */
export function bareAria(card: CardLayout, cell: CardCell): boolean {
    return cell.kind === 'set' && BARE_SET_ROWS.has(card.module);
}
