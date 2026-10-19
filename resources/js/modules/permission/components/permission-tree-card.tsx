// Role Template card drawn from the server layout (GET /api/permissions): master band, then the general, group, set and plain cells, with cascade.
import { translate } from '@/lang';
import type { Lang } from '@/shared/types';
import { Fragment, useMemo, type Dispatch, type SetStateAction } from 'react';
import {
    bareAria,
    cardCountSpec,
    cardKeys,
    cardRows,
    countingHas,
    rowShowsInfo,
    type CardCell,
    type CardLayout,
    type CardRow,
} from '../lib/card-layout';
import { cascadeToggle, countGranted, gatedKeys } from '../lib/permission-count';
import { actionDescription, actionLabel, isLivePermission } from '../lib/permission-labels';
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
    spreadRows,
    WIDE_CHILDREN,
    type SwitchProps,
} from './permission-layout';

const splitKey = (key: string): [string, string] => {
    const dot = key.indexOf('.');
    return [key.slice(0, dot), key.slice(dot + 1)];
};
const label = (key: string, lang: Lang) => actionLabel(...splitKey(key), lang);
const description = (key: string, lang: Lang) => actionDescription(...splitKey(key), lang);

type GroupCell = Extract<CardCell, { kind: 'group' }>;
type SetCell = Extract<CardCell, { kind: 'set' }>;
type PlainCell = Extract<CardCell, { kind: 'plain' }>;

/** One Role Template card; super is read-only (every switch locked, every key held). */
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
    const { masterOn, cells } = cardRows(card, has, isSuper, isLivePermission);
    const { on, total } = countGranted(spec, countingHas(card, has, isLivePermission));

    const toggle = (key: string) => {
        if (isSuper) return;
        setDraft((prev) => cascadeToggle(prev, key, spec));
    };

    // A waiting switch reads off even when the draft holds it; a coming-soon one never flips
    const switchOf = (cell: CardCell, row: CardRow): SwitchProps => ({
        pkey: row.key,
        label: label(row.key, lang),
        info: rowShowsInfo(card, cell, row.key) ? description(row.key, lang) : undefined,
        on: row.on && (isSuper || !row.locked),
        locked: row.locked,
        lockedBy: row.lockedBy ? label(row.lockedBy, lang) : undefined,
        onToggle: () => {
            if (!row.comingSoon) toggle(row.key);
        },
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
                <GroupHead chip={cell.chip} lang={lang} {...switchOf(cell, head)} />
                {cell.note && <GroupNote>{translate(lang, cell.note)}</GroupNote>}
                <ChildList wide={wide} cluster={cluster}>
                    {children.map((row) => (
                        <ChildRow key={row.key} aria={`${headLabel} ${label(row.key, lang)}`} {...switchOf(cell, row)} />
                    ))}
                </ChildList>
                {solo.map((row) => (
                    <PlainRow key={row.key} lang={lang} {...switchOf(cell, row)} />
                ))}
            </PermissionCell>
        );
    };

    const setCell = (cell: SetCell, rows: CardRow[]) => {
        const setLabel = translate(lang, cell.label);
        const wide = cell.keys.length > WIDE_CHILDREN;
        const bare = bareAria(card, cell);
        return (
            <PermissionCell key={cell.label} wide={wide}>
                <SetHead label={setLabel} info={cell.hint ? translate(lang, cell.hint) : undefined} />
                <ChildList wide={wide}>
                    {rows.map((row) => (
                        <ChildRow key={row.key} aria={bare ? undefined : `${setLabel} ${label(row.key, lang)}`} {...switchOf(cell, row)} />
                    ))}
                </ChildList>
            </PermissionCell>
        );
    };

    // Plain switches spread over up to three cells
    const plainCells = (cell: PlainCell, rows: CardRow[]) => (
        <Fragment key={cell.keys[0]}>
            {spreadRows(rows).map((part) => (
                <PermissionCell key={part[0].key}>
                    {part.map((row) => (
                        <PlainRow key={row.key} lang={lang} dimOff={cell.coming_soon_aware} comingSoon={row.comingSoon} {...switchOf(cell, row)} />
                    ))}
                </PermissionCell>
            ))}
        </Fragment>
    );

    const gate = card.master;
    const master = gate && {
        pkey: gate.key,
        label: label(gate.key, lang),
        info: rowShowsInfo(card, null, gate.key) ? description(gate.key, lang) : undefined,
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
                        return <GeneralCell key="general" lang={lang} rows={rows.map((row) => ({ key: row.key, ...switchOf(cell, row) }))} />;
                    }
                    if (cell.kind === 'group') return groupCell(cell, rows);
                    if (cell.kind === 'set') return setCell(cell, rows);
                    return plainCells(cell, rows);
                })}
        </PermissionCard>
    );
}
