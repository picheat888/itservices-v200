import { ContractAssetsTab } from '@/components/contracts/contract-assets-tab';
import { ContractAttachmentsTab } from '@/components/contracts/contract-attachments-tab';
import { ContractDialogHeader } from '@/components/contracts/contract-dialog-header';
import { StatusBadge } from '@/shared/components/status-badge';
import { Button } from '@/shared/ui/button';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogContent } from '@/shared/ui/dialog';
import { useContractMutations } from '@/hooks/use-contracts';
import { useT } from '@/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { useUiStore } from '@/stores/ui';
import { type Contract, type ContractType } from '@/shared/types';
import { Ban, Clock, Cog, FileText, Laptop, type LucideIcon, Package, SquarePen, Wifi } from 'lucide-react';
import { useEffect, useState } from 'react';

/** Icon per contract type — mirrors the icons used by the Edit wizard's type cards. */
const TYPE_ICON: Record<ContractType, LucideIcon> = {
    software: FileText,
    hardware: Laptop,
    service: Cog,
    connectivity: Wifi,
    other: Package,
};

type TabId = 'overview' | 'assets' | 'attachments';

/** A single label/value pair in the Overview particulars grid. */
function KV({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
    return (
        <div className="space-y-0.5">
            <div className="text-muted-foreground text-xs">{label}</div>
            <div className={mono ? 'font-mono text-sm' : 'text-sm'}>{value}</div>
        </div>
    );
}

/** Small uppercase section heading. */
function SectionLabel({ children }: { children: React.ReactNode }) {
    return <div className="text-muted-foreground mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">{children}</div>;
}

/**
 * Read-only contract detail rendered as a centered 1100px focus dialog with three tabs
 * (Overview / Assets / Attachments). Status + days-remaining badges live in the header.
 */
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
    const confirm = useConfirm();
    const { cancel } = useContractMutations();
    const [tab, setTab] = useState<TabId>('overview');

    // Retain the last contract so the dialog can keep rendering its content while it
    // animates closed (open → false). Without this, the component would unmount the
    // instant `contract` becomes null and Radix could never play the exit animation.
    const [shown, setShown] = useState<Contract | null>(contract);
    useEffect(() => {
        if (contract) setShown(contract);
    }, [contract]);

    // Reset to Overview whenever a (different) contract opens.
    useEffect(() => {
        setTab('overview');
    }, [contract?.id]);

    // Drive `open` off the live prop (so closing animates), but render from the retained
    // `c` so content stays present during the fade-out.
    const c = contract ?? shown;
    if (!c) return null;

    /**
     * Cancel flow. Hardware contracts may only be cancelled once every linked asset is
     * written off — otherwise warn and stop. All cancels then require a final confirmation.
     */
    const handleCancel = async () => {
        if (c.type === 'hardware') {
            const pending = c.linked_assets.filter((a) => a.status !== 'writeoff');
            if (pending.length > 0) {
                await confirm({
                    variant: 'warn',
                    hideCancel: true,
                    title: lang === 'th' ? 'ยังยกเลิกสัญญาไม่ได้' : 'Cannot cancel yet',
                    description:
                        lang === 'th'
                            ? `ต้อง write-off ทรัพย์สินที่ผูกกับสัญญานี้ให้ครบก่อน ยังเหลืออีก ${pending.length} รายการ`
                            : `Every linked asset must be written off first. ${pending.length} asset(s) still need write-off.`,
                    confirmText: lang === 'th' ? 'เข้าใจแล้ว' : 'Got it',
                });
                return;
            }
        }
        await confirm({
            variant: 'danger',
            title: lang === 'th' ? 'ยืนยันยกเลิกสัญญา?' : 'Cancel this contract?',
            entity: { name: c.name, sub: c.code },
            confirmText: t('contract_cancel'),
            action: async () => {
                await cancel.mutateAsync(c.id);
                onClose();
            },
        });
    };

    const days = c.days_remaining;
    const cancelled = c.status === 'cancelled';
    const tone = cancelled ? 'gray' : c.status === 'expired' ? 'red' : c.in_reminder ? 'amber' : 'green';
    const statusLabel = cancelled
        ? t('contract_cancelled')
        : c.status === 'expired'
          ? lang === 'th'
              ? 'หมดอายุ'
              : 'Expired'
          : lang === 'th'
            ? 'ใช้งาน'
            : 'Active';
    const TypeIcon = TYPE_ICON[c.type] ?? FileText;

    // Days-remaining badge (header titleSuffix): hidden when cancelled; colored by state.
    const daysBadge = cancelled ? null : (
        <span
            className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] font-semibold',
                days <= 0
                    ? 'border-destructive/30 bg-destructive/10 text-destructive'
                    : c.in_reminder
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      : 'border-brand/30 bg-brand/10 text-brand',
            )}
        >
            <Clock className="h-3 w-3" />
            {days <= 0
                ? lang === 'th'
                    ? `เกินกำหนด ${-days} วัน`
                    : `${-days} days overdue`
                : c.in_reminder
                  ? lang === 'th'
                      ? `หมดอายุใน ${days} วัน`
                      : `Expires in ${days} days`
                  : lang === 'th'
                    ? `เหลือ ${days} วัน`
                    : `${days} days left`}
        </span>
    );

    const tabs: { id: TabId; label: string; count?: number }[] = [
        { id: 'overview', label: lang === 'th' ? 'ภาพรวม' : 'Overview' },
        { id: 'assets', label: lang === 'th' ? 'ทรัพย์สิน' : 'Assets', count: c.linked_assets.length },
        { id: 'attachments', label: lang === 'th' ? 'เอกสารแนบ' : 'Attachments', count: c.attachments.length },
    ];

    return (
        <Dialog open={!!contract} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="!flex h-[min(860px,calc(100vh-72px))] max-w-[1100px] flex-col gap-0 overflow-hidden p-0">
                <ContractDialogHeader
                    icon={TypeIcon}
                    eyebrow={lang === 'th' ? 'สัญญา' : 'Contract'}
                    title={c.title || c.name}
                    code={c.code}
                    srDescription={c.vendor}
                    titleSuffix={daysBadge}
                    headerRight={<StatusBadge tone={tone}>{statusLabel}</StatusBadge>}
                />

                {/* Tab bar */}
                <div className="border-border/60 flex gap-1 border-b px-6">
                    {tabs.map((tb) => (
                        <button
                            key={tb.id}
                            type="button"
                            onClick={() => setTab(tb.id)}
                            className={cn(
                                'relative px-4 py-3 text-sm font-semibold transition-colors',
                                tab === tb.id ? 'text-brand' : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {tb.label}
                            {tb.count != null && tb.count > 0 && (
                                <span className="bg-accent ml-1.5 rounded-full px-1.5 py-0.5 font-mono text-[11px]">{tb.count}</span>
                            )}
                            {tab === tb.id && <span className="bg-brand absolute inset-x-2 -bottom-px h-0.5 rounded-full" />}
                        </button>
                    ))}
                </div>

                {/* Body — the active panel. Assets/Attachments fill & manage their own layout. */}
                <div className={cn('min-h-0 flex-1', tab === 'overview' ? 'overflow-y-auto px-6 py-6' : 'overflow-hidden p-6')}>
                    {tab === 'overview' && (
                        <div className="grid gap-8 md:grid-cols-2">
                            {/* Left — particulars */}
                            <div className="grid grid-cols-2 gap-4">
                                <KV label={t('contract_code')} value={c.code} mono />
                                <KV label={t('contract_vendor')} value={c.vendor} />
                                <div className="col-span-2">
                                    <KV label={t('contract_title')} value={c.title || '—'} />
                                </div>
                                <div className="col-span-2">
                                    <KV label={t('contract_name')} value={c.name} />
                                </div>
                                <KV label={t('contract_type')} value={t(`contract_type_${c.type}`)} />
                                <KV label={t('contract_billing')} value={t(`contract_billing_${c.billing_cycle}`)} />
                                <KV label={t('contract_start')} value={c.start} mono />
                                <KV label={t('contract_end')} value={c.end} mono />
                                <KV label={t('contract_value')} value={c.value_display} mono />
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
                                    value={c.auto_renew ? (lang === 'th' ? 'ใช่' : 'Yes') : lang === 'th' ? 'ไม่' : 'No'}
                                />
                                <KV
                                    label={t('contract_reminder_threshold')}
                                    value={
                                        c.reminder_days
                                            ? `${c.reminder_days} ${lang === 'th' ? 'วันก่อนหมดอายุ' : 'days before expiry'}`
                                            : '—'
                                    }
                                />
                                {cancelled && c.cancelled_at && <KV label={t('contract_cancelled_on')} value={c.cancelled_at} mono />}
                                <KV label={t('contract_created')} value={c.created_at ?? '—'} mono />
                                <KV label={t('contract_updated')} value={c.updated_at ?? '—'} mono />
                            </div>

                            {/* Right — schedule + notes */}
                            <div className="space-y-6">
                                <div>
                                    <SectionLabel>{t('contract_notification_schedule')}</SectionLabel>
                                    <div className="flex flex-wrap gap-1.5">
                                        {[
                                            { d: 150, on: c.notify_150 },
                                            { d: 120, on: c.notify_120 },
                                            { d: 90, on: c.notify_90 },
                                            { d: 60, on: c.notify_60 },
                                            { d: 45, on: c.notify_45 },
                                            { d: 30, on: c.notify_30 },
                                            { d: 7, on: c.notify_7 },
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
                                                {n.d}
                                                {lang === 'th' ? ' วัน' : 'd'}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                {c.notes && (
                                    <div>
                                        <SectionLabel>{lang === 'th' ? 'หมายเหตุ' : 'Notes'}</SectionLabel>
                                        <p className="text-sm whitespace-pre-wrap">{c.notes}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {tab === 'assets' && <ContractAssetsTab assets={c.linked_assets} />}
                    {tab === 'attachments' && <ContractAttachmentsTab attachments={c.attachments} />}
                </div>

                {/* Footer — Cancel (left) / Edit (right); the ✕ handles closing. */}
                {canEdit && !cancelled && (
                    <div className="border-border/60 bg-muted/30 flex items-center gap-2 border-t px-6 py-3">
                        <Button variant="destructive" className="mr-auto" onClick={handleCancel} disabled={cancel.isPending}>
                            <Ban className="h-4 w-4" />
                            {t('contract_cancel')}
                        </Button>
                        <Button variant="outline" onClick={() => onEdit(c)}>
                            <SquarePen className="h-4 w-4" />
                            {t('edit')}
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
