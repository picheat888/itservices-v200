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
import { useTicketMutations } from '../hooks/use-tickets';
import { TICKET_PRIORITY_META } from './ticket-meta';

const PRIORITIES: TicketPriority[] = ['critical', 'high', 'medium', 'low'];

/** An IT staff takes an open case: sets priority, optional note, and (for hardware) a related asset. */
export function TakeCaseModal({ ticket, onClose }: { ticket: Ticket | null; onClose: () => void }) {
    const t = useT();
    const { take } = useTicketMutations();
    const [priority, setPriority] = useState<TicketPriority>('medium');
    const [note, setNote] = useState('');
    const [assetId, setAssetId] = useState('');

    const isHardware = ticket?.category === 'hardware';
    const { data: assetData } = useAssets({ page: 1, per_page: 50, search: '' });
    const assetOptions = useMemo(
        () => (assetData?.data ?? []).map((a) => ({ value: String(a.id), label: `${a.asset_code} · ${a.model}`, search: `${a.asset_code} ${a.model}` })),
        [assetData],
    );

    useEffect(() => {
        if (ticket) {
            setPriority('medium');
            setNote('');
            setAssetId('');
        }
    }, [ticket]);

    const submit = async () => {
        if (!ticket) return;
        await take.mutateAsync({ id: ticket.id, priority, note: note.trim() || null, related_asset_id: assetId ? Number(assetId) : null });
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
                    code={ticket?.ticket_no}
                    subtitle={ticket ? <span className="text-muted-foreground truncate text-sm">{ticket.subject}</span> : undefined}
                    srDescription={t('ticket_take_case')}
                />

                <div className="flex-1 space-y-6 overflow-y-auto border-t px-6 py-6">
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

                    {isHardware && (
                        <Field label={t('ticket_related_asset')} help={t('ticket_related_asset_help')}>
                            <SearchableSelect
                                value={assetId}
                                onChange={setAssetId}
                                options={assetOptions}
                                placeholder={t('ticket_no_related_asset')}
                                clearable
                            />
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
