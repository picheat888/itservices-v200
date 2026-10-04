import { useT } from '@/lang';
import { formatDateShort } from '@/shared/lib/datetime';
import { cn } from '@/shared/lib/utils';
import { useUiStore } from '@/stores/ui';

/**
 * Two small muted lines — "เพิ่มเมื่อ 4 ต.ค. 2026 โดย …" / "แก้ไขล่าสุด … โดย …" — for a record's
 * created_at/created_by and updated_at/updated_by (App\Models\Concerns\RecordsActors). A missing
 * name (rows seeded or imported before the stamps existed) just drops the "โดย" part.
 * Used by the employee and stock item detail views.
 */
export function RecordStamps({
    createdAt,
    createdBy,
    updatedAt,
    updatedBy,
    className,
}: {
    createdAt?: string | null;
    createdBy?: string | null;
    updatedAt?: string | null;
    updatedBy?: string | null;
    className?: string;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const line = (label: string, date?: string | null, by?: string | null) => (
        <div>
            {label} {date ? formatDateShort(date, lang) : '—'}
            {by && ` ${t('record_by')} ${by}`}
        </div>
    );

    return (
        <div className={cn('text-muted-foreground text-[10.5px] leading-tight', className)}>
            {line(t('record_added'), createdAt, createdBy)}
            {line(t('record_updated'), updatedAt, updatedBy)}
        </div>
    );
}
