// List cells the access reports share: the holder, the resource, its type, the level, and the grant's status (pages/access-*.tsx).
import { useT } from '@/lang';
import { StatusBadge } from '@/shared/components/status-badge';
import { localPair } from '@/shared/lib/local-name';
import { useUiStore } from '@/stores/ui';
import { Link } from 'react-router-dom';
import { useCanOpen } from '../hooks/use-can-open';
import type { AccessType, ChartLabel } from '../types';
import { ACCESS_TYPES, TypeDot, TypeLabel } from './access-overview-cards';
import { shortDate } from './transfer-cards';

export type AccessRow = Record<string, unknown> & { _links?: Record<string, string> };

export const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown) => (typeof v === 'number' ? v : null);
const isLabel = (v: unknown): v is ChartLabel => typeof v === 'object' && v !== null && 'name' in v;

function None() {
    return <span className="text-muted-foreground">—</span>;
}

/** The holder's name (opening them on the Employees page) with their code under it. */
export function EmployeeCell({ row }: { row: AccessRow }) {
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
            <div className="text-muted-foreground text-xs">{str(row.employee_code)}</div>
        </div>
    );
}

/** The resource's name, with its code and address under it — and its registry's dot when the list mixes them. */
export function ResourceCell({ row, withType = false }: { row: AccessRow; withType?: boolean }) {
    const name = str(row.resource);
    if (!name) return <None />;
    const type = ACCESS_TYPES.includes(row.resource_type as AccessType) ? (row.resource_type as AccessType) : null;
    const sub = [str(row.resource_code), str(row.resource_detail)].filter((s): s is string => Boolean(s));
    return (
        <div className="min-w-0">
            <div className="flex max-w-[16rem] items-center gap-1.5 font-medium" title={name}>
                {withType && type && <TypeDot type={type} />}
                <span className="truncate">{name}</span>
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

export function TypeCell({ type }: { type: unknown }) {
    return ACCESS_TYPES.includes(type as AccessType) ? <TypeLabel type={type as AccessType} /> : <None />;
}

export function LevelCell({ level }: { level: unknown }) {
    const t = useT();
    if (level === 'Read' || level === 'Write') return <span>{t(`rep_ac_level_${String(level).toLowerCase()}`)}</span>;
    return <span className="text-muted-foreground">{t('rep_ac_level_member')}</span>;
}

/** In use; in use across departments (the pair); held by a leaver; or revoked, when and by whom. */
export function StatusCell({ row }: { row: AccessRow }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const department = row.resource_department;
    switch (row.status) {
        case 'cross':
            return (
                <span
                    className="inline-flex whitespace-nowrap"
                    title={
                        isLabel(department)
                            ? t('rep_ac_cross_of').replace('{dept}', localPair(department.name, department.name_th, lang) || '')
                            : undefined
                    }
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
            return (
                <StatusBadge tone="red">{days === null ? t('rep_ac_left_no_date') : t('rep_ac_left_days').replace('{n}', String(days))}</StatusBadge>
            );
        }
        case 'revoked': {
            const at = str(row.revoked_at);
            const by = str(row.revoked_by);
            return (
                <div>
                    <StatusBadge tone="gray">
                        {at ? t('rep_ac_revoked_on').replace('{date}', shortDate(at, lang)) : t('rep_ac_status_revoked')}
                    </StatusBadge>
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

/** The department column with "→ ของ <dept>" under a cross-department holder's own department. */
export function DepartmentCell({ row }: { row: AccessRow }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const name = (v: unknown) => (isLabel(v) ? localPair(v.name, v.name_th, lang) : null);
    const own = name(row.department);
    if (!own) return <None />;
    const theirs = row.status === 'cross' ? name(row.resource_department) : null;
    return (
        <div className="min-w-0">
            <div className="max-w-[12rem] truncate">{own}</div>
            {theirs && (
                <div className="max-w-[12rem] truncate text-xs text-amber-700 dark:text-amber-300">
                    {t('rep_ar_cross_to').replace('{dept}', theirs)}
                </div>
            )}
        </div>
    );
}
