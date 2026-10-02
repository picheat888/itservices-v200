/**
 * One cell of a generic tabular report table: formats a column's raw value per its
 * `ColumnType` (mirrors App\Services\Report\Tabular\ReportColumn::value()). Shared by
 * every tabular report page so a report definition only has to declare types, not markup.
 *
 * A zero is drawn faint so the numbers that mean something stand out of a mostly-empty
 * grid; free text keeps its whole value in a tooltip (the column truncates it); and a
 * column declared with linkTo() opens its record when the reader may open that module.
 */
import { useT } from '@/lang';
import { StatusBadge } from '@/shared/components/status-badge';
import { cn } from '@/shared/lib/utils';
import { useUiStore } from '@/stores/ui';
import { Link } from 'react-router-dom';
import type { TabularColumnDef } from '../types';

/** Days to an end date as a pill, said in words — "เลยมา 5 วัน" / "วันนี้" / "อีก 9 วัน" — never a minus sign. */
function DaysLeftBadge({ value }: { value: number }) {
    const t = useT();
    const tone = value < 0 || value <= 30 ? 'red' : value <= 60 ? 'amber' : 'gray';
    const label = value === 0 ? t('rep_days_today') : t(value < 0 ? 'rep_days_over' : 'rep_days_in').replace('{n}', String(Math.abs(value)));
    return <StatusBadge tone={tone}>{label}</StatusBadge>;
}

/**
 * Hours to a deadline as a pill: past it red ("เกิน 3 วัน"), inside a day amber ("อีก 5 ชม."),
 * further out gray. Under a day it counts hours, beyond that whole days.
 */
export function HoursLeftBadge({ value }: { value: number }) {
    const t = useT();
    const abs = Math.abs(value);
    const amount =
        abs < 24
            ? t('rep_hours_n').replace('{n}', String(Math.max(1, Math.round(abs))))
            : t('rep_days_n').replace('{n}', String(Math.round(abs / 24)));
    const tone = value < 0 ? 'red' : value <= 24 ? 'amber' : 'gray';
    return <StatusBadge tone={tone}>{t(value < 0 ? 'rep_left_over' : 'rep_left_in').replace('{n}', amount)}</StatusBadge>;
}

const ZERO = 'text-muted-foreground/60';

export function TabularCell({ column, value, href }: { column: TabularColumnDef; value: unknown; href?: string }) {
    const content = <CellValue column={column} value={value} />;
    if (!href || value === null || value === undefined || value === '') return content;

    return (
        <Link to={href} className="text-brand font-medium hover:underline">
            {content}
        </Link>
    );
}

function CellValue({ column, value }: { column: TabularColumnDef; value: unknown }) {
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
            return <span className={cn('font-mono', Number(value) === 0 && ZERO)}>{formatted}</span>;
        }
        case 'number':
            return (
                <span className={cn('font-mono', Number(value) === 0 && ZERO)}>{value === null || value === undefined ? '—' : String(value)}</span>
            );
        case 'date':
            return <span className="font-mono">{(value as string | null) ?? '—'}</span>;
        case 'days_left':
            return value === null || value === undefined ? <>—</> : <DaysLeftBadge value={value as number} />;
        case 'hours_left':
            return value === null || value === undefined ? <>—</> : <HoursLeftBadge value={value as number} />;
        case 'enum': {
            if (value === null || value === undefined) return <>—</>;
            const key = column.labels?.[String(value)] ?? String(value);
            return <>{t(key)}</>;
        }
        case 'text':
        default:
            return <span title={(value as string | null) || undefined}>{(value as string | null) || '—'}</span>;
    }
}
