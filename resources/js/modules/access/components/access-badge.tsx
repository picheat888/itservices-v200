import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';

/**
 * Small pill describing a file-share access level:
 *   Read  → neutral/muted
 *   Write → blue/info
 *   Full  → brand/accent
 * Labels are localized via the access_acc_* keys, falling back to the raw level.
 */
export function AccessBadge({ level }: { level: string | null | undefined }) {
    const t = useT();
    if (!level) return null;

    const map: Record<string, { className: string; label: string }> = {
        Read: { className: 'bg-muted text-muted-foreground', label: t('access_acc_read') },
        Write: { className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400', label: t('access_acc_write') },
        Full: { className: 'bg-brand/15 text-brand', label: t('access_acc_full') },
    };
    const cfg = map[level] ?? { className: 'bg-muted text-muted-foreground', label: level };

    return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', cfg.className)}>{cfg.label}</span>;
}
