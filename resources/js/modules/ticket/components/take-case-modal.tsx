import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field, FormErrorBanner } from '@/shared/components/field';
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
import { useTicketAssetPicker, useTicketMutations, useTicketRequesterAssets } from '../hooks/use-tickets';
import { PriorityPicker } from './priority-picker';

// An IT staff takes an open case: note, related asset, and a priority only on a directly reported case.

// Categories whose cases are about a device on the asset register
const ASSET_BACKED: TicketCategory[] = ['hardware', 'cctv', 'telephone'];

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
        }));
        const ownIds = new Set(own.map((o) => o.value));
        const rest = foundAssets
            .map((a) => ({
                value: String(a.id),
                label: a.asset_code,
                hint: a.model ?? undefined,
                search: `${a.asset_code} ${a.model ?? ''}`,
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

    useEffect(() => {
        if (ticket) {
            setPriority('medium');
            setNote('');
            setAssetId('');
            setPickedAsset(null);
            clearFormError();
        }
    }, [ticket, clearFormError]);

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
    const isDirty = (!fromRequest && priority !== 'medium') || note.trim() !== '' || assetId !== '';
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
                                                            'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                                                            selected
                                                                ? 'border-brand bg-brand/10 text-brand'
                                                                : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                                                        )}
                                                    >
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
        </Dialog>
    );
}
