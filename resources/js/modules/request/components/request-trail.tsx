import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import type { RequestApproval, ServiceRequest } from '@/shared/types';
import { Bell, Check, Flag, SkipForward, X } from 'lucide-react';

type TrailTone = 'done' | 'current' | 'rejected' | 'skipped' | 'queued';

interface TrailItem {
    tone: TrailTone;
    glyph: React.ReactNode;
    title: string;
    meta: string;
    note?: string | null;
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
            meta: isFulfillment && row.status === 'waiting' ? t('req_trail_after_approvals') : stepMeta(row),
            note: row.note,
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
        <div className="before:bg-border relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[11px] before:w-px">
            {items.map((item, i) => (
                <div key={i} className="relative flex items-start gap-3">
                    <span
                        className={cn(
                            'z-[1] flex h-[23px] w-[23px] shrink-0 items-center justify-center rounded-full border-[1.5px]',
                            item.tone === 'done' && 'border-emerald-500 bg-emerald-500 text-white',
                            item.tone === 'current' && 'border-brand bg-brand/10 text-brand ring-brand/15 ring-[3px]',
                            item.tone === 'rejected' && 'border-destructive bg-destructive text-white',
                            item.tone === 'skipped' && 'border-amber-500/60 bg-amber-500/10 text-amber-600 dark:text-amber-400',
                            item.tone === 'queued' && 'border-border bg-background text-muted-foreground',
                        )}
                    >
                        {item.glyph}
                    </span>
                    <div className="min-w-0 pt-0.5">
                        <div className={cn('text-sm leading-tight font-semibold', item.tone === 'queued' && 'text-muted-foreground')}>
                            {item.title}
                        </div>
                        <div className="text-muted-foreground mt-0.5 text-xs leading-snug">{item.meta}</div>
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
