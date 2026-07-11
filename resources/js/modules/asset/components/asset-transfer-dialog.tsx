import { useT } from '@/lang';
import { useEmployees, useLocations } from '@/modules/employee';
import { Field } from '@/shared/components/field';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { cn } from '@/shared/lib/utils';
import type { Asset } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { useUiStore } from '@/stores/ui';
import { Loader2, Share2, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAssetMutations } from '../hooks/use-assets';

type Mode = 'employee' | 'shared';

/**
 * Hand assets to a new owner — an employee (pending acceptance) or a shared label (common).
 * Serves both the single-asset flow (`asset`) and the bulk flow (`ids` + `open`); the form is
 * identical, only the submit target (single vs bulk endpoint) and the header differ.
 */
export function AssetTransferDialog({
    asset,
    ids,
    open,
    onClose,
    onDone,
}: {
    asset?: Asset | null;
    ids?: number[];
    open?: boolean;
    onClose: () => void;
    onDone?: () => void;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { transfer, bulkTransfer } = useAssetMutations();
    const { data: locations = [] } = useLocations();
    const { data: employees = [] } = useEmployees();

    const isBulk = ids != null;
    const isOpen = isBulk ? !!open : !!asset;
    const busy = isBulk ? bulkTransfer.isPending : transfer.isPending;

    const locationOptions = useMemo(() => locations.map((l) => ({ value: String(l.id), label: l.name, search: l.name })), [locations]);
    const employeeOptions = useMemo(
        () =>
            employees.map((e) => {
                const name = lang === 'th' ? (e.name_th ?? e.name) : e.name;
                return {
                    value: String(e.id),
                    label: `${name} · ${e.code}${e.department ? ` · ${e.department}` : ''}`,
                    // Search both languages so a Thai query matches an English-stored name and vice versa.
                    search: `${e.name} ${e.name_th ?? ''} ${e.code} ${e.department ?? ''}`,
                };
            }),
        [employees, lang],
    );

    const [mode, setMode] = useState<Mode>('employee');
    const [employeeId, setEmployeeId] = useState('');
    const [sharedLabel, setSharedLabel] = useState('');
    const [location, setLocation] = useState('');
    const [reason, setReason] = useState('');
    const [err, setErr] = useState<{ employee?: string; shared?: string; location?: string }>({});

    // Reset the form whenever the dialog (re)opens for a new asset / batch.
    useEffect(() => {
        setMode('employee');
        setEmployeeId('');
        setSharedLabel('');
        setLocation('');
        setReason('');
        setErr({});
    }, [asset, open]);

    const submit = async () => {
        const required = t('asset_err_required');
        const e: { employee?: string; shared?: string; location?: string } = {};
        if (mode === 'employee' && !employeeId) e.employee = required;
        if (mode === 'shared' && !sharedLabel.trim()) e.shared = required;
        if (!location) e.location = required;
        setErr(e);
        if (Object.keys(e).length) return;

        const owner =
            mode === 'employee'
                ? { owner_employee_id: Number(employeeId) }
                : { owner_label: sharedLabel.trim() };

        try {
            if (isBulk) {
                await bulkTransfer.mutateAsync({ ids, mode, ...owner, location_id: Number(location), reason: reason.trim() || undefined });
            } else if (asset) {
                await transfer.mutateAsync({ id: asset.id, payload: { mode, ...owner, location_id: Number(location), reason: reason.trim() || undefined } });
            }
            (onDone ?? onClose)();
        } catch {
            setErr({ location: t('asset_transfer_failed') });
        }
    };

    const description = isBulk
        ? t('asset_bulk_count').replace('{count}', String(ids?.length ?? 0))
        : asset
          ? `${asset.asset_code} — ${asset.model ?? ''}`
          : '';

    return (
        <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogTitle>{isBulk ? t('asset_bulk_transfer_title') : t('transfer_asset')}</DialogTitle>
                <DialogDescription>{description}</DialogDescription>

                <div className="mt-4 space-y-5">
                    {/* Segmented toggle: Employee | Shared */}
                    <div className="bg-muted grid grid-cols-2 gap-2 rounded-lg p-1">
                        {(['employee', 'shared'] as Mode[]).map((m) => (
                            <button
                                key={m}
                                type="button"
                                onClick={() => setMode(m)}
                                className={cn(
                                    'flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                                    mode === m ? 'bg-background text-brand shadow-sm' : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {m === 'employee' ? <Users className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
                                {m === 'employee' ? t('transfer_mode_employee') : t('transfer_mode_shared')}
                            </button>
                        ))}
                    </div>

                    {mode === 'employee' ? (
                        <Field label={t('transfer_mode_employee')} required error={err.employee}>
                            <SearchableSelect
                                value={employeeId}
                                onChange={setEmployeeId}
                                options={employeeOptions}
                                preferDown
                                placeholder={t('transfer_pick_employee')}
                            />
                        </Field>
                    ) : (
                        <Field label={t('transfer_shared_label')} required error={err.shared}>
                            <Input
                                value={sharedLabel}
                                onChange={(ev) => setSharedLabel(ev.target.value)}
                                placeholder={t('transfer_shared_label_ph')}
                                autoFocus
                            />
                        </Field>
                    )}

                    <Field label={t('asset_location')} required error={err.location}>
                        <SearchableSelect value={location} onChange={setLocation} options={locationOptions} preferDown placeholder={t('transfer_location_ph')} />
                    </Field>

                    <Field label={t('asset_transfer_reason')}>
                        <textarea
                            value={reason}
                            onChange={(ev) => setReason(ev.target.value)}
                            rows={3}
                            className="border-input bg-background focus:border-brand w-full rounded-md border px-3 py-2 text-sm outline-none"
                            placeholder={t('asset_transfer_reason_ph')}
                        />
                    </Field>
                </div>

                <div className="mt-6 flex flex-row gap-2">
                    <Button variant="outline" className="flex-1" onClick={onClose}>
                        {t('cancel')}
                    </Button>
                    <Button className="flex-1" onClick={submit} disabled={busy}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                        {t('asset_transfer_action')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
