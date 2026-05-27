import { Field } from '@/components/shared/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useContractMutations } from '@/hooks/use-contracts';
import { useVendors } from '@/hooks/use-master-data';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui';
import type { BillingCycle, Contract, ContractType, Vendor } from '@/types';
import { Calendar, Check, Cog, FileText, Laptop, Paperclip, Wifi } from 'lucide-react';
import { useEffect, useState } from 'react';

const TYPE_META: { value: ContractType; icon: typeof FileText; labelKey: string }[] = [
    { value: 'software', icon: FileText, labelKey: 'contract_type_software' },
    { value: 'hardware', icon: Laptop, labelKey: 'contract_type_hardware' },
    { value: 'service', icon: Cog, labelKey: 'contract_type_service' },
    { value: 'connectivity', icon: Wifi, labelKey: 'contract_type_connectivity' },
];

const REMINDER_DAYS = [150, 120, 90, 60, 45, 30, 7] as const;
type ReminderKey = 'notify_150' | 'notify_120' | 'notify_90' | 'notify_60' | 'notify_45' | 'notify_30' | 'notify_7';

interface FormState {
    code: string;
    type: ContractType;
    vendor: string;
    name: string;
    start_date: string;
    end_date: string;
    value: string;
    billing_cycle: BillingCycle;
    auto_renew: boolean;
    notify_150: boolean;
    notify_120: boolean;
    notify_90: boolean;
    notify_60: boolean;
    notify_45: boolean;
    notify_30: boolean;
    notify_7: boolean;
    notes: string;
}

const EMPTY: FormState = {
    code: '',
    type: 'software',
    vendor: '',
    name: '',
    start_date: '',
    end_date: '',
    value: '',
    billing_cycle: 'yearly',
    auto_renew: false,
    notify_150: false,
    notify_120: false,
    notify_90: false,
    notify_60: true,
    notify_45: false,
    notify_30: true,
    notify_7: true,
    notes: '',
};

/** Drawer used for both creating a new contract and editing an existing one. */
export function ContractFormDrawer({
    open,
    editing,
    onClose,
}: {
    open: boolean;
    editing: Contract | null;
    onClose: () => void;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { create, update } = useContractMutations();
    const { data: vendors = [] } = useVendors();
    const [form, setForm] = useState<FormState>(EMPTY);
    const [err, setErr] = useState<Record<string, string>>({});

    // Hydrate the form when opening; editing populates from the contract.
    useEffect(() => {
        if (!open) return;
        setErr({});
        if (editing) {
            setForm({
                code: editing.code,
                type: editing.type,
                vendor: editing.vendor,
                name: editing.name,
                start_date: editing.start,
                end_date: editing.end,
                value: String(editing.value),
                billing_cycle: editing.billing_cycle,
                auto_renew: editing.auto_renew,
                notify_150: editing.notify_150,
                notify_120: editing.notify_120,
                notify_90: editing.notify_90,
                notify_60: editing.notify_60,
                notify_45: editing.notify_45,
                notify_30: editing.notify_30,
                notify_7: editing.notify_7,
                notes: editing.notes ?? '',
            });
        } else {
            setForm(EMPTY);
        }
    }, [open, editing]);

    const upd = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

    const submit = () => {
        const e: Record<string, string> = {};
        const required = lang === 'th' ? 'จำเป็นต้องกรอก' : 'Required';
        if (!form.code.trim()) e.code = required;
        if (!form.vendor.trim()) e.vendor = required;
        if (!form.name.trim()) e.name = required;
        if (!form.start_date) e.start_date = required;
        if (!form.end_date) e.end_date = required;
        if (!form.value.trim()) e.value = required;
        if (form.start_date && form.end_date && form.end_date < form.start_date) {
            e.end_date = lang === 'th' ? 'ต้องไม่ก่อนวันเริ่ม' : 'Must be after start';
        }
        setErr(e);
        if (Object.keys(e).length) return;

        const payload = {
            code: form.code.trim(),
            type: form.type,
            vendor: form.vendor.trim(),
            name: form.name.trim(),
            start_date: form.start_date,
            end_date: form.end_date,
            value: Number(form.value),
            billing_cycle: form.billing_cycle,
            auto_renew: form.auto_renew,
            notify_150: form.notify_150,
            notify_120: form.notify_120,
            notify_90: form.notify_90,
            notify_60: form.notify_60,
            notify_45: form.notify_45,
            notify_30: form.notify_30,
            notify_7: form.notify_7,
            notes: form.notes.trim() || null,
        };

        if (editing) {
            update.mutate({ id: editing.id, payload }, { onSuccess: onClose });
        } else {
            create.mutate(payload, { onSuccess: onClose });
        }
    };

    const saving = create.isPending || update.isPending;

    return (
        <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
            <SheetContent side="right" className="flex w-[620px] flex-col sm:max-w-[620px]">
                <SheetHeader>
                    <SheetTitle>{editing ? `${t('edit')}: ${editing.code}` : t('new_contract')}</SheetTitle>
                    <SheetDescription>{t('contract_register_sub')}</SheetDescription>
                </SheetHeader>

                <div className="mt-6 flex-1 space-y-6 overflow-y-auto px-1">
                    {/* Contract type radio cards */}
                    <div>
                        <div className="mb-2 text-xs font-semibold text-muted-foreground">
                            {t('contract_type')} <span className="text-destructive">*</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {TYPE_META.map((tp) => {
                                const Icon = tp.icon;
                                const active = form.type === tp.value;
                                return (
                                    <button
                                        type="button"
                                        key={tp.value}
                                        onClick={() => upd('type', tp.value)}
                                        className={cn(
                                            'flex flex-col items-center gap-2 rounded-lg border p-3 text-center text-xs transition-colors',
                                            active ? 'border-brand bg-brand/5 text-brand' : 'border-border hover:bg-accent',
                                        )}
                                    >
                                        <Icon className="h-5 w-5" />
                                        <span className="font-medium leading-tight">{t(tp.labelKey)}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <Field label={t('contract_code')} help={t('contract_code_hint')} required error={err.code}>
                        <Input value={form.code} onChange={(e) => upd('code', e.target.value)} placeholder="CT-2026-001" className="font-mono" />
                    </Field>

                    <div className="grid grid-cols-2 gap-4">
                        <Field label={t('contract_vendor')} required error={err.vendor}>
                            <Input
                                value={form.vendor}
                                onChange={(e) => upd('vendor', e.target.value)}
                                list="contract-vendor-list"
                                placeholder={lang === 'th' ? 'เลือกหรือพิมพ์ชื่อผู้จำหน่าย' : 'Select or type vendor name'}
                            />
                            <datalist id="contract-vendor-list">
                                {vendors.map((v: Vendor) => <option key={v.id} value={v.name} />)}
                            </datalist>
                        </Field>
                        <Field label={t('contract_name')} required error={err.name}>
                            <Input
                                value={form.name}
                                onChange={(e) => upd('name', e.target.value)}
                                placeholder={lang === 'th' ? 'เช่น Microsoft 365 — 320 สิทธิ์' : 'e.g. Microsoft 365 — 320 seats'}
                            />
                        </Field>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <Field label={t('contract_start')} required error={err.start_date}>
                            <div className="relative">
                                <Input
                                    type="date"
                                    className="font-mono pr-9 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
                                    value={form.start_date}
                                    onChange={(e) => upd('start_date', e.target.value)}
                                />
                                <Calendar className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            </div>
                        </Field>
                        <Field label={t('contract_end')} required error={err.end_date}>
                            <div className="relative">
                                <Input
                                    type="date"
                                    className="font-mono pr-9 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
                                    value={form.end_date}
                                    onChange={(e) => upd('end_date', e.target.value)}
                                />
                                <Calendar className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            </div>
                        </Field>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <Field label={`${t('contract_value')} (฿)`} required error={err.value}>
                            <Input
                                type="text"
                                inputMode="numeric"
                                className="font-mono"
                                value={form.value ? Number(form.value).toLocaleString() : ''}
                                onChange={(e) => upd('value', e.target.value.replace(/[^\d]/g, ''))}
                                placeholder="2,140,000"
                            />
                        </Field>
                        <Field label={t('contract_billing')}>
                            <select
                                value={form.billing_cycle}
                                onChange={(e) => upd('billing_cycle', e.target.value as BillingCycle)}
                                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-brand"
                            >
                                <option value="monthly">{t('contract_billing_monthly')}</option>
                                <option value="quarterly">{t('contract_billing_quarterly')}</option>
                                <option value="yearly">{t('contract_billing_yearly')}</option>
                            </select>
                        </Field>
                    </div>

                    <Field label={t('contract_auto_renew')}>
                        <label className="flex h-10 items-center gap-3 text-sm">
                            <button
                                type="button"
                                onClick={() => upd('auto_renew', !form.auto_renew)}
                                className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', form.auto_renew ? 'bg-brand' : 'bg-muted')}
                            >
                                <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', form.auto_renew ? 'left-[1.125rem]' : 'left-0.5')} />
                            </button>
                            <span className="text-muted-foreground">
                                {form.auto_renew
                                    ? lang === 'th' ? 'ต่ออายุอัตโนมัติ' : 'Will renew automatically'
                                    : lang === 'th' ? 'ต้องต่ออายุด้วยตนเอง' : 'Manual renewal required'}
                            </span>
                        </label>
                    </Field>

                    <Field label={t('contract_notify')}>
                        <div className="flex flex-wrap gap-2">
                            {REMINDER_DAYS.map((d) => {
                                const key = `notify_${d}` as ReminderKey;
                                const on = form[key];
                                return (
                                    <button
                                        type="button"
                                        key={d}
                                        onClick={() => upd(key, !on)}
                                        className={cn(
                                            'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                                            on ? 'border-brand bg-brand/10 text-brand' : 'border-border text-muted-foreground hover:bg-accent',
                                        )}
                                    >
                                        {d} {lang === 'th' ? 'วัน' : 'days'}
                                    </button>
                                );
                            })}
                        </div>
                    </Field>

                    <Field label={t('contract_link_assets')} help={t('contract_link_assets_sub')}>
                        <div className="rounded-md bg-muted/50 px-3 py-4 text-center text-sm text-muted-foreground">{t('coming_soon')}</div>
                    </Field>

                    <Field label={t('contract_attachments')} help={lang === 'th' ? 'PDF ไม่เกิน 25MB' : 'PDF up to 25MB'}>
                        <div className="flex flex-col items-center gap-1 rounded-md border border-dashed border-border px-3 py-5 text-center text-sm text-muted-foreground">
                            <Paperclip className="h-4 w-4" />
                            <span>{t('coming_soon')}</span>
                        </div>
                    </Field>
                </div>

                <SheetFooter className="mt-4 flex-row gap-2">
                    <Button variant="outline" className="flex-1" onClick={onClose}>
                        {t('cancel')}
                    </Button>
                    <Button className="flex-1" onClick={submit} disabled={saving}>
                        <Check className="h-4 w-4" />
                        {t('save')}
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
