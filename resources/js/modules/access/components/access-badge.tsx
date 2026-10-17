import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';

/**
 * Small pill describing a file-share access level:
 *   Read  → neutral/muted
 *   Write → blue/info (write access implies read)
 */
export function AccessBadge({ level }: { level: string | null | undefined }) {
    const t = useT();
    if (!level) return null;

    const map: Record<string, string> = {
        Read: 'bg-muted text-muted-foreground',
        Write: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    };
    const label: Record<string, string> = { Read: t('emp_v_level_read'), Write: t('emp_v_level_read_write') };
    const className = map[level] ?? 'bg-muted text-muted-foreground';

    return (
        <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', className)}>
            {label[level] ?? level}
        </span>
    );
}
