import { useT } from '@/lang';
import { useAssets } from '@/modules/asset';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field } from '@/shared/components/field';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { cn } from '@/shared/lib/utils';
import type { Ticket, TicketPriority } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent } from '@/shared/ui/dialog';
import { Textarea } from '@/shared/ui/textarea';
import { Loader2, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTicketMutations, useTicketRequesterAssets } from '../hooks/use-tickets';
import { TICKET_PRIORITY_META } from './ticket-meta';

const PRIORITIES: TicketPriority[] = ['critical', 'high', 'medium', 'low'];

/**
 * An IT staff takes an open case: optional note, (for hardware) a related asset, and — only
 * for a case somebody reported directly — a priority.
 *
 * A case opened from an approved request is not given one. Its target was settled by what was
 * asked for, before anybody looked at it, and the endpoint refuses a priority on such a case;
 * offering the control would be offering a choice that cannot be saved.
 */
export function TakeCaseModal({ ticket, onClose }: { ticket: Ticket | null; onClose: () => void }) {
    const t = useT();
    const { take } = useTicketMutations();
    const [priority, setPriority] = useState<TicketPriority>('medium');
    // null on a case nobody reported directly — see the note on Ticket['from_request'].
    const fromRequest = !!ticket?.from_request;
    const [note, setNote] = useState('');
    const [assetId, setAssetId] = useState('');

    // Retain a "shown" copy so the content doesn't blank out during the Radix exit animation.
    const [shown, setShown] = useState<Ticket | null>(null);
    useEffect(() => {
        if (ticket) setShown(ticket);
    }, [ticket]);
    const view = ticket ?? shown;

    const isHardware = view?.category === 'hardware';
    const { data: assetData } = useAssets({ page: 1, per_page: 50, search: '' });
    // The requester's own devices — offered as one-click chips, and merged to the
    // top of the search select so a chip-picked asset always renders its label.
    const { data: ownAssets } = useTicketRequesterAssets(isHardware ? view?.id : null);
    const assetOptions = useMemo(() => {
        const own = (ownAssets ?? []).map((a) => ({
            value: String(a.id),
            label: `${a.asset_code} · ${a.model ?? '—'}`,
            search: `${a.asset_code} ${a.model ?? ''}`,
        }));
        const ownIds = new Set(own.map((o) => o.value));
        const rest = (assetData?.data ?? [])
            .map((a) => ({
                value: String(a.id),
                label: `${a.asset_code} · ${a.model}`,
                search: `${a.asset_code} ${a.model}`,
            }))
            .filter((o) => !ownIds.has(o.value));

        return [...own, ...rest];
    }, [assetData, ownAssets]);

    useEffect(() => {
        if (ticket) {
            setPriority('medium');
            setNote('');
            setAssetId('');
        }
    }, [ticket]);

    const submit = async () => {
        if (!ticket) return;
        await take.mutateAsync({
            id: ticket.id,
            // Omitted entirely rather than sent as null: the endpoint rejects the key outright
            // on a request-born case, which is what keeps the rule true for anything posting
            // at the API and not only for this dialog.
            ...(fromRequest ? {} : { priority }),
            note: note.trim() || null,
            related_asset_id: assetId ? Number(assetId) : null,
        });
        onClose();
    };

    const pending = take.isPending;

    return (
        <Dialog open={!!ticket} onOpenChange={(o) => !o && !pending && onClose()}>
            <DialogContent className="!flex max-h-[calc(100vh-4.5rem)] w-[calc(100vw-2rem)] max-w-[560px] flex-col gap-0 overflow-hidden p-0">
                <FocusDialogHeader
                    icon={Zap}
                    eyebrow="Take Case"
                    title={t('ticket_take_case')}
                    code={view?.ticket_no}
                    subtitle={view ? <span className="text-muted-foreground truncate text-sm">{view.subject}</span> : undefined}
                    srDescription={t('ticket_take_case')}
                />

                <div className="flex-1 space-y-6 overflow-y-auto border-t px-6 py-6">
                    {!fromRequest && (
                        <Field label={t('ticket_priority')} required>
                            <div className="flex flex-wrap gap-2">
                                {PRIORITIES.map((p) => (
                                    <button
                                        key={p}
                                        type="button"
                                        onClick={() => setPriority(p)}
                                        className={cn(
                                            'rounded-full px-3 py-1 text-sm font-medium transition-colors',
                                            priority === p ? 'bg-brand text-white' : 'bg-muted text-muted-foreground hover:text-foreground',
                                        )}
                                    >
                                        {t(TICKET_PRIORITY_META[p].key)}
                                    </button>
                                ))}
                            </div>
                        </Field>
                    )}

                    {isHardware && (
                        <Field label={t('ticket_related_asset')} help={t('ticket_related_asset_help')}>
                            <div className="space-y-2">
                                {(ownAssets?.length ?? 0) > 0 && (
                                    <div>
                                        <div className="text-muted-foreground mb-1.5 text-xs">
                                            {t('ticket_requester_assets').replace('{name}', view?.requester_name ?? '')}
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {(ownAssets ?? []).map((a) => {
                                                const selected = assetId === String(a.id);
                                                return (
                                                    <button
                                                        key={a.id}
                                                        type="button"
                                                        onClick={() => setAssetId(selected ? '' : String(a.id))}
                                                        className={cn(
                                                            'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                                                            selected
                                                                ? 'border-brand bg-brand/10 text-brand'
                                                                : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                                                        )}
                                                    >
                                                        {a.asset_code} · {a.model ?? '—'}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                <SearchableSelect
                                    value={assetId}
                                    onChange={setAssetId}
                                    options={assetOptions}
                                    placeholder={t('ticket_no_related_asset')}
                                    clearable
                                />
                            </div>
                        </Field>
                    )}

                    <Field label={t('ticket_initial_notes')}>
                        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
                    </Field>
                </div>

                <div className="border-border bg-muted/20 flex items-center justify-end gap-2 border-t px-6 py-3.5">
                    <Button variant="outline" onClick={onClose} disabled={pending}>
                        {t('cancel')}
                    </Button>
                    <Button onClick={submit} disabled={pending}>
                        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                        {t('ticket_take_case')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
