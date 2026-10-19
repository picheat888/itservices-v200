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

export type CardRow = { key: string; on: boolean; locked: boolean; lockedBy: string | null };
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
export function cardRows(card: CardLayout, has: (key: string) => boolean, roleLocked: boolean): CardView {
    const master = card.master?.key ?? null;
    const masterOn = master === null || has(master);

    const row = (key: string, lockedBy: string | null, waiting: boolean): CardRow => {
        if (roleLocked) return { key, on: has(key), locked: true, lockedBy: null };
        return { key, on: has(key), locked: waiting, lockedBy: waiting ? lockedBy : null };
    };
    const underMaster = (key: string): CardRow => row(key, master, !masterOn);

    const rowsOf = (cell: CardCell): CardRow[] => {
        if (cell.kind !== 'group') {
            const gatedCell = cell.kind === 'set' || master !== null;
            return cell.keys.map((key) => (gatedCell ? underMaster(key) : row(key, null, false)));
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
