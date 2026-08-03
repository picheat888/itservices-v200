import { useT } from '@/lang';
import { Field } from '@/shared/components/field';
import { ListSkeleton } from '@/shared/components/skeletons';
import { StatusBadge } from '@/shared/components/status-badge';
import { REQUEST_TYPE_META } from '@/shared/lib/request-meta';
import { cn } from '@/shared/lib/utils';
import type { RequestOption, RequestOptionList } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Switch } from '@/shared/ui/switch';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';
import { ArrowDown, ArrowUp, GripVertical, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useRequestOptionLists, useRequestOptionMutations } from '../hooks/use-master-data';

/**
 * Settings → Master data → Request data.
 *
 * The choice lists behind the request form's managed selects, laid out the way
 * the Permission module lays out role templates: the lists down the left, the
 * selected list's choices on the right. Which lists exist is declared
 * server-side (RequestSchemas `managed`), so this screen never hardcodes them.
 *
 * Both labels are editable; the stored code is generated once and shown in the
 * edit dialog only, because submitted requests reference it. Rows sit in the
 * order the request form offers them, and dragging a row changes that order.
 */
export function RequestDataSection() {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const confirm = useConfirm();
    const { data, isLoading } = useRequestOptionLists();
    const { create, update, remove, reorder } = useRequestOptionMutations();

    // Memoised so the identity is stable between renders — the effect below and
    // the lookups depend on it.
    const lists = useMemo(() => data?.lists ?? [], [data]);
    const [listKey, setListKey] = useState('');
    // Land on the first list once it arrives, and never point at a list that went away.
    useEffect(() => {
        if (!lists.length) return;
        const keys = lists.map((l) => `${l.request_type}.${l.field_key}`);
        if (!keys.includes(listKey)) setListKey(keys[0]);
    }, [lists, listKey]);

    const active: RequestOptionList | null = useMemo(
        () => lists.find((l) => `${l.request_type}.${l.field_key}` === listKey) ?? null,
        [lists, listKey],
    );
    const rows = useMemo(
        () => (data?.options ?? []).filter((o) => active && o.request_type === active.request_type && o.field_key === active.field_key),
        [data, active],
    );
    /** How many choices each list holds, for the counts down the left. */
    const counts = useMemo(() => {
        const map = new Map<string, number>();
        for (const o of data?.options ?? []) {
            const key = `${o.request_type}.${o.field_key}`;
            map.set(key, (map.get(key) ?? 0) + 1);
        }
        return map;
    }, [data]);

    const [editing, setEditing] = useState<RequestOption | null>(null);
    const [adding, setAdding] = useState(false);

    const onError = (e: unknown) => {
        const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
        useToastStore.getState().push(msg ?? t('md_save_failed'), 'error');
    };

    // Row order lives here while a drag is in progress so the rows can shift
    // under the cursor; the server order takes over again the moment it lands.
    const [order, setOrder] = useState<number[]>([]);
    const [dragId, setDragId] = useState<number | null>(null);
    useEffect(() => {
        if (dragId === null) setOrder(rows.map((o) => o.id));
    }, [rows, dragId]);

    // Whatever `order` knows about, in its order, then anything it has not heard
    // of yet (a choice just added) — so a new row never blinks out of the list.
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

    /** Move a row to another index and save the list's new order. */
    const moveTo = (from: number, to: number) => {
        if (to < 0 || to >= ordered.length || from === to) return;
        const ids = ordered.map((o) => o.id);
        ids.splice(to, 0, ids.splice(from, 1)[0]);
        setOrder(ids);
        persist(ids);
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

    return (
        <>
            {/* Geometry matched to the DataTable frame the sibling master-data tabs
                render, so switching tabs does not shift the content's outline. */}
            <Card className="overflow-hidden rounded-xl shadow-none">
                <div className="border-border flex items-center justify-between gap-3 border-b p-3">
                    <span className="text-muted-foreground text-sm">{t('rd_list_note')}</span>
                    <Button disabled={!active} onClick={() => setAdding(true)}>
                        <Plus className="h-4 w-4" />
                        {t('rd_add')}
                    </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[220px_1fr]">
                    {/* Which list — the request type it serves, and the field it fills. */}
                    <div className="border-border border-b md:border-r md:border-b-0">
                        {isLoading ? (
                            <ListSkeleton rows={3} />
                        ) : (
                            lists.map((l) => {
                                const key = `${l.request_type}.${l.field_key}`;
                                const on = key === listKey;
                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => setListKey(key)}
                                        className={cn(
                                            'border-border hover:bg-accent/50 flex w-full items-center gap-2 border-b px-4 py-3 text-left transition-colors last:border-b-0',
                                            on && 'bg-brand/10',
                                        )}
                                    >
                                        <span className="min-w-0 flex-1">
                                            <span className={cn('block truncate text-sm font-semibold', on && 'text-brand')}>
                                                {t(REQUEST_TYPE_META[l.request_type].labelKey)}
                                            </span>
                                            <span className="text-muted-foreground block truncate text-xs">
                                                {lang === 'th' ? l.label_th : l.label_en}
                                            </span>
                                        </span>
                                        <span className="text-muted-foreground font-mono text-xs">{counts.get(key) ?? 0}</span>
                                    </button>
                                );
                            })
                        )}
                    </div>

                    {/* Its choices, in the order the request form offers them — held in
                        their own frame so the set reads as one object, not as rows
                        bleeding into the card. */}
                    <div className="min-w-0 p-4">
                        <div className="border-border overflow-hidden rounded-lg border">
                            {isLoading ? (
                                <ListSkeleton rows={3} />
                            ) : ordered.length === 0 ? (
                                <p className="text-muted-foreground px-4 py-12 text-center text-sm">{t('rd_empty')}</p>
                            ) : (
                                <ul>
                                    {ordered.map((o, i) => (
                                        <li
                                            key={o.id}
                                            draggable
                                            onDragStart={(e) => {
                                                setDragId(o.id);
                                                e.dataTransfer.effectAllowed = 'move';
                                                // Firefox refuses to start a drag without payload.
                                                e.dataTransfer.setData('text/plain', String(o.id));
                                            }}
                                            onDragEnter={() => dragOver(o.id)}
                                            onDragOver={(e) => e.preventDefault()}
                                            // Only dragEnd saves. It fires exactly once per drag, where
                                            // dragEnd plus drop would send the same order twice.
                                            onDrop={(e) => e.preventDefault()}
                                            onDragEnd={dropped}
                                            className={cn(
                                                'group border-border flex items-center gap-3 border-b px-3 py-2.5 transition-shadow select-none last:border-b-0',
                                                // The row lifts out of the list only while it is carried.
                                                dragId === o.id && 'ring-brand/40 bg-card relative z-10 shadow-md ring-1',
                                            )}
                                        >
                                            <GripVertical className="text-muted-foreground/40 group-hover:text-muted-foreground h-4 w-4 shrink-0 cursor-grab transition-colors active:cursor-grabbing" />

                                            <div className="min-w-0 flex-1">
                                                <p className={cn('truncate text-sm font-medium', !o.active && 'text-muted-foreground')}>
                                                    {(lang === 'th' ? o.label_th || o.label_en : o.label_en) || '—'}
                                                </p>
                                                {(lang === 'th' ? o.label_en : o.label_th) && (
                                                    <p className="text-muted-foreground truncate text-xs">
                                                        {lang === 'th' ? o.label_en : o.label_th}
                                                    </p>
                                                )}
                                            </div>

                                            {!o.active && <StatusBadge tone="gray">{t('rd_hidden')}</StatusBadge>}

                                            {/* Keyboard route to the same reordering the grip offers. */}
                                            <div className="flex shrink-0 flex-col gap-0.5">
                                                <IconBtn label={t('rd_move_up')} disabled={i === 0} onClick={() => moveTo(i, i - 1)}>
                                                    <ArrowUp className="h-3.5 w-3.5" />
                                                </IconBtn>
                                                <IconBtn
                                                    label={t('rd_move_down')}
                                                    disabled={i === ordered.length - 1}
                                                    onClick={() => moveTo(i, i + 1)}
                                                >
                                                    <ArrowDown className="h-3.5 w-3.5" />
                                                </IconBtn>
                                            </div>

                                            <div className="flex shrink-0 gap-1">
                                                <IconBtn label={t('edit')} className="h-8 w-8" onClick={() => setEditing(o)}>
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </IconBtn>
                                                <IconBtn
                                                    label={t('delete')}
                                                    className="hover:text-destructive h-8 w-8"
                                                    onClick={async () => {
                                                        const ok = await confirm({
                                                            variant: 'danger',
                                                            entity: { name: o.label_en, sub: o.label_th ?? undefined },
                                                            description: t('rd_delete_desc'),
                                                        });
                                                        if (!ok) return;
                                                        remove.mutateAsync(o.id).catch(onError);
                                                    }}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </IconBtn>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        {ordered.length > 1 && (
                            <p className="text-muted-foreground mt-2 flex items-center gap-1.5 text-xs">
                                {reorder.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                                {reorder.isPending ? t('rd_saving_order') : t('rd_drag_hint')}
                            </p>
                        )}
                    </div>
                </div>
            </Card>

            <OptionModal
                open={adding || editing !== null}
                option={editing}
                list={active}
                busy={create.isPending || update.isPending}
                onClose={() => {
                    setAdding(false);
                    setEditing(null);
                }}
                onSave={async (form) => {
                    try {
                        if (editing) {
                            await update.mutateAsync({ id: editing.id, ...form });
                        } else if (active) {
                            await create.mutateAsync({ request_type: active.request_type, field_key: active.field_key, ...form });
                        }
                        setAdding(false);
                        setEditing(null);
                    } catch (e) {
                        onError(e);
                    }
                }}
            />
        </>
    );
}

/** Square icon button for the row's reorder and edit controls. */
function IconBtn({
    children,
    onClick,
    disabled,
    label,
    className,
}: {
    children: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
    label: string;
    className?: string;
}) {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            disabled={disabled}
            onClick={onClick}
            className={cn(
                'text-muted-foreground hover:bg-muted hover:text-foreground flex h-6 w-7 cursor-pointer items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-40',
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

/** Add / edit one choice: the two labels and whether it is offered. */
function OptionModal({
    open,
    option,
    list,
    busy,
    onClose,
    onSave,
}: {
    open: boolean;
    option: RequestOption | null;
    list: RequestOptionList | null;
    busy: boolean;
    onClose: () => void;
    onSave: (form: OptionForm) => void;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const [form, setForm] = useState<OptionForm>({ label_en: '', label_th: '', active: true });
    const [err, setErr] = useState('');

    useEffect(() => {
        if (!open) return;
        setErr('');
        setForm({
            label_en: option?.label_en ?? '',
            label_th: option?.label_th ?? '',
            active: option?.active ?? true,
        });
    }, [open, option]);

    const submit = () => {
        if (!form.label_en.trim()) {
            setErr(lang === 'th' ? 'จำเป็นต้องกรอก' : 'Required');
            return;
        }
        onSave({ ...form, label_en: form.label_en.trim(), label_th: form.label_th.trim() });
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-[440px]">
                <DialogTitle className="text-[15px] font-bold">{option ? t('rd_edit') : t('rd_add')}</DialogTitle>
                {list && (
                    <p className="text-muted-foreground -mt-2 text-xs">
                        {t(REQUEST_TYPE_META[list.request_type].labelKey)} · {lang === 'th' ? list.label_th : list.label_en}
                    </p>
                )}

                <div className="space-y-4">
                    <Field label={t('rd_label_en')} required error={err} name="label_en">
                        <Input
                            autoFocus
                            value={form.label_en}
                            onChange={(e) => {
                                setForm((f) => ({ ...f, label_en: e.target.value }));
                                if (err) setErr('');
                            }}
                            placeholder="Monitor"
                        />
                    </Field>
                    <Field label={t('rd_label_th')} name="label_th">
                        <Input value={form.label_th} onChange={(e) => setForm((f) => ({ ...f, label_th: e.target.value }))} placeholder="จอภาพ" />
                    </Field>
                    <Field label={t('status')} name="active">
                        <div className="border-input flex h-10 items-center justify-between rounded-lg border px-3">
                            <span className="text-sm">{form.active ? t('rd_active') : t('rd_hidden')}</span>
                            <Switch checked={form.active} onChange={(v) => setForm((f) => ({ ...f, active: v }))} />
                        </div>
                    </Field>
                    <p className="text-muted-foreground text-xs">{option ? t('rd_rename_safe') : t('rd_new_at_end')}</p>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={busy}>
                        {t('cancel')}
                    </Button>
                    <Button onClick={submit} disabled={busy}>
                        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                        {t('save')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
