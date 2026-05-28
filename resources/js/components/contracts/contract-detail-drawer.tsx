import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useContractMutations } from '@/hooks/use-contracts';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui';
import type { Contract } from '@/types';
import { Ban, FileText, SquarePen } from 'lucide-react';

/** Human-readable file size, e.g. "1.4 MB" / "820 KB". */
function formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function KV({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
    return (
        <div className="space-y-0.5">
            <div className="text-muted-foreground text-xs">{label}</div>
            <div className={mono ? 'font-mono text-sm' : 'text-sm'}>{value}</div>
        </div>
    );
}

/** Read-only contract detail with the notification schedule + (deferred) linked assets. */
export function ContractDetailDrawer({
    contract,
    onClose,
    onEdit,
    canEdit,
}: {
    contract: Contract | null;
    onClose: () => void;
    onEdit: (c: Contract) => void;
    canEdit: boolean;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { cancel } = useContractMutations();

    if (!contract) return null;

    const days = contract.days_remaining;
    const cancelled = contract.status === 'cancelled';
    const tone = cancelled ? 'gray' : contract.status === 'expired' ? 'red' : contract.in_reminder ? 'amber' : 'green';
    const statusLabel = cancelled
        ? t('contract_cancelled')
        : contract.status === 'expired'
          ? lang === 'th'
              ? 'หมดอายุ'
              : 'Expired'
          : lang === 'th'
            ? 'ใช้งาน'
            : 'Active';

    return (
        <Sheet open={!!contract} onOpenChange={(o) => !o && onClose()}>
            <SheetContent side="right" className="flex w-[620px] flex-col sm:max-w-[620px]">
                <SheetHeader>
                    <SheetTitle>{contract.name}</SheetTitle>
                    <SheetDescription>{contract.vendor}</SheetDescription>
                </SheetHeader>

                <div className="mt-6 flex-1 space-y-6 overflow-y-auto px-1">
                    <div className="flex flex-wrap gap-2">
                        <StatusBadge tone={tone}>{statusLabel}</StatusBadge>
                        {contract.in_reminder && (
                            <StatusBadge tone="amber">{lang === 'th' ? `หมดอายุใน ${days} วัน` : `Expires in ${days} days`}</StatusBadge>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <KV label="ID" value={contract.code} mono />
                        <KV label={t('contract_vendor')} value={contract.vendor} />
                        <KV label={t('contract_start')} value={contract.start} mono />
                        <KV label={t('contract_end')} value={contract.end} mono />
                        <KV label={t('contract_value')} value={contract.value_display} mono />
                        <KV
                            label={t('contract_auto_renew')}
                            value={contract.auto_renew ? (lang === 'th' ? 'ใช่' : 'Yes') : lang === 'th' ? 'ไม่' : 'No'}
                        />
                    </div>

                    {/* Notification schedule — alerts are sent automatically by the
                        daily contracts:send-expiry-alerts command (bell + email). */}
                    <div>
                        <div className="text-muted-foreground mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
                            {t('contract_notification_schedule')}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {[
                                { d: 150, on: contract.notify_150 },
                                { d: 120, on: contract.notify_120 },
                                { d: 90, on: contract.notify_90 },
                                { d: 60, on: contract.notify_60 },
                                { d: 45, on: contract.notify_45 },
                                { d: 30, on: contract.notify_30 },
                                { d: 7, on: contract.notify_7 },
                            ].map((n) => (
                                <span
                                    key={n.d}
                                    className={cn(
                                        'rounded-full border px-2.5 py-0.5 text-xs font-medium',
                                        n.on
                                            ? 'border-brand/30 bg-brand/10 text-brand'
                                            : 'border-border text-muted-foreground/40 line-through',
                                    )}
                                >
                                    {n.d}{lang === 'th' ? ' วัน' : 'd'}
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Linked assets — depends on the Assets module which is not built yet. */}
                    <div>
                        <div className="text-muted-foreground mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
                            {t('contract_link_assets')}
                            <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-medium tracking-normal normal-case">
                                {t('coming_soon')}
                            </span>
                        </div>
                        <div className="bg-muted/50 text-muted-foreground rounded-md px-3 py-4 text-center text-sm">
                            {t('contract_link_assets_sub')}
                        </div>
                    </div>

                    {/* Attachments — PDF documents, opens in a new tab. */}
                    <div>
                        <div className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">{t('contract_attachments')}</div>
                        {contract.attachments.length === 0 ? (
                            <div className="bg-muted/50 text-muted-foreground rounded-md px-3 py-4 text-center text-sm">{t('attachment_none')}</div>
                        ) : (
                            <div className="space-y-2">
                                {contract.attachments.map((a) => (
                                    <a
                                        key={a.id}
                                        href={a.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="border-border hover:bg-accent/50 flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                                    >
                                        <FileText className="text-muted-foreground h-4 w-4 shrink-0" />
                                        <span className="hover:text-brand min-w-0 flex-1 truncate">{a.name}</span>
                                        <span className="text-muted-foreground shrink-0 text-xs">{formatSize(a.size)}</span>
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>

                    {contract.notes && (
                        <div className="space-y-1">
                            <div className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                                {lang === 'th' ? 'หมายเหตุ' : 'Notes'}
                            </div>
                            <p className="text-sm">{contract.notes}</p>
                        </div>
                    )}
                </div>

                <SheetFooter className="mt-4 flex-row flex-wrap gap-2">
                    <Button variant="outline" className="flex-1" onClick={onClose}>
                        {t('close')}
                    </Button>
                    {canEdit && !cancelled && (
                        <Button variant="outline" className="flex-1" onClick={() => onEdit(contract)}>
                            <SquarePen className="h-4 w-4" />
                            {t('edit')}
                        </Button>
                    )}
                    {canEdit && !cancelled && (
                        <Button
                            variant="destructive"
                            className="flex-1"
                            onClick={() => cancel.mutate(contract.id, { onSuccess: onClose })}
                            disabled={cancel.isPending}
                        >
                            <Ban className="h-4 w-4" />
                            {t('contract_cancel')}
                        </Button>
                    )}
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
