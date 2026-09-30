/**
 * "รายงานที่ตั้งเวลาไว้" on the Report Center: the reader's scheduled report emails — how
 * often and to whom, when the next one goes out, how the last one went — with edit, pause /
 * resume, send now and delete. Hidden while there are none; a schedule is set from a
 * report page's "ตั้งเวลาส่ง" button. Data: useReportSchedules (GET /api/reports/schedules).
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
import { CalendarClock, Pencil, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useDeleteSchedule, useReportCatalogue, useReportSchedules, useSendScheduleNow, useUpdateSchedule } from '../hooks/use-reports';
import type { ReportScheduleItem } from '../types';
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

    const when = `${t(`rep_schedule_freq_${item.frequency}`)} · ${hourLabel(item.send_hour)}`;
    const recipients =
        item.recipients.length === 1
            ? item.recipients[0]
            : t('rep_schedules_recipients')
                  .replace('{first}', item.recipients[0])
                  .replace('{n}', String(item.recipients.length - 1));

    return (
        <div className={cn('border-border flex flex-wrap items-center gap-3 border-b px-5 py-3 last:border-b-0', !item.active && 'opacity-60')}>
            <span
                className={cn(
                    'flex h-10 w-9 shrink-0 items-center justify-center rounded font-mono text-[10px] font-bold uppercase',
                    item.format === 'xlsx'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'bg-red-500/10 text-red-600 dark:text-red-400',
                )}
            >
                {item.format}
            </span>
            <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{title}</div>
                <div className="text-muted-foreground truncate text-xs">
                    {when} · {recipients}
                </div>
                <div className="text-muted-foreground text-xs">
                    {item.active ? t('rep_schedules_next').replace('{t}', formatDateTime(item.next_run_at)) : t('rep_schedules_paused')}
                    {item.last_run_at && (
                        <>
                            {' · '}
                            <span className={item.last_status === 'failed' ? 'text-destructive' : undefined}>
                                {(item.last_status === 'failed' ? t('rep_schedules_last_failed') : t('rep_schedules_last_sent')).replace(
                                    '{t}',
                                    formatDateTime(item.last_run_at),
                                )}
                                {item.last_status === 'failed' && item.last_error && ` - ${t(`rep_schedules_err_${item.last_error}`)}`}
                            </span>
                        </>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-1">
                <Switch checked={item.active} onChange={onToggle} disabled={update.isPending} aria-label={t('rep_schedules_active')} />
                <Button
                    size="icon"
                    variant="ghost"
                    onClick={onSendNow}
                    disabled={!item.active || sendNow.isPending}
                    aria-label={t('rep_schedules_send_now')}
                    title={t('rep_schedules_send_now')}
                >
                    <Send className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={onEdit} aria-label={t('rep_schedules_edit')} title={t('rep_schedules_edit')}>
                    <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={onDelete} aria-label={t('rep_schedules_delete')} title={t('rep_schedules_delete')}>
                    <Trash2 className="h-4 w-4" />
                </Button>
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

    if (items.length === 0) return null;

    const formats = (key: string) => catalogue.find((r) => r.key === key)?.formats ?? ['pdf'];

    return (
        <Card id="scheduled-reports" className="overflow-hidden">
            <div className="bg-muted border-border flex items-center gap-2.5 border-b px-5 py-3">
                <span className="bg-brand/10 text-brand flex h-7 w-7 items-center justify-center rounded-md">
                    <CalendarClock className="h-4 w-4" />
                </span>
                <span className="font-semibold">{t('rep_schedules_title')}</span>
                <span className="text-muted-foreground text-xs">{t('rep_schedules_sub')}</span>
            </div>
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
