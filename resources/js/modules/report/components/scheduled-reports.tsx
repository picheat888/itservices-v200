/**
 * "รายงานที่ตั้งเวลาไว้" in the Report Center's right rail, laid out like the exports card above
 * it: a tile (the file type, with a clock), then three lines each split left | right — report |
 * on/off switch, to whom | send now / edit / delete icons, when it goes out | next send — and a
 * red line when the last send failed. With none yet the same card says so; a
 * schedule is set from a report page's "ตั้งเวลาส่ง" button. Data: useReportSchedules
 * (GET /api/reports/schedules).
 */
import { useT } from '@/lang';
import { refusalText } from '@/shared/lib/api-errors';
import { formatDateTime } from '@/shared/lib/datetime';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Switch } from '@/shared/ui/switch';
import { useToastStore } from '@/stores/toast';
import { CalendarClock, Clock, Mail, Pencil, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useDeleteSchedule, useReportCatalogue, useReportSchedules, useSendScheduleNow, useUpdateSchedule } from '../hooks/use-reports';
import type { ReportScheduleItem } from '../types';
import { RailHeading } from './my-exports';
import { reportStem } from './report-catalogue';
import { hourLabel, scheduleCoverage, ScheduleReportDialog } from './schedule-report-dialog';

function ScheduleRow({ item, onEdit }: { item: ReportScheduleItem; onEdit: () => void }) {
    const t = useT();
    const confirm = useConfirm();
    const update = useUpdateSchedule();
    const remove = useDeleteSchedule();
    const sendNow = useSendScheduleNow();
    const title = t(`rep_${reportStem(item.report_key)}_title`);

    const toast = (message: string, tone: 'success' | 'error') => useToastStore.getState().push(message, tone);

    const onToggle = (active: boolean) =>
        update.mutate({ id: item.id, patch: { active } }, { onError: (e) => toast(refusalText(e, t, 'rep_schedule_refusal_'), 'error') });

    const onSendNow = () =>
        sendNow.mutate(item.id, {
            onSuccess: () => toast(t('rep_schedules_sent_now').replace('{n}', String(item.recipients.length)), 'success'),
            onError: (e) => toast(refusalText(e, t, 'rep_schedule_refusal_'), 'error'),
        });

    const onDelete = async () => {
        const ok = await confirm({
            variant: 'danger',
            entity: { name: title, sub: t(`rep_schedule_freq_${item.frequency}`) },
            action: () => remove.mutateAsync(item.id),
        });
        if (ok) useToastStore.getState().push(t('rep_schedules_deleted'), 'error', undefined, 'trash', { duration: 4000 });
    };

    // "ทุกวันจันทร์ · 07:00" — the day it goes out and the hour.
    const when = `${t(`rep_schedule_freq_${item.frequency}_when`)} · ${hourLabel(item.send_hour)}`;
    const recipients =
        item.recipients.length === 1
            ? item.recipients[0]
            : t('rep_schedules_recipients')
                  .replace('{first}', item.recipients[0])
                  .replace('{n}', String(item.recipients.length - 1));
    const failed = item.last_status === 'failed';
    const lastSent = item.last_run_at && !failed ? t('rep_schedules_last_sent').replace('{t}', formatDateTime(item.last_run_at)) : undefined;
    const iconButton = 'text-muted-foreground hover:text-foreground h-7 w-7';

    return (
        <div className="border-border flex gap-3 border-b px-4 py-3 last:border-b-0">
            {/* The file it sends, marked with a clock: a schedule, where an export row is a file. */}
            <span
                className={cn(
                    'flex min-h-12 w-11 shrink-0 flex-col items-center justify-center gap-1.5 self-stretch rounded-md border',
                    item.format === 'xlsx'
                        ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'border-red-500/25 bg-red-500/10 text-red-600 dark:text-red-400',
                    !item.active && 'opacity-50',
                )}
            >
                <span className="font-mono text-[10px] leading-none font-bold uppercase">{item.format}</span>
                <Clock className="text-muted-foreground h-3 w-3" />
            </span>

            {/* Three lines, each read left to right: the report | its switch; to whom | what can be
                done; when it goes out | the next send. A paused row fades, its switch does not. */}
            <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
                <div className={cn('truncate text-sm font-semibold', !item.active && 'opacity-60')} title={title}>
                    {title}
                </div>
                <div className="flex justify-end" title={t('rep_schedules_active')}>
                    <Switch checked={item.active} onChange={onToggle} disabled={update.isPending} aria-label={t('rep_schedules_active')} />
                </div>

                <div
                    className={cn('text-muted-foreground flex min-w-0 items-center gap-1 text-[11px]', !item.active && 'opacity-60')}
                    title={item.recipients.join(', ')}
                >
                    <Mail className="h-3 w-3 shrink-0" />
                    <span className="truncate">{recipients}</span>
                </div>
                {/* Icons only — the name and the tooltip say what each does. */}
                <div className="-my-1 -mr-1.5 flex items-center justify-end">
                    <Button
                        size="icon"
                        variant="ghost"
                        onClick={onSendNow}
                        disabled={!item.active || sendNow.isPending}
                        aria-label={t('rep_schedules_send_now')}
                        title={t('rep_schedules_send_now')}
                        className="text-brand hover:text-brand h-7 w-7"
                    >
                        <Send className="h-4 w-4" />
                    </Button>
                    <Button
                        size="icon"
                        variant="ghost"
                        onClick={onEdit}
                        aria-label={t('rep_schedules_edit')}
                        title={t('rep_schedules_edit')}
                        className={iconButton}
                    >
                        <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                        size="icon"
                        variant="ghost"
                        onClick={onDelete}
                        aria-label={t('rep_schedules_delete')}
                        title={t('rep_schedules_delete')}
                        className={cn(iconButton, 'hover:text-destructive')}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>

                <div className={cn('text-foreground/75 truncate text-xs', !item.active && 'opacity-60')}>{when}</div>
                <div className={cn('text-muted-foreground text-right text-[11px] whitespace-nowrap', !item.active && 'opacity-60')} title={lastSent}>
                    {item.active ? t('rep_schedules_next').replace('{t}', formatDateTime(item.next_run_at)) : t('rep_schedules_paused')}
                </div>

                {failed && item.last_run_at && (
                    <div className="text-destructive col-span-2 text-[11px]">
                        {t('rep_schedules_last_failed').replace('{t}', formatDateTime(item.last_run_at))}
                        {item.last_error && ` - ${t(`rep_schedules_err_${item.last_error}`)}`}
                    </div>
                )}
            </div>
        </div>
    );
}

export function ScheduledReports() {
    const t = useT();
    const { data: items = [] } = useReportSchedules();
    const { data: catalogue = [] } = useReportCatalogue();
    const update = useUpdateSchedule();
    const [editing, setEditing] = useState<ReportScheduleItem | null>(null);
    // The last schedule opened, kept while the dialog animates closed so it does not blank.
    const [shown, setShown] = useState<ReportScheduleItem | null>(null);

    const formats = (key: string) => catalogue.find((r) => r.key === key)?.formats ?? ['pdf'];

    // One card either way — the same heading, then the schedules or a line saying there are none
    // (as the exports card above does).
    return (
        <Card id="scheduled-reports" className="overflow-hidden">
            <RailHeading icon={CalendarClock} title={t('rep_schedules_title')} note={t('rep_schedules_sub')} />
            {items.length === 0 && <p className="text-muted-foreground px-[18px] py-8 text-center text-sm">{t('rep_schedules_empty')}</p>}
            {items.map((item) => (
                <ScheduleRow
                    key={item.id}
                    item={item}
                    onEdit={() => {
                        setEditing(item);
                        setShown(item);
                    }}
                />
            ))}
            {shown && (
                <ScheduleReportDialog
                    open={editing !== null}
                    onOpenChange={(open) => !open && setEditing(null)}
                    title={t(`rep_${reportStem(shown.report_key)}_title`)}
                    formats={formats(shown.report_key)}
                    // The ticket overview keeps from/to too, so the stored filter names answer for every report.
                    coverage={scheduleCoverage(Object.keys(shown.filters))}
                    initial={shown}
                    onSubmit={(input) => update.mutateAsync({ id: shown.id, patch: input })}
                    isPending={update.isPending}
                    error={update.error}
                    onReset={update.reset}
                />
            )}
        </Card>
    );
}
