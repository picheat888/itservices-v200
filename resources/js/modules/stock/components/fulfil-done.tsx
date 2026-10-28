// Fulfil dialog's last screen (board 3.1): the ISS just issued, the lots it drew and the issue sheet to print.
import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { TABLE_HEAD } from '@/shared/lib/surface';
import { cn } from '@/shared/lib/utils';
import type { IssueResult } from '@/shared/types';
import { Button, buttonVariants } from '@/shared/ui/button';
import { DialogBody, DialogFooterBar } from '@/shared/ui/dialog';
import { Check, Printer } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { issuePdfUrl } from '../api/stockApi';

interface FulfilDoneProps {
    requestId: number;
    requestNo: string;
    itemName: string | null;
    qty: number;
    newOnHand: number;
    recipient: string;
    issue: IssueResult;
    /** "ดูคำขอเบิก": the request detail opens from here. */
    onViewRequest: () => void;
    onDone: () => void;
}

const LABEL = 'text-muted-foreground text-xs';
const TH = 'border-border border-b px-3 py-2';
const TD = 'border-border/60 border-b px-3 py-2 tabular-nums group-last:border-0';

export function FulfilDone({ requestId, requestNo, itemName, qty, newOnHand, recipient, issue, onViewRequest, onDone }: FulfilDoneProps) {
    const t = useT();
    const fmtN = useNumberFormat();
    const lotsTitleId = useId();
    const doneRef = useRef<HTMLButtonElement>(null);
    // Filled just after mount so screen readers announce it (a live region read only when its text changes)
    const [announcement, setAnnouncement] = useState('');
    const summary = [t('stock_issued_title'), issue.doc_no ?? '', `−${fmtN(qty)}`, itemName ?? '', `${t('stock_new_onhand')} ${fmtN(newOnHand)}`]
        .filter(Boolean)
        .join(' ');

    // The fulfil button that had focus is gone; land keyboard and screen-reader users on the result
    useEffect(() => {
        doneRef.current?.focus();
        const timer = window.setTimeout(() => setAnnouncement(summary), 150);
        return () => window.clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <>
            <FocusDialogHeader
                icon={Check}
                tone="success"
                eyebrow={t('stock')}
                title={t('stock_issued_title')}
                code={issue.doc_no ?? undefined}
                srDescription={t('stock_issue_ready_hint')}
            />
            <DialogBody className="space-y-4">
                <p role="status" className="sr-only">
                    {announcement}
                </p>
                {/* Amount out and the new on-hand */}
                <div className="flex flex-col items-center gap-0.5 text-center">
                    <div className="text-4xl leading-tight font-extrabold text-red-700 tabular-nums dark:text-red-400">−{fmtN(qty)}</div>
                    <div className="mt-1 text-sm font-semibold">{itemName}</div>
                    <div className="text-muted-foreground text-xs">
                        {t('stock_new_onhand')} <b className="text-foreground tabular-nums">{fmtN(newOnHand)}</b>
                    </div>
                </div>

                <dl className="border-border grid grid-cols-3 gap-4 rounded-lg border px-3.5 py-3 text-sm">
                    <div className="min-w-0">
                        <dt className={LABEL}>{t('stock_issue_doc_no')}</dt>
                        <dd className="truncate font-bold" translate="no">
                            {issue.doc_no ?? '—'}
                        </dd>
                    </div>
                    <div className="min-w-0">
                        <dt className={LABEL}>{t('stock_issue_request_ref')}</dt>
                        <dd className="truncate font-medium" translate="no">
                            {requestNo}
                        </dd>
                    </div>
                    <div className="min-w-0">
                        <dt className={LABEL}>{t('stock_issue_recipient')}</dt>
                        <dd className="truncate">{recipient}</dd>
                    </div>
                </dl>

                {/* Lots the issue drew */}
                <section aria-labelledby={lotsTitleId}>
                    <h3 id={lotsTitleId} className="mb-2 text-sm font-semibold">
                        {t('stock_issue_from_lots')}
                    </h3>
                    <div className="border-border overflow-hidden rounded-lg border">
                        <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
                            <colgroup>
                                <col />
                                <col className="w-[44%]" />
                                <col className="w-20" />
                            </colgroup>
                            <thead className={TABLE_HEAD}>
                                <tr className="text-muted-foreground text-left text-xs font-medium">
                                    <th scope="col" className={TH}>
                                        {t('stock_warehouse')}
                                    </th>
                                    <th scope="col" className={TH}>
                                        {t('stock_lot_word')}
                                    </th>
                                    <th scope="col" className={cn(TH, 'text-right')}>
                                        {t('stock_qty')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {issue.lines.map((line) => (
                                    <tr key={`${line.warehouse ?? ''}-${line.lot_id}`} className="group">
                                        <td className={cn(TD, 'truncate')}>{line.warehouse ?? t('stock_lot_unassigned')}</td>
                                        <td className={cn(TD, 'truncate font-semibold')} translate="no">
                                            {line.lot_no ?? t('stock_lot_before_tracking')}
                                        </td>
                                        <td className={cn(TD, 'text-right')}>{fmtN(line.qty)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* Issue sheet to print */}
                <div className="border-brand/30 bg-brand/5 flex flex-wrap items-center gap-3.5 rounded-xl border px-4 py-3.5">
                    <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold">{t('stock_issue_ready_title')}</div>
                        <p className="text-muted-foreground mt-0.5 text-xs">{t('stock_issue_ready_hint')}</p>
                    </div>
                    <a
                        href={issuePdfUrl(requestId)}
                        target="_blank"
                        rel="noopener"
                        className={cn(buttonVariants({ variant: 'outline' }), 'shrink-0')}
                    >
                        <Printer className="h-4 w-4" aria-hidden />
                        {t('stock_issue_print')}
                        <span className="sr-only">{t('stock_opens_new_tab')}</span>
                    </a>
                </div>
            </DialogBody>
            <DialogFooterBar>
                <Button variant="outline" onClick={onViewRequest}>
                    {t('stock_issue_view_request')}
                </Button>
                <Button ref={doneRef} onClick={onDone}>
                    <Check className="h-4 w-4" aria-hidden />
                    {t('stock_done')}
                </Button>
            </DialogFooterBar>
        </>
    );
}
