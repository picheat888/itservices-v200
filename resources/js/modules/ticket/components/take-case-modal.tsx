import { useT } from '@/lang';
import { AssetTypeIcon } from '@/modules/asset';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field, FormErrorBanner } from '@/shared/components/field';
import { ModelPhoto } from '@/shared/components/model-photo';
import { ModelPhotoLightbox, type LightboxPhoto } from '@/shared/components/model-photo-lightbox';
import { SaveButton } from '@/shared/components/save-button';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useFormError } from '@/shared/hooks/use-form-error';
import { refusalText } from '@/shared/lib/api-errors';
import { localPair } from '@/shared/lib/local-name';
import { cn } from '@/shared/lib/utils';
import type { Ticket, TicketCategory, TicketPriority } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogBody, DialogFooterBar, FormDialogContent } from '@/shared/ui/dialog';
import { Textarea } from '@/shared/ui/textarea';
import { useUiStore } from '@/stores/ui';
import { Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { TicketAssetOption } from '../api/ticketApi';
import { useTicketAssetPicker, useTicketMutations, useTicketRequesterAssets } from '../hooks/use-tickets';
import { PriorityPicker } from './priority-picker';

// An IT staff takes an open case: note, related asset, and a priority only on a directly reported case.

// Categories whose cases are about a device on the asset register
const ASSET_BACKED: TicketCategory[] = ['hardware', 'cctv', 'telephone'];

/** What the preview under the asset picker shows about the chosen device. */
interface PickedDevice {
    code: string;
    model: string | null;
    brand: string | null;
    tag: string | null;
    type: string | null;
    typeTh: string | null;
    photo: string | null;
}

const deviceOf = (a: TicketAssetOption): PickedDevice => ({
    code: a.asset_code,
    model: a.model,
    brand: a.brand ?? null,
    tag: a.tag ?? null,
    type: a.type ?? null,
    typeTh: a.type_th ?? null,
    photo: a.model_photo_url ?? null,
});

export function TakeCaseModal({ ticket, onClose }: { ticket: Ticket | null; onClose: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { take } = useTicketMutations();
    const [priority, setPriority] = useState<TicketPriority>('medium');
    const [note, setNote] = useState('');
    const [assetId, setAssetId] = useState('');
    const formError = useFormError();
    const clearFormError = formError.clear;

    // Retain a "shown" copy so the content doesn't blank out during the Radix exit animation.
    const [shown, setShown] = useState<Ticket | null>(null);
    useEffect(() => {
        if (ticket) setShown(ticket);
    }, [ticket]);
    const view = ticket ?? shown;
    // Read from the retained copy so the priority row does not appear while the dialog fades out
    const fromRequest = !!view?.from_request;

    const isAssetBacked = view != null && ASSET_BACKED.includes(view.category);
    const { assets: foundAssets, pickerProps: assetPickerProps } = useTicketAssetPicker(isAssetBacked);
    // The requester's own devices: one-click chips, also first in the select so a chip pick shows its label
    const { data: ownAssets } = useTicketRequesterAssets(isAssetBacked ? view?.id : null);
    const assetOptions = useMemo(() => {
        const own = (ownAssets ?? []).map((a) => ({
            value: String(a.id),
            label: a.asset_code,
            hint: a.model ?? '—',
            search: `${a.asset_code} ${a.model ?? ''}`,
            device: deviceOf(a),
        }));
        const ownIds = new Set(own.map((o) => o.value));
        const rest = foundAssets
            .map((a) => ({
                value: String(a.id),
                label: a.asset_code,
                hint: a.model ?? undefined,
                search: `${a.asset_code} ${a.model ?? ''}`,
                device: deviceOf(a),
            }))
            .filter((o) => !ownIds.has(o.value));

        return [...own, ...rest];
    }, [foundAssets, ownAssets]);
    // The chosen asset keeps its label when a later search no longer lists it
    const [pickedAsset, setPickedAsset] = useState<(typeof assetOptions)[number] | null>(null);
    const pickAsset = (value: string) => {
        setAssetId(value);
        setPickedAsset(assetOptions.find((o) => o.value === value) ?? null);
    };

    // Starts on the asset already linked to the case, so taking it does not unlink it
    const linkedAssetId = ticket?.related_asset_id != null ? String(ticket.related_asset_id) : '';
    useEffect(() => {
        if (ticket) {
            setPriority('medium');
            setNote('');
            setAssetId(linkedAssetId);
            setPickedAsset(
                linkedAssetId && ticket.related_asset_tag
                    ? {
                          value: linkedAssetId,
                          label: ticket.related_asset_tag,
                          hint: ticket.related_asset_model ?? undefined,
                          search: ticket.related_asset_tag,
                          device: {
                              code: ticket.related_asset_tag,
                              model: ticket.related_asset_model ?? null,
                              brand: ticket.related_asset_brand ?? null,
                              tag: ticket.related_asset_tag_name ?? null,
                              type: ticket.related_asset_type ?? null,
                              typeTh: ticket.related_asset_type_th ?? null,
                              photo: ticket.related_asset_model_photo_url ?? null,
                          },
                      }
                    : null,
            );
            clearFormError();
        }
    }, [ticket, linkedAssetId, clearFormError]);

    const submit = async () => {
        if (!ticket) return;
        formError.clear();
        try {
            await take.mutateAsync({
                id: ticket.id,
                // Omitted, not null: the endpoint refuses the key on a request-born case
                ...(fromRequest ? {} : { priority }),
                note: note.trim() || null,
                related_asset_id: assetId ? Number(assetId) : null,
            });
            onClose();
        } catch (e: unknown) {
            formError.show(refusalText(e, t, 'ticket_refusal_'));
        }
    };

    const pending = take.isPending;
    const picked = assetId && pickedAsset?.value === assetId ? pickedAsset.device : null;
    const [lightbox, setLightbox] = useState<LightboxPhoto | null>(null);
    const openPhoto = (d: PickedDevice) => {
        if (d.photo) setLightbox({ src: d.photo, model: d.model ?? d.code, brand: d.brand });
    };
    const isDirty = (!fromRequest && priority !== 'medium') || note.trim() !== '' || assetId !== linkedAssetId;
    const guardClose = useDiscardGuard(!!ticket && isDirty);

    return (
        <Dialog open={!!ticket} onOpenChange={(o) => !o && !pending && guardClose(onClose)}>
            <FormDialogContent
                // Every field is optional, so don't raise the iPad keyboard on open
                onOpenAutoFocus={(e) => {
                    e.preventDefault();
                    (e.currentTarget as HTMLElement | null)?.focus();
                }}
            >
                <FocusDialogHeader
                    icon={Zap}
                    eyebrow={view?.ticket_no}
                    title={t('ticket_take_case')}
                    titleSuffix={<span className="sr-only"> {view?.ticket_no}</span>}
                    subtitle={view ? <span className="text-muted-foreground truncate text-sm">{view.subject}</span> : undefined}
                    srDescription={t('ticket_take_case')}
                />

                <DialogBody>
                    <FormErrorBanner message={formError.message} shakeKey={formError.shakeKey} />

                    {!fromRequest && (
                        <Field label={t('ticket_priority')} required>
                            <PriorityPicker value={priority} onChange={setPriority} label={t('ticket_priority')} />
                        </Field>
                    )}

                    {isAssetBacked && (
                        <Field label={t('ticket_related_asset')} help={t('ticket_related_asset_help')}>
                            <div className="space-y-2">
                                {(ownAssets?.length ?? 0) > 0 && (
                                    <div>
                                        <div className="text-muted-foreground mb-1.5 text-xs">
                                            {t('ticket_requester_assets').replace(
                                                '{name}',
                                                localPair(view?.requester_name, view?.requester_name_th, lang) ?? '',
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {(ownAssets ?? []).map((a) => {
                                                const selected = assetId === String(a.id);
                                                return (
                                                    <button
                                                        key={a.id}
                                                        type="button"
                                                        aria-pressed={selected}
                                                        onClick={() => setAssetId(selected ? '' : String(a.id))}
                                                        className={cn(
                                                            'touch:px-3.5 touch:py-2.5 touch:text-sm inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                                                            selected
                                                                ? 'border-brand bg-brand/10 text-brand'
                                                                : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                                                        )}
                                                    >
                                                        <ModelPhoto
                                                            size={20}
                                                            src={a.model_photo_url}
                                                            alt={a.model ?? a.asset_code}
                                                            fallback={
                                                                <AssetTypeIcon type={a.type ?? ''} className="h-3.5 w-3.5 shrink-0 opacity-70" />
                                                            }
                                                        />
                                                        <span>{a.asset_code}</span>
                                                        <span>{a.model ?? '—'}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                <SearchableSelect
                                    value={assetId}
                                    onChange={pickAsset}
                                    options={assetOptions}
                                    selectedOption={pickedAsset ?? undefined}
                                    {...assetPickerProps}
                                    placeholder={t('ticket_no_related_asset')}
                                    clearable
                                />
                                {/* The chosen device, big enough to recognise */}
                                {picked && (
                                    <div className="flex items-center gap-3 pt-1">
                                        <ModelPhoto
                                            size={72}
                                            src={picked.photo}
                                            alt={picked.model ?? picked.code}
                                            onOpen={() => openPhoto(picked)}
                                            fallback={
                                                <span className="bg-muted text-muted-foreground grid h-[72px] w-[72px] shrink-0 place-items-center rounded-[10px]">
                                                    <AssetTypeIcon type={picked.type ?? ''} className="h-7 w-7" />
                                                </span>
                                            }
                                        />
                                        <div className="min-w-0">
                                            <div className="truncate text-sm font-semibold">{picked.model ?? picked.code}</div>
                                            <div className="text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                                                {picked.type && <span>{localPair(picked.type, picked.typeTh, lang)}</span>}
                                                <span>{picked.code}</span>
                                                {picked.tag && <span>{picked.tag}</span>}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </Field>
                    )}

                    <Field label={t('ticket_initial_notes')}>
                        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} />
                    </Field>
                </DialogBody>

                <DialogFooterBar>
                    <Button variant="outline" onClick={() => guardClose(onClose)} disabled={pending}>
                        {t('cancel')}
                    </Button>
                    <SaveButton onClick={submit} loading={pending}>
                        <Zap className="h-4 w-4" />
                        {t('ticket_take_case')}
                    </SaveButton>
                </DialogFooterBar>
            </FormDialogContent>
            <ModelPhotoLightbox photo={lightbox} onClose={() => setLightbox(null)} />
        </Dialog>
    );
}
