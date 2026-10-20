/**
 * "จัดการ" dialog on the "รายงานที่ตั้งส่งอัตโนมัติ" card, for an admin with reports.schedule_manage:
 * everyone's scheduled report emails in a table; a row opens a detail panel that slides over the
 * table, where the admin pauses or resumes, deletes, or takes one recipient off (never the last).
 */
import { useT } from '@/lang';
import { DataTable, type Column } from '@/shared/components/data-table';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { DisabledReason } from '@/shared/components/disabled-reason';
import { FilterPopover } from '@/shared/components/filter-popover';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { StatusBadge, ToneDot } from '@/shared/components/status-badge';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { refusalText } from '@/shared/lib/api-errors';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogContent, focusDialogContentClass, focusDialogOnOpen } from '@/shared/ui/dialog';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';
import { CalendarClock, Filter, Mail, Pause, Play, Trash2, UserMinus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useManagedSchedules, useManageSchedule } from '../hooks/use-reports';
import type { ManagedScheduleItem } from '../types';
import { reportStem } from './report-catalogue';
import { hourLabel } from './schedule-report-dialog';

type StatusFilter = 'all' | 'active' | 'paused' | 'failed';

const REFUSAL = 'rep_manage_refusal_';

function useLabels() {
    const t = useT();
    const lang = useUiStore((s) => s.lang);

    return {
        report: (item: ManagedScheduleItem) => t(`rep_${reportStem(item.report_key)}_title`),
        when: (item: ManagedScheduleItem) => `${t(`rep_schedule_freq_${item.frequency}_when`)} ${hourLabel(item.send_hour)}`,
        department: (item: ManagedScheduleItem) => {
            const d = item.owner.department;
            return d ? (lang === 'th' ? d.name_th || d.name : d.name) : null;
        },
        outside: (item: ManagedScheduleItem) => item.recipient_list.filter((r) => !r.has_account).length,
    };
}

/** The last send in a word: sent, failed, paused, or never. */
function LastSend({ item }: { item: ManagedScheduleItem }) {
    const t = useT();
    const fmt = useDateFormat();
    if (!item.active) return <StatusBadge tone="gray">{t('rep_schedules_paused')}</StatusBadge>;
    if (!item.last_run_at) return <span className="text-muted-foreground text-xs">{t('rep_manage_never')}</span>;
    const failed = item.last_status === 'failed';

    return (
        <div className="space-y-0.5">
            <StatusBadge tone={failed ? 'red' : 'green'}>{t(failed ? 'rep_manage_status_failed' : 'rep_manage_status_ok')}</StatusBadge>
            <div className="text-muted-foreground text-xs whitespace-nowrap">{fmt.dateTime(item.last_run_at)}</div>
        </div>
    );
}

/** The slide-over: one schedule's details and the admin's actions. */
function ScheduleDetailPanel({ item, onClose }: { item: ManagedScheduleItem | null; onClose: () => void }) {
    const t = useT();
    const fmt = useDateFormat();
    const fmtN = useNumberFormat();
    const confirm = useConfirm();
    const labels = useLabels();
    const { setActive, remove, removeRecipient } = useManageSchedule();
    const toast = useToastStore.getState().push;

    if (!item) return null;
    const title = labels.report(item);
    const filterCount = Object.keys(item.filters ?? {}).length;
    const lastOne = item.recipient_list.length === 1;

    const onToggle = () =>
        setActive.mutate(
            { id: item.id, active: !item.active },
            {
                onSuccess: () => toast(t(item.active ? 'rep_manage_paused_done' : 'rep_manage_resumed_done'), 'success'),
                onError: (e) => toast(refusalText(e, t, REFUSAL), 'error'),
            },
        );

    const onDelete = async () => {
        const ok = await confirm({
            variant: 'danger',
            title: t('rep_manage_delete_title'),
            description: t('rep_manage_delete_desc'),
            entity: { name: title, sub: item.owner.name ?? undefined },
            action: () => remove.mutateAsync(item.id),
        });
        if (ok) {
            onClose();
            toast(t('rep_schedules_deleted'), 'error', undefined, 'trash', { duration: 4000 });
        }
    };

    const onRemoveRecipient = async (email: string, hasAccount: boolean) => {
        const ok = await confirm({
            variant: 'danger',
            icon: UserMinus,
            title: t('rep_manage_remove_title'),
            description: t('rep_manage_remove_desc').replace('{n}', fmtN(item.recipient_list.length - 1)),
            confirmText: t('rep_manage_remove_confirm'),
            entity: {
                name: email,
                sub: t('rep_manage_remove_sub')
                    .replace('{kind}', t(hasAccount ? 'rep_manage_account' : 'rep_manage_outside'))
                    .replace('{report}', title)
                    .replace('{owner}', item.owner.name ?? '-'),
            },
            action: () => removeRecipient.mutateAsync({ id: item.id, email }),
        });
        if (ok) toast(t('rep_manage_removed').replace('{email}', email), 'error', undefined, 'trash', { duration: 4000 });
    };

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                    <div className="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">{item.format}</div>
                    <h3 className="text-base font-bold">{title}</h3>
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onClose} aria-label={t('rep_manage_close_detail')}>
                    <X className="h-4 w-4" />
                </Button>
            </div>

            <dl className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
                <dt className="text-muted-foreground">{t('rep_manage_col_owner')}</dt>
                <dd className="min-w-0">
                    {item.owner.name ?? '-'}
                    {labels.department(item) && <div className="text-muted-foreground text-xs">{labels.department(item)}</div>}
                </dd>
                <dt className="text-muted-foreground">{t('rep_manage_col_when')}</dt>
                <dd>{labels.when(item)}</dd>
                <dt className="text-muted-foreground">{t('rep_manage_d_filters')}</dt>
                <dd>{filterCount === 0 ? t('rep_schedule_filters_none') : t('rep_manage_filters_n').replace('{n}', fmtN(filterCount))}</dd>
                <dt className="text-muted-foreground">{t('rep_manage_d_next')}</dt>
                <dd>{item.active && item.next_run_at ? fmt.dateTime(item.next_run_at) : t('rep_schedules_paused')}</dd>
                <dt className="text-muted-foreground">{t('rep_manage_col_last')}</dt>
                <dd>
                    <LastSend item={item} />
                    {item.last_status === 'failed' && item.last_error && (
                        <div className="text-destructive mt-1 text-xs">{t(`rep_schedules_err_${item.last_error}`)}</div>
                    )}
                </dd>
            </dl>

            {/* Recipients */}
            <div>
                <h4 className="text-muted-foreground mb-2 text-xs font-bold tracking-wide">
                    {t('rep_manage_recipients_n').replace('{n}', fmtN(item.recipient_list.length))}
                </h4>
                <ul className="space-y-1.5">
                    {item.recipient_list.map((r) => (
                        <li key={r.email} className="flex items-center justify-between gap-2 text-sm">
                            <span className="flex min-w-0 items-center gap-1.5">
                                <Mail className="text-muted-foreground h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                <span className="break-all">{r.email}</span>
                            </span>
                            <span className="flex shrink-0 items-center gap-1.5">
                                <StatusBadge tone={r.has_account ? 'gray' : 'amber'} dot={false}>
                                    {t(r.has_account ? 'rep_manage_account' : 'rep_manage_outside')}
                                </StatusBadge>
                                <DisabledReason
                                    reason={lastOne ? t('rep_manage_remove_last') : null}
                                    label={t('rep_manage_remove').replace('{email}', r.email)}
                                >
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="text-muted-foreground hover:text-destructive h-7 w-7"
                                        disabled={lastOne || removeRecipient.isPending}
                                        onClick={() => onRemoveRecipient(r.email, r.has_account)}
                                        aria-label={t('rep_manage_remove').replace('{email}', r.email)}
                                        title={lastOne ? undefined : t('rep_manage_remove').replace('{email}', r.email)}
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </Button>
                                </DisabledReason>
                            </span>
                        </li>
                    ))}
                </ul>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
                <Button variant={item.active ? 'outline' : 'default'} onClick={onToggle} disabled={setActive.isPending}>
                    {item.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    {t(item.active ? 'rep_manage_pause' : 'rep_manage_resume')}
                </Button>
                <Button variant="outline" className="text-destructive hover:text-destructive" onClick={onDelete}>
                    <Trash2 className="h-4 w-4" />
                    {t('rep_manage_delete')}
                </Button>
            </div>
        </div>
    );
}

export function ManageSchedulesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    const t = useT();
    const fmtN = useNumberFormat();
    const labels = useLabels();
    const { data: items = [], isLoading } = useManagedSchedules(open);
    const [query, setQuery] = useState('');
    const [status, setStatus] = useState<StatusFilter>('all');
    const [outsideOnly, setOutsideOnly] = useState(false);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const selected = items.find((s) => s.id === selectedId) ?? null;
    // The last schedule shown, kept while the panel slides closed so it does not blank.
    const [shown, setShown] = useState<ManagedScheduleItem | null>(null);
    useEffect(() => {
        if (selected) setShown(selected);
    }, [selected]);
    useEffect(() => {
        if (!open) setSelectedId(null);
    }, [open]);

    const panelOpen = selected !== null;
    const rows = items.filter((item) => {
        if (outsideOnly && labels.outside(item) === 0) return false;
        if (status === 'active') return item.active;
        if (status === 'paused') return !item.active;
        if (status === 'failed') return item.active && item.last_status === 'failed';
        return true;
    });
    const filterCount = (status !== 'all' ? 1 : 0) + (outsideOnly ? 1 : 0);

    const columns: Column<ManagedScheduleItem>[] = [
        {
            key: 'owner',
            header: t('rep_manage_col_owner'),
            width: '176px',
            render: (item) => (
                <div className="min-w-0">
                    <div className="truncate font-semibold">{item.owner.name ?? '-'}</div>
                    {labels.department(item) && <div className="text-muted-foreground truncate text-xs">{labels.department(item)}</div>}
                </div>
            ),
        },
        {
            key: 'report',
            header: t('rep_manage_col_report'),
            minWidth: '10rem',
            render: (item) => (
                <span className="flex min-w-0 items-center gap-2">
                    <span
                        className={cn(
                            'shrink-0 rounded px-1.5 text-[10px] font-bold uppercase',
                            item.format === 'xlsx'
                                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                : 'bg-red-500/10 text-red-700 dark:text-red-400',
                        )}
                    >
                        {item.format}
                    </span>
                    <span className="truncate">{labels.report(item)}</span>
                </span>
            ),
        },
        {
            key: 'when',
            header: t('rep_manage_col_when'),
            width: '136px',
            hideBelow: 'lg',
            render: (item) => <span className="whitespace-nowrap">{labels.when(item)}</span>,
        },
        {
            key: 'recipients',
            header: t('rep_manage_col_recipients'),
            width: '116px',
            render: (item) => (
                <div className="whitespace-nowrap">
                    <div>{t('rep_manage_people').replace('{n}', fmtN(item.recipient_list.length))}</div>
                    {labels.outside(item) > 0 && (
                        <div className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                            {t('rep_manage_outside_n').replace('{n}', fmtN(labels.outside(item)))}
                        </div>
                    )}
                </div>
            ),
        },
        { key: 'last', header: t('rep_manage_col_last'), width: '136px', render: (item) => <LastSend item={item} /> },
    ];

    const statusOptions: { value: StatusFilter; label: string; tone: 'gray' | 'green' | 'red' | 'violet' }[] = [
        { value: 'all', label: t('rep_manage_status_all'), tone: 'gray' },
        { value: 'active', label: t('rep_manage_status_active'), tone: 'green' },
        { value: 'paused', label: t('rep_schedules_paused'), tone: 'violet' },
        { value: 'failed', label: t('rep_manage_status_failed'), tone: 'red' },
    ];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className={focusDialogContentClass}
                onOpenAutoFocus={focusDialogOnOpen}
                // Escape closes the slide-over first, then the dialog
                onEscapeKeyDown={(e) => {
                    if (panelOpen) {
                        e.preventDefault();
                        setSelectedId(null);
                    }
                }}
            >
                <FocusDialogHeader
                    icon={CalendarClock}
                    eyebrow={t('rep_manage_eyebrow')}
                    title={t('rep_manage_title')}
                    srDescription={t('rep_manage_title')}
                    titleSuffix={
                        <span className="bg-muted text-muted-foreground rounded-md border px-2 text-xs font-semibold">
                            {t('rep_manage_count').replace('{n}', fmtN(items.length))}
                        </span>
                    }
                />

                <div className="border-border relative min-h-0 flex-1 overflow-hidden border-t">
                    <div className="h-full overflow-y-auto px-6 py-4 [--sticky-top:-1rem]">
                        <DataTable
                            columns={columns}
                            rows={rows}
                            rowKey={(item) => item.id}
                            searchable={(item) =>
                                `${item.owner.name ?? ''} ${labels.department(item) ?? ''} ${labels.report(item)} ${item.recipients.join(' ')}`
                            }
                            searchPlaceholder={t('rep_manage_search')}
                            search={{ value: query, onChange: setQuery }}
                            onRowClick={(item) => setSelectedId(item.id === selectedId ? null : item.id)}
                            rowClassName={(item) => (item.id === selectedId ? 'bg-brand/5 shadow-[inset_3px_0_0_var(--color-brand)]' : undefined)}
                            loading={isLoading}
                            pageSize={10}
                            filters={
                                <FilterPopover
                                    count={filterCount}
                                    onClear={() => {
                                        setStatus('all');
                                        setOutsideOnly(false);
                                    }}
                                    resultCount={rows.length}
                                    width={320}
                                >
                                    {() => (
                                        <div className="space-y-3">
                                            <div>
                                                <div className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium">
                                                    <Filter className="h-3.5 w-3.5" />
                                                    {t('rep_manage_filter_status')}
                                                </div>
                                                <SearchableSelect
                                                    active={status !== 'all'}
                                                    value={status}
                                                    onChange={(v) => setStatus(v as StatusFilter)}
                                                    options={statusOptions.map((o) => ({
                                                        value: o.value,
                                                        label: o.label,
                                                        search: o.label,
                                                        icon: <ToneDot tone={o.tone} />,
                                                    }))}
                                                    clearable={false}
                                                />
                                            </div>
                                            <label className="flex cursor-pointer items-center gap-2 text-sm">
                                                <input
                                                    type="checkbox"
                                                    id="manage-schedules-outside"
                                                    className="accent-brand h-4 w-4"
                                                    checked={outsideOnly}
                                                    onChange={(e) => setOutsideOnly(e.target.checked)}
                                                />
                                                {t('rep_manage_filter_outside')}
                                            </label>
                                        </div>
                                    )}
                                </FilterPopover>
                            }
                            empty={
                                query.trim() !== '' || filterCount > 0
                                    ? { kind: 'search', title: t('rep_manage_empty_search'), hint: t('rep_manage_empty_search_hint') }
                                    : { kind: 'empty', title: t('rep_manage_empty'), hint: null }
                            }
                        />
                    </div>

                    {/* The table dims behind the slide-over; rows stay clickable to switch */}
                    <div
                        aria-hidden="true"
                        className={cn(
                            'bg-foreground/5 pointer-events-none absolute inset-0 z-20 transition-opacity duration-200 motion-reduce:transition-none',
                            panelOpen ? 'opacity-100' : 'opacity-0',
                        )}
                    />
                    <aside
                        aria-label={shown ? labels.report(shown) : undefined}
                        aria-hidden={!panelOpen}
                        inert={!panelOpen}
                        className={cn(
                            'bg-card border-border absolute inset-y-0 right-0 z-20 w-full overflow-y-auto border-l p-5 shadow-2xl transition-transform duration-200 motion-reduce:transition-none sm:w-[440px]',
                            panelOpen ? 'translate-x-0' : 'translate-x-full',
                        )}
                    >
                        <ScheduleDetailPanel item={selected ?? shown} onClose={() => setSelectedId(null)} />
                    </aside>
                </div>
            </DialogContent>
        </Dialog>
    );
}
