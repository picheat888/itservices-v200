// Settings → Request data: the choice lists behind the request form's managed selects.
// One tab per list (?list=), rows reordered by drag or the arrow buttons, edited in OptionModal.
import { useT } from '@/lang';
import { EmptyPane } from '@/shared/components/empty-pane';
import { Field } from '@/shared/components/field';
import { PageTabs } from '@/shared/components/page-tabs';
import { SaveButton } from '@/shared/components/save-button';
import { ListSkeleton } from '@/shared/components/skeletons';
import { StatusBadge } from '@/shared/components/status-badge';
import { useCloseAfterSave } from '@/shared/hooks/use-close-after-save';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useListParams } from '@/shared/hooks/use-list-params';
import { toastDeleteError } from '@/shared/lib/api-errors';
import { REQUEST_TYPE_META } from '@/shared/lib/request-meta';
import { cn } from '@/shared/lib/utils';
import type { RequestOption, RequestOptionList } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Switch } from '@/shared/ui/switch';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';
import { ArrowDown, ArrowUp, GripVertical, ListChecks, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useRequestOptionLists, useRequestOptionMutations } from '../hooks/use-master-data';

/** Fill `{name}`-style placeholders in a translated string. */
const fill = (text: string, vars: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (m, key: string) => String(vars[key] ?? m));

const listKeyOf = (l: { request_type: string; field_key: string }) => `${l.request_type}.${l.field_key}`;

/** Error message from an API failure, or the generic save-failed text. */
const errorMessage = (e: unknown, fallback: string) => (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

export function RequestDataSection() {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const confirm = useConfirm();
    const { data, isLoading } = useRequestOptionLists();
    const { create, update, remove, reorder } = useRequestOptionMutations();

    const lists = useMemo(() => data?.lists ?? [], [data]);
    const keys = useMemo(() => lists.map(listKeyOf), [lists]);

    // Selected list in ?list= (no ?list= = the first list)
    const params = useListParams();
    const requested = params.get('list');
    const listKey = keys.includes(requested) ? requested : (keys[0] ?? '');
    const selectList = (next: string) => {
        if (next === listKey) return;
        params.setParams({ list: next === keys[0] ? null : next });
    };

    const active: RequestOptionList | null = useMemo(() => lists.find((l) => listKeyOf(l) === listKey) ?? null, [lists, listKey]);
    const rows = useMemo(
        () => (data?.options ?? []).filter((o) => active && o.request_type === active.request_type && o.field_key === active.field_key),
        [data, active],
    );
    const counts = useMemo(() => {
        const map = new Map<string, number>();
        for (const o of data?.options ?? []) {
            const key = listKeyOf(o);
            map.set(key, (map.get(key) ?? 0) + 1);
        }
        return map;
    }, [data]);

    const [editing, setEditing] = useState<RequestOption | null>(null);
    const [adding, setAdding] = useState(false);
    const [announcement, setAnnouncement] = useState('');

    const onError = (e: unknown) => {
        useToastStore.getState().push(errorMessage(e, t('md_save_failed')), 'error', t('cd_error_title'));
    };

    const rowLabel = (o: RequestOption) => (lang === 'th' ? o.label_th : o.label_en) || o.label_en;

    // Local order while dragging; server order otherwise
    const [order, setOrder] = useState<number[]>([]);
    const [dragId, setDragId] = useState<number | null>(null);
    useEffect(() => {
        if (dragId === null) setOrder(rows.map((o) => o.id));
    }, [rows, dragId]);

    // Known ids in drag order, then rows not yet in `order` (just added)
    const ordered = useMemo(() => {
        const byId = new Map(rows.map((o) => [o.id, o]));
        const placed = order.map((id) => byId.get(id)).filter((o): o is RequestOption => !!o);
        const seen = new Set(placed.map((o) => o.id));

        return [...placed, ...rows.filter((o) => !seen.has(o.id))];
    }, [rows, order]);

    const persist = (ids: number[]) => {
        if (!active) return;
        reorder.mutateAsync({ request_type: active.request_type, field_key: active.field_key, ids }).catch(onError);
    };

    /** Move a row to another index, save, and announce the new position. */
    const moveTo = (from: number, to: number) => {
        if (to < 0 || to >= ordered.length || from === to) return;
        const ids = ordered.map((o) => o.id);
        ids.splice(to, 0, ids.splice(from, 1)[0]);
        setOrder(ids);
        persist(ids);
        setAnnouncement(fill(t('rd_moved'), { name: rowLabel(ordered[from]), n: to + 1 }));
    };

    /** Shift the carried row under the cursor without saving anything yet. */
    const dragOver = (overId: number) => {
        if (dragId === null || dragId === overId) return;
        const ids = ordered.map((o) => o.id);
        const from = ids.indexOf(dragId);
        const to = ids.indexOf(overId);
        if (from < 0 || to < 0) return;
        ids.splice(to, 0, ids.splice(from, 1)[0]);
        setOrder(ids);
    };

    /** Save the order the drag ended on, if it actually changed anything. */
    const dropped = () => {
        setDragId(null);
        const ids = ordered.map((o) => o.id);
        if (ids.join() === rows.map((o) => o.id).join()) return;
        persist(ids);
    };

    const tabs = lists.map((l) => {
        const key = listKeyOf(l);
        return { id: key, label: t(REQUEST_TYPE_META[l.request_type].labelKey), count: counts.get(key) ?? 0 };
    });

    return (
        <>
            {/* List tabs */}
            {tabs.length > 0 ? (
                <PageTabs tabs={tabs} active={listKey} onChange={selectList} className="mb-4" />
            ) : (
                <div className="border-border mb-4 h-11 border-b" aria-hidden />
            )}

            {/* Toolbar */}
            <div className="mb-3 flex items-center justify-between gap-3">
                <p role="status" aria-live="polite" className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    {reorder.isPending && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
                    {ordered.length > 1 && (reorder.isPending ? t('rd_saving_order') : t('rd_drag_hint'))}
                    <span className="sr-only">{announcement}</span>
                </p>
                <Button disabled={!active} onClick={() => setAdding(true)}>
                    <Plus className="h-4 w-4" />
                    {t('rd_add')}
                </Button>
            </div>

            {/* Choices */}
            <div className="border-border overflow-hidden rounded-xl border">
                {isLoading ? (
                    <ListSkeleton rows={3} />
                ) : ordered.length === 0 ? (
                    <EmptyPane icon={ListChecks} text={t('rd_empty')} />
                ) : (
                    <ul>
                        {ordered.map((o, i) => {
                            const name = rowLabel(o);
                            return (
                                <li
                                    key={o.id}
                                    draggable
                                    onDragStart={(e) => {
                                        setDragId(o.id);
                                        e.dataTransfer.effectAllowed = 'move';
                                        // Firefox needs a payload to start a drag
                                        e.dataTransfer.setData('text/plain', String(o.id));
                                    }}
                                    onDragEnter={() => dragOver(o.id)}
                                    onDragOver={(e) => e.preventDefault()}
                                    // Only dragEnd saves, so a drop never sends the order twice
                                    onDrop={(e) => e.preventDefault()}
                                    onDragEnd={dropped}
                                    className={cn(
                                        'group border-border flex items-center gap-3 border-b px-3 py-2 transition-[background-color,box-shadow] select-none last:border-b-0',
                                        dragId === o.id && 'ring-brand/40 bg-card relative z-10 shadow-md ring-1',
                                    )}
                                >
                                    <GripVertical
                                        className="text-muted-foreground/40 group-hover:text-muted-foreground h-4 w-4 shrink-0 cursor-grab transition-colors active:cursor-grabbing"
                                        aria-hidden
                                    />

                                    <p className={cn('min-w-0 flex-1 truncate text-sm font-medium', !o.active && 'text-muted-foreground')}>
                                        {name}
                                        {/* English fallback marker */}
                                        {lang === 'th' && !o.label_th && (
                                            <span className="text-muted-foreground ml-2 text-xs font-normal">{t('rd_untranslated')}</span>
                                        )}
                                    </p>

                                    {!o.active && <StatusBadge tone="gray">{t('rd_hidden')}</StatusBadge>}

                                    {/* Keyboard reorder */}
                                    <div className="flex shrink-0 gap-0.5">
                                        <IconBtn
                                            label={fill(t('rd_move_up_aria'), { name })}
                                            title={t('rd_move_up')}
                                            disabled={i === 0}
                                            onClick={() => moveTo(i, i - 1)}
                                        >
                                            <ArrowUp className="h-3.5 w-3.5" />
                                        </IconBtn>
                                        <IconBtn
                                            label={fill(t('rd_move_down_aria'), { name })}
                                            title={t('rd_move_down')}
                                            disabled={i === ordered.length - 1}
                                            onClick={() => moveTo(i, i + 1)}
                                        >
                                            <ArrowDown className="h-3.5 w-3.5" />
                                        </IconBtn>
                                    </div>

                                    <div className="flex shrink-0 gap-1">
                                        <IconBtn label={fill(t('rd_edit_aria'), { name })} title={t('edit')} onClick={() => setEditing(o)}>
                                            <Pencil className="h-3.5 w-3.5" />
                                        </IconBtn>
                                        <IconBtn
                                            label={fill(t('rd_delete_aria'), { name })}
                                            title={t('delete')}
                                            className="hover:text-destructive"
                                            onClick={async () => {
                                                const ok = await confirm({
                                                    variant: 'danger',
                                                    entity: { name: o.label_en, sub: o.label_th ?? undefined },
                                                    description: t('rd_delete_desc'),
                                                });
                                                if (!ok) return;
                                                // 409 = still used by a request
                                                remove.mutateAsync(o.id).catch((e) => toastDeleteError(e, t));
                                            }}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </IconBtn>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            <OptionModal
                open={adding || editing !== null}
                option={editing}
                list={active}
                saving={create.isPending || update.isPending}
                onClose={() => {
                    setAdding(false);
                    setEditing(null);
                }}
                onSave={async (form) => {
                    if (editing) {
                        await update.mutateAsync({ id: editing.id, ...form });
                    } else if (active) {
                        await create.mutateAsync({ request_type: active.request_type, field_key: active.field_key, ...form });
                    }
                }}
            />
        </>
    );
}

/** Square icon button for the row's reorder, edit and delete controls. */
function IconBtn({
    children,
    onClick,
    disabled,
    label,
    title,
    className,
}: {
    children: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
    label: string;
    title?: string;
    className?: string;
}) {
    return (
        <button
            type="button"
            aria-label={label}
            title={title ?? label}
            disabled={disabled}
            onClick={onClick}
            className={cn(
                'text-muted-foreground hover:bg-muted hover:text-foreground flex h-8 w-8 cursor-pointer items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-40',
                className,
            )}
        >
            {children}
        </button>
    );
}

interface OptionForm {
    label_en: string;
    label_th: string;
    active: boolean;
}

/** Seed the dialog from an existing choice (edit) or blank + offered (create). */
function optionSeed(option: RequestOption | null): OptionForm {
    return { label_en: option?.label_en ?? '', label_th: option?.label_th ?? '', active: option?.active ?? true };
}

/** Add / edit one choice: the two labels and whether it is offered. */
function OptionModal({
    open,
    option,
    list,
    saving,
    onClose,
    onSave,
}: {
    open: boolean;
    option: RequestOption | null;
    list: RequestOptionList | null;
    saving: boolean;
    onClose: () => void;
    onSave: (form: OptionForm) => Promise<void>;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const [form, setForm] = useState<OptionForm>(() => optionSeed(null));
    const [err, setErr] = useState('');
    const [saved, setSaved] = useState(false);
    const closeAfterSave = useCloseAfterSave(open, onClose);

    const initialForm = useMemo(() => optionSeed(option), [option]);
    const isDirty = !saved && JSON.stringify(form) !== JSON.stringify(initialForm);
    const guardClose = useDiscardGuard(open && isDirty);

    useEffect(() => {
        if (!open) return;
        setErr('');
        setSaved(false);
        setForm(optionSeed(option));
    }, [open, option]);

    const submit = async () => {
        if (saving || saved) return;
        if (!form.label_en.trim()) {
            setErr(t('set_err_required'));
            return;
        }
        try {
            await onSave({ ...form, label_en: form.label_en.trim(), label_th: form.label_th.trim() });
            setSaved(true);
            closeAfterSave();
        } catch (e) {
            useToastStore.getState().push(errorMessage(e, t('md_save_failed')), 'error', t('cd_error_title'));
        }
    };

    const submitOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && guardClose(onClose)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{option ? t('rd_edit') : t('rd_add')}</DialogTitle>
                    {list && (
                        <DialogDescription className="flex flex-wrap gap-x-3">
                            <span>{t(REQUEST_TYPE_META[list.request_type].labelKey)}</span>
                            <span>{lang === 'th' ? list.label_th : list.label_en}</span>
                        </DialogDescription>
                    )}
                </DialogHeader>

                <div className="space-y-4">
                    <Field label={t('rd_label_en')} required error={err} name="label_en">
                        <Input
                            autoFocus
                            value={form.label_en}
                            onChange={(e) => {
                                setForm((f) => ({ ...f, label_en: e.target.value }));
                                if (err) setErr('');
                            }}
                            onKeyDown={submitOnEnter}
                            placeholder={t('rd_label_en_ph')}
                        />
                    </Field>
                    <Field label={t('rd_label_th')} name="label_th">
                        <Input
                            value={form.label_th}
                            onChange={(e) => setForm((f) => ({ ...f, label_th: e.target.value }))}
                            onKeyDown={submitOnEnter}
                            placeholder={t('rd_label_th_ph')}
                        />
                    </Field>
                    <Field label={t('status')} name="active">
                        <div className="border-input flex h-10 items-center justify-between rounded-lg border px-3">
                            <span className="text-sm">{form.active ? t('rd_active') : t('rd_hidden')}</span>
                            <Switch aria-label={t('status')} checked={form.active} onChange={(v) => setForm((f) => ({ ...f, active: v }))} />
                        </div>
                    </Field>
                    <p className="text-muted-foreground text-xs">{option ? t('rd_rename_safe') : t('rd_new_at_end')}</p>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => guardClose(onClose)} disabled={saving}>
                        {t('cancel')}
                    </Button>
                    <SaveButton loading={saving} success={saved} onClick={submit} />
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
