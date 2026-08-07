import { useT } from '@/lang';
import { REQUEST_SKIP_REASON_LABEL } from '@/shared/lib/request-meta';
import { cn } from '@/shared/lib/utils';
import type { ApprovalSkipReason, RequestApproval, ServiceRequest } from '@/shared/types';
import { Bell, Check, Flag, KeyRound, SkipForward, X } from 'lucide-react';

type TrailTone = 'done' | 'current' | 'rejected' | 'skipped' | 'queued';

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
export function RequestTrail({ request }: { request: ServiceRequest }) {
    const t = useT();
    const approvals = request.approvals ?? [];

    const items: TrailItem[] = [
        {
            tone: 'done',
            glyph: <Check className="h-3 w-3" />,
            title: t('req_trail_submitted'),
            meta: `${request.requester.name} · ${request.created_at}`,
        },
    ];

    // No SLA here on purpose — this module does not present a deadline as an
    // indicator; the trail says where a request stands, not how late it is.
    const stepMeta = (row: RequestApproval): string => {
        switch (row.status) {
            case 'approved':
                return `${row.kind === 'fulfillment' ? t('req_trail_fulfilled_done') : t('req_trail_approved')}${row.acted_at ? ` · ${row.acted_at}` : ''}`;
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

    for (const row of approvals) {
        const isFulfillment = row.kind === 'fulfillment';
        const tone: TrailTone =
            row.status === 'approved'
                ? 'done'
                : row.status === 'rejected'
                  ? 'rejected'
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
            title: isFulfillment ? t('req_trail_fulfillment') : row.approver_name ? `${row.approver_name}` : row.label,
            // A skipped step with a reason says it all inside the amber note below, so the
            // status line stays quiet instead of printing "skipped" twice. Rows from before
            // reasons were stored still get the plain word.
            meta:
                isFulfillment && row.status === 'waiting'
                    ? t('req_trail_after_approvals')
                    : row.status === 'skipped' && row.skip_reason
                      ? ''
                      : stepMeta(row),
            note: row.note,
            awaitingAccount: row.awaiting_account,
            skipReason: row.skip_reason,
        });
        // Fulfillment row also carries the auto-ticket footnote once opened.
        if (isFulfillment && request.ticket) {
            items[items.length - 1].meta += ` · ${t('req_trail_ticket_opened')}`;
        }
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
                                item.tone === 'skipped' && 'border-amber-500/60 bg-amber-500/10 text-amber-600 dark:text-amber-400',
                                item.tone === 'queued' && 'border-border bg-background text-muted-foreground',
                            )}
                        >
                            {item.glyph}
                        </span>
                    </span>
                    <div className="min-w-0 pt-0.5">
                        <div className={cn('text-sm leading-tight font-semibold', item.tone === 'queued' && 'text-muted-foreground')}>
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
