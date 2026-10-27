// The small S/N tag after a SKU whose units are tracked by serial (count dialogs).
import { useT } from '@/lang';

export function SnBadge() {
    const t = useT();
    return (
        <span className="ml-1.5 inline-flex h-[18px] items-center rounded border border-violet-400 px-1.5 align-middle text-[11px] font-semibold text-violet-700 dark:border-violet-500/60 dark:text-violet-300">
            {t('stock_count_sn_badge')}
        </span>
    );
}
