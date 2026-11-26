// "รายชื่อพนักงาน" report page (pages/employees-directory.tsx): the status switch on the list heading and the cells the page draws itself.
import { useT } from '@/lang';
import { StatusBadge } from '@/shared/components/status-badge';
import { TriangleAlert } from 'lucide-react';
import { useTabularSummary } from '../hooks/use-reports';
import { withoutFilters } from '../lib/filter-scope';
import { thaiNameNote } from '../lib/thai-name-note';
import type { TabularFilters } from '../types';
import { Segments } from './access-overview-cards';
import { DepartmentCell } from './employee-overview-cards';

const REPORT_KEY = 'employees.directory';

type Row = Record<string, unknown>;
type Patch = (next: TabularFilters) => void;

const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

/** ทั้งหมด / ใช้งาน / ลาออก on the list heading; its counts are the page's tiles, which ignore this switch. */
export function StatusSegments({ filters, patch }: { filters: TabularFilters; patch: Patch }) {
    const t = useT();
    const { data } = useTabularSummary(REPORT_KEY, withoutFilters(filters, ['status']), true);
    const count = (key: string) => data?.summary.find((tile) => tile.key === key)?.value ?? null;

    return (
        <Segments
            label={t('rep_fl_status')}
            options={[
                { value: null as string | null, label: t('rep_ed_status_all'), count: count('total') },
                { value: 'active', label: t('rep_ed_status_active'), count: count('active') },
                { value: 'resigned', label: t('rep_ed_status_resigned'), count: count('resigned') },
            ]}
            value={(filters.status as string | null | undefined) ?? null}
            onChange={(status) => patch({ status })}
        />
    );
}

function AmberNote({ children }: { children: React.ReactNode }) {
    return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-300">
            <TriangleAlert aria-hidden className="h-3.5 w-3.5 shrink-0" />
            {children}
        </span>
    );
}

/** The Thai name, or the part there is; an amber note on the active rows the "no Thai name" tile counts. */
function ThaiNameCell({ row }: { row: Row }) {
    const t = useT();
    const name = text(row.name_th);
    const note = thaiNameNote(row);

    if (note === 'missing') return <AmberNote>{t('rep_ed_no_thai_name')}</AmberNote>;
    if (!name) return <>—</>;

    return (
        <div className="min-w-0">
            <div className="truncate" title={name}>
                {name}
            </div>
            {note === 'incomplete' && <AmberNote>{t('rep_ed_thai_name_incomplete')}</AmberNote>}
        </div>
    );
}

/** Email on top, phone under it. */
function ContactCell({ row }: { row: Row }) {
    const t = useT();
    const email = text(row.email);
    const phone = text(row.phone);

    return (
        <div className="min-w-0">
            <div className="max-w-[16rem] truncate" title={email ?? undefined}>
                {email ?? '—'}
            </div>
            <div className="text-muted-foreground text-xs tabular-nums">{phone ?? t('rep_ed_no_phone')}</div>
        </div>
    );
}

function StatusCell({ value }: { value: unknown }) {
    const t = useT();
    if (value !== 'active' && value !== 'resigned') return <>—</>;

    return value === 'active' ? (
        <StatusBadge tone="green">{t('rep_ed_status_active')}</StatusBadge>
    ) : (
        <StatusBadge tone="red">{t('rep_ed_status_resigned')}</StatusBadge>
    );
}

function UsernameCell({ value }: { value: unknown }) {
    const t = useT();
    const username = text(value);
    if (username) return <span title={username}>{username}</span>;

    return <span className="text-muted-foreground text-xs">{t('rep_ed_no_account')}</span>;
}

/** The page's own cells; every other column keeps the shared TabularCell. */
export function directoryCell(key: string, row: Row): React.ReactNode | undefined {
    switch (key) {
        case 'name_th':
            return <ThaiNameCell row={row} />;
        case 'department':
            return <DepartmentCell row={row} />;
        case 'email':
            return <ContactCell row={row} />;
        case 'status':
            return <StatusCell value={row.status} />;
        case 'username':
            return <UsernameCell value={row.username} />;
        default:
            return undefined;
    }
}
