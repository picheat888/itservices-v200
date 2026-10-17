// Dashboard (/): greeting, then "งานที่รอคุณ", "ของฉัน" and the sections the reader's Dashboard switches open.
import { useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { LoadFailedPanel } from '@/shared/components/load-failed';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { localPair } from '@/shared/lib/local-name';
import { useUiStore } from '@/stores/ui';
import { DashboardSkeleton } from '../components/dashboard-skeleton';
import { ItSection } from '../components/it-section';
import { MineSection } from '../components/mine-section';
import { PeopleSection } from '../components/people-section';
import { RequestsSection } from '../components/requests-section';
import { TodoSection } from '../components/todo-section';
import { useDashboardSummary } from '../hooks/use-dashboard';

export default function DashboardPage() {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { user } = useAuth();
    const fmt = useDateFormat();
    const { data, isLoading, isError, refetch } = useDashboardSummary();
    const today = new Date();
    // Day names from the SLA settings (ISO numbering: Monday 1 … Sunday 7).
    const weekday = t(`set_sla_day_full_${today.getDay() || 7}`);

    return (
        <div className="space-y-8">
            <header>
                <h1 className="text-2xl font-bold">{t('dash_hello').replace('{name}', localPair(user?.name, user?.name_th, lang) ?? '')}</h1>
                <p className="text-muted-foreground text-sm">{t('dash_today').replace('{weekday}', weekday).replace('{date}', fmt.date(today))}</p>
            </header>
            {isError && !data ? (
                <LoadFailedPanel onRetry={() => refetch()} />
            ) : isLoading || !data ? (
                <DashboardSkeleton />
            ) : (
                <>
                    <TodoSection data={data} />
                    <MineSection mine={data.mine} />
                    {data.it && <ItSection it={data.it} />}
                    {data.requests && <RequestsSection requests={data.requests} />}
                    {(data.hr || data.activity) && <PeopleSection hr={data.hr} activity={data.activity} />}
                </>
            )}
        </div>
    );
}
