// "ภาพรวมคำขอ" report page (/reports/requests-overview): shared tabular body + RequestOverviewCards + the request list cells.
import { useT } from '@/lang';
import { StatusBadge } from '@/shared/components/status-badge';
import { REQUEST_ONBOARDING_BADGE, REQUEST_ONBOARDING_ROW, REQUEST_STATUS_META } from '@/shared/lib/request-meta';
import type { ServiceRequestStatus } from '@/shared/types';
import { useUiStore } from '@/stores/ui';
import { count, deptName } from '../components/access-parts';
import { RequestOverviewCards } from '../components/request-overview-cards';
import { TabularReportView } from '../components/tabular-report-view';

/** Columns drawn inside the type, requester and days cells — kept in the rows and files. */
const INNER = ['origin', 'employee_code', 'department', 'open_days'];

type Row = Record<string, unknown>;

/** The type, with the violet "พนักงานใหม่" badge when HR filed it for a new employee. */
function TypeCell({ row }: { row: Row }) {
    const t = useT();
    return (
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
            {t(`req_${row.request_type as string}`)}
            {row.origin === 'onboarding' && <StatusBadge tone={REQUEST_ONBOARDING_BADGE.tone}>{t(REQUEST_ONBOARDING_BADGE.labelKey)}</StatusBadge>}
        </span>
    );
}

/** Name on top; employee code and department muted under it. */
function RequesterCell({ row }: { row: Row }) {
    const lang = useUiStore((s) => s.lang);
    const department = row.department as { name: string; name_th: string | null } | null;
    return (
        <span className="block min-w-0">
            <span translate="no" className="block max-w-56 truncate font-medium">
                {row.requester as string}
            </span>
            <span className="text-muted-foreground flex gap-2.5 text-xs whitespace-nowrap">
                {row.employee_code ? <span>{row.employee_code as string}</span> : null}
                {department && <span className="truncate">{deptName(department, lang)}</span>}
            </span>
        </span>
    );
}

function StatusCell({ status }: { status: ServiceRequestStatus }) {
    const t = useT();
    const meta = REQUEST_STATUS_META[status];
    return meta ? <StatusBadge tone={meta.tone}>{t(meta.labelKey)}</StatusBadge> : null;
}

/** Whole days submitted → completed; still open: days so far, muted. */
function DaysCell({ row }: { row: Row }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    if (typeof row.total_days === 'number') {
        return (
            <span className="whitespace-nowrap">
                <b className="font-semibold tabular-nums">{count(row.total_days, lang)}</b> {t('rep_days')}
            </span>
        );
    }
    if (typeof row.open_days === 'number') {
        return (
            <span className="text-muted-foreground whitespace-nowrap">
                {row.open_days < 1 ? t('rep_rqo_today') : t('rep_rqo_open_n').replace('{n}', count(row.open_days, lang))}
            </span>
        );
    }
    return <span className="text-muted-foreground">—</span>;
}

function requestCell(key: string, row: Row) {
    if (key === 'request_type') return <TypeCell row={row} />;
    if (key === 'requester') return <RequesterCell row={row} />;
    if (key === 'status') return <StatusCell status={row.status as ServiceRequestStatus} />;
    if (key === 'total_days') return <DaysCell row={row} />;
    return undefined;
}

export default function RequestsOverviewReportPage() {
    return (
        <TabularReportView
            reportKey="requests.overview"
            extras={{
                tiles: 5,
                innerColumns: INNER,
                beforeTable: ({ filters }) => <RequestOverviewCards filters={filters} />,
                rowsTitle: 'rep_rqo_rows_title',
                rowClassName: (row) => (row.origin === 'onboarding' ? REQUEST_ONBOARDING_ROW : undefined),
                renderCell: requestCell,
            }}
        />
    );
}
