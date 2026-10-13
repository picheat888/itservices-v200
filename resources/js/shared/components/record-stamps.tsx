import { useT } from '@/lang';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { cn } from '@/shared/lib/utils';

/**
 * Two small muted lines — "เพิ่มเมื่อ <date> โดย …" / "แก้ไขล่าสุด … โดย …" — for a record's
 * created_at/created_by and updated_at/updated_by (App\Models\Concerns\RecordsActors). A missing
 * name (rows seeded or imported before the stamps existed) just drops the "โดย" part.
 * Leave createdAt/createdBy out for records nobody adds by hand (the templates) — only the
 * "แก้ไขล่าสุด" line shows then. Used by the employee, stock item, access and template views.
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
    const fmt = useDateFormat();
    const line = (label: string, date?: string | null, by?: string | null) => (
        <div>
            {label} {fmt.date(date)}
            {by && ` ${t('record_by')} ${by}`}
        </div>
    );

    return (
        <div className={cn('text-muted-foreground text-[10.5px] leading-tight', className)}>
            {(createdAt !== undefined || createdBy !== undefined) && line(t('record_added'), createdAt, createdBy)}
            {line(t('record_updated'), updatedAt, updatedBy)}
        </div>
    );
}
