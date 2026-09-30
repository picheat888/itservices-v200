/**
 * "ตั้งเวลาส่ง" dialog shared by every report page and by the hub's scheduled-reports panel
 * (edit). Picks the file format, how often (daily / weekly / monthly — each run covers the
 * period that just closed), the hour, and the recipients (any addresses). Centered focus
 * dialog (FocusDialogHeader) per the app's dialog standard; the caller owns the mutation
 * (isPending/error/reset) and gets the input through `onSubmit`.
 */
import { useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { refusalText } from '@/shared/lib/api-errors';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { ChoiceCard } from '@/shared/ui/choice-card';
import { Dialog, DialogContent, DialogFooter } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { isAxiosError } from 'axios';
import { CalendarClock, Loader2, X } from 'lucide-react';
import { useEffect, useState, type KeyboardEvent } from 'react';
import type { ExportFormat, ScheduleFrequency, ScheduleInput } from '../types';

/** Mirrors ReportSchedule::MAX_RECIPIENTS. */
const MAX_RECIPIENTS = 10;

const FREQUENCIES: ScheduleFrequency[] = ['daily', 'weekly', 'monthly'];

const HOURS = Array.from({ length: 24 }, (_, h) => h);

// Same shape the server checks with email:rfc, loose enough for every real address.
const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

/**
 * What one run of a report covers, read off its date filters (the same rule the server uses
 * to roll them — ReportScheduleService::filtersFor): `from`/`to` = the period that just
 * closed, a lone `as_of` = the standing at its end, none = the state when the mail goes out.
 */
export type ScheduleCoverage = 'range' | 'as_of' | 'now';

export function scheduleCoverage(dateFilterNames: string[]): ScheduleCoverage {
    if (dateFilterNames.includes('from') || dateFilterNames.includes('to')) return 'range';
    return dateFilterNames.includes('as_of') ? 'as_of' : 'now';
}

export function ScheduleReportDialog({
    open,
    onOpenChange,
    title,
    subtitle,
    formats,
    coverage,
    initial,
    onSubmit,
    isPending,
    error,
    onReset,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    subtitle?: string;
    formats: ExportFormat[];
    coverage: ScheduleCoverage;
    /** An existing schedule being edited; a new one starts from the reader's own address. */
    initial?: ScheduleInput;
    onSubmit: (input: ScheduleInput) => Promise<unknown>;
    isPending: boolean;
    error: unknown;
    onReset: () => void;
}) {
    const t = useT();
    const { user } = useAuth();
    const [format, setFormat] = useState<ExportFormat>(formats[0] ?? 'pdf');
    const [frequency, setFrequency] = useState<ScheduleFrequency>('weekly');
    const [hour, setHour] = useState(7);
    const [recipients, setRecipients] = useState<string[]>([]);
    const [draft, setDraft] = useState('');
    const [draftError, setDraftError] = useState<string | null>(null);

    // Reset the form each time the dialog opens — to the schedule being edited, or to defaults.
    useEffect(() => {
        if (!open) return;
        setFormat(initial?.format ?? formats[0] ?? 'pdf');
        setFrequency(initial?.frequency ?? 'weekly');
        setHour(initial?.send_hour ?? 7);
        setRecipients(initial?.recipients ?? (user?.email ? [user.email] : []));
        setDraft('');
        setDraftError(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only on open
    }, [open]);

    const handleOpenChange = (next: boolean) => {
        if (!next) onReset();
        onOpenChange(next);
    };

    /** Add what is typed; returns the list it produced (or the current one when refused). */
    const commitDraft = (): string[] | null => {
        const value = draft.trim().replace(/[,;]$/, '').toLowerCase();
        if (value === '') return recipients;
        if (!looksLikeEmail(value)) {
            setDraftError(t('rep_schedule_email_invalid'));
            return null;
        }
        if (recipients.length >= MAX_RECIPIENTS) {
            setDraftError(t('rep_schedule_recipients_max').replace('{n}', String(MAX_RECIPIENTS)));
            return null;
        }
        const next = recipients.includes(value) ? recipients : [...recipients, value];
        setRecipients(next);
        setDraft('');
        setDraftError(null);
        return next;
    };

    const onDraftKey = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',' || e.key === ';') {
            e.preventDefault();
            commitDraft();
        } else if (e.key === 'Backspace' && draft === '' && recipients.length > 0) {
            setRecipients(recipients.slice(0, -1));
        }
    };

    const submit = () => {
        const list = commitDraft();
        if (list === null) return;
        if (list.length === 0) {
            setDraftError(t('rep_schedule_recipients_required'));
            return;
        }
        onReset();
        onSubmit({ format, frequency, send_hour: hour, recipients: list })
            .then(() => onOpenChange(false))
            .catch(() => {});
    };

    // A 422 on one address (recipients.2) points at that chip; anything else is one line.
    const fieldErrors = isAxiosError(error) ? ((error.response?.data?.errors ?? {}) as Record<string, string[]>) : {};
    const badIndexes = new Set(
        Object.keys(fieldErrors)
            .map((k) => /^recipients\.(\d+)$/.exec(k)?.[1])
            .filter((i): i is string => i != null)
            .map(Number),
    );
    const recipientsError = draftError ?? (badIndexes.size > 0 || fieldErrors.recipients ? t('rep_schedule_email_invalid') : null);

    const formatChoices: Record<ExportFormat, { title: string; tone: string }> = {
        xlsx: { title: t('rep_export_xlsx'), tone: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
        pdf: { title: t('rep_export_pdf'), tone: 'bg-red-500/10 text-red-600 dark:text-red-400' },
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="max-w-xl p-0">
                <FocusDialogHeader
                    icon={CalendarClock}
                    eyebrow={t('rep_schedule_eyebrow')}
                    title={title}
                    subtitle={subtitle}
                    srDescription={t('rep_schedule_eyebrow')}
                />
                <div className="space-y-5 px-6 pb-2">
                    <div className="space-y-2">
                        <div className="text-muted-foreground text-xs font-semibold">{t('rep_schedule_frequency')}</div>
                        <div className="grid gap-2 sm:grid-cols-3">
                            {FREQUENCIES.map((f) => (
                                <ChoiceCard key={f} selected={frequency === f} onClick={() => setFrequency(f)} className="rounded-lg p-3 text-left">
                                    <span className="block text-sm font-semibold">{t(`rep_schedule_freq_${f}`)}</span>
                                    <span className="text-muted-foreground text-xs">
                                        {t(coverage === 'range' ? `rep_schedule_freq_${f}_desc` : `rep_schedule_freq_${f}_when`)}
                                    </span>
                                </ChoiceCard>
                            ))}
                        </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <div className="text-muted-foreground text-xs font-semibold">{t('rep_schedule_hour')}</div>
                            <Select value={String(hour)} onValueChange={(v) => setHour(Number(v))}>
                                <SelectTrigger aria-label={t('rep_schedule_hour')}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {HOURS.map((h) => (
                                        <SelectItem key={h} value={String(h)}>
                                            {hourLabel(h)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <div className="text-muted-foreground text-xs font-semibold">{t('rep_export_format')}</div>
                            <div className="flex gap-2">
                                {formats.map((f) => (
                                    <ChoiceCard
                                        key={f}
                                        selected={format === f}
                                        onClick={() => setFormat(f)}
                                        className="flex flex-1 items-center gap-2 rounded-lg px-3 py-2 text-left"
                                    >
                                        <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase ${formatChoices[f].tone}`}>
                                            {f}
                                        </span>
                                        <span className="text-sm font-semibold">{formatChoices[f].title}</span>
                                    </ChoiceCard>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="text-muted-foreground flex items-baseline justify-between text-xs font-semibold">
                            <span>{t('rep_schedule_recipients')}</span>
                            <span className="font-mono normal-case">
                                {recipients.length}/{MAX_RECIPIENTS}
                            </span>
                        </div>
                        <div
                            className={cn(
                                'border-input bg-background flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5',
                                recipientsError && 'border-destructive',
                            )}
                        >
                            {recipients.map((r, i) => (
                                <span
                                    key={r}
                                    className={cn(
                                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs',
                                        badIndexes.has(i) ? 'bg-destructive/10 text-destructive' : 'bg-muted',
                                    )}
                                >
                                    {r}
                                    <button
                                        type="button"
                                        onClick={() => setRecipients(recipients.filter((x) => x !== r))}
                                        aria-label={t('rep_schedule_recipient_remove').replace('{email}', r)}
                                        className="hover:text-foreground text-muted-foreground"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </span>
                            ))}
                            <Input
                                value={draft}
                                onChange={(e) => {
                                    setDraft(e.target.value);
                                    setDraftError(null);
                                }}
                                onKeyDown={onDraftKey}
                                onBlur={() => draft.trim() && commitDraft()}
                                placeholder={recipients.length === 0 ? t('rep_schedule_recipients_placeholder') : ''}
                                aria-label={t('rep_schedule_recipients')}
                                aria-invalid={!!recipientsError}
                                className="h-7 min-w-40 flex-1 border-0 px-1 shadow-none focus-visible:ring-0"
                            />
                        </div>
                        {recipientsError ? (
                            <div className="text-destructive text-xs">{recipientsError}</div>
                        ) : (
                            <div className="text-muted-foreground text-xs">{t('rep_schedule_recipients_hint')}</div>
                        )}
                    </div>

                    <div className="bg-brand/5 rounded-lg px-3 py-2 text-sm">
                        {t(`rep_schedule_when_${frequency}`).replace('{time}', hourLabel(hour))}{' '}
                        {t(coverage === 'now' ? 'rep_schedule_cover_now' : `rep_schedule_cover_${coverage}_${frequency}`)}
                        <div className="text-muted-foreground mt-1 text-xs">
                            {t(coverage === 'now' ? 'rep_schedule_filters_note_now' : 'rep_schedule_filters_note')}
                        </div>
                    </div>
                    {error != null && badIndexes.size === 0 && !fieldErrors.recipients && (
                        <div className="text-destructive text-sm">{refusalText(error, t, 'rep_schedule_refusal_')}</div>
                    )}
                </div>
                <DialogFooter className="border-border border-t px-6 py-4">
                    <Button variant="ghost" onClick={() => handleOpenChange(false)}>
                        {t('rep_dialog_cancel')}
                    </Button>
                    <Button onClick={submit} disabled={isPending}>
                        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
                        {initial ? t('rep_schedule_save') : t('rep_schedule_create')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
