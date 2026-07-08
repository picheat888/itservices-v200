import { Field } from '@/shared/components/field';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { useAssetMutations } from '../hooks/use-assets';
import { useEmployees, useLocations } from '@/modules/employee';
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import type { Asset } from '@/shared/types';
import { Loader2, Share2, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

type Mode = 'employee' | 'shared';

/** Hand an asset to a new owner — an employee (pending acceptance) or a shared label (deployed). */
export function AssetTransferDialog({ asset, onClose }: { asset: Asset | null; onClose: () => void }) {
    const t = useT();
    const { transfer } = useAssetMutations();
    const { data: locations = [] } = useLocations();
    const { data: employees = [] } = useEmployees();

    const locationOptions = useMemo(
        () => locations.map((l) => ({ value: String(l.id), label: l.name, search: l.name })),
        [locations],
    );
    const employeeOptions = useMemo(
        () =>
            employees.map((e) => ({
                value: String(e.id),
                label: `${e.name} · ${e.code}${e.department ? ` · ${e.department}` : ''}`,
                search: `${e.name} ${e.code} ${e.department ?? ''}`,
            })),
        [employees],
    );

    const [mode, setMode] = useState<Mode>('employee');
    const [employeeId, setEmployeeId] = useState('');
    const [sharedLabel, setSharedLabel] = useState('');
    const [location, setLocation] = useState('');
    const [reason, setReason] = useState('');
    const [err, setErr] = useState<{ employee?: string; shared?: string; location?: string }>({});

    // Reset the form whenever a new asset opens the dialog.
    useEffect(() => {
        setMode('employee');
        setEmployeeId('');
        setSharedLabel('');
        setLocation('');
        setReason('');
        setErr({});
    }, [asset]);

    const submit = async () => {
        if (!asset) return;
        const required = t('asset_err_required');
        const e: { employee?: string; shared?: string; location?: string } = {};
        if (mode === 'employee' && !employeeId) e.employee = required;
        if (mode === 'shared' && !sharedLabel.trim()) e.shared = required;
        if (!location) e.location = required;
        setErr(e);
        if (Object.keys(e).length) return;

        const payload =
            mode === 'employee'
                ? { mode, owner_employee_id: Number(employeeId), location_id: Number(location), reason: reason.trim() || undefined }
                : { mode, owner_label: sharedLabel.trim(), location_id: Number(location), reason: reason.trim() || undefined };

        try {
            await transfer.mutateAsync({ id: asset.id, payload });
            onClose();
        } catch {
            setErr({ location: t('asset_transfer_failed') });
        }
    };

    return (
        <Dialog open={!!asset} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogTitle>{t('transfer_asset')}</DialogTitle>
                <DialogDescription>{asset ? `${asset.tag} — ${asset.model ?? ''}` : ''}</DialogDescription>

                <div className="mt-4 space-y-5">
                    <Field label={t('asset_current_owner')}>
                        <Input value={asset?.owner_name ?? asset?.owner ?? '—'} disabled className="opacity-70" />
                    </Field>

                    {/* Segmented toggle: Employee | Shared */}
                    <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
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
                                placeholder={t('transfer_pick_employee')}
                            />
                        </Field>
                    ) : (
                        <Field label={t('transfer_shared_label')} required error={err.shared}>
                            <Input value={sharedLabel} onChange={(ev) => setSharedLabel(ev.target.value)} placeholder={t('transfer_shared_label_ph')} autoFocus />
                        </Field>
                    )}

                    <Field label={t('asset_location')} required error={err.location}>
                        <SearchableSelect
                            value={location}
                            onChange={setLocation}
                            options={locationOptions}
                            placeholder={t('transfer_location_ph')}
                        />
                    </Field>

                    <Field label={t('asset_transfer_reason')}>
                        <textarea
                            value={reason}
                            onChange={(ev) => setReason(ev.target.value)}
                            rows={3}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-brand"
                            placeholder={t('asset_transfer_reason_ph')}
                        />
                    </Field>
                </div>

                <div className="mt-6 flex flex-row gap-2">
                    <Button variant="outline" className="flex-1" onClick={onClose}>
                        {t('cancel')}
                    </Button>
                    <Button className="flex-1" onClick={submit} disabled={transfer.isPending}>
                        {transfer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                        {t('transfer_asset')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
