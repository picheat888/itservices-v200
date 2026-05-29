import { Field } from '@/components/shared/field';
import { TICKET_PRIORITY_META } from '@/components/tickets/ticket-meta';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAssets } from '@/hooks/use-assets';
import { useTicketMutations } from '@/hooks/use-tickets';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { Ticket, TicketPriority } from '@/types';
import { Loader2, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';

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

    return (
        <Sheet open={!!ticket} onOpenChange={(o) => !o && onClose()}>
            <SheetContent side="right" className="flex w-[480px] flex-col sm:max-w-[480px]">
                <SheetHeader>
                    <SheetTitle>{t('ticket_take_case')}</SheetTitle>
                    <SheetDescription>{ticket ? `${ticket.ticket_no} · ${ticket.subject}` : ''}</SheetDescription>
                </SheetHeader>

                <div className="mt-6 flex-1 space-y-6 overflow-y-auto px-1">
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
                            <select
                                value={assetId}
                                onChange={(e) => setAssetId(e.target.value)}
                                className="border-input bg-background focus:border-brand w-full rounded-md border px-3 py-2 text-sm outline-none"
                            >
                                <option value="">{t('ticket_no_related_asset')}</option>
                                {(assetData?.data ?? []).map((a) => (
                                    <option key={a.id} value={a.id}>
                                        {a.tag} · {a.model}
                                    </option>
                                ))}
                            </select>
                        </Field>
                    )}

                    <Field label={t('ticket_initial_notes')}>
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            rows={3}
                            className="border-input bg-background focus:border-brand w-full rounded-md border px-3 py-2 text-sm outline-none"
                        />
                    </Field>
                </div>

                <SheetFooter className="mt-4 flex-row gap-2">
                    <Button variant="outline" className="flex-1" onClick={onClose}>
                        {t('cancel')}
                    </Button>
                    <Button className="flex-1" onClick={submit} disabled={take.isPending}>
                        {take.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                        {t('ticket_take_case')}
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
