/**
 * Time left on a contract, one pill for all three contract reports — the /contracts DaysCell: closed gray,
 * due or past red, inside the reminder window amber, otherwise blue, in the contract module's words.
 */
import { useT } from '@/lang';
import { StatusBadge } from '@/shared/components/status-badge';
import { formatNumber } from '@/shared/lib/number';
import { useUiStore } from '@/stores/ui';

export function ContractLeftPill({
    days,
    inReminder,
    closed,
}: {
    days: number | null;
    inReminder: boolean;
    closed?: 'cancelled' | 'expired' | null;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const count = (n: number) => formatNumber(n, lang);

    if (closed === 'cancelled') return <StatusBadge tone="gray">{t('contract_cancelled')}</StatusBadge>;
    if (closed === 'expired') return <StatusBadge tone="gray">{t('contract_expired')}</StatusBadge>;
    if (days === null) return <span className="text-muted-foreground">—</span>;
    if (days === 0) return <StatusBadge tone="red">{t('contract_due_today')}</StatusBadge>;
    if (days < 0) return <StatusBadge tone="red">{t('contract_days_overdue_short').replace('{n}', count(-days))}</StatusBadge>;
    if (inReminder) return <StatusBadge tone="amber">{t('contract_days_many').replace('{n}', count(days))}</StatusBadge>;
    return <StatusBadge tone="blue">{t('contract_days_short').replace('{n}', count(days))}</StatusBadge>;
}
