/**
 * One cell of a generic tabular report table: formats a column's raw value per its
 * `ColumnType` (mirrors App\Services\Report\Tabular\ReportColumn::value()). Shared by
 * every tabular report page so a report definition only has to declare types, not markup.
 */
import { useT } from '@/lang';
import { StatusBadge } from '@/shared/components/status-badge';
import { useUiStore } from '@/stores/ui';
import type { TabularColumnDef } from '../types';

function DaysLeftBadge({ value }: { value: number }) {
    const t = useT();
    const tone = value < 0 || value <= 30 ? 'red' : value <= 60 ? 'amber' : 'gray';
    return <StatusBadge tone={tone}>{t('rep_days_left').replace('{n}', String(value))}</StatusBadge>;
}

export function TabularCell({ column, value }: { column: TabularColumnDef; value: unknown }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);

    switch (column.type) {
        case 'localized': {
            const v = value as { name?: string | null; name_th?: string | null } | null;
            const label = (lang === 'th' && v?.name_th) || v?.name;
            return <>{label || '—'}</>;
        }
        case 'money': {
            if (value === null || value === undefined) return <>—</>;
            const formatted = Number(value).toLocaleString(lang === 'th' ? 'th-TH' : 'en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            });
            return <span className="font-mono">{formatted}</span>;
        }
        case 'number':
            return <span className="font-mono">{value === null || value === undefined ? '—' : String(value)}</span>;
        case 'date':
            return <span className="font-mono">{(value as string | null) ?? '—'}</span>;
        case 'days_left':
            return value === null || value === undefined ? <>—</> : <DaysLeftBadge value={value as number} />;
        case 'enum': {
            if (value === null || value === undefined) return <>—</>;
            const key = column.labels?.[String(value)] ?? String(value);
            return <>{t(key)}</>;
        }
        case 'text':
        default:
            return <>{(value as string | null) || '—'}</>;
    }
}
