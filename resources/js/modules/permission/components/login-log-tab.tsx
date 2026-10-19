// Login tab: the server-paged sign-in log on the shared DataTable, with an event filter and a date range.
import { useT } from '@/lang';
import { deviceLine, loginEventWords, type LoginEventRow } from '@/modules/auth';
import { DataTable, type Column } from '@/shared/components/data-table';
import { DateTimeCell } from '@/shared/components/date-time-cell';
import { LoadFailed } from '@/shared/components/load-failed';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { TruncText } from '@/shared/components/trunc-text';
import { useDateColumnWidth } from '@/shared/hooks/use-date-column-width';
import { useDebouncedSearch } from '@/shared/hooks/use-debounced-search';
import { useListParams } from '@/shared/hooks/use-list-params';
import { localName } from '@/shared/lib/local-name';
import { cn } from '@/shared/lib/utils';
import { DateRangeInput } from '@/shared/ui/date-range-input';
import { useUiStore } from '@/stores/ui';
import { X } from 'lucide-react';
import { useLoginEvents } from '../hooks/use-permissions';
import { LOGIN_EVENT_FILTERS, readLoginEvent, readLoginRange } from '../lib/login-log-params';

const ALL = 'all';
const FAILED_TEXT = 'text-red-700 dark:text-destructive';
const RANGE_ACTIVE = 'border-brand/50 bg-brand/5 text-brand font-medium';

/** Who the row is about: the account's name and username, or the name typed for an account nobody owns. */
function LoginUserCell({ row }: { row: LoginEventRow }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);

    if (row.user) {
        return (
            <div className="min-w-0">
                <TruncText text={localName(row.user, lang)} className="font-medium" />
                <TruncText text={row.user.username} className="text-muted-foreground text-xs" />
            </div>
        );
    }

    return (
        <div className="min-w-0">
            <TruncText text={t('login_reason_unknown_account')} className="text-muted-foreground" />
            {row.login_name && <TruncText text={row.login_name} className="text-xs" />}
        </div>
    );
}

/** The event word with its reason line under it; wrong passwords and locks read in destructive text. */
function LoginEventCell({ row }: { row: LoginEventRow }) {
    const t = useT();
    const { event, reason, failed } = loginEventWords(row, t);

    return (
        <div className="min-w-0">
            <TruncText text={event} className={cn('font-medium', failed && FAILED_TEXT)} />
            {reason && <TruncText text={reason} className={cn('text-xs', failed ? FAILED_TEXT : 'text-muted-foreground')} />}
        </div>
    );
}

export function LoginLogTab() {
    const t = useT();
    const dateWidth = useDateColumnWidth();
    // Search, filters, page and rows-per-page live in the URL (?search, event, from, to, page, per).
    const list = useListParams();
    const { page, perPage } = list;
    const search = list.get('search');
    const event = readLoginEvent(list.get('event'));
    const range = readLoginRange(list.get('from'), list.get('to'));
    const sentSearch = useDebouncedSearch(search);
    const hasFilter = event !== '' || range !== null;

    const { data, isLoading, isFetching, isPlaceholderData, isError, refetch } = useLoginEvents({
        page,
        perPage,
        search: sentSearch,
        event,
        from: range?.from,
        to: range?.to,
    });
    // A failed refetch keeps the rows on screen
    const failed = isError && !data;
    const rows = failed ? [] : (data?.data ?? []);

    const clearFilters = () => list.setParams({ event: null, from: null, to: null, page: null });

    const eventOptions = [
        { value: ALL, label: t('perm_login_all_events'), search: '' },
        ...LOGIN_EVENT_FILTERS.map((value) => {
            const label = t(`login_event_${value}`);
            return { value, label, search: label };
        }),
    ];

    const columns: Column<LoginEventRow>[] = [
        {
            key: 'time',
            sticky: 'left',
            header: t('audit_time'),
            width: dateWidth,
            className: 'text-muted-foreground whitespace-nowrap',
            render: (row) => <DateTimeCell value={row.created_at} className="tabular-nums" />,
        },
        {
            key: 'user',
            header: t('audit_user'),
            minWidth: '11rem',
            render: (row) => <LoginUserCell row={row} />,
        },
        {
            key: 'event',
            header: t('perm_login_col_event'),
            width: '200px',
            render: (row) => <LoginEventCell row={row} />,
        },
        {
            key: 'ip',
            header: t('perm_login_col_ip'),
            width: '136px',
            render: (row) => <TruncText text={row.ip} className="tabular-nums" />,
        },
        {
            key: 'place',
            header: t('perm_login_col_place'),
            width: '176px',
            render: (row) => <TruncText text={row.location} />,
        },
        {
            key: 'device',
            header: t('perm_login_col_device'),
            width: '160px',
            render: (row) => (
                <TruncText text={row.os !== null && row.browser !== null ? deviceLine({ os: row.os, browser: row.browser }, t) : null} />
            ),
        },
    ];

    return (
        <div className="p-5">
            <DataTable
                columns={columns}
                rows={rows}
                rowKey={(row) => row.id}
                caption={t('perm_logins')}
                loading={isLoading || (isFetching && isPlaceholderData)}
                searchable={() => ''}
                searchPlaceholder={t('perm_logins_search')}
                search={{ value: search, onChange: (value) => list.setFilter('search', value) }}
                server={{
                    ...list.table.paging,
                    total: failed ? 0 : (data?.meta.total ?? 0),
                }}
                filters={
                    <>
                        <div className="w-44">
                            <label htmlFor="login-filter-event" className="sr-only">
                                {t('perm_login_col_event')}
                            </label>
                            <SearchableSelect
                                id="login-filter-event"
                                active={event !== ''}
                                value={event || ALL}
                                onChange={(value) => list.setFilter('event', value === ALL ? '' : value)}
                                options={eventOptions}
                            />
                        </div>
                        <div>
                            <label htmlFor="login-filter-range" className="sr-only">
                                {t('rep_f_range')}
                            </label>
                            <DateRangeInput
                                id="login-filter-range"
                                from={range?.from ?? ''}
                                to={range?.to ?? ''}
                                maxDate={new Date()}
                                onChange={(from, to) => list.setParams({ from, to, page: null })}
                                className={cn('min-w-44', range && RANGE_ACTIVE)}
                            />
                        </div>
                        {hasFilter && (
                            <button
                                type="button"
                                onClick={clearFilters}
                                className="border-border text-muted-foreground hover:bg-accent hover:text-foreground inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors"
                            >
                                <X className="h-3 w-3" />
                                {t('reset_filters')}
                            </button>
                        )}
                    </>
                }
                emptyState={failed ? <LoadFailed onRetry={() => void refetch()} /> : undefined}
                empty={
                    search !== '' || hasFilter
                        ? { kind: 'search', title: t('perm_empty_logins_search'), hint: t('perm_empty_logins_search_hint') }
                        : { kind: 'empty', title: t('perm_empty_logins'), hint: t('perm_empty_logins_hint') }
                }
            />
        </div>
    );
}
