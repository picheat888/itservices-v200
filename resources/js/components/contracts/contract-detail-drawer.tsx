import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useContractMutations } from '@/hooks/use-contracts';
import { useT } from '@/lib/i18n';
import { useUiStore } from '@/stores/ui';
import type { Contract } from '@/types';
import { Ban, Mail, RefreshCw, RotateCcw, SquarePen } from 'lucide-react';

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
    canRenew,
}: {
    contract: Contract | null;
    onClose: () => void;
    onEdit: (c: Contract) => void;
    canEdit: boolean;
    canRenew: boolean;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { renew, cancel } = useContractMutations();

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
                        {contract.owner && <KV label={t('contract_owner')} value={contract.owner} />}
                    </div>

                    {/* Notification schedule — alerts are sent automatically by the
                        daily contracts:send-expiry-alerts command (bell + email). */}
                    <div>
                        <div className="text-muted-foreground mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
                            {t('contract_notification_schedule')}
                        </div>
                        <div className="space-y-2">
                            {[
                                { d: 150, on: contract.notify_150 },
                                { d: 120, on: contract.notify_120 },
                                { d: 90, on: contract.notify_90 },
                                { d: 60, on: contract.notify_60 },
                                { d: 45, on: contract.notify_45 },
                                { d: 30, on: contract.notify_30 },
                                { d: 7, on: contract.notify_7 },
                            ].map((n) => (
                                <div key={n.d} className="bg-muted/50 flex items-center gap-3 rounded-md px-3 py-2">
                                    <Mail className="text-muted-foreground h-4 w-4" />
                                    <div className="flex-1 text-sm">{lang === 'th' ? `แจ้งเตือนก่อน ${n.d} วัน` : `${n.d}-day reminder`}</div>
                                    <StatusBadge tone={n.on ? 'blue' : 'gray'}>
                                        {n.on ? (lang === 'th' ? 'กำหนดไว้' : 'Scheduled') : lang === 'th' ? 'ปิด' : 'Off'}
                                    </StatusBadge>
                                </div>
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

                    {contract.notes && (
                        <div className="space-y-1">
                            <div className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                                {lang === 'th' ? 'หมายเหตุ' : 'Notes'}
                            </div>
                            <p className="text-sm">{contract.notes}</p>
                        </div>
                    )}
                </div>

                <SheetFooter className="mt-4 flex-col gap-2">
                    {canEdit && (
                        <Button
                            variant={cancelled ? 'outline' : 'destructive'}
                            className="w-full"
                            onClick={() => cancel.mutate(contract.id, { onSuccess: onClose })}
                            disabled={cancel.isPending}
                        >
                            {cancelled ? <RotateCcw className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                            {cancelled ? t('contract_reactivate') : t('contract_cancel')}
                        </Button>
                    )}
                    <div className="flex gap-2">
                        <Button variant="outline" className="flex-1" onClick={onClose}>
                            {t('close')}
                        </Button>
                        {canEdit && !cancelled && (
                            <Button variant="outline" className="flex-1" onClick={() => onEdit(contract)}>
                                <SquarePen className="h-4 w-4" />
                                {t('edit')}
                            </Button>
                        )}
                        {canRenew && !cancelled && (
                            <Button
                                className="flex-1"
                                onClick={() => renew.mutate({ id: contract.id }, { onSuccess: onClose })}
                                disabled={renew.isPending}
                            >
                                <RefreshCw className="h-4 w-4" />
                                {t('contract_renew')}
                            </Button>
                        )}
                    </div>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
