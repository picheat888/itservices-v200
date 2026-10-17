import { useT } from '@/lang';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { localPair } from '@/shared/lib/local-name';
import { REQUEST_SKIP_REASON_LABEL } from '@/shared/lib/request-meta';
import { cn } from '@/shared/lib/utils';
import type { ApprovalSkipReason, RequestApproval, ServiceRequest } from '@/shared/types';
import { useUiStore } from '@/stores/ui';
import { Ban, Bell, Check, Flag, KeyRound, SkipForward, X } from 'lucide-react';

/** `cancelled` = withdrawn by the requester, or the IT step closed without delivery (muted, not the red of a refusal). */
type TrailTone = 'done' | 'current' | 'rejected' | 'cancelled' | 'skipped' | 'queued';

interface TrailItem {
    tone: TrailTone;
    glyph: React.ReactNode;
    title: string;
    meta: string;
    /** When the step was decided — its own span after the meta, spaced rather than joined. */
    metaTime?: string | null;
    note?: string | null;
    /** Step is open but its approver cannot sign in yet — said in the reader's language. */
    awaitingAccount?: boolean;
    /** Why the engine skipped the step, if it did — also written in the reader's language. */
    skipReason?: ApprovalSkipReason | null;
}

/** "QC Dept.: Asst. Manager / Manager" — who is holding a step that names no one person. */
function departmentTitle(row: RequestApproval, lang: string): string {
    const positions = (row.approver_positions ?? []).join(' / ');
    const department = localPair(row.approver_department, row.approver_department_th, lang);
    return positions ? `${department}: ${positions}` : String(department);
}

/** The alternates holding a step, on one line (whichever signs first closes it). */
function candidatesTitle(row: RequestApproval, lang: string): string {
    return (row.approver_candidates ?? []).map((name, i) => localPair(name, row.approver_candidates_th?.[i], lang)).join(', ');
}

/** Vertical approval trail: submitted, each approval step, then the IT step or the rejection notice. */
export function RequestTrail({ request }: { request: ServiceRequest }) {
    const fmt = useDateFormat();
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const approvals = request.approvals ?? [];

    const items: TrailItem[] = [
        {
            tone: 'done',
            glyph: <Check className="h-3 w-3" />,
            title: t('req_trail_submitted'),
            meta: fmt.dateTime(request.created_at),
        },
    ];

    const stepMeta = (row: RequestApproval): string => {
        switch (row.status) {
            case 'approved':
                return t('req_trail_approved');
            case 'rejected':
                return t('req_trail_rejected');
            case 'current':
                return t('req_trail_waiting');
            case 'skipped':
                return t('req_trail_skipped');
            default:
                return t('req_trail_queued');
        }
    };

    /** The IT step in its own words; once a ticket exists, the ticket's state. */
    const completionMeta = (row: RequestApproval): string => {
        if (row.status === 'waiting') return t('req_trail_after_approvals');
        if (row.status === 'approved') {
            const done = row.acted_by_name ? t('req_trail_completed_by').replace('{name}', row.acted_by_name) : t('req_trail_completed_done');

            return done;
        }
        // Closed without delivery
        if (row.status === 'rejected') {
            const stopped = row.acted_by_name ? t('req_trail_cancelled_by').replace('{name}', row.acted_by_name) : t('req_trail_not_delivered');

            return stopped;
        }

        const ticket = request.ticket;
        if (ticket?.status === 'in_progress') {
            return ticket.assignee ? t('req_trail_ticket_in_progress').replace('{name}', ticket.assignee) : t('req_trail_ticket_taken');
        }
        if (ticket?.status === 'open') return t('req_trail_ticket_waiting_take');

        return t('req_trail_it_pending');
    };

    for (const row of approvals) {
        const isCompletion = row.kind === 'completion';
        const tone: TrailTone =
            row.status === 'approved'
                ? 'done'
                : row.status === 'rejected'
                  ? isCompletion
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
                ) : isCompletion ? (
                    <Flag className="h-3 w-3" />
                ) : (
                    <span className="text-[11px] font-bold">{row.position}</span>
                ),
            // An untaken group step names its people, or its department and positions
            title: isCompletion
                ? t('req_trail_completion')
                : (row.approver_name ??
                  ((row.approver_candidates ?? []).length > 0
                      ? candidatesTitle(row, lang)
                      : row.approver_department
                        ? departmentTitle(row, lang)
                        : row.label)),
            // A skip reason shows in the amber note instead
            meta: isCompletion ? completionMeta(row) : row.status === 'skipped' && row.skip_reason ? '' : stepMeta(row),
            // Decided or closed steps say when; open, queued and skipped steps have no time.
            metaTime: row.status === 'approved' || row.status === 'rejected' ? fmt.dateTime(row.acted_at) : null,
            note: row.note,
            awaitingAccount: row.awaiting_account,
            skipReason: row.skip_reason,
        });
    }

    // Withdrawn while pending: placed before the steps it never reached
    if (request.status === 'cancelled' && request.cancel_reason) {
        const firstQueued = items.findIndex((item) => item.tone === 'queued');
        items.splice(firstQueued < 0 ? items.length : firstQueued, 0, {
            tone: 'cancelled',
            glyph: <Ban className="h-3 w-3" />,
            title: request.cancelled_by ?? request.requester.name,
            meta: t('req_trail_withdrawn'),
            metaTime: fmt.dateTime(request.cancelled_at),
            note: request.cancel_reason,
        });
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
                    {/* Connector to the next marker */}
                    {i < items.length - 1 && <span aria-hidden className="bg-border absolute top-[26px] -bottom-3 left-[11px] w-px" />}
                    {/* Opaque disc so the rail does not show through tinted markers */}
                    <span className="bg-background relative z-[1] shrink-0 rounded-full">
                        {/* Live step halo */}
                        {item.tone === 'current' && <span aria-hidden className="bg-brand/30 trail-live absolute inset-0 rounded-full" />}
                        <span
                            className={cn(
                                'relative flex h-[23px] w-[23px] items-center justify-center rounded-full border-[1.5px]',
                                item.tone === 'done' && 'border-emerald-600 bg-emerald-600 text-white',
                                item.tone === 'current' && 'border-brand bg-brand/10 text-brand ring-brand/15 ring-[3px]',
                                item.tone === 'rejected' && 'border-destructive bg-destructive text-destructive-foreground',
                                item.tone === 'cancelled' && 'border-border bg-muted text-muted-foreground',
                                item.tone === 'skipped' && 'border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400',
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
                        {(item.meta || item.metaTime) && (
                            <div className="text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 text-xs leading-snug">
                                {item.meta && <span>{item.meta}</span>}
                                {item.metaTime && <span>{item.metaTime}</span>}
                            </div>
                        )}
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
