import { useT } from '@/lang';
import { useLocations } from '@/modules/employee';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field, FormErrorBanner } from '@/shared/components/field';
import { SaveButton } from '@/shared/components/save-button';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useFormError } from '@/shared/hooks/use-form-error';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { serverMessage } from '@/shared/lib/api-errors';
import type { Asset } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogBody, DialogFooterBar, FormDialogContent } from '@/shared/ui/dialog';
import { Textarea } from '@/shared/ui/textarea';
import { MapPin } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAssetMutations } from '../hooks/use-assets';

/**
 * Correct where in-use assets physically sit — the holder moved desk and took the kit along.
 * Serves the single-asset flow (`asset`) and the Inventory bulk flow (`ids` + `open`) from one
 * form, the same way the hand-over dialog does.
 *
 * Deliberately a much smaller form than the hand-over: nothing about custody changes here, so
 * there is no owner to pick and nobody to warn — just the new place, and an optional note that
 * lands on the asset's history row.
 */
export function AssetLocationDialog({
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
    const fmtN = useNumberFormat();
    const { updateLocation } = useAssetMutations();
    const { data: locations = [] } = useLocations();

    const isBulk = ids != null;
    const isOpen = isBulk ? !!open : !!asset;

    const locationOptions = useMemo(() => locations.map((l) => ({ value: String(l.id), label: l.name, search: l.name })), [locations]);

    // Retain the last asset so the header doesn't blank while the dialog animates closed.
    const [shown, setShown] = useState<Asset | null>(asset ?? null);
    useEffect(() => {
        if (asset) setShown(asset);
    }, [asset]);
    const view = asset ?? shown;

    const [location, setLocation] = useState('');
    const [note, setNote] = useState('');
    const [err, setErr] = useState<string | undefined>();
    const formError = useFormError();
    const clearFormError = formError.clear;

    // Single asset starts on its current place; reset only while open so a closing dialog keeps its content.
    const seedLocation = !isBulk && asset?.location_id ? String(asset.location_id) : '';
    useEffect(() => {
        if (!isOpen) return;
        setLocation(seedLocation);
        setNote('');
        setErr(undefined);
        clearFormError();
    }, [asset, open, isBulk, isOpen, seedLocation, clearFormError]);

    const isDirty = location !== seedLocation || note !== '';
    const guardClose = useDiscardGuard(isOpen && isDirty);

    const submit = async () => {
        if (!location) {
            setErr(t('asset_err_required'));
            return;
        }
        const targetIds = isBulk ? (ids ?? []) : view ? [view.id] : [];
        if (!targetIds.length) return;

        formError.clear();
        try {
            await updateLocation.mutateAsync({ ids: targetIds, location_id: Number(location), note: note.trim() || undefined });
            (onDone ?? onClose)();
        } catch (error) {
            formError.show(serverMessage(error) ?? t('asset_location_failed'));
        }
    };

    const description = isBulk
        ? t('asset_bulk_count').replace('{count}', fmtN(ids?.length ?? 0))
        : view
          ? `${view.asset_code} - ${view.model ?? ''}`
          : '';

    return (
        <Dialog open={isOpen} onOpenChange={(o) => !o && guardClose(onClose)}>
            <FormDialogContent>
                <FocusDialogHeader
                    icon={MapPin}
                    eyebrow={isBulk ? t('asset_bulk_count').replace('{count}', fmtN(ids?.length ?? 0)) : view?.asset_code}
                    title={isBulk ? t('asset_bulk_location_title') : t('asset_location_title')}
                    subtitle={!isBulk && view?.model ? <span className="text-muted-foreground text-sm">{view.model}</span> : undefined}
                    srDescription={description || undefined}
                />

                <DialogBody>
                    <FormErrorBanner message={formError.message} shakeKey={formError.shakeKey} />

                    {/* Where it sits today, so the new choice is a change from something. */}
                    {!isBulk && (
                        <div className="text-sm">
                            <span className="text-muted-foreground">{t('asset_location_current')}: </span>
                            <span className="font-medium">{view?.location ?? '—'}</span>
                        </div>
                    )}

                    <Field label={t('asset_location_new')} required error={err}>
                        <SearchableSelect
                            value={location}
                            onChange={setLocation}
                            options={locationOptions}
                            preferDown
                            placeholder={t('transfer_location_ph')}
                        />
                    </Field>

                    <Field label={t('asset_location_note')}>
                        <Textarea value={note} onChange={(ev) => setNote(ev.target.value)} rows={3} placeholder={t('asset_location_note_ph')} />
                    </Field>
                </DialogBody>

                <DialogFooterBar>
                    <Button variant="outline" onClick={() => guardClose(onClose)}>
                        {t('cancel')}
                    </Button>
                    <SaveButton onClick={submit} loading={updateLocation.isPending}>
                        <MapPin className="h-4 w-4" />
                        {t('asset_location_save')}
                    </SaveButton>
                </DialogFooterBar>
            </FormDialogContent>
        </Dialog>
    );
}
