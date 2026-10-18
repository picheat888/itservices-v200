// Shared layout for every Role Template card: header, master band, then permissions in ruled cells (3 / 2 / 1 columns by card width).
import { translate, useT } from '@/lang';
import { InfoHint } from '@/shared/components/info-hint';
import { formatNumber } from '@/shared/lib/number';
import { cn } from '@/shared/lib/utils';
import type { Lang } from '@/shared/types';
import { createContext, useContext, useId, useState, type ReactNode } from 'react';
import { PermissionCardHeader } from './permission-card-header';
import { PermissionSwitch } from './permission-switch';

/** A group with more children than this spans two cells and lays its children in two columns. */
export const WIDE_CHILDREN = 6;

/** Unsaved changes (orange), the search term (tinted), search hits hidden behind an off master and the super role's lock, for every card on the page. */
type PermissionView = { changed: (key: string) => boolean; query: string; hiddenHits: (module: string) => number; superRole: boolean };
const PermissionViewContext = createContext<PermissionView>({ changed: () => false, query: '', hiddenHits: () => 0, superRole: false });
export const PermissionViewProvider = PermissionViewContext.Provider;

export const CHANGED_TEXT = 'font-semibold text-orange-700 dark:text-orange-400';

const HIT_TEXT = 'bg-brand/10 text-foreground -mx-0.5 rounded px-0.5';

function useLabelClass(label: string, pkey?: string) {
    const { changed, query } = useContext(PermissionViewContext);
    const q = query.trim().toLowerCase();
    return cn(q && label.toLowerCase().includes(q) && HIT_TEXT, pkey && changed(pkey) && CHANGED_TEXT);
}

/** `lockedBy`: the label of the switch that has to be on before this one can be. */
export type SwitchProps = { label: string; info?: string; on: boolean; locked: boolean; onToggle: () => void; pkey?: string; lockedBy?: string };

function Label({ label, pkey }: { label: string; pkey?: string }) {
    return <span className={useLabelClass(label, pkey)}>{label}</span>;
}

/** Ids that tie a row's label, hint and lock reason to its switch; `notes` are the hidden texts the switch reads. */
function useSwitchWiring(s: SwitchProps, extraDescribedBy?: string) {
    const t = useT();
    const { superRole } = useContext(PermissionViewContext);
    const id = useId();
    const reason = !s.locked ? null : superRole ? t('perm_super_locked') : s.lockedBy ? t('perm_lock_needs').replace('{name}', s.lockedBy) : null;
    const hintId = s.info ? `${id}-hint` : undefined;
    // Keyboard focus on the switch shows its hint, as hover does for the (i)
    const [hintShown, setHintShown] = useState(false);
    const reasonId = reason ? `${id}-reason` : undefined;
    return {
        switchId: `${id}-switch`,
        hintShown,
        focusEvents: {
            onFocus: (event: React.FocusEvent<HTMLButtonElement>) => setHintShown(event.currentTarget.matches(':focus-visible')),
            onBlur: () => setHintShown(false),
            onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => event.key === 'Escape' && setHintShown(false),
        },
        describedBy: [hintId, reasonId, extraDescribedBy].filter(Boolean).join(' ') || undefined,
        notes: (
            <>
                {s.info && (
                    <span id={hintId} hidden>
                        {s.info}
                    </span>
                )}
                {reason && (
                    <span id={reasonId} hidden>
                        {reason}
                    </span>
                )}
            </>
        ),
    };
}

/** The row's words; a click on them toggles the switch. */
// The (i) flows after the label's last word, also when the label wraps
const HINT_AFTER_LABEL = 'ml-1 align-[-2px]';

function SwitchLabel({ htmlFor, s }: { htmlFor: string; s: SwitchProps }) {
    return (
        <label htmlFor={htmlFor} className={cn('min-w-0', !s.locked && 'cursor-pointer')}>
            <Label label={s.label} pkey={s.pkey} />
        </label>
    );
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
    const { changed } = useContext(PermissionViewContext);
    const hasBody = Boolean(children);
    const headingId = useId();

    return (
        <div role="group" aria-labelledby={headingId} className="border-border @container rounded-lg border">
            <PermissionCardHeader headingId={headingId} module={module} on={on} total={total} changed={keys.some(changed)} lang={lang} />
            {master && <MasterBand module={module} master={master} lang={lang} hasBody={hasBody} />}
            {note && <div className={cn('bg-brand/5 border-border text-muted-foreground px-3.5 py-2.5 text-xs', hasBody && 'border-b')}>{note}</div>}
            {hasBody && <div className="grid grid-cols-1 overflow-hidden rounded-b-[inherit] @md:grid-cols-2 @3xl:grid-cols-3">{children}</div>}
        </div>
    );
}

/** The card's gate: label, sub line and the master switch. */
function MasterBand({
    module,
    master,
    lang,
    hasBody,
}: {
    module: string;
    master: SwitchProps & { sub?: string; rest: number };
    lang: Lang;
    hasBody: boolean;
}) {
    const { hiddenHits } = useContext(PermissionViewContext);
    const hidden = !master.on ? hiddenHits(module) : 0;
    const subId = useId();
    const wiring = useSwitchWiring(master, subId);

    return (
        <div className={cn('bg-brand/5 border-border flex items-center gap-2.5 px-3.5 py-2.5', hasBody && 'border-b')}>
            <div className="min-w-0">
                <div className="text-sm font-semibold">
                    <SwitchLabel htmlFor={wiring.switchId} s={master} />
                    {master.info && <InfoHint text={master.info} tabbable={false} shown={wiring.hintShown} className={HINT_AFTER_LABEL} />}
                </div>
                <div id={subId} className="text-muted-foreground text-xs">
                    {masterSub(master, hidden, lang)}
                </div>
            </div>
            <div className="ml-auto">
                <PermissionSwitch
                    id={wiring.switchId}
                    label={master.label}
                    on={master.on}
                    locked={master.locked}
                    onClick={master.onToggle}
                    describedBy={wiring.describedBy}
                    {...wiring.focusEvents}
                />
                {wiring.notes}
            </div>
        </div>
    );
}

/** One ruled cell; neighbours share a 1px line, the card edge shows none. */
export function PermissionCell({ wide, children }: { wide?: boolean; children: ReactNode }) {
    return <div className={cn('border-border -mt-px -ml-px min-w-0 border-t border-l px-4 pt-2.5 pb-3', wide && '@md:col-span-2')}>{children}</div>;
}

/** A switch that owns the children under it: a tinted heading band. */
export function GroupHead({ chip, lang, ...s }: SwitchProps & { chip?: boolean; lang: Lang }) {
    const wiring = useSwitchWiring(s);
    return (
        <div className="bg-muted -mx-2 mb-1 flex min-h-[34px] items-center gap-2 rounded-md px-2">
            <span className="min-w-0 text-sm font-medium">
                <SwitchLabel htmlFor={wiring.switchId} s={s} />
                {s.info && <InfoHint text={s.info} tabbable={false} shown={wiring.hintShown} className={HINT_AFTER_LABEL} />}
            </span>
            <span className="ml-auto flex items-center gap-2">
                {chip && <span className="bg-brand/10 text-brand-ink rounded px-1.5 text-xs font-semibold">{translate(lang, 'perm_ui_view')}</span>}
                <PermissionSwitch
                    id={wiring.switchId}
                    label={s.label}
                    on={s.on}
                    locked={s.locked}
                    onClick={s.onToggle}
                    describedBy={wiring.describedBy}
                    {...wiring.focusEvents}
                />
                {wiring.notes}
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
    const wiring = useSwitchWiring(s);
    return (
        <div className="flex min-h-[30px] items-center gap-2">
            <span className="text-muted-foreground min-w-0 text-[13px]">
                <SwitchLabel htmlFor={wiring.switchId} s={s} />
                {s.info && <InfoHint text={s.info} tabbable={false} shown={wiring.hintShown} className={HINT_AFTER_LABEL} />}
            </span>
            <span className="ml-auto">
                <PermissionSwitch
                    id={wiring.switchId}
                    label={aria ?? s.label}
                    on={s.on}
                    locked={s.locked}
                    onClick={s.onToggle}
                    describedBy={wiring.describedBy}
                    {...wiring.focusEvents}
                />
                {wiring.notes}
            </span>
        </div>
    );
}

/** A top-level switch with no children, as a plain row (cards made only of these). */
export function PlainRow({ dimOff, comingSoon, lang, ...s }: SwitchProps & { dimOff?: boolean; comingSoon?: boolean; lang: Lang }) {
    const tagId = useId();
    const wiring = useSwitchWiring(s, comingSoon ? tagId : undefined);
    return (
        <div className="flex min-h-[34px] items-center gap-2">
            <span className={cn('min-w-0 text-sm', dimOff && !s.on ? 'text-muted-foreground' : 'text-foreground font-medium')}>
                <SwitchLabel htmlFor={wiring.switchId} s={s} />
                {s.info && <InfoHint text={s.info} tabbable={false} shown={wiring.hintShown} className={HINT_AFTER_LABEL} />}
                {comingSoon && (
                    <span id={tagId} className="ml-1 text-xs italic opacity-70">
                        ({translate(lang, 'coming_soon_tag')})
                    </span>
                )}
            </span>
            <span className="ml-auto">
                <PermissionSwitch
                    id={wiring.switchId}
                    label={s.label}
                    on={s.on}
                    locked={s.locked}
                    onClick={s.onToggle}
                    describedBy={wiring.describedBy}
                    {...wiring.focusEvents}
                />
                {wiring.notes}
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
