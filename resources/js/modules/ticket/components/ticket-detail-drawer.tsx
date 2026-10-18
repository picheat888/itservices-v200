import { useT } from '@/lang';
import { AssetTypeIcon } from '@/modules/asset';
import { AttachmentPreview, FILE_TONE, KIND_META, fileKind } from '@/shared/components/attachment-preview';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { DialogTabs } from '@/shared/components/dialog-tabs';
import { EmptyState } from '@/shared/components/empty-state';
import { formatFileSize } from '@/shared/components/file-drop-zone';
import { SectionLabel } from '@/shared/components/section-label';
import { StatusBadge } from '@/shared/components/status-badge';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { localPair } from '@/shared/lib/local-name';
import { formatNumber } from '@/shared/lib/number';
import { REQUEST_TYPE_META } from '@/shared/lib/request-meta';
import { cn } from '@/shared/lib/utils';
import type { ServiceRequestType, Ticket, TicketAttachment, TicketStatus, TicketWorkClass } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, focusDialogContentClass } from '@/shared/ui/dialog';
import { useUiStore } from '@/stores/ui';
import {
    ArrowRightLeft,
    Check,
    CircleAlert,
    Download,
    History,
    MessageSquarePlus,
    Paperclip,
    Pencil,
    RefreshCcw,
    Users,
    Wrench,
    X,
    Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ResolveMode } from './resolve-ticket-modal';
import { ticketActionFlags } from './ticket-actions';
import { TICKET_WORK_CLASS_META, TicketPriorityBadge, TicketSlaBadge, TicketStatusBadge, ticketCategoryIcon } from './ticket-meta';

/**
 * One-line label/value row for the rail's compact sections (SLA, dates).
 *
 * `wrap` is for the one value that is a sentence rather than a timestamp — truncating the name
 * of the rule that set a deadline defeats the point of printing it.
 */
/**
 * Bar colour per SLA state, mirroring the badge's tones (see SLA_TONE in ticket-meta).
 * Kept beside the bar rather than exported from there because the badge paints a chip and this
 * paints a fill — same meaning, different property.
 */
const SLA_BAR_TONE: Record<NonNullable<Ticket['sla']>['state'], string> = {
    on_track: 'bg-emerald-500',
    near_due: 'bg-amber-500',
    over_sla: 'bg-destructive',
    met: 'bg-emerald-500',
    missed: 'bg-destructive',
};

function RailRow({
    label,
    value,
    wrap = false,
    quiet = false,
}: {
    label: string;
    value: React.ReactNode;
    wrap?: boolean;
    /** For a fact that has already settled — still worth having, no longer worth chasing. */
    quiet?: boolean;
}) {
    return (
        <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="text-muted-foreground shrink-0">{label}</span>
            <span className={cn('min-w-0 text-right', wrap ? 'text-balance' : 'truncate', quiet && 'text-muted-foreground')}>{value || '—'}</span>
        </div>
    );
}

/** Small label/value pair used in the details grid and the rail. */
function KV({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="space-y-0.5">
            <div className="text-muted-foreground text-xs">{label}</div>
            <div className="text-sm">{value || '—'}</div>
        </div>
    );
}

/** Visual tone of a spine step: done (brand check), ok (green), canceled (gray ✕, matches the status badge), current/working (pulsing), future (hollow gray). */
type SpineTone = 'done' | 'ok' | 'canceled' | 'current' | 'working' | 'future';

/** Maps the ticket status onto the three spine steps: created → taken → closed. */
function spineTones(status: TicketStatus): [SpineTone, SpineTone, SpineTone] {
    switch (status) {
        case 'open':
            return ['done', 'current', 'future'];
        case 'in_progress':
            return ['done', 'working', 'future'];
        case 'completed':
            return ['done', 'done', 'ok'];
        case 'canceled':
            return ['done', 'done', 'canceled'];
    }
}

/** One node of the case-status spine in the rail: dot + connector line + title/meta. */
function SpineStep({
    tone,
    index,
    last = false,
    title,
    meta,
    when,
}: {
    tone: SpineTone;
    index: number;
    last?: boolean;
    title: React.ReactNode;
    meta?: React.ReactNode;
    when?: string;
}) {
    const done = tone === 'done' || tone === 'ok' || tone === 'canceled';
    return (
        <li className="flex gap-3">
            <div className="flex flex-col items-center">
                <span className="relative shrink-0 rounded-full">
                    {/* Live step halo */}
                    {(tone === 'current' || tone === 'working') && (
                        <span
                            aria-hidden
                            className={cn('trail-live absolute inset-0 rounded-full', tone === 'current' ? 'bg-brand/30' : 'bg-violet-500/30')}
                        />
                    )}
                    <span
                        className={cn(
                            'relative grid h-[22px] w-[22px] place-items-center rounded-full text-[10px] font-bold',
                            tone === 'done' && 'bg-brand text-brand-foreground',
                            tone === 'ok' && 'bg-emerald-600 text-white',
                            tone === 'canceled' && 'bg-muted-foreground text-background',
                            tone === 'current' && 'border-brand text-brand bg-background border-2',
                            tone === 'working' && 'bg-background border-2 border-violet-500 text-violet-600 dark:text-violet-400',
                            tone === 'future' && 'border-border text-muted-foreground bg-background border-2',
                        )}
                    >
                        {done ? tone === 'canceled' ? <X className="h-3 w-3" /> : <Check className="h-3 w-3" /> : index}
                    </span>
                </span>
                {!last && <div className={cn('my-1 w-0.5 flex-1 rounded-full', tone === 'done' ? 'bg-brand' : 'bg-border')} />}
            </div>
            <div className={cn('min-w-0 flex-1', !last && 'pb-4')}>
                <div className={cn('text-sm leading-tight font-medium', tone === 'future' && 'text-muted-foreground')}>{title}</div>
                {(meta || when) && (
                    <div className="text-muted-foreground text-xs leading-relaxed">
                        {meta}
                        {when && <div className="text-[11px]">{when}</div>}
                    </div>
                )}
            </div>
        </li>
    );
}

/**
 * How much time the case gets, said in the unit it was set in.
 *
 * A repair KPI is written as "30 days" and stored as 720 hours; printing the stored number
 * asks the reader to divide before they can check it against the agreement they signed.
 * Working-hours targets stay in hours — a working day is eight of them, so a day count there
 * would be an approximation standing where an exact figure belongs.
 */
function slaTargetAmount(target: NonNullable<Ticket['sla_target']>, t: (key: string) => string): string {
    const lang = useUiStore.getState().lang;
    if (target.clock === 'calendar') {
        return target.hours % 24 === 0
            ? t('ticket_sla_target_days').replace('{n}', formatNumber(target.hours / 24, lang))
            : t('ticket_sla_target_hours_calendar').replace('{n}', formatNumber(target.hours, lang));
    }

    return t('ticket_sla_target_hours').replace('{n}', formatNumber(target.hours, lang));
}

/**
 * Which rule handed down that number — the line that stops a long deadline on an urgent case
 * reading as a bug.
 *
 * A case whose target came from no rule at all is the one place nobody chose the number:
 * it is named as the default rather than dressed up as a decision.
 */
function slaTargetSource(target: NonNullable<Ticket['sla_target']>, t: (key: string) => string): string {
    // A repair KPI winning the target is its own reason, not the "nobody chose this" default —
    // without this branch a case classified as repair read as if nothing had been decided.
    if (target.scope === 'work_class' && target.value) {
        // Named as the work it is, not just who does it: "External technician" on a row
        // labelled "Rule" reads as the person the case was given to, which is a different fact.
        const meta = TICKET_WORK_CLASS_META[target.value as TicketWorkClass];
        return meta ? t('ticket_sla_target_repair').replace('{c}', t(meta.key)) : target.value;
    }
    if (target.scope === 'request_type' && target.value) {
        const meta = REQUEST_TYPE_META[target.value as ServiceRequestType];
        return meta ? t(meta.labelKey) : t('ticket_sla_target_request');
    }
    if (target.scope === 'priority' && target.value) {
        return t('ticket_sla_target_priority');
    }

    return t('ticket_sla_target_default');
}

/** One row of the progress timeline. The two ends of the case sit in the same list as the notes. */
type ProgressKind = 'taken' | 'note' | 'forwarded' | 'completed' | 'canceled';

interface ProgressEntry {
    key: string;
    kind: ProgressKind;
    /** Who wrote it, or what happened — whichever the row is about. */
    title: string;
    when: string | null;
    body?: string | null;
}

/** Who first held the case: a forward moves the assignee, so the earliest hand-over names them. */
function firstHolderName(ticket: Ticket, lang: string): string {
    const firstForward = (ticket.updates ?? []).find((u) => u.kind === 'forwarded');
    if (firstForward?.meta?.from) return localPair(firstForward.meta.from, firstForward.meta.from_th, lang) ?? firstForward.meta.from;
    return localPair(ticket.assignee_name, ticket.assignee_name_th, lang) ?? '';
}

/** The case's path in one list; the two ends come from the ticket itself, the middle from ticket_updates. */
function progressEntries(ticket: Ticket, t: (key: string) => string, lang: string): ProgressEntry[] {
    const entries: ProgressEntry[] = [];

    // A case canceled before anybody took it never reached this step.
    if (ticket.responded_at != null || ticket.assignee_name != null) {
        entries.push({
            key: 'taken',
            kind: 'taken',
            title: `${t('ticket_taken_by')} ${firstHolderName(ticket, lang)}`.trim(),
            when: ticket.responded_at,
            body: ticket.take_note,
        });
    }

    for (const u of ticket.updates ?? []) {
        if (u.kind === 'forwarded') {
            entries.push({
                key: `update-${u.id}`,
                kind: 'forwarded',
                title: t('ticket_forwarded_event')
                    .replace('{from}', localPair(u.meta?.from, u.meta?.from_th, lang) || '—')
                    .replace('{to}', localPair(u.meta?.to, u.meta?.to_th, lang) || '—'),
                when: u.created_at,
                // Who moved it, when that was a dispatcher rather than the person it left.
                body: u.author_name && u.author_name !== u.meta?.from ? t('ticket_forwarded_by').replace('{name}', u.author_name) : null,
            });
            continue;
        }
        entries.push({
            key: `update-${u.id}`,
            kind: 'note',
            title: localPair(u.author_name, u.author_name_th, lang) ?? u.author_name,
            when: u.created_at,
            body: u.body,
        });
    }

    if (ticket.resolved_at != null) {
        const canceled = ticket.status === 'canceled';
        entries.push({
            key: 'closed',
            kind: canceled ? 'canceled' : 'completed',
            title: t(canceled ? 'ticket_canceled_event' : 'ticket_completed_event'),
            when: ticket.resolved_at,
            body: ticket.resolution,
        });
    }

    return entries;
}

/**
 * Icon + dot tone per timeline row, and the body tint where the row deserves one.
 *
 * The closing rows wear the colours their status badge and the Details pane already use, so the
 * same outcome does not change colour depending on which tab you read it in.
 */
const PROGRESS_META: Record<ProgressKind, { Icon: typeof Check; dot: string; body?: string }> = {
    taken: { Icon: Zap, dot: 'bg-brand/10 text-brand' },
    note: { Icon: MessageSquarePlus, dot: 'bg-muted text-muted-foreground' },
    // Same violet as the forward bell, so the hand-over reads as the same event in both places.
    forwarded: { Icon: ArrowRightLeft, dot: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
    completed: {
        Icon: Check,
        dot: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
        body: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    },
    // Canceled is a neutral outcome, not an error — grey, the way its status badge is.
    canceled: { Icon: X, dot: 'bg-muted-foreground/15 text-muted-foreground', body: 'bg-muted text-muted-foreground' },
};

/** Read-only ticket view — centered focus dialog with a tabbed body (details / files) and a case-status rail. */
export function TicketDetailDrawer({
    ticket,
    onClose,
    canTake,
    canResolve,
    canAssign,
    canForward,
    meId,
    meEmployeeId,
    canEdit,
    onEdit,
    onTake,
    onAssign,
    onForward,
    onResolve,
    onUpdate,
}: {
    ticket: Ticket | null;
    onClose: () => void;
    /** tickets.resolve plus the case's Ticket Level */
    canTake: boolean;
    /** tickets.resolve */
    canResolve: boolean;
    /** tickets.assign */
    canAssign: boolean;
    /** tickets.forward */
    canForward: boolean;
    meId: number | undefined;
    /** The viewer's employee id — a case they filed themselves can never be taken by them. */
    meEmployeeId: number | null | undefined;
    canEdit: boolean;
    onEdit: (t: Ticket) => void;
    onTake: (t: Ticket) => void;
    onAssign: (t: Ticket) => void;
    onForward: (t: Ticket) => void;
    onResolve: (t: Ticket, mode: ResolveMode) => void;
    /** Opens the progress-note dialog — offered to the assignee while the case is in flight. */
    onUpdate: (t: Ticket) => void;
}) {
    const fmt = useDateFormat();
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    // System-timezone timestamp; '' (not '—') when missing — timeline steps hide their timestamp row entirely.
    const fmtWhen = (iso: string | null | undefined): string => (iso ? fmt.dateTime(iso) : '');

    // Retain a "shown" copy so the content doesn't blank out during the Radix exit animation.
    const [shown, setShown] = useState<Ticket | null>(null);
    useEffect(() => {
        if (ticket) setShown(ticket);
    }, [ticket]);
    const view = ticket ?? shown;

    const [tab, setTab] = useState<'details' | 'progress' | 'files'>('details');
    // In-app preview (lightbox) for image and PDF attachments instead of opening a new tab.
    const [preview, setPreview] = useState<TicketAttachment | null>(null);
    useEffect(() => {
        setPreview(null);
        setTab('details');
    }, [view?.id]);

    if (!view) return null;

    const progress = progressEntries(view, t, lang);
    const { showTake, showAssign, showForward, showWork, hasDeskActions } = ticketActionFlags(view, {
        canTake,
        canResolve,
        canAssign,
        canForward,
        meId,
        meEmployeeId,
    });
    const files = view.attachments ?? [];
    const [s1, s2, s3] = spineTones(view.status);
    // A ticket canceled before anyone took it never reached step 2.
    const wasTaken = view.responded_at != null || view.assignee_name != null;

    return (
        <>
            <Dialog open={!!ticket} onOpenChange={(o) => !o && onClose()}>
                <DialogContent
                    // Height follows the content, capped at the focus-dialog size; the floor stops a tab switch collapsing it
                    className={cn(focusDialogContentClass, 'h-auto max-h-[min(860px,calc(100vh-72px))] min-h-[380px]')}
                    // Focus the dialog itself so no button opens with a focus ring (and no field raises the iPad keyboard)
                    onOpenAutoFocus={(e) => {
                        e.preventDefault();
                        (e.currentTarget as HTMLElement | null)?.focus();
                    }}
                >
                    {/* ---- header: shared focus-dialog header (icon tile + eyebrow + title + code chip) ---- */}
                    <FocusDialogHeader
                        icon={ticketCategoryIcon(view.category)}
                        eyebrow={
                            <span className="flex flex-wrap items-center gap-2">
                                {t('ticket_col_no')}
                                <span className="text-foreground text-[13.5px] font-extrabold tracking-tight">{view.ticket_no}</span>
                                <span className="bg-accent text-foreground/65 dark:text-muted-foreground rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-normal normal-case">
                                    {t(`ticket_cat_${view.category}`)}
                                </span>
                            </span>
                        }
                        title={view.subject}
                        srDescription={view.ticket_no}
                        headerRight={
                            <div className="flex flex-wrap items-center justify-end gap-2">
                                <TicketStatusBadge status={view.status} t={t} />
                                {view.priority && <TicketPriorityBadge priority={view.priority} t={t} />}
                                {/* A case out with a technician is a state of the case, like the two
                                    beside it — not an aside to the button that set it, which is where
                                    it used to sit, wedged into a row of actions. Named for who has the
                                    work rather than "Repair": the difference between an in-house bench
                                    and a vendor is the difference between days and weeks. */}
                                {view.work_class && view.work_class !== 'standard' && (
                                    <StatusBadge tone="gray" dot={false}>
                                        <Wrench className="h-3 w-3" />
                                        {t(TICKET_WORK_CLASS_META[view.work_class].key)}
                                    </StatusBadge>
                                )}
                            </div>
                        }
                    />

                    {/* Status banner; its action lives in the footer */}
                    {showTake && (
                        <div className="bg-brand/10 text-brand border-border/60 flex items-center gap-2.5 border-b px-6 py-2 text-[12.5px]">
                            <Zap className="h-3.5 w-3.5 shrink-0" />
                            <span className="flex-1">{t('ticket_unassigned_hint')}</span>
                        </div>
                    )}
                    {showWork && (
                        <div className="border-border/60 flex items-center gap-2.5 border-b bg-violet-500/10 px-6 py-2 text-[12.5px] text-violet-600 dark:text-violet-400">
                            <RefreshCcw className="h-3.5 w-3.5 shrink-0" />
                            <span className="flex-1">{t('ticket_working_hint')}</span>
                        </div>
                    )}

                    {/* ---- body: tabbed main column | case-status rail ---- */}
                    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto sm:flex-row sm:overflow-hidden">
                        <div className="flex min-w-0 flex-1 flex-col sm:min-h-0">
                            <DialogTabs
                                className="shrink-0 px-6"
                                active={tab}
                                onChange={setTab}
                                tabs={[
                                    // Three different kinds of thing — what was reported, what has
                                    // happened since, what came attached — so each gets a mark that
                                    // can be recognised before the word is read.
                                    { id: 'details', label: t('ticket_tab_details'), icon: CircleAlert },
                                    { id: 'progress', label: t('ticket_tab_progress'), count: progress.length, icon: History },
                                    { id: 'files', label: t('ticket_attach'), count: files.length, icon: Paperclip },
                                ]}
                            />

                            {/* Only the pane content scrolls — the tab bar above stays put. */}
                            <div className="min-h-0 flex-1 px-6 py-4 sm:overflow-y-auto">
                                {/* Details answers "what was reported"; Progress answers "what happened
                                    since". The take note and the resolution belong to the second
                                    question and live in that timeline — printing them here as well
                                    made two tabs tell one story, and the subject was already the
                                    dialog's own title two lines above. */}
                                {tab === 'details' && (
                                    <div className="space-y-5">
                                        <section>
                                            <SectionLabel>{t('ticket_description')}</SectionLabel>
                                            {/* whitespace-pre-wrap: an auto-opened case writes one fact per
                                                line (type, requester, each typed field, then the reason),
                                                and without this every break collapsed into one paragraph —
                                                which is how a structured summary came out as a wall of text. */}
                                            <p className="bg-muted/50 rounded-md px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
                                                {view.description}
                                            </p>
                                        </section>

                                        {view.related_asset_tag && (
                                            <section>
                                                <SectionLabel>{t('ticket_related_asset')}</SectionLabel>
                                                {/* Plain info block (not a card) — this view has no asset navigation. */}
                                                <div className="space-y-3">
                                                    {/* Device kind: the ASSET's type icon + category name (not the ticket category). */}
                                                    <div className="flex items-center gap-2.5">
                                                        <span className="bg-muted text-muted-foreground grid h-8 w-8 shrink-0 place-items-center rounded-md">
                                                            <AssetTypeIcon type={view.related_asset_type ?? ''} className="h-4 w-4" />
                                                        </span>
                                                        <span className="text-sm font-semibold">
                                                            {localPair(view.related_asset_type, view.related_asset_type_th, lang) ?? '—'}
                                                        </span>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                                                        <KV label={t('ticket_asset_no')} value={view.related_asset_tag} />
                                                        <KV label={t('ticket_asset_tag')} value={view.related_asset_tag_name} />
                                                        <KV
                                                            label={t('ticket_asset_brand_model')}
                                                            value={[view.related_asset_brand, view.related_asset_model].filter(Boolean).join(' ')}
                                                        />
                                                        <KV label={t('ticket_asset_serial')} value={view.related_asset_serial} />
                                                    </div>
                                                </div>
                                            </section>
                                        )}
                                    </div>
                                )}

                                {tab === 'progress' && (
                                    <div>
                                        {progress.length === 0 ? (
                                            <EmptyState title={t('ticket_empty_drawer_progress')} hint={t('ticket_empty_drawer_progress_hint')} />
                                        ) : (
                                            <ol className="space-y-0">
                                                {progress.map((entry, i) => {
                                                    const meta = PROGRESS_META[entry.kind];
                                                    const last = i === progress.length - 1;
                                                    return (
                                                        <li key={entry.key} className="flex gap-3">
                                                            {/* Dot + connector: the same spine the rail uses, so the two
                                                                timelines in this dialog read as one language. */}
                                                            <div className="flex flex-col items-center">
                                                                <span
                                                                    className={cn(
                                                                        'mt-1 grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full',
                                                                        meta.dot,
                                                                    )}
                                                                >
                                                                    <meta.Icon className="h-3.5 w-3.5" />
                                                                </span>
                                                                {!last && <div className="bg-border my-1 w-0.5 flex-1 rounded-full" />}
                                                            </div>
                                                            <div className={cn('min-w-0 flex-1', !last && 'pb-4')}>
                                                                <div className="flex flex-wrap items-baseline gap-x-2">
                                                                    <span className="text-sm leading-tight font-semibold">{entry.title}</span>
                                                                    <span className="text-muted-foreground text-[11px]">{fmtWhen(entry.when)}</span>
                                                                </div>
                                                                {/* Taking a case without leaving a note is allowed, so the
                                                                    row stands on its own headline when there is no body. */}
                                                                {entry.body && (
                                                                    <p
                                                                        className={cn(
                                                                            'mt-1.5 rounded-md px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap',
                                                                            meta.body ?? 'bg-muted/50',
                                                                        )}
                                                                    >
                                                                        {entry.body}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </li>
                                                    );
                                                })}
                                            </ol>
                                        )}
                                    </div>
                                )}

                                {tab === 'files' && (
                                    <div>
                                        {files.length === 0 ? (
                                            <EmptyState title={t('ticket_empty_drawer_files')} hint={t('ticket_empty_drawer_files_hint')} />
                                        ) : (
                                            <ul className="grid gap-3 sm:grid-cols-2">
                                                {files.map((a) => {
                                                    const kind = fileKind(a);
                                                    const isImage = kind === 'image';
                                                    const meta = isImage ? null : KIND_META[kind];
                                                    return (
                                                        <li
                                                            key={a.id}
                                                            className="border-border group hover:border-brand overflow-hidden rounded-xl border transition-colors"
                                                        >
                                                            {/* Big thumbnail → opens the in-app preview (image lightbox / PDF viewer). */}
                                                            <button
                                                                type="button"
                                                                onClick={() => setPreview(a)}
                                                                aria-label={a.name}
                                                                className="bg-muted border-border/60 block h-36 w-full overflow-hidden border-b p-2"
                                                            >
                                                                {isImage ? (
                                                                    // object-contain: screenshots/documents show whole, letterboxed on the muted bg.
                                                                    <img
                                                                        src={a.url}
                                                                        alt=""
                                                                        className="h-full w-full rounded-sm object-contain transition-transform duration-200 group-hover:scale-[1.02]"
                                                                    />
                                                                ) : (
                                                                    meta && (
                                                                        <span className="flex h-full w-full flex-col items-center justify-center gap-2">
                                                                            <meta.Icon strokeWidth={1.5} className={cn('h-14 w-14', FILE_TONE)} />
                                                                            <span
                                                                                className={cn(
                                                                                    'rounded-full border border-current px-2 py-0.5 text-[10px] font-bold tracking-widest',
                                                                                    FILE_TONE,
                                                                                )}
                                                                            >
                                                                                {meta.short}
                                                                            </span>
                                                                        </span>
                                                                    )
                                                                )}
                                                            </button>
                                                            <div className="flex items-center gap-2 px-3 py-2.5">
                                                                <div className="min-w-0 flex-1">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setPreview(a)}
                                                                        className="hover:text-brand block w-full truncate text-left text-sm font-semibold"
                                                                    >
                                                                        {a.name}
                                                                    </button>
                                                                    <div className="text-muted-foreground flex flex-wrap gap-x-3 text-[11px]">
                                                                        <span>{formatFileSize(a.size)}</span>
                                                                        {a.created_at && <span>{fmtWhen(a.created_at)}</span>}
                                                                    </div>
                                                                    {/* Filed with the request, not uploaded here — and not removable. */}
                                                                    {a.from_request && (
                                                                        <span className="border-brand/30 bg-brand/5 text-brand mt-1 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold">
                                                                            <Paperclip className="h-2.5 w-2.5 shrink-0" />
                                                                            {a.from_request}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <a
                                                                    href={a.url}
                                                                    download={a.name}
                                                                    aria-label={t('attachment_download')}
                                                                    title={t('attachment_download')}
                                                                    className="text-muted-foreground hover:bg-accent hover:text-foreground grid h-8 w-8 shrink-0 place-items-center rounded-md"
                                                                >
                                                                    <Download className="h-4 w-4" />
                                                                </a>
                                                            </div>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ---- rail: case-status spine + dates ---- */}
                        <aside className="border-border bg-muted/30 shrink-0 border-t px-5 py-4 sm:w-[300px] sm:overflow-y-auto sm:border-t-0 sm:border-l">
                            <SectionLabel>{t('ticket_case_status')}</SectionLabel>
                            <ol className="mt-3">
                                <SpineStep
                                    tone={s1}
                                    index={1}
                                    title={t('ticket_created_event')}
                                    meta={localPair(view.requester_name, view.requester_name_th, lang) ?? view.requester_code}
                                    when={fmtWhen(view.created_at)}
                                />
                                <SpineStep
                                    tone={view.status !== 'open' && !wasTaken ? 'future' : s2}
                                    index={2}
                                    title={
                                        view.status !== 'open' && wasTaken
                                            ? `${t('ticket_taken_by')} ${firstHolderName(view, lang)}`.trim()
                                            : t('ticket_waiting')
                                    }
                                    when={fmtWhen(view.responded_at)}
                                />
                                <SpineStep
                                    tone={s3}
                                    index={3}
                                    last
                                    title={
                                        view.status === 'completed'
                                            ? t('ticket_completed_event')
                                            : view.status === 'canceled'
                                              ? t('ticket_canceled_event')
                                              : t('ticket_step_closed')
                                    }
                                    when={fmtWhen(view.resolved_at)}
                                />
                            </ol>

                            <div className="bg-border/60 my-3 h-px" />
                            <SectionLabel>{t('ticket_open_by')}</SectionLabel>
                            <div className="space-y-3 pl-1">
                                <KV
                                    label={t('ticket_full_name')}
                                    value={localPair(view.requester_name, view.requester_name_th, lang) ?? view.requester_code}
                                />
                                <KV
                                    label={t('ticket_callback_phone')}
                                    value={
                                        view.callback_phone ? (
                                            // Click-to-call: strip the label text ("ต่อ 218" etc.) down to dialable characters.
                                            <a
                                                href={`tel:${view.callback_phone.replace(/[^\d+#*]/g, '')}`}
                                                className="hover:text-brand hover:underline"
                                            >
                                                {view.callback_phone}
                                            </a>
                                        ) : null
                                    }
                                />
                            </div>

                            <div className="bg-border/60 my-3 h-px" />
                            <SectionLabel>{t('ticket_responsible_by')}</SectionLabel>
                            <div className="pl-1 text-sm">
                                {localPair(view.assignee_name, view.assignee_name_th, lang) ?? (
                                    <span className="text-muted-foreground italic">{t('ticket_unassigned')}</span>
                                )}
                            </div>

                            {/* For the person waiting, not the desk: one date answering "when will
                                this be done", with none of the target-vs-actual scoring below it.
                                Hidden from anyone who gets the SLA block, which already carries the
                                same instant under a name that means something to them. */}
                            {!view.sla && view.status !== 'completed' && view.status !== 'canceled' && (
                                <>
                                    <div className="bg-border/60 my-3 h-px" />
                                    <SectionLabel>{t('ticket_expected_at')}</SectionLabel>
                                    <div className="pl-1 text-sm">
                                        {view.expected_at ? (
                                            <span>{fmtWhen(view.expected_at)}</span>
                                        ) : (
                                            <span className="text-muted-foreground italic">{t('ticket_expected_at_pending')}</span>
                                        )}
                                    </div>
                                </>
                            )}

                            {view.sla && (
                                <>
                                    <div className="bg-border/60 my-3 h-px" />
                                    {/* Compact: badge on the heading row, dues as one-liners. */}
                                    <div className="flex items-center justify-between gap-2">
                                        <SectionLabel>{t('ticket_sla')}</SectionLabel>
                                        <TicketSlaBadge ticket={view} t={t} />
                                    </div>
                                    {/* One of these two clocks is running and the other has
                                        already settled — response until somebody picks the case
                                        up, resolution from then on. They used to sit as
                                        identical rows, so a deadline that was history read as
                                        something still to hit, and the badge above named a
                                        number with no row to point at. The live one carries the
                                        bar; the settled one steps back. */}
                                    <div className="space-y-2 pl-1">
                                        {(() => {
                                            const liveIsResponse = view.status === 'open' && !view.responded_at;
                                            const liveLabel = liveIsResponse ? 'ticket_sla_response_due' : 'ticket_sla_resolve_due';
                                            const pastLabel = liveIsResponse ? 'ticket_sla_resolve_due' : 'ticket_sla_response_due';
                                            const liveDue = liveIsResponse ? view.sla.response_due_at : view.sla.resolve_due_at;
                                            const pastDue = liveIsResponse ? view.sla.resolve_due_at : view.sla.response_due_at;
                                            // A closed case has a verdict, not a countdown — the badge
                                            // already says met or missed, and a full bar adds nothing.
                                            const running = view.sla.state !== 'met' && view.sla.state !== 'missed';
                                            // Nobody has taken it, so the resolution clock has not started
                                            // (see TicketSla::resolveStart). The date the server carries is a
                                            // placeholder that keeps the queue sortable, not a promise — and
                                            // it moves the moment somebody picks the case up, so printing it
                                            // as a deadline hands the reader a date that is about to be wrong.
                                            const resolveNotStarted = !view.responded_at;

                                            return (
                                                <>
                                                    <div className="space-y-1.5">
                                                        <RailRow label={t(liveLabel)} value={fmtWhen(liveDue)} />
                                                        {running && (
                                                            <div className="bg-muted h-1 overflow-hidden rounded-full" role="presentation">
                                                                <div
                                                                    className={cn('h-full rounded-full', SLA_BAR_TONE[view.sla.state])}
                                                                    style={{ width: `${Math.min(100, Math.max(0, view.sla.pct_elapsed))}%` }}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <RailRow
                                                        label={t(pastLabel)}
                                                        value={resolveNotStarted ? t('ticket_sla_resolve_not_started') : fmtWhen(pastDue)}
                                                        quiet
                                                    />
                                                </>
                                            );
                                        })()}
                                        {/* Where the resolution target came from. Without this, a three-day
                                            deadline on a case marked critical reads as a bug.

                                            Held back until somebody takes the case: until then there is no
                                            deadline on screen for it to explain, and the number itself is not
                                            settled — the priority that picks it is chosen at the moment of
                                            taking. A figure shown next to nothing reads as a commitment. */}
                                        {view.responded_at && view.sla_target && (
                                            <>
                                                <RailRow label={t('ticket_sla_target_from')} value={slaTargetAmount(view.sla_target, t)} wrap />
                                                <RailRow label={t('ticket_sla_source')} value={slaTargetSource(view.sla_target, t)} wrap />
                                            </>
                                        )}
                                    </div>
                                </>
                            )}

                            {/* No "Other" block: it held the creation time, which the first step of
                                the spine above already gives, and updated_at, which moves whenever
                                anything at all is touched and tells a reader nothing they can act on. */}
                        </aside>
                    </div>

                    {/* ---- footer: role-/status-aware actions ----

                         The bar is always there, so the dialog ends the same way for everybody.
                         A requester gets only what is theirs to do — edit their own case while
                         it is still open, and close the dialog — with none of the desk's work
                         on it. Close only appears when the desk's buttons do not: putting it
                         beside "Close the case" would be two buttons whose labels agree and
                         whose consequences do not. */}
                    <div className="border-border bg-muted/20 flex flex-row flex-wrap items-center gap-2 border-t px-6 py-3.5">
                        {canEdit && (
                            <Button variant="outline" onClick={() => onEdit(view)}>
                                <Pencil className="h-4 w-4" />
                                {t('edit')}
                            </Button>
                        )}
                        <span className="flex-1" />
                        {showAssign && (
                            <Button variant="outline" onClick={() => onAssign(view)}>
                                <Users className="h-4 w-4" />
                                {t('ticket_assign_to_staff')}
                            </Button>
                        )}
                        {showTake && (
                            <Button onClick={() => onTake(view)}>
                                <Zap className="h-4 w-4" />
                                {t('ticket_take_case')}
                            </Button>
                        )}
                        {showForward && (
                            <Button variant="outline" onClick={() => onForward(view)}>
                                <ArrowRightLeft className="h-4 w-4" />
                                {t('ticket_forward')}
                            </Button>
                        )}
                        {!hasDeskActions && (
                            <Button variant="outline" onClick={onClose}>
                                {t('close')}
                            </Button>
                        )}
                        {showWork && (
                            <>
                                {/* Between taking and closing: the third thing an assignee can do. */}
                                <Button variant="outline" onClick={() => onUpdate(view)}>
                                    <MessageSquarePlus className="h-4 w-4" />
                                    {t('ticket_update_action')}
                                </Button>
                                <Button variant="destructive" onClick={() => onResolve(view, 'cancel')}>
                                    <X className="h-4 w-4" />
                                    {t('ticket_mark_canceled')}
                                </Button>
                                <Button onClick={() => onResolve(view, 'complete')}>
                                    <Check className="h-4 w-4" />
                                    {t('ticket_mark_complete')}
                                </Button>
                            </>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Attachment lightbox — images zoom/pan, PDFs embed the browser's viewer, the rest show a file card. */}
            <AttachmentPreview file={preview} onClose={() => setPreview(null)} meta={(f) => (f.created_at ? fmtWhen(f.created_at) : '')} />
        </>
    );
}
