import { useT } from '@/lang';
import { REQUEST_SKIP_REASON_LABEL } from '@/shared/lib/request-meta';
import { cn } from '@/shared/lib/utils';
import type { ApprovalSkipReason, RequestApproval, ServiceRequest } from '@/shared/types';
import { Bell, Check, Flag, KeyRound, SkipForward, X } from 'lucide-react';

/**
 * `cancelled` is the IT queue step closed without delivery. It is kept apart from
 * `rejected` on purpose: nobody refused this request — it cleared every approval and
 * then could not be delivered, and a red "refused" marker said the opposite. Muted,
 * matching the grey the status badge already uses for a cancelled request.
 */
type TrailTone = 'done' | 'current' | 'rejected' | 'cancelled' | 'skipped' | 'queued';

interface TrailItem {
    tone: TrailTone;
    glyph: React.ReactNode;
    title: string;
    meta: string;
    note?: string | null;
    /** Step is open but its approver cannot sign in yet — said in the reader's language. */
    awaitingAccount?: boolean;
    /** Why the engine skipped the step, if it did — also written in the reader's language. */
    skipReason?: ApprovalSkipReason | null;
}

/**
 * Vertical approval trail of one request — mirrors the draw.io flow: submitted
 * → every (frozen) approval step with its decision + remark → the Admin/IT
 * fulfillment hop, or the rejection notice back to the requester.
 */
/** "QC Dept. · Asst. Manager / Manager" — who is holding a step that names no one person. */
function departmentTitle(row: RequestApproval): string {
    const positions = (row.approver_positions ?? []).join(' / ');
    return positions ? `${row.approver_department} · ${positions}` : String(row.approver_department);
}

/**
 * Who is holding a step that names several people: all of them, until one signs.
 *
 * Joined with "·" like the department line above rather than listed, because the trail
 * gives each step one line and the names are alternates — whichever of them acts, the step
 * is done, so the line is one answer and not a checklist.
 */
function candidatesTitle(row: RequestApproval): string {
    return (row.approver_candidates ?? []).join(' · ');
}

export function RequestTrail({ request }: { request: ServiceRequest }) {
    const t = useT();
    const approvals = request.approvals ?? [];

    const items: TrailItem[] = [
        {
            tone: 'done',
            glyph: <Check className="h-3 w-3" />,
            title: t('req_trail_submitted'),
            // Just the timestamp: who submitted it is the requester card above, and
            // repeating the name here made the same person read twice side by side.
            meta: request.created_at,
        },
    ];

    // No SLA here on purpose — this module does not present a deadline as an
    // indicator; the trail says where a request stands, not how late it is.
    const stepMeta = (row: RequestApproval): string => {
        switch (row.status) {
            case 'approved':
                return `${t('req_trail_approved')}${row.acted_at ? ` · ${row.acted_at}` : ''}`;
            case 'rejected':
                return `${t('req_trail_rejected')}${row.acted_at ? ` · ${row.acted_at}` : ''}`;
            case 'current':
                return t('req_trail_waiting');
            case 'skipped':
                return t('req_trail_skipped');
            default:
                return t('req_trail_queued');
        }
    };

    /**
     * The IT queue step, said in its own words. It is not an approval rung, so the
     * approver vocabulary above reads wrong on it: "waiting" meant "waiting for
     * approval" on a request that was approved days ago, and "rejected" meant
     * "not approved" on work IT simply could not deliver.
     *
     * Once a ticket exists, the ticket is where this step actually stands — nobody has
     * picked it up, or somebody is on it — so that is what it reports.
     */
    const fulfillmentMeta = (row: RequestApproval): string => {
        if (row.status === 'waiting') return t('req_trail_after_approvals');
        if (row.status === 'approved') {
            // Naming who finished it: the trail says who decided every other step, and
            // this is the one where the work actually happened.
            const done = row.acted_by_name ? t('req_trail_fulfilled_by').replace('{name}', row.acted_by_name) : t('req_trail_fulfilled_done');

            return `${done}${row.acted_at ? ` · ${row.acted_at}` : ''}`;
        }
        // Closed without delivery. Every approver said yes, so this is a cancellation —
        // and it names who called it off, the same way the completed line does.
        if (row.status === 'rejected') {
            const stopped = row.acted_by_name ? t('req_trail_cancelled_by').replace('{name}', row.acted_by_name) : t('req_trail_not_delivered');

            return `${stopped}${row.acted_at ? ` · ${row.acted_at}` : ''}`;
        }

        const ticket = request.ticket;
        if (ticket?.status === 'in_progress') {
            return ticket.assignee ? t('req_trail_ticket_in_progress').replace('{name}', ticket.assignee) : t('req_trail_ticket_taken');
        }
        if (ticket?.status === 'open') return t('req_trail_ticket_waiting_take');

        return t('req_trail_it_pending');
    };

    for (const row of approvals) {
        const isFulfillment = row.kind === 'fulfillment';
        const tone: TrailTone =
            row.status === 'approved'
                ? 'done'
                : row.status === 'rejected'
                  ? isFulfillment
                      ? 'cancelled'
                      : 'rejected'
                  : row.status === 'current'
                    ? 'current'
                    : row.status === 'skipped'
                      ? 'skipped'
                      : 'queued';
        items.push({
            tone,
            glyph:
                row.status === 'approved' ? (
                    <Check className="h-3 w-3" />
                ) : row.status === 'rejected' ? (
                    <X className="h-3 w-3" />
                ) : row.status === 'skipped' ? (
                    <SkipForward className="h-3 w-3" />
                ) : isFulfillment ? (
                    <Flag className="h-3 w-3" />
                ) : (
                    <span className="font-mono text-[11px] font-bold">{row.position}</span>
                ),
            // A group step nobody has taken yet has no single name to print. The people it
            // names, or the department and the rungs it accepts, are what the reader can act
            // on — "waiting on a person we cannot name" is the one thing the line must not say.
            title: isFulfillment
                ? t('req_trail_fulfillment')
                : (row.approver_name ??
                  ((row.approver_candidates ?? []).length > 0 ? candidatesTitle(row) : row.approver_department ? departmentTitle(row) : row.label)),
            // A skipped step with a reason says it all inside the amber note below, so the
            // status line stays quiet instead of printing "skipped" twice. Rows from before
            // reasons were stored still get the plain word.
            meta: isFulfillment ? fulfillmentMeta(row) : row.status === 'skipped' && row.skip_reason ? '' : stepMeta(row),
            note: row.note,
            awaitingAccount: row.awaiting_account,
            skipReason: row.skip_reason,
        });
        // No auto-ticket footnote: the line above already reports the ticket's own state
        // ("waiting to be picked up", "in progress by …"), which only reads that way
        // because a ticket exists. The linked-ticket card below carries the number.
    }

    // Rejection bounces a Bell + Email back to the requester (per the diagram).
    if (request.status === 'rejected') {
        items.push({
            tone: 'rejected',
            glyph: <Bell className="h-3 w-3" />,
            title: request.requester.name,
            meta: `${t('req_decide_notify_reject')}`,
        });
    }

    return (
        <div className="relative space-y-4">
            {items.map((item, i) => (
                <div key={i} className="relative flex items-start gap-3">
                    {/* One connector per gap, drawn from under this marker to just short of
                        the next one — and none after the last step. A single rail spanning
                        the whole list was sized by the container, so it hung ~26px below the
                        final dot (the height of its two text lines) and poked out above the
                        first one. */}
                    {i < items.length - 1 && <span aria-hidden className="bg-border absolute top-[26px] -bottom-3 left-[11px] w-px" />}
                    {/* Opaque disc under the marker: the tinted tones (current, skipped) are
                        translucent, and without something solid behind them the rail was
                        visible straight through the middle of the dot. */}
                    <span className="bg-background relative z-[1] shrink-0 rounded-full">
                        {/* Live step: a halo swelling out from behind the dot. Sits before the
                            marker in the DOM so the marker draws over it. */}
                        {item.tone === 'current' && <span aria-hidden className="bg-brand/30 trail-live absolute inset-0 rounded-full" />}
                        <span
                            className={cn(
                                // `relative`: an absolutely-positioned sibling (the halo) paints
                                // over a static one whatever the DOM order, so the marker has to
                                // be positioned too for it to stay on top.
                                'relative flex h-[23px] w-[23px] items-center justify-center rounded-full border-[1.5px]',
                                item.tone === 'done' && 'border-emerald-500 bg-emerald-500 text-white',
                                item.tone === 'current' && 'border-brand bg-brand/10 text-brand ring-brand/15 ring-[3px]',
                                item.tone === 'rejected' && 'border-destructive bg-destructive text-white',
                                item.tone === 'cancelled' && 'border-border bg-muted text-muted-foreground',
                                item.tone === 'skipped' && 'border-amber-500/60 bg-amber-500/10 text-amber-600 dark:text-amber-400',
                                item.tone === 'queued' && 'border-border bg-background text-muted-foreground',
                            )}
                        >
                            {item.glyph}
                        </span>
                    </span>
                    <div className="min-w-0 pt-0.5">
                        <div
                            className={cn(
                                'text-sm leading-tight font-semibold',
                                (item.tone === 'queued' || item.tone === 'cancelled') && 'text-muted-foreground',
                            )}
                        >
                            {item.title}
                        </div>
                        {item.meta && <div className="text-muted-foreground mt-0.5 text-xs leading-snug">{item.meta}</div>}
                        {item.skipReason && (
                            <div className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                                <SkipForward className="h-3.5 w-3.5 shrink-0" />
                                {t(REQUEST_SKIP_REASON_LABEL[item.skipReason])}
                            </div>
                        )}
                        {item.awaitingAccount && (
                            <div className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                                <KeyRound className="h-3.5 w-3.5 shrink-0" />
                                {t('req_await_account')}
                            </div>
                        )}
                        {item.note && (
                            <div className="bg-muted/60 text-foreground/80 mt-1.5 rounded-lg px-2.5 py-1.5 text-xs leading-relaxed">
                                “{item.note}”
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
