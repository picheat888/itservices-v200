import { ContractDialogHeader } from '@/components/contracts/contract-dialog-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useContractMutations } from '@/hooks/use-contracts';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui';
import { type Contract, type ContractType } from '@/types';
import { Ban, Cog, ExternalLink, FileText, Laptop, type LucideIcon, Package, SquarePen, Wifi } from 'lucide-react';
import { Link } from 'react-router-dom';

/** Asset status → StatusBadge tone for the linked-assets list. */
const ASSET_TONE: Record<string, 'green' | 'amber' | 'red' | 'blue' | 'gray'> = {
    deployed: 'blue',
    ready: 'green',
    pending_acceptance: 'amber',
    pending_return: 'amber',
    maintenance: 'amber',
    writeoff: 'red',
};

/** Icon per contract type — mirrors the icons used by the Edit wizard's type cards. */
const TYPE_ICON: Record<ContractType, LucideIcon> = {
    software: FileText,
    hardware: Laptop,
    service: Cog,
    connectivity: Wifi,
    other: Package,
};

/** Human-readable file size, e.g. "1.4 MB" / "820 KB". */
function formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** A single label/value pair in the particulars grid. */
function KV({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
    return (
        <div className="space-y-0.5">
            <div className="text-muted-foreground text-xs">{label}</div>
            <div className={mono ? 'font-mono text-sm' : 'text-sm'}>{value}</div>
        </div>
    );
}

/** Small uppercase section heading used in the right column. */
function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <div className="text-muted-foreground mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">{children}</div>
    );
}

/**
 * Read-only contract detail rendered as a centered 1100px focus dialog — the same
 * shell as the Edit wizard so View ↔ Edit feels like one surface. Left column holds
 * the particulars; right column holds the notification schedule, linked assets,
 * attachments, and notes.
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

    if (!contract) return null;

    /**
     * Cancel flow. Hardware contracts may only be cancelled once every linked
     * asset is written off — otherwise warn and stop. All cancels then require a
     * final confirmation. The backend enforces the same rule (422).
     */
    const handleCancel = async () => {
        if (contract.type === 'hardware') {
            const pending = contract.linked_assets.filter((a) => a.status !== 'writeoff');
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
            entity: { name: contract.name, sub: contract.code },
            confirmText: t('contract_cancel'),
            action: async () => {
                await cancel.mutateAsync(contract.id);
                onClose();
            },
        });
    };

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
    const TypeIcon = TYPE_ICON[contract.type] ?? FileText;

    return (
        <Dialog
            open={!!contract}
            onOpenChange={(o) => {
                if (!o) onClose();
            }}
        >
            <DialogContent className="!flex h-[min(860px,calc(100vh-72px))] max-w-[1100px] flex-col gap-0 overflow-hidden p-0">
                <ContractDialogHeader
                    icon={TypeIcon}
                    eyebrow={lang === 'th' ? 'สัญญา' : 'Contract'}
                    title={contract.title || contract.name}
                    code={contract.code}
                    srDescription={contract.vendor}
                />

                {/* Body — only this scrolls */}
                <div className="border-border/60 flex-1 space-y-6 overflow-y-auto border-t px-6 py-6">
                    <div className="flex flex-wrap gap-2">
                        <StatusBadge tone={tone}>{statusLabel}</StatusBadge>
                        {contract.in_reminder && (
                            <StatusBadge tone="amber">{lang === 'th' ? `หมดอายุใน ${days} วัน` : `Expires in ${days} days`}</StatusBadge>
                        )}
                    </div>

                    <div className="grid gap-8 md:grid-cols-2">
                        {/* Left — particulars */}
                        <div className="grid grid-cols-2 gap-4">
                            <KV label={t('contract_code')} value={contract.code} mono />
                            <KV label={t('contract_vendor')} value={contract.vendor} />
                            <div className="col-span-2">
                                <KV label={t('contract_title')} value={contract.title || '—'} />
                            </div>
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
                            {cancelled && contract.cancelled_at && <KV label={t('contract_cancelled_on')} value={contract.cancelled_at} mono />}
                            <KV label={t('contract_created')} value={contract.created_at ?? '—'} mono />
                            <KV label={t('contract_updated')} value={contract.updated_at ?? '—'} mono />
                        </div>

                        {/* Right — schedule, assets, attachments, notes */}
                        <div className="space-y-6">
                            {/* Notification schedule — alerts are sent automatically by the
                                daily contracts:send-expiry-alerts command (bell + email). */}
                            <div>
                                <SectionLabel>{t('contract_notification_schedule')}</SectionLabel>
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
                                            {n.d}
                                            {lang === 'th' ? ' วัน' : 'd'}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* Linked assets — shown whenever the contract has assets linked (any type). */}
                            {contract.linked_assets.length > 0 && (
                                <div>
                                    <SectionLabel>
                                        {t('contract_link_assets')}
                                        <span className="font-mono text-[11px] tracking-normal normal-case">{contract.linked_assets.length}</span>
                                    </SectionLabel>
                                    <div className="space-y-1.5">
                                        {contract.linked_assets.map((a) => (
                                            <Link
                                                key={a.id}
                                                to={`/assets?view=${a.id}`}
                                                className="border-border hover:border-brand/50 hover:bg-accent/40 group flex items-center gap-3 rounded-md border px-3 py-2 transition-colors"
                                                title={t('asset_view')}
                                            >
                                                <span className="font-mono text-xs">{a.tag}</span>
                                                <div className="min-w-0 flex-1">
                                                    <div className="truncate text-sm font-medium">{a.name}</div>
                                                    <div className="text-muted-foreground truncate text-xs">
                                                        {[a.type, a.serial, a.owner].filter(Boolean).join(' · ') || '—'}
                                                    </div>
                                                </div>
                                                {a.status && (
                                                    <StatusBadge tone={ASSET_TONE[a.status] ?? 'gray'}>{a.status.replace(/_/g, ' ')}</StatusBadge>
                                                )}
                                                <ExternalLink className="text-muted-foreground group-hover:text-brand h-3.5 w-3.5 shrink-0" />
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Attachments — PDF documents, opens in a new tab. */}
                            <div>
                                <SectionLabel>{t('contract_attachments')}</SectionLabel>
                                {contract.attachments.length === 0 ? (
                                    <div className="bg-muted/50 text-muted-foreground rounded-md px-3 py-4 text-center text-sm">
                                        {t('attachment_none')}
                                    </div>
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
                                <div>
                                    <SectionLabel>{lang === 'th' ? 'หมายเหตุ' : 'Notes'}</SectionLabel>
                                    <p className="text-sm whitespace-pre-wrap">{contract.notes}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer — Close / Edit / Cancel contract */}
                <div className="border-border/60 bg-muted/30 flex flex-wrap items-center gap-2 border-t px-6 py-3.5">
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
                        <Button variant="destructive" className="flex-1" onClick={handleCancel} disabled={cancel.isPending}>
                            <Ban className="h-4 w-4" />
                            {t('contract_cancel')}
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
