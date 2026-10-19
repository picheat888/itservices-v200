/**
 * "รายงานที่ตั้งส่งอัตโนมัติ" in the Report Center's right rail, laid out like the exports card above
 * it: a tile (the file type, with a clock), then three lines each split left | right — report |
 * on/off switch, to whom | send now / edit / delete icons, when it goes out | next send — and a
 * red line when the last send failed. With none yet the same card says so; a
 * schedule is set from a report page's "ตั้งเวลาส่ง" button. Data: useReportSchedules
 * (GET /api/reports/schedules).
 */
import { useT } from '@/lang';
import { DisabledReason } from '@/shared/components/disabled-reason';
import { EmptyState } from '@/shared/components/empty-state';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { refusalText } from '@/shared/lib/api-errors';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Switch } from '@/shared/ui/switch';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';
import { CalendarClock, Clock, Mail, Pencil, Send, Settings2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useReportRights } from '../hooks/use-report-rights';
import {
    useDeleteSchedule,
    useReportCatalogue,
    useReportSchedules,
    useSendScheduleNow,
    useTabularDefinition,
    useTicketOverview,
    useUpdateSchedule,
} from '../hooks/use-reports';
import { defaultTicketReportFilters } from '../hooks/use-ticket-report-filters';
import type { ReportScheduleItem, TicketReportFilters } from '../types';
import { ManageSchedulesDialog } from './manage-schedules-dialog';
import { RailHeading, RailHeadingSkeleton, RailRowsSkeleton } from './my-exports';
import { reportStem } from './report-catalogue';
import { tabularFilterChips, ticketFilterChips } from './schedule-filter-summary';
import { hourLabel, scheduleCoverage, ScheduleReportDialog } from './schedule-report-dialog';

function ScheduleRow({ item, opens, onEdit }: { item: ReportScheduleItem; opens: boolean; onEdit: () => void }) {
    const fmt = useDateFormat();
    const t = useT();
    const fmtN = useNumberFormat();
    const confirm = useConfirm();
    const update = useUpdateSchedule();
    const remove = useDeleteSchedule();
    const sendNow = useSendScheduleNow();
    const { canSchedule } = useReportRights();
    const noRight = canSchedule ? null : t('rep_no_schedule_right');
    // Pause, edit and send also need the report itself, as UpdateReportScheduleRequest and sendNow check.
    const canAct = canSchedule && opens;
    const actReason = noRight ?? (opens ? null : t('rep_no_report_right'));
    const title = t(`rep_${reportStem(item.report_key)}_title`);

    const toast = (message: string, tone: 'success' | 'error') => useToastStore.getState().push(message, tone);

    const onToggle = (active: boolean) =>
        update.mutate({ id: item.id, patch: { active } }, { onError: (e) => toast(refusalText(e, t, 'rep_schedule_refusal_'), 'error') });

    const onSendNow = () =>
        sendNow.mutate(item.id, {
            onSuccess: () => toast(t('rep_schedules_sent_now').replace('{n}', fmtN(item.recipients.length)), 'success'),
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

    // "ทุกวันจันทร์  07:00" — the day it goes out and the hour, spaced apart.
    const when = (
        <>
            {t(`rep_schedule_freq_${item.frequency}_when`)}
            <span className="ml-2">{hourLabel(item.send_hour)}</span>
        </>
    );
    const recipients =
        item.recipients.length === 1
            ? item.recipients[0]
            : t('rep_schedules_recipients')
                  .replace('{first}', item.recipients[0])
                  .replace('{n}', fmtN(item.recipients.length - 1));
    const failed = item.last_status === 'failed';
    const lastSent = item.last_run_at && !failed ? t('rep_schedules_last_sent').replace('{t}', fmt.dateTime(item.last_run_at)) : undefined;
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
                <span className="text-[10px] leading-none font-bold uppercase">{item.format}</span>
                <Clock className="text-muted-foreground h-3 w-3" />
            </span>

            {/* Three lines, each read left to right: the report | its switch; to whom | what can be
                done; when it goes out | the next send. A paused row fades, its switch does not. */}
            <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
                <div className={cn('truncate text-sm font-semibold', !item.active && 'opacity-60')} title={title}>
                    {title}
                </div>
                <div className="flex justify-end" title={t('rep_schedules_active')}>
                    <DisabledReason reason={actReason} label={t('rep_schedules_active')}>
                        <Switch
                            checked={item.active}
                            onChange={onToggle}
                            disabled={update.isPending || !canAct}
                            aria-label={t('rep_schedules_active')}
                        />
                    </DisabledReason>
                </div>

                <div
                    className={cn('text-muted-foreground flex min-w-0 items-center gap-1 text-xs', !item.active && 'opacity-60')}
                    title={item.recipients.join(', ')}
                >
                    <Mail className="h-3 w-3 shrink-0" />
                    <span className="truncate">{recipients}</span>
                </div>
                {/* Icons only — the name and the tooltip say what each does. */}
                <div className="-my-1 -mr-1.5 flex items-center justify-end">
                    <DisabledReason reason={actReason} label={t('rep_schedules_send_now')}>
                        <Button
                            size="icon"
                            variant="ghost"
                            onClick={onSendNow}
                            disabled={!item.active || sendNow.isPending || !canAct}
                            aria-label={t('rep_schedules_send_now')}
                            title={canAct ? t('rep_schedules_send_now') : undefined}
                            className="text-brand hover:text-brand h-7 w-7"
                        >
                            <Send className="h-4 w-4" />
                        </Button>
                    </DisabledReason>
                    <DisabledReason reason={actReason} label={t('rep_schedules_edit')}>
                        <Button
                            size="icon"
                            variant="ghost"
                            onClick={onEdit}
                            disabled={!canAct}
                            aria-label={t('rep_schedules_edit')}
                            title={canAct ? t('rep_schedules_edit') : undefined}
                            className={iconButton}
                        >
                            <Pencil className="h-4 w-4" />
                        </Button>
                    </DisabledReason>
                    <DisabledReason reason={noRight} label={t('rep_schedules_delete')}>
                        <Button
                            size="icon"
                            variant="ghost"
                            onClick={onDelete}
                            disabled={!canSchedule}
                            aria-label={t('rep_schedules_delete')}
                            title={canSchedule ? t('rep_schedules_delete') : undefined}
                            className={cn(iconButton, 'hover:text-destructive')}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </DisabledReason>
                </div>

                <div className={cn('text-foreground/75 truncate text-xs', !item.active && 'opacity-60')}>{when}</div>
                <div className={cn('text-muted-foreground text-right text-xs', !item.active && 'opacity-60')} title={lastSent}>
                    {item.active ? t('rep_schedules_next').replace('{t}', fmt.dateTime(item.next_run_at)) : t('rep_schedules_paused')}
                </div>

                {failed && item.last_run_at && (
                    <div className="text-destructive col-span-2 text-xs">
                        {t('rep_schedules_last_failed').replace('{t}', fmt.dateTime(item.last_run_at))}
                        {item.last_error && ` - ${t(`rep_schedules_err_${item.last_error}`)}`}
                    </div>
                )}
            </div>
        </div>
    );
}

export function ScheduledReports() {
    const t = useT();
    const { data: items = [], isLoading } = useReportSchedules();
    const { data: catalogue = [], isSuccess: catalogueLoaded } = useReportCatalogue();
    const update = useUpdateSchedule();
    const [editing, setEditing] = useState<ReportScheduleItem | null>(null);
    const { canManageSchedules } = useReportRights();
    const [managing, setManaging] = useState(false);
    // The last schedule opened, kept while the dialog animates closed so it does not blank.
    const [shown, setShown] = useState<ReportScheduleItem | null>(null);

    const formats = (key: string) => catalogue.find((r) => r.key === key)?.formats ?? ['pdf'];

    // Names for the filters the open schedule keeps: a tabular report labels them from its
    // definition, the Ticket & SLA page from its own department / assignee options.
    const lang = useUiStore((s) => s.lang);
    const isTicket = shown?.report_key === 'tickets.overview';
    const definition = useTabularDefinition(shown && !isTicket ? shown.report_key : '', !!shown && !isTicket).data;
    const ticketFilters = { ...defaultTicketReportFilters(), ...(isTicket ? shown?.filters : {}) } as TicketReportFilters;
    const ticketOptions = useTicketOverview(ticketFilters, !!shown && isTicket).data?.options;
    const filterChips = !shown
        ? undefined
        : isTicket
          ? ticketFilterChips(shown.filters, ticketOptions, t, lang)
          : definition
            ? tabularFilterChips(definition, shown.filters, t, lang)
            : undefined;

    // One card either way — the same heading, then the schedules or a line saying there are none
    // (as the exports card above does).
    return (
        <Card id="scheduled-reports" className="overflow-hidden">
            {isLoading ? (
                <RailHeadingSkeleton note={false} />
            ) : (
                <RailHeading
                    icon={CalendarClock}
                    title={t('rep_schedules_title')}
                    action={
                        canManageSchedules ? (
                            <button
                                type="button"
                                onClick={() => setManaging(true)}
                                className="focus-visible:ring-brand text-brand inline-flex items-center gap-1 rounded-sm font-medium transition-colors hover:underline focus-visible:ring-2 focus-visible:outline-none"
                            >
                                <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
                                {t('rep_manage')}
                            </button>
                        ) : undefined
                    }
                />
            )}
            {canManageSchedules && <ManageSchedulesDialog open={managing} onOpenChange={setManaging} />}
            {isLoading && <RailRowsSkeleton rows={2} />}
            {!isLoading && items.length === 0 && (
                <EmptyState kind="empty" title={t('rep_empty_center_schedules')} hint={t('rep_empty_center_schedules_hint')} />
            )}
            {items.map((item) => (
                <ScheduleRow
                    key={item.id}
                    item={item}
                    opens={!catalogueLoaded || catalogue.some((r) => r.key === item.report_key)}
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
                    filterChips={filterChips}
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
