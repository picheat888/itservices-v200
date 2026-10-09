/**
 * "การใช้ License ซอฟต์แวร์" — /reports/access-software-licenses
 *
 * Report key access.software_licenses: one row per licence holder under SoftwareLicenseCards (seats per
 * software, leavers, requests waiting). Routed by ../routes.tsx.
 */
import { useT } from '@/lang';
import { type AccessRow, EmployeeCell, StatusCell } from '../components/access-cells';
import { SoftwareLicenseCards, SoftwareListLead, SoftwareUsageSegments } from '../components/software-license-cards';
import { TabularReportView } from '../components/tabular-report-view';

/** Columns drawn inside the software, employee and status cells — kept in the rows and files. */
const INNER = ['software_code', 'publisher', 'license_type', 'employee_code', 'left_days', 'revoked_at', 'revoked_by'];

const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null);

/** The software's name with its code and licence type under it. */
function SoftwareCell({ row }: { row: AccessRow }) {
    const t = useT();
    const name = str(row.software);
    if (!name) return <span className="text-muted-foreground">—</span>;
    const type = str(row.license_type);
    const sub = [str(row.software_code), type ? t(`access_lic_${type}`) : null].filter((s): s is string => Boolean(s));
    return (
        <div className="min-w-0">
            <div className="max-w-[16rem] truncate font-medium" title={name}>
                {name}
            </div>
            <div className="text-muted-foreground flex gap-x-3 text-xs">
                {sub.map((part) => (
                    <span key={part}>{part}</span>
                ))}
            </div>
        </div>
    );
}

function licenseCell(key: string, row: AccessRow) {
    if (key === 'software') return <SoftwareCell row={row} />;
    if (key === 'employee') return <EmployeeCell row={row} />;
    if (key === 'status') return <StatusCell row={row} />;
    return undefined;
}

export default function AccessSoftwareLicensesReportPage() {
    return (
        <TabularReportView
            reportKey="access.software_licenses"
            extras={{
                tiles: 5,
                // Usage as segments in the bar; the picked software and active / revoked sit on the list's heading.
                hiddenFilters: ['usage', 'software_id', 'state'],
                innerColumns: INNER,
                filterLead: ({ filters, patch }) => <SoftwareUsageSegments filters={filters} patch={patch} />,
                rowsLead: ({ filters, patch }) => <SoftwareListLead filters={filters} patch={patch} />,
                beforeTable: ({ filters, patch }) => <SoftwareLicenseCards filters={filters} patch={patch} />,
                rowsTitle: 'rep_sl_rows_title',
                rowClassName: (row) => (row.status === 'left' ? 'bg-red-500/5' : undefined),
                renderCell: licenseCell,
            }}
        />
    );
}
