// Shared layout for every Role Template card: header, master band, then permissions in ruled cells (3 / 2 / 1 columns by card width).
import { translate } from '@/lang';
import { InfoHint } from '@/shared/components/info-hint';
import { formatNumber } from '@/shared/lib/number';
import { cn } from '@/shared/lib/utils';
import type { Lang } from '@/shared/types';
import { createContext, useContext, type ReactNode } from 'react';
import { PermissionCardHeader } from './permission-card-header';
import { PermissionSwitch } from './permission-switch';

/** A group with more children than this spans two cells and lays its children in two columns. */
export const WIDE_CHILDREN = 6;

/** Unsaved changes (orange), the search term (tinted) and search hits hidden behind an off master, for every card on the page. */
type PermissionView = { changed: (key: string) => boolean; query: string; hiddenHits: (module: string) => number };
const PermissionViewContext = createContext<PermissionView>({ changed: () => false, query: '', hiddenHits: () => 0 });
export const PermissionViewProvider = PermissionViewContext.Provider;

export const CHANGED_TEXT = 'font-semibold text-orange-700 dark:text-orange-400';

const HIT_TEXT = 'bg-brand/10 -mx-0.5 rounded px-0.5';

function useLabelClass(label: string, pkey?: string) {
    const { changed, query } = useContext(PermissionViewContext);
    const q = query.trim().toLowerCase();
    return cn(pkey && changed(pkey) && CHANGED_TEXT, q && label.toLowerCase().includes(q) && HIT_TEXT);
}

export type SwitchProps = { label: string; info?: string; on: boolean; locked: boolean; onToggle: () => void; pkey?: string };

function Label({ label, pkey }: { label: string; pkey?: string }) {
    return <span className={useLabelClass(label, pkey)}>{label}</span>;
}

/** The master band's sub line: hidden search hits first, then the off count, else the module note. */
function masterSub(master: SwitchProps & { sub?: string; rest: number }, hidden: number, lang: Lang): string {
    if (hidden > 0) {
        const key = hidden === 1 ? 'perm_search_hidden_by_master_one' : 'perm_search_hidden_by_master';
        return translate(lang, key).replace('{n}', formatNumber(hidden, lang));
    }
    if (master.on || master.rest === 0) return master.sub ?? translate(lang, 'perm_ui_master_note');
    return translate(lang, 'perm_ui_master_off').replace('{n}', formatNumber(master.rest, lang));
}

export function PermissionCard({
    module,
    on,
    total,
    keys,
    lang,
    master,
    note,
    children,
}: {
    module: string;
    on: number;
    total: number;
    /** Every key the card owns; any unsaved one turns the header count orange. */
    keys: string[];
    lang: Lang;
    /** The module gate; `rest` is how many switches hide while it is off. */
    master?: SwitchProps & { sub?: string; rest: number };
    /** Band text for a card with no gate (My Profile). */
    note?: string;
    children?: ReactNode;
}) {
    const { changed, hiddenHits } = useContext(PermissionViewContext);
    const hasBody = Boolean(children);
    const hidden = master && !master.on ? hiddenHits(module) : 0;

    return (
        <div className="border-border @container rounded-lg border">
            <PermissionCardHeader module={module} on={on} total={total} changed={keys.some(changed)} lang={lang} />
            {master && (
                <div className={cn('bg-brand/5 border-border flex items-center gap-2.5 px-3.5 py-2.5', hasBody && 'border-b')}>
                    <div className="min-w-0">
                        <div className="flex items-center gap-1 text-sm font-semibold">
                            <Label label={master.label} pkey={master.pkey} />
                            {master.info && <InfoHint text={master.info} />}
                        </div>
                        <div className="text-muted-foreground text-xs">{masterSub(master, hidden, lang)}</div>
                    </div>
                    <div className="ml-auto">
                        <PermissionSwitch label={master.label} on={master.on} locked={master.locked} onClick={master.onToggle} />
                    </div>
                </div>
            )}
            {note && <div className={cn('bg-brand/5 border-border text-muted-foreground px-3.5 py-2.5 text-xs', hasBody && 'border-b')}>{note}</div>}
            {hasBody && <div className="grid grid-cols-1 overflow-hidden rounded-b-[inherit] @md:grid-cols-2 @3xl:grid-cols-3">{children}</div>}
        </div>
    );
}

/** One ruled cell; neighbours share a 1px line, the card edge shows none. */
export function PermissionCell({ wide, children }: { wide?: boolean; children: ReactNode }) {
    return <div className={cn('border-border -mt-px -ml-px min-w-0 border-t border-l px-4 pt-2.5 pb-3', wide && '@md:col-span-2')}>{children}</div>;
}

/** A switch that owns the children under it: a tinted heading band. */
export function GroupHead({ chip, lang, ...s }: SwitchProps & { chip?: boolean; lang: Lang }) {
    return (
        <div className="bg-muted -mx-2 mb-1 flex min-h-[34px] items-center gap-2 rounded-md px-2">
            <span className="flex min-w-0 items-center gap-1 text-sm font-medium">
                <Label label={s.label} pkey={s.pkey} />
                {s.info && <InfoHint text={s.info} />}
            </span>
            <span className="ml-auto flex items-center gap-2">
                {chip && <span className="bg-brand/10 text-brand rounded px-1.5 text-xs font-semibold">{translate(lang, 'perm_ui_view')}</span>}
                <PermissionSwitch label={s.label} on={s.on} locked={s.locked} onClick={s.onToggle} />
            </span>
        </div>
    );
}

/** A heading with no switch of its own (Tickets Level, the report domains, the Email tab). */
export function SetHead({ label, info }: { label: string; info?: string }) {
    return (
        <div className="bg-muted -mx-2 mb-1 flex min-h-[34px] items-center gap-1 rounded-md px-2 text-sm font-medium">
            <Label label={label} />
            {info && <InfoHint text={info} />}
        </div>
    );
}

export function GroupNote({ children }: { children: ReactNode }) {
    return <p className="text-muted-foreground -mt-0.5 mb-1 text-xs">{children}</p>;
}

/** The indented list under a heading; a wide group flows it into two columns. */
export function ChildList({ wide, cluster, children }: { wide?: boolean; cluster?: { label: string; info: string }; children: ReactNode }) {
    return (
        <div className={cn('border-border ml-2 border-l pl-3', wide && '@md:columns-2 @md:gap-7 [&>*]:break-inside-avoid')}>
            {cluster && (
                <div className="flex min-h-[30px] items-center gap-1 text-[13px] font-medium [column-span:all]">
                    {cluster.label}
                    <InfoHint text={cluster.info} />
                </div>
            )}
            {children}
        </div>
    );
}

export function ChildRow({ aria, ...s }: SwitchProps & { aria?: string }) {
    return (
        <div className="flex min-h-[30px] items-center gap-2">
            <span className="text-muted-foreground flex min-w-0 items-center gap-1 text-[13px]">
                <Label label={s.label} pkey={s.pkey} />
                {s.info && <InfoHint text={s.info} />}
            </span>
            <span className="ml-auto">
                <PermissionSwitch label={aria ?? s.label} on={s.on} locked={s.locked} onClick={s.onToggle} />
            </span>
        </div>
    );
}

/** A top-level switch with no children, as a plain row (cards made only of these). */
export function PlainRow({ dimOff, comingSoon, lang, ...s }: SwitchProps & { dimOff?: boolean; comingSoon?: boolean; lang: Lang }) {
    return (
        <div className="flex min-h-[34px] items-center gap-2">
            <span
                className={cn('flex min-w-0 items-center gap-1 text-sm', dimOff && !s.on ? 'text-muted-foreground' : 'text-foreground font-medium')}
            >
                <Label label={s.label} pkey={s.pkey} />
                {s.info && <InfoHint text={s.info} />}
                {comingSoon && <span className="ml-1 text-xs italic opacity-70">({translate(lang, 'coming_soon_tag')})</span>}
            </span>
            <span className="ml-auto">
                <PermissionSwitch label={s.label} on={s.on} locked={s.locked} onClick={s.onToggle} />
            </span>
        </div>
    );
}

/** Screen switches that share a card with groups sit under one "General" heading, as children. */
export function GeneralCell({ lang, rows }: { lang: Lang; rows: (SwitchProps & { key: string })[] }) {
    if (rows.length === 0) return null;
    return (
        <PermissionCell>
            <SetHead label={translate(lang, 'perm_ui_general')} />
            <ChildList>
                {rows.map(({ key, ...row }) => (
                    <ChildRow key={key} pkey={key} {...row} />
                ))}
            </ChildList>
        </PermissionCell>
    );
}

/** Splits a card made only of plain switches into up to three cells. */
export function spreadRows<T>(rows: T[]): T[][] {
    const per = Math.ceil(rows.length / 3);
    const cells: T[][] = [];
    for (let i = 0; i < rows.length; i += per) cells.push(rows.slice(i, i + per));
    return cells;
}
