import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useContractMutations } from '@/hooks/use-contracts';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui';
import { ASSET_LINKABLE_CONTRACT_TYPES, type Contract } from '@/types';
import { Ban, FileText, SquarePen } from 'lucide-react';

/** Asset status → StatusBadge tone for the linked-assets list. */
const ASSET_TONE: Record<string, 'green' | 'amber' | 'red' | 'blue' | 'gray'> = {
    deployed: 'blue',
    ready: 'green',
    pending_acceptance: 'amber',
    pending_return: 'amber',
    maintenance: 'amber',
    writeoff: 'red',
};

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
                    <SheetTitle>{contract.title || contract.name}</SheetTitle>
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
                        <KV label={t('contract_code')} value={contract.code} mono />
                        <KV label={t('contract_vendor')} value={contract.vendor} />
                        <div className="col-span-2">
                            <KV label={t('contract_name')} value={contract.name} />
                        </div>
                        <KV label={t('contract_type')} value={t(`contract_type_${contract.type}`)} />
                        <KV label={t('contract_billing')} value={t(`contract_billing_${contract.billing_cycle}`)} />
                        <KV label={t('contract_start')} value={contract.start} mono />
                        <KV label={t('contract_end')} value={contract.end} mono />
                        <KV label={t('contract_value')} value={contract.value_display} mono />
                        <KV
                            label={t('contract_days_remaining')}
                            value={
                                cancelled
                                    ? '—'
                                    : days >= 0
                                      ? `${days} ${lang === 'th' ? 'วัน' : 'days'}`
                                      : lang === 'th'
                                        ? `เกินกำหนด ${-days} วัน`
                                        : `${-days} days overdue`
                            }
                        />
                        <KV
                            label={t('contract_auto_renew')}
                            value={contract.auto_renew ? (lang === 'th' ? 'ใช่' : 'Yes') : lang === 'th' ? 'ไม่' : 'No'}
                        />
                        <KV
                            label={t('contract_reminder_threshold')}
                            value={
                                contract.reminder_days
                                    ? `${contract.reminder_days} ${lang === 'th' ? 'วันก่อนหมดอายุ' : 'days before expiry'}`
                                    : '—'
                            }
                        />
                        {cancelled && contract.cancelled_at && (
                            <KV label={t('contract_cancelled_on')} value={contract.cancelled_at} mono />
                        )}
                        <KV label={t('contract_created')} value={contract.created_at ?? '—'} mono />
                        <KV label={t('contract_updated')} value={contract.updated_at ?? '—'} mono />
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

                    {/* Linked assets — only for hardware, connectivity, and other contracts.
                        Assets are linked from the asset form (Assets module). */}
                    {ASSET_LINKABLE_CONTRACT_TYPES.includes(contract.type) && (
                        <div>
                            <div className="text-muted-foreground mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
                                {t('contract_link_assets')}
                                {contract.linked_assets.length > 0 && (
                                    <span className="font-mono text-[11px] tracking-normal normal-case">{contract.linked_assets.length}</span>
                                )}
                            </div>
                            {contract.linked_assets.length === 0 ? (
                                <div className="bg-muted/50 text-muted-foreground rounded-md px-3 py-4 text-center text-sm">
                                    {t('contract_link_assets_sub')}
                                </div>
                            ) : (
                                <div className="space-y-1.5">
                                    {contract.linked_assets.map((a) => (
                                        <div key={a.id} className="border-border flex items-center gap-3 rounded-md border px-3 py-2">
                                            <span className="font-mono text-xs">{a.tag}</span>
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-sm font-medium">{a.name}</div>
                                                {a.owner && <div className="text-muted-foreground truncate text-xs">{a.owner}</div>}
                                            </div>
                                            {a.status && (
                                                <StatusBadge tone={ASSET_TONE[a.status] ?? 'gray'}>{a.status.replace(/_/g, ' ')}</StatusBadge>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

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
