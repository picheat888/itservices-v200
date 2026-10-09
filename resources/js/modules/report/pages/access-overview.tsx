// "ภาพรวมสิทธิ์การเข้าถึง" report page (/reports/access-overview): shared tabular body + AccessOverviewCards + its own register cells.
import { useT } from '@/lang';
import { StatusBadge } from '@/shared/components/status-badge';
import { useUiStore } from '@/stores/ui';
import { Link } from 'react-router-dom';
import { ACCESS_TYPES, AccessOverviewCards, AccessStateSegments, AccessTypeSegments, TypeLabel } from '../components/access-overview-cards';
import { TabularReportView } from '../components/tabular-report-view';
import { shortDate } from '../components/transfer-cards';
import { useCanOpen } from '../hooks/use-can-open';
import type { AccessType, ChartLabel } from '../types';

type Row = Record<string, unknown> & { _links?: Record<string, string> };

/** Columns drawn inside the employee, resource and status cells — kept in the rows and files. */
const INNER = ['employee_code', 'resource_code', 'resource_detail', 'resource_department', 'left_days', 'revoked_at', 'revoked_by'];

const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown) => (typeof v === 'number' ? v : null);
const isLabel = (v: unknown): v is ChartLabel => typeof v === 'object' && v !== null && 'name' in v;

function None() {
    return <span className="text-muted-foreground">—</span>;
}

/** The holder's name (opening them on the Employees page) with their code under it. */
function EmployeeCell({ row }: { row: Row }) {
    const canOpen = useCanOpen();
    const href = row._links?.employee;
    const name = str(row.employee);
    if (!name) return <None />;
    return (
        <div className="min-w-0">
            {href && canOpen(href) ? (
                <Link
                    to={href}
                    className="text-brand focus-visible:ring-brand block max-w-[14rem] truncate rounded-sm font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
                    title={name}
                >
                    {name}
                </Link>
            ) : (
                <div className="max-w-[14rem] truncate font-medium" title={name}>
                    {name}
                </div>
            )}
            <div className="text-muted-foreground font-mono text-xs">{str(row.employee_code)}</div>
        </div>
    );
}

/** The resource's name, with its code and address under it. */
function ResourceCell({ row }: { row: Row }) {
    const name = str(row.resource);
    if (!name) return <None />;
    const sub = [str(row.resource_code), str(row.resource_detail)].filter((s): s is string => Boolean(s));
    return (
        <div className="min-w-0">
            <div className="max-w-[16rem] truncate font-medium" title={name}>
                {name}
            </div>
            <div className="text-muted-foreground flex max-w-[16rem] gap-x-3 text-xs" title={sub.join('\n')} translate="no">
                {sub.map((part) => (
                    <span key={part} className="truncate">
                        {part}
                    </span>
                ))}
            </div>
        </div>
    );
}

function TypeCell({ type }: { type: unknown }) {
    return ACCESS_TYPES.includes(type as AccessType) ? <TypeLabel type={type as AccessType} /> : <None />;
}

function LevelCell({ level }: { level: unknown }) {
    const t = useT();
    if (level === 'Read' || level === 'Write') return <span>{t(`rep_ac_level_${String(level).toLowerCase()}`)}</span>;
    return <span className="text-muted-foreground">{t('rep_ac_level_member')}</span>;
}

/** In use; in use across departments (the pair); held by a leaver; or revoked, when and by whom. */
function StatusCell({ row }: { row: Row }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const department = row.resource_department;
    switch (row.status) {
        case 'cross':
            return (
                <span
                    className="inline-flex whitespace-nowrap"
                    title={isLabel(department) ? t('rep_ac_cross_of').replace('{dept}', (lang === 'th' && department.name_th) || department.name || '') : undefined}
                >
                    <StatusBadge tone="green" className="rounded-r-none">
                        {t('rep_ac_status_active')}
                    </StatusBadge>
                    <StatusBadge tone="amber" className="rounded-l-none">
                        {t('rep_ac_status_cross_short')}
                    </StatusBadge>
                </span>
            );
        case 'left': {
            const days = num(row.left_days);
            return <StatusBadge tone="red">{days === null ? t('rep_ac_left_no_date') : t('rep_ac_left_days').replace('{n}', String(days))}</StatusBadge>;
        }
        case 'revoked': {
            const at = str(row.revoked_at);
            const by = str(row.revoked_by);
            return (
                <div>
                    <StatusBadge tone="gray">{at ? t('rep_ac_revoked_on').replace('{date}', shortDate(at, lang)) : t('rep_ac_status_revoked')}</StatusBadge>
                    {by && <div className="text-muted-foreground mt-0.5 text-xs">{t('rep_ac_revoked_by').replace('{name}', by)}</div>}
                </div>
            );
        }
        case 'active':
            return <StatusBadge tone="green">{t('rep_ac_status_active')}</StatusBadge>;
        default:
            return <None />;
    }
}

function accessCell(key: string, row: Row) {
    if (key === 'employee') return <EmployeeCell row={row} />;
    if (key === 'resource') return <ResourceCell row={row} />;
    if (key === 'resource_type') return <TypeCell type={row.resource_type} />;
    if (key === 'level') return <LevelCell level={row.level} />;
    if (key === 'status') return <StatusCell row={row} />;
    return undefined;
}

export default function AccessOverviewReportPage() {
    return (
        <TabularReportView
            reportKey="access.overview"
            extras={{
                tiles: 5,
                // The type filter sits at the head of the bar as segments; active / revoked narrows only the register.
                hiddenFilters: ['type', 'state'],
                innerColumns: INNER,
                filterLead: ({ filters, patch }) => <AccessTypeSegments filters={filters} patch={patch} />,
                rowsLead: ({ filters, patch }) => <AccessStateSegments filters={filters} patch={patch} />,
                beforeTable: ({ filters }) => <AccessOverviewCards filters={filters} />,
                rowsTitle: 'rep_ac_rows_title',
                rowClassName: (row) => (row.status === 'left' ? 'bg-red-500/5' : undefined),
                renderCell: accessCell,
            }}
        />
    );
}
