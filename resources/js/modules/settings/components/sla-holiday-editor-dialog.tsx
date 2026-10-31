// Holiday editor (768): the year's full table with add, delete, copy from last year and paste, saved on its own button.
import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { EmptyState } from '@/shared/components/empty-state';
import { SaveButton } from '@/shared/components/save-button';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useHeldWhileOpen } from '@/shared/hooks/use-held-while-open';
import { useNavigationGuard } from '@/shared/hooks/use-navigation-guard';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { DateInput } from '@/shared/ui/date-input';
import { Dialog, DialogBody, DialogContent, DialogFooterBar, mediumDialogContentClass } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { useToastStore } from '@/stores/toast';
import { CalendarDays, ClipboardPaste, Copy, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { SlaHoliday } from '../api/settingsApi';
import { useSaveFailed, useSaveSlaHolidays } from '../hooks/use-settings';
import {
    fixedDateRows,
    HOLIDAY_NAME_MAX,
    HOLIDAYS_PER_YEAR_MAX,
    isoWeekday,
    rowErrors,
    serverRowErrors,
    tooManyHolidays,
    type HolidayRow,
    type RowError,
} from '../lib/sla-holidays';
import { SlaHolidayPasteDialog } from './sla-holiday-paste-dialog';
import { ErrorSummary, FieldError, fillText, HEAD_ROW, MINI_LABEL, ROW, SLA_ERROR_BORDER, TABLE, type SlaError } from './sla-parts';

const COLS = 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.5rem] @2xl:grid-cols-[10rem_minmax(7rem,0.8fr)_minmax(0,1.6fr)_2.5rem]';
const PASTE_BUTTON_ID = 'hol-paste-btn';
const ADD_BUTTON_ID = 'hol-add-btn';
// The section's edit or add button, which takes focus back on close
export const OPENER_ID = 'hol-edit-btn';

const ERROR_KEY = {
    required: 'set_hol_err_date_required',
    other_year: 'set_hol_err_date_other_year',
    taken: 'set_hol_err_date_taken',
} as const;

const toRow = (h: SlaHoliday): HolidayRow => ({ key: `h${h.id}`, date: h.date, name: h.name });
// Undated rows sort last; equal dates keep their order
const byDate = (a: HolidayRow, b: HolidayRow) => (a.date || '9999').localeCompare(b.date || '9999');

/** Rows added, removed or changed since the editor opened. */
function changeCount(rows: HolidayRow[], base: HolidayRow[]): number {
    const before = new Map(base.map((r) => [r.key, r]));
    const now = new Set(rows.map((r) => r.key));
    const changed = rows.filter((r) => {
        const old = before.get(r.key);
        return !old || old.date !== r.date || old.name !== r.name;
    }).length;
    return changed + base.filter((r) => !now.has(r.key)).length;
}

export function SlaHolidayEditorDialog({
    open,
    year: liveYear,
    saved,
    previousYear,
    workDays,
    onClose,
}: {
    open: boolean;
    year: number;
    saved: SlaHoliday[];
    previousYear: SlaHoliday[];
    workDays: number[];
    onClose: () => void;
}) {
    const t = useT();
    const fmt = useDateFormat();
    const fmtN = useNumberFormat();
    const save = useSaveSlaHolidays();
    const failed = useSaveFailed();
    const year = useHeldWhileOpen(liveYear, open);
    const yearText = fmt.year(year);

    const [rows, setRows] = useState<HolidayRow[]>([]);
    const [base, setBase] = useState<HolidayRow[]>([]);
    const [attempted, setAttempted] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [serverErrors, setServerErrors] = useState<Record<string, RowError>>({});
    const [fresh, setFresh] = useState<Set<string>>(new Set());
    const [pasteOpen, setPasteOpen] = useState(false);
    const nextKey = useRef(1);
    const focusAfter = useRef<string | null>(null);

    // Each opening starts from the saved list; the last rows stay on screen through the close animation
    const [wasOpen, setWasOpen] = useState(false);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) {
            const start = saved.map(toRow);
            setRows(start);
            setBase(start);
            setAttempted(false);
            setServerErrors({});
            setFresh(new Set());
            setPasteOpen(false);
        }
    }

    // Focus moves after the rows it points at are on screen
    useEffect(() => {
        if (!focusAfter.current) return;
        document.getElementById(focusAfter.current)?.focus();
        focusAfter.current = null;
    }, [rows]);

    // Copied or pasted rows fade in once, then drop the class so a re-sort does not replay it
    useEffect(() => {
        if (fresh.size === 0) return;
        const id = window.setTimeout(() => setFresh(new Set()), 1000);
        return () => window.clearTimeout(id);
    }, [fresh]);

    const sorted = useMemo(() => [...rows].sort(byDate), [rows]);
    const changes = changeCount(rows, base);
    const dirty = open && changes > 0;
    const guardClose = useDiscardGuard(dirty);
    useNavigationGuard(dirty, ['holidays_edit']);
    const fixed = fixedDateRows(previousYear, year);

    const errors = useMemo(() => {
        if (!attempted) return {} as Record<string, RowError>;
        const local = rowErrors(sorted, year);
        const merged: Record<string, RowError> = { ...serverErrors };
        for (const [key, error] of Object.entries(local)) merged[key] = { ...merged[key], ...error };
        return merged;
    }, [attempted, sorted, year, serverErrors]);

    const weekdayShort = (iso: string) => t(`set_sla_day_${isoWeekday(iso)}`);
    const rowLabel = (r: HolidayRow) => (r.date ? `${weekdayShort(r.date)} ${fmt.date(r.date)}` : t('set_hol_no_date'));
    const dateMessage = (e?: RowError) => (e?.date ? fillText(t(ERROR_KEY[e.date]), { year: yearText }) : '');
    const nameMessage = (e?: RowError) =>
        e?.name === 'too_long'
            ? fillText(t('set_hol_err_name_too_long'), { max: fmtN(HOLIDAY_NAME_MAX) })
            : e?.name
              ? t('set_hol_err_name_required')
              : '';

    const summary: SlaError[] = sorted.flatMap((r) => {
        const e = errors[r.key];
        if (!e) return [];
        const list: SlaError[] = [];
        if (e.date) list.push({ id: `hol-d-${r.key}`, where: rowLabel(r), message: dateMessage(e) });
        if (e.name) list.push({ id: `hol-n-${r.key}`, where: rowLabel(r), message: nameMessage(e) });
        return list;
    });

    const newKey = () => `n${nextKey.current++}`;
    const append = (added: { date: string; name: string }[]) => {
        const withKeys = added.map((a) => ({ key: newKey(), ...a }));
        setRows((prev) => [...prev, ...withKeys]);
        setFresh(new Set(withKeys.map((r) => r.key)));
        return withKeys;
    };
    const setRow = (key: string, patch: Partial<HolidayRow>) => {
        setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
        setServerErrors((prev) => {
            if (!prev[key]) return prev;
            const rest = { ...prev };
            delete rest[key];
            return rest;
        });
    };
    const addRow = () => {
        const [row] = append([{ date: '', name: '' }]);
        focusAfter.current = `hol-d-${row.key}`;
    };
    const removeRow = (key: string) => {
        const index = sorted.findIndex((r) => r.key === key);
        const neighbour = sorted[index + 1] ?? sorted[index - 1];
        focusAfter.current = neighbour ? `hol-n-${neighbour.key}` : ADD_BUTTON_ID;
        setRows((prev) => prev.filter((r) => r.key !== key));
    };
    const copyFixed = () => {
        append(fixed);
        useToastStore
            .getState()
            .push(fillText(t('set_hol_copied_body'), { year: yearText }), 'success', fillText(t('set_hol_copied'), { n: fmtN(fixed.length) }));
    };
    const addPasted = (pasted: { date: string; name: string }[]) => {
        append(pasted);
        setPasteOpen(false);
        useToastStore.getState().push(t('set_hol_pasted_body'), 'success', fillText(t('set_hol_pasted'), { n: fmtN(pasted.length) }));
    };

    const handleSave = () => {
        setAttempted(true);
        if (Object.keys(rowErrors(sorted, year)).length > 0) {
            setServerErrors({});
            setAttempt((n) => n + 1);
            return;
        }
        const sent = sorted;
        save.mutate(
            { year, holidays: sent.map((r) => ({ date: r.date, name: r.name.trim() })) },
            {
                onSuccess: () => {
                    useToastStore.getState().push(t('set_hol_saved_body'), 'success', fillText(t('set_hol_saved'), { year: yearText }));
                    onClose();
                },
                onError: (error) => {
                    const res = (error as { response?: { status?: number; data?: { errors?: Record<string, string[]> } } })?.response;
                    const fieldErrors = res?.status === 422 ? (res.data?.errors ?? {}) : {};
                    const mapped = serverRowErrors(
                        fieldErrors,
                        sent.map((r) => r.key),
                    );
                    const tooMany = tooManyHolidays(fieldErrors);
                    if (tooMany) {
                        useToastStore
                            .getState()
                            .push(fillText(t('set_hol_err_too_many'), { n: fmtN(HOLIDAYS_PER_YEAR_MAX) }), 'error', t('settings_save_failed_title'));
                    }
                    if (Object.keys(mapped).length === 0) {
                        if (tooMany) {
                            setServerErrors({});
                        } else {
                            failed(error);
                        }
                        return;
                    }
                    setServerErrors(mapped);
                    setAttempt((n) => n + 1);
                },
            },
        );
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && guardClose(onClose)}>
            <DialogContent
                className={mediumDialogContentClass}
                onCloseAutoFocus={(e) => {
                    e.preventDefault();
                    document.getElementById(OPENER_ID)?.focus();
                }}
            >
                <FocusDialogHeader
                    icon={CalendarDays}
                    eyebrow={fillText(t('set_hol_year'), { year: yearText })}
                    title={t('set_hol_editor_title')}
                    srDescription={t('set_hol_desc')}
                />
                <DialogBody className="@container space-y-3 py-4">
                    {summary.length > 0 && <ErrorSummary key={attempt} errors={summary} attempt={attempt} />}

                    {rows.length === 0 ? (
                        <div className={TABLE}>
                            <EmptyState
                                title={fillText(t('set_hol_empty'), { year: yearText })}
                                hint={fillText(t('set_hol_empty_hint'), { year: yearText })}
                                className="min-h-[220px]"
                            >
                                {fixed.length > 0 && (
                                    <Button type="button" variant="outline" onClick={copyFixed} className="h-auto min-h-10 whitespace-normal">
                                        <Copy aria-hidden />
                                        {fillText(t('set_hol_copy'), { prev: fmt.year(year - 1), n: fmtN(fixed.length) })}
                                    </Button>
                                )}
                                <Button id={PASTE_BUTTON_ID} type="button" variant="outline" onClick={() => setPasteOpen(true)}>
                                    <ClipboardPaste aria-hidden />
                                    {t('set_hol_paste')}
                                </Button>
                                <Button id={ADD_BUTTON_ID} type="button" variant="outline" onClick={addRow}>
                                    <Plus aria-hidden />
                                    {t('set_hol_add')}
                                </Button>
                            </EmptyState>
                        </div>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-muted-foreground text-sm">{fillText(t('set_hol_days'), { n: fmtN(rows.length) })}</span>
                                <Button id={PASTE_BUTTON_ID} type="button" variant="outline" onClick={() => setPasteOpen(true)}>
                                    <ClipboardPaste aria-hidden />
                                    {t('set_hol_paste')}
                                </Button>
                            </div>
                            <div role="table" aria-label={fillText(t('set_hol_year'), { year: yearText })} className={TABLE}>
                                <div role="row" className={cn(ROW, HEAD_ROW, COLS)}>
                                    <span role="columnheader">{t('set_hol_col_date')}</span>
                                    <span role="columnheader">{t('set_hol_col_day')}</span>
                                    <span role="columnheader">{t('set_hol_col_name')}</span>
                                    <span role="columnheader">
                                        <span className="sr-only">{t('delete')}</span>
                                    </span>
                                </div>
                                {sorted.map((r) => {
                                    const e = errors[r.key];
                                    const label = r.name.trim() || t('set_hol_no_name');
                                    const weekday = r.date ? isoWeekday(r.date) : null;
                                    return (
                                        <div key={r.key} role="row" className={cn(ROW, COLS, 'items-start', fresh.has(r.key) && 'row-in')}>
                                            <div role="cell">
                                                <span aria-hidden className={MINI_LABEL}>
                                                    {t('set_hol_col_date')}
                                                </span>
                                                <label htmlFor={`hol-d-${r.key}`} className="sr-only">
                                                    {fillText(t('set_hol_aria_date'), { name: label })}
                                                </label>
                                                <DateInput
                                                    id={`hol-d-${r.key}`}
                                                    value={r.date}
                                                    onChange={(date) => setRow(r.key, { date })}
                                                    aria-invalid={!!e?.date || undefined}
                                                    aria-describedby={e?.date ? `hol-d-${r.key}-error` : undefined}
                                                    className={cn(e?.date && SLA_ERROR_BORDER)}
                                                />
                                                <FieldError id={`hol-d-${r.key}-error`} message={dateMessage(e)} />
                                            </div>
                                            <div role="cell" className="text-muted-foreground flex min-h-10 flex-col justify-center text-sm">
                                                <span aria-hidden className={MINI_LABEL}>
                                                    {t('set_hol_col_day')}
                                                </span>
                                                {weekday === null ? '—' : t(`set_sla_day_full_${weekday}`)}
                                                {weekday !== null && !workDays.includes(weekday) && (
                                                    <span className="text-xs text-amber-700 dark:text-amber-400">{t('set_hol_weekly_off')}</span>
                                                )}
                                            </div>
                                            <div role="cell" className="col-span-2 row-start-2 @2xl:col-span-1 @2xl:row-start-auto">
                                                <label htmlFor={`hol-n-${r.key}`} className="sr-only">
                                                    {fillText(t('set_hol_aria_name'), { date: r.date ? fmt.date(r.date) : '' })}
                                                </label>
                                                <Input
                                                    id={`hol-n-${r.key}`}
                                                    value={r.name}
                                                    onChange={(ev) => setRow(r.key, { name: ev.target.value })}
                                                    maxLength={HOLIDAY_NAME_MAX}
                                                    autoComplete="off"
                                                    aria-invalid={!!e?.name || undefined}
                                                    aria-describedby={e?.name ? `hol-n-${r.key}-error` : undefined}
                                                    className={cn(e?.name && SLA_ERROR_BORDER)}
                                                />
                                                <FieldError id={`hol-n-${r.key}-error`} message={nameMessage(e)} />
                                            </div>
                                            <div role="cell" className="col-start-3 row-start-1 @2xl:col-start-auto @2xl:row-start-auto">
                                                <button
                                                    type="button"
                                                    onClick={() => removeRow(r.key)}
                                                    aria-label={fillText(t('set_hol_aria_delete'), { name: label })}
                                                    className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive grid h-10 w-10 place-items-center rounded-md"
                                                >
                                                    <Trash2 className="h-4 w-4" aria-hidden />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                                <div role="row" className={cn(ROW, 'py-1.5')}>
                                    <div role="cell">
                                        <Button id={ADD_BUTTON_ID} type="button" variant="ghost" onClick={addRow}>
                                            <Plus aria-hidden />
                                            {t('set_hol_add')}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </DialogBody>
                <DialogFooterBar className="flex-wrap">
                    {changes > 0 && (
                        <span className="text-muted-foreground mr-auto text-sm">{fillText(t('set_hol_changes'), { n: fmtN(changes) })}</span>
                    )}
                    <Button type="button" variant="outline" onClick={() => guardClose(onClose)}>
                        {t('cancel')}
                    </Button>
                    <SaveButton type="button" onClick={handleSave} loading={save.isPending} disabled={changes === 0}>
                        {t('set_hol_save')}
                    </SaveButton>
                </DialogFooterBar>

                <SlaHolidayPasteDialog
                    open={pasteOpen}
                    year={year}
                    existing={rows.map((r) => r.date).filter(Boolean)}
                    onClose={() => setPasteOpen(false)}
                    onAdd={addPasted}
                    returnFocusTo={PASTE_BUTTON_ID}
                />
            </DialogContent>
        </Dialog>
    );
}
