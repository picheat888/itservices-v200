// Role Template card drawn from the server layout (GET /api/permissions): master band, then the general, group and set cells, with cascade.
import { translate } from '@/lang';
import type { Lang } from '@/shared/types';
import { useMemo, type Dispatch, type SetStateAction } from 'react';
import { cardCountSpec, cardKeys, cardRows, type CardCell, type CardLayout, type CardRow } from '../lib/card-layout';
import { cascadeToggle, countGranted, gatedKeys } from '../lib/permission-count';
import { actionDescription, actionLabel } from '../lib/permission-labels';
import {
    ChildList,
    ChildRow,
    GeneralCell,
    GroupHead,
    GroupNote,
    PermissionCard,
    PermissionCell,
    PlainRow,
    SetHead,
    WIDE_CHILDREN,
    type SwitchProps,
} from './permission-layout';

// Cards whose master band shows its (i)
const MASTER_INFO = new Set(['stock', 'employees']);
// Cards whose set rows are named without their heading (Ticket Level, request notifications)
const BARE_SET_ROWS = new Set(['tickets', 'requests']);

const splitKey = (key: string): [string, string] => {
    const dot = key.indexOf('.');
    return [key.slice(0, dot), key.slice(dot + 1)];
};
const label = (key: string, lang: Lang) => actionLabel(...splitKey(key), lang);
const description = (key: string, lang: Lang) => actionDescription(...splitKey(key), lang);

type GroupCell = Extract<CardCell, { kind: 'group' }>;
type SetCell = Extract<CardCell, { kind: 'set' }>;

/** One tree card; super is read-only (every switch locked, every key held). */
export function PermissionTreeCard({
    card,
    draft,
    setDraft,
    isSuper,
    lang,
}: {
    card: CardLayout;
    draft: Set<string>;
    setDraft: Dispatch<SetStateAction<Set<string>>>;
    isSuper: boolean;
    lang: Lang;
}) {
    const spec = useMemo(() => cardCountSpec(card), [card]);
    const keys = useMemo(() => cardKeys(card), [card]);
    const has = (key: string) => isSuper || draft.has(key);
    const { masterOn, cells } = cardRows(card, has, isSuper);
    const { on, total } = countGranted(spec, has);

    const toggle = (key: string) => {
        if (isSuper) return;
        setDraft((prev) => cascadeToggle(prev, key, spec));
    };

    // A waiting switch reads off even when the draft holds it
    const switchOf = (row: CardRow, withInfo = true): SwitchProps => ({
        pkey: row.key,
        label: label(row.key, lang),
        info: withInfo ? description(row.key, lang) : undefined,
        on: row.on && (isSuper || !row.locked),
        locked: row.locked,
        lockedBy: row.lockedBy ? label(row.lockedBy, lang) : undefined,
        onToggle: () => toggle(row.key),
    });

    const groupCell = (cell: GroupCell, rows: CardRow[]) => {
        const [head, ...rest] = rows;
        const children = rest.slice(0, cell.children.length);
        const solo = rest.slice(cell.children.length);
        const headLabel = label(cell.view, lang);
        const wide = cell.children.length > WIDE_CHILDREN;
        const cluster = cell.cluster ? { label: translate(lang, cell.cluster.title), info: translate(lang, cell.cluster.hint) } : undefined;
        return (
            <PermissionCell key={cell.view} wide={wide}>
                {/* Self-service heads outside the master carry no (i) */}
                <GroupHead chip={cell.chip} lang={lang} {...switchOf(head, !cell.outside_master)} />
                {cell.note && <GroupNote>{translate(lang, cell.note)}</GroupNote>}
                <ChildList wide={wide} cluster={cluster}>
                    {children.map((row) => (
                        <ChildRow key={row.key} aria={`${headLabel} ${label(row.key, lang)}`} {...switchOf(row)} />
                    ))}
                </ChildList>
                {solo.map((row) => (
                    <PlainRow key={row.key} lang={lang} {...switchOf(row)} />
                ))}
            </PermissionCell>
        );
    };

    const setCell = (cell: SetCell, rows: CardRow[]) => {
        const setLabel = translate(lang, cell.label);
        const wide = cell.keys.length > WIDE_CHILDREN;
        const bare = BARE_SET_ROWS.has(card.module);
        // Ticket Level rows carry no (i)
        const withInfo = card.module !== 'tickets';
        return (
            <PermissionCell key={cell.label} wide={wide}>
                <SetHead label={setLabel} info={cell.hint ? translate(lang, cell.hint) : undefined} />
                <ChildList wide={wide}>
                    {rows.map((row) => (
                        <ChildRow key={row.key} aria={bare ? undefined : `${setLabel} ${label(row.key, lang)}`} {...switchOf(row, withInfo)} />
                    ))}
                </ChildList>
            </PermissionCell>
        );
    };

    const gate = card.master;
    const master = gate && {
        pkey: gate.key,
        label: label(gate.key, lang),
        info: MASTER_INFO.has(card.module) ? description(gate.key, lang) : undefined,
        sub: gate.sub ? translate(lang, gate.sub) : undefined,
        on: masterOn,
        locked: isSuper,
        onToggle: () => toggle(gate.key),
        rest: gatedKeys(spec).length,
    };
    // Only self-service groups outside the master show while it is off
    const shown = cells.filter(({ cell }) => masterOn || (cell.kind === 'group' && cell.outside_master));

    return (
        <PermissionCard
            module={card.module}
            on={on}
            total={total}
            lang={lang}
            keys={keys}
            master={master ?? undefined}
            note={card.note ? translate(lang, card.note) : undefined}
        >
            {shown.length > 0 &&
                shown.map(({ cell, rows }) => {
                    if (cell.kind === 'general') {
                        return <GeneralCell key="general" lang={lang} rows={rows.map((row) => ({ key: row.key, ...switchOf(row) }))} />;
                    }
                    if (cell.kind === 'group') return groupCell(cell, rows);
                    if (cell.kind === 'set') return setCell(cell, rows);
                    return null;
                })}
        </PermissionCard>
    );
}
