import { useT } from '@/lang';
import { useLocations } from '@/modules/employee';
import { Field } from '@/shared/components/field';
import { SearchableSelect } from '@/shared/components/searchable-select';
import type { Asset } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui/dialog';
import { Textarea } from '@/shared/ui/textarea';
import { Loader2, MapPin } from 'lucide-react';
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
    const { updateLocation } = useAssetMutations();
    const { data: locations = [] } = useLocations();

    const isBulk = ids != null;
    const isOpen = isBulk ? !!open : !!asset;

    const locationOptions = useMemo(() => locations.map((l) => ({ value: String(l.id), label: l.name, search: l.name })), [locations]);

    // Retain the last asset so the dialog keeps rendering content while it animates closed —
    // the parent nulls the prop the moment it closes, which would blank the header mid-fade.
    const [shown, setShown] = useState<Asset | null>(asset ?? null);
    useEffect(() => {
        if (asset) setShown(asset);
    }, [asset]);
    const view = asset ?? shown;

    const [location, setLocation] = useState('');
    const [note, setNote] = useState('');
    const [err, setErr] = useState<string | undefined>();

    // Reset whenever the dialog (re)opens for a new asset / batch. A single asset starts on
    // where it is now, so the picker shows the current place rather than an empty box.
    // Guarded by `isOpen` for the same reason as `shown`: a closing dialog must not wipe the
    // form the viewer is still watching fade out.
    useEffect(() => {
        if (!isOpen) return;
        setLocation(!isBulk && asset?.location_id ? String(asset.location_id) : '');
        setNote('');
        setErr(undefined);
    }, [asset, open, isBulk, isOpen]);

    const submit = async () => {
        if (!location) {
            setErr(t('asset_err_required'));
            return;
        }
        const targetIds = isBulk ? (ids ?? []) : view ? [view.id] : [];
        if (!targetIds.length) return;

        try {
            await updateLocation.mutateAsync({ ids: targetIds, location_id: Number(location), note: note.trim() || undefined });
            (onDone ?? onClose)();
        } catch {
            setErr(t('asset_location_failed'));
        }
    };

    const description = isBulk
        ? t('asset_bulk_count').replace('{count}', String(ids?.length ?? 0))
        : view
          ? `${view.asset_code} - ${view.model ?? ''}`
          : '';

    return (
        <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogTitle>{isBulk ? t('asset_bulk_location_title') : t('asset_location_title')}</DialogTitle>
                <DialogDescription>{description}</DialogDescription>

                <div className="mt-4 space-y-5">
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
                </div>

                <div className="mt-6 flex flex-row gap-2">
                    <Button variant="outline" className="flex-1" onClick={onClose}>
                        {t('cancel')}
                    </Button>
                    <Button className="flex-1" onClick={submit} disabled={updateLocation.isPending}>
                        {updateLocation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                        {t('asset_location_save')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
