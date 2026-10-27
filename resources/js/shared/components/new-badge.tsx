// The green "ใหม่ / New" badge and the row tint of a row the user just created.
import { useT } from '@/lang';
import { StatusBadge } from '@/shared/components/status-badge';

/** Tint and fade-in of a just-created row. */
export const NEW_ROW_CLASS =
    'animate-in fade-in bg-(--row-tint) duration-500 motion-reduce:animate-none [--row-tint:color-mix(in_oklab,var(--color-emerald-500)_8%,transparent)]';

export function NewBadge() {
    const t = useT();
    return <StatusBadge tone="green">{t('badge_new')}</StatusBadge>;
}
