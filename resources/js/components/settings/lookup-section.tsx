import { Column, DataTable } from '@/components/shared/data-table';
import { Field } from '@/components/shared/field';
import { SaveButton } from '@/components/shared/save-button';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useT } from '@/lib/i18n';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import Swal from 'sweetalert2';

/** How long the success checkmark stays visible before the dialog closes. */
const CLOSE_DELAY_MS = 1100;

/** A simple {id, name, description} master-data row. */
export interface LookupItem {
    id: number;
    name: string;
    description?: string | null;
}

interface MutationLike {
    mutateAsync: (v: never) => Promise<unknown>;
    mutate: (v: never) => void;
    isPending: boolean;
}

interface LookupMutations {
    create: MutationLike;
    update: MutationLike;
    remove: MutationLike;
}

interface LookupSectionProps {
    rows: LookupItem[];
    mutations: LookupMutations;
    /** Dialog/title labels. */
    addLabel: string;
    editLabel: string;
    nameLabel: string;
    /** Toolbar add button label. */
    addButtonLabel: string;
}

/**
 * LookupSection — reusable CRUD list for a {name, description} master-data
 * lookup (Unit, Stock status, Warranty type). Renders the shared DataTable with
 * an Add button in the search row and an add/edit dialog whose Save button shows
 * a spinner then a checkmark before auto-closing.
 */
export function LookupSection({ rows, mutations, addLabel, editLabel, nameLabel, addButtonLabel }: LookupSectionProps) {
    const t = useT();
    const { create, update, remove } = mutations;
    const [addOpen, setAddOpen] = useState(false);
    const [editItem, setEditItem] = useState<LookupItem | null>(null);

    const columns: Column<LookupItem>[] = [
        { key: 'name', header: nameLabel, render: (r) => <span className="text-sm font-medium">{r.name}</span> },
        {
            key: 'description',
            header: t('md_description'),
            render: (r) => <span className="text-muted-foreground text-sm">{r.description || '—'}</span>,
        },
        {
            key: 'actions',
            header: t('actions'),
            align: 'right',
            render: (r) => (
                <div className="flex justify-end gap-1">
                    <button onClick={() => setEditItem(r)} className="hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md">
                        <Pencil className="h-4 w-4" />
                    </button>
                    <button
                        onClick={() => {
                            if (confirm(`${t('confirm_delete')} ${r.name}`)) remove.mutate(r.id as never);
                        }}
                        className="text-destructive hover:bg-destructive/10 flex h-8 w-8 items-center justify-center rounded-md"
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                </div>
            ),
        },
    ];

    return (
        <div>
            <DataTable
                columns={columns}
                rows={rows}
                rowKey={(r) => r.id}
                searchable={(r) => `${r.name} ${r.description ?? ''}`}
                actions={
                    <Button onClick={() => setAddOpen(true)}>
                        <Plus className="h-4 w-4" />
                        {addButtonLabel}
                    </Button>
                }
            />
            <LookupModal
                open={addOpen || !!editItem}
                item={editItem}
                addLabel={addLabel}
                editLabel={editLabel}
                nameLabel={nameLabel}
                create={create}
                update={update}
                onClose={() => {
                    setAddOpen(false);
                    setEditItem(null);
                }}
            />
        </div>
    );
}

/** Add/edit dialog for a lookup item. */
function LookupModal({
    open,
    item,
    addLabel,
    editLabel,
    nameLabel,
    create,
    update,
    onClose,
}: {
    open: boolean;
    item: LookupItem | null;
    addLabel: string;
    editLabel: string;
    nameLabel: string;
    create: MutationLike;
    update: MutationLike;
    onClose: () => void;
}) {
    const t = useT();
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const saving = create.isPending || update.isPending;

    useEffect(() => {
        if (open) {
            setName(item?.name ?? '');
            setDescription(item?.description ?? '');
        }
    }, [open, item]);

    const submit = async () => {
        if (!name.trim()) return;
        const payload = { name: name.trim(), description: description.trim() || undefined };
        try {
            if (item) {
                await update.mutateAsync({ id: item.id, ...payload } as never);
            } else {
                await create.mutateAsync(payload as never);
            }
            setTimeout(onClose, CLOSE_DELAY_MS);
        } catch {
            Swal.fire({ icon: 'error', title: 'Error', text: 'Something went wrong.' });
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{item ? editLabel : addLabel}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <Field label={nameLabel} required>
                        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder={nameLabel} onKeyDown={(e) => e.key === 'Enter' && submit()} />
                    </Field>
                    <Field label={t('md_description')}>
                        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('md_description')} onKeyDown={(e) => e.key === 'Enter' && submit()} />
                    </Field>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={saving}>
                        {t('cancel')}
                    </Button>
                    <SaveButton loading={saving} onClick={submit} disabled={!name.trim()} />
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
