import { useT } from '@/lang';
import { Column, DataTable } from '@/shared/components/data-table';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import type { EmptyStateProps } from '@/shared/components/empty-state';
import { Field } from '@/shared/components/field';
import { SaveButton } from '@/shared/components/save-button';
import { useCloseAfterSave } from '@/shared/hooks/use-close-after-save';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useListParams } from '@/shared/hooks/use-list-params';
import { hasFieldError, toastDeleteError } from '@/shared/lib/api-errors';
import { Button } from '@/shared/ui/button';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogBody, DialogFooterBar, FormDialogContent } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { useToastStore } from '@/stores/toast';
import { Pencil, Plus, Trash2, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useListDialog } from '../hooks/use-list-dialog';

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
    /** True while the rows are first loading (shows skeleton rows instead of "no data"). */
    loading?: boolean;
    mutations: LookupMutations;
    /** Dialog/title labels. */
    addLabel: string;
    editLabel: string;
    nameLabel: string;
    /** Dialog header icon and the line above the title: the Settings area the list lives in. */
    icon: LucideIcon;
    eyebrow: string;
    /** Toolbar add button label. */
    addButtonLabel: string;
    /** Which master-data list this is: picks its set_empty_md_<name> words. */
    emptyName: string;
}

/** The empty state of a master-data list: its "none yet" words, or its "no match" words while a search is typed. */
export function masterDataEmpty(t: (key: string) => string, name: string, searching: boolean, addButtonLabel: string): EmptyStateProps {
    if (searching) {
        return { kind: 'search', title: t(`set_empty_md_${name}_search`), hint: t(`set_empty_md_${name}_search_hint`) };
    }
    return { title: t(`set_empty_md_${name}`), hint: t(`set_empty_md_${name}_hint`).replace('{button}', addButtonLabel) };
}

/** LookupSection — CRUD list for a {name, description} lookup; search and page live in the URL (?search, page, per). */
export function LookupSection({
    rows,
    loading,
    mutations,
    addLabel,
    editLabel,
    nameLabel,
    icon,
    eyebrow,
    addButtonLabel,
    emptyName,
}: LookupSectionProps) {
    const t = useT();
    const confirm = useConfirm();
    const list = useListParams();
    const { create, update, remove } = mutations;
    const dialog = useListDialog(rows, !loading);

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
                    {/* Icon-only row actions, labelled per row */}
                    <button
                        type="button"
                        onClick={() => dialog.edit(r)}
                        aria-label={`${t('edit')} ${r.name}`}
                        className="hover:bg-accent focus-visible:ring-ring/50 flex h-8 w-8 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-2"
                    >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        aria-label={`${t('delete')} ${r.name}`}
                        onClick={async () => {
                            if (!(await confirm({ variant: 'danger', entity: { name: r.name, sub: r.description || undefined } }))) return;
                            try {
                                await remove.mutateAsync(r.id as never);
                            } catch (e) {
                                toastDeleteError(e, t);
                            }
                        }}
                        className="text-destructive hover:bg-destructive/10 focus-visible:ring-destructive/40 flex h-8 w-8 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-2"
                    >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
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
                loading={loading}
                rowKey={(r) => r.id}
                search={list.table.search}
                paging={list.table.paging}
                searchPlaceholder={t('set_search_name_desc')}
                searchable={(r) => `${r.name} ${r.description ?? ''}`}
                empty={masterDataEmpty(t, emptyName, list.table.search.value.trim() !== '', addButtonLabel)}
                actions={
                    <Button onClick={dialog.add}>
                        <Plus className="h-4 w-4" />
                        {addButtonLabel}
                    </Button>
                }
            />
            <LookupModal
                open={dialog.open}
                item={dialog.editing}
                addLabel={addLabel}
                editLabel={editLabel}
                nameLabel={nameLabel}
                icon={icon}
                eyebrow={eyebrow}
                create={create}
                update={update}
                onClose={dialog.close}
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
    icon,
    eyebrow,
    create,
    update,
    onClose,
}: {
    open: boolean;
    item: LookupItem | null;
    addLabel: string;
    editLabel: string;
    nameLabel: string;
    icon: LucideIcon;
    eyebrow: string;
    create: MutationLike;
    update: MutationLike;
    onClose: () => void;
}) {
    const t = useT();
    // The header keeps the record being edited while the dialog closes
    const [shown, setShown] = useState(item);
    useEffect(() => {
        if (open) setShown(item);
    }, [open, item]);
    const view = open ? item : shown;
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [nameError, setNameError] = useState<string | undefined>();
    const [saved, setSaved] = useState(false);
    const nameRef = useRef<HTMLInputElement>(null);
    const closeAfterSave = useCloseAfterSave(open, onClose);
    const saving = create.isPending || update.isPending;

    useEffect(() => {
        if (open) {
            setName(item?.name ?? '');
            setDescription(item?.description ?? '');
            setNameError(undefined);
            setSaved(false);
        }
    }, [open, item]);

    // Dirty = differs from the values the dialog was seeded with (create = blank).
    const isDirty = !saved && (name !== (item?.name ?? '') || description !== (item?.description ?? ''));
    const guardClose = useDiscardGuard(open && isDirty);

    const submit = async () => {
        if (saving || saved) {
            return;
        }
        if (!name.trim()) {
            setNameError(t('set_err_required'));
            nameRef.current?.focus();
            return;
        }
        setNameError(undefined);
        const payload = { name: name.trim(), description: description.trim() || null };
        try {
            if (item) {
                await update.mutateAsync({ id: item.id, ...payload } as never);
            } else {
                await create.mutateAsync(payload as never);
            }
            setSaved(true);
            closeAfterSave();
        } catch (err) {
            if (hasFieldError(err, 'name')) {
                setNameError(t('md_name_taken'));
                nameRef.current?.focus();
            } else {
                useToastStore.getState().push(t('cd_error'), 'error', t('cd_error_title'));
            }
        }
    };

    const onEnter = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            submit();
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && guardClose(onClose)}>
            <FormDialogContent>
                <FocusDialogHeader
                    icon={icon}
                    eyebrow={eyebrow}
                    title={view ? editLabel : addLabel}
                    code={view?.name}
                    srDescription={t('md_modal_desc')}
                />
                <DialogBody>
                    <Field label={nameLabel} required error={nameError}>
                        <Input
                            ref={nameRef}
                            autoComplete="off"
                            value={name}
                            onChange={(e) => {
                                setName(e.target.value);
                                setNameError(undefined);
                            }}
                            autoFocus
                            maxLength={120}
                            onKeyDown={onEnter}
                        />
                    </Field>
                    <Field label={t('md_description')}>
                        <Input
                            autoComplete="off"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            maxLength={255}
                            onKeyDown={onEnter}
                        />
                    </Field>
                </DialogBody>
                <DialogFooterBar>
                    <Button variant="outline" onClick={() => guardClose(onClose)} disabled={saving}>
                        {t('cancel')}
                    </Button>
                    <SaveButton loading={saving} success={saved} onClick={submit} />
                </DialogFooterBar>
            </FormDialogContent>
        </Dialog>
    );
}
