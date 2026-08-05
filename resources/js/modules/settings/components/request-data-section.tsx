import { useT } from '@/lang';
import { Field } from '@/shared/components/field';
import { ListSkeleton } from '@/shared/components/skeletons';
import { StatusBadge } from '@/shared/components/status-badge';
import { toastDeleteError } from '@/shared/lib/api-errors';
import { REQUEST_TYPE_META } from '@/shared/lib/request-meta';
import { cn } from '@/shared/lib/utils';
import type { RequestOption, RequestOptionList } from '@/shared/types';
import { Button } from '@/shared/ui/button';
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
 * Rows show one label — the active UI language, same as every other master-data
 * list, so the topbar's language button switches this screen too. Both labels are
 * edited together in the dialog. Rows sit in the order the request form offers
 * them, and dragging a row changes that order.
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
            {/* Which list, as sub-tabs — the same shape every other settings section
                uses for its sub-sections. A second bordered card with its own 220px
                nav sat inside the settings shell's own nav and read as a panel
                stranded in a panel. */}
            <div className="border-border mb-4 flex flex-wrap gap-1 border-b pb-3">
                {lists.map((l) => {
                    const key = `${l.request_type}.${l.field_key}`;
                    const on = key === listKey;
                    return (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setListKey(key)}
                            className={cn(
                                'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                                on ? 'bg-brand text-white' : 'text-muted-foreground hover:bg-accent/50',
                            )}
                        >
                            {/* The service name alone — each service has one managed list,
                                so naming the field again said nothing new. */}
                            {t(REQUEST_TYPE_META[l.request_type].labelKey)}
                            <span className={cn('font-mono text-[11px]', on ? 'text-white/70' : 'text-muted-foreground/70')}>
                                {counts.get(key) ?? 0}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Toolbar: what the rows do on the left, what you can add on the right —
                the layout DataTable gives every other list on this page. */}
            <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    {reorder.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                    {ordered.length > 1 && (reorder.isPending ? t('rd_saving_order') : t('rd_drag_hint'))}
                </p>
                <Button disabled={!active} onClick={() => setAdding(true)}>
                    <Plus className="h-4 w-4" />
                    {t('rd_add')}
                </Button>
            </div>

            {/* The choices, in the order the request form offers them. */}
            <div className="border-border overflow-hidden rounded-xl border">
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

                                <p className={cn('min-w-0 flex-1 truncate text-sm font-medium', !o.active && 'text-muted-foreground')}>
                                    {(lang === 'th' ? o.label_th : o.label_en) || o.label_en}
                                    {/* Falling back to the English label: say so, rather than
                                                    letting it pass as the Thai one. */}
                                    {lang === 'th' && !o.label_th && (
                                        <span className="text-muted-foreground ml-2 text-[11px] font-normal">{t('rd_untranslated')}</span>
                                    )}
                                </p>

                                {!o.active && <StatusBadge tone="gray">{t('rd_hidden')}</StatusBadge>}

                                {/* Keyboard route to the same reordering the grip offers. */}
                                <div className="flex shrink-0 flex-col gap-0.5">
                                    <IconBtn label={t('rd_move_up')} disabled={i === 0} onClick={() => moveTo(i, i - 1)}>
                                        <ArrowUp className="h-3.5 w-3.5" />
                                    </IconBtn>
                                    <IconBtn label={t('rd_move_down')} disabled={i === ordered.length - 1} onClick={() => moveTo(i, i + 1)}>
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
                                            // 409 = a request already points at it; same
                                            // "still in use by N records" toast as every
                                            // other master-data list.
                                            remove.mutateAsync(o.id).catch((e) => toastDeleteError(e, t));
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
