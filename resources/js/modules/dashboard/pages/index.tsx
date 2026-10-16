// Dashboard (/): greeting, then "งานที่รอคุณ", "ของฉัน" and the sections the reader's Dashboard switches open.
import { useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { DASH_STYLES } from '../components/dash-parts';
import { DashboardSkeleton } from '../components/dashboard-skeleton';
import { ItSection } from '../components/it-section';
import { MineSection } from '../components/mine-section';
import { PeopleSection } from '../components/people-section';
import { RequestsSection } from '../components/requests-section';
import { TodoSection } from '../components/todo-section';
import { useDashboardSummary } from '../hooks/use-dashboard';

export default function DashboardPage() {
    const t = useT();
    const { user } = useAuth();
    const fmt = useDateFormat();
    const { data, isLoading, isError } = useDashboardSummary();
    const today = new Date();
    // Day names from the SLA settings (ISO numbering: Monday 1 … Sunday 7).
    const weekday = t(`set_sla_day_full_${today.getDay() || 7}`);

    return (
        <div className="space-y-8">
            <style>{DASH_STYLES}</style>
            <header>
                <h1 className="text-2xl font-bold">{t('dash_hello').replace('{name}', user?.name ?? '')}</h1>
                <p className="text-muted-foreground text-sm">{t('dash_today').replace('{weekday}', weekday).replace('{date}', fmt.date(today))}</p>
            </header>
            {isError ? (
                <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                    {t('dash_load_failed')}
                </p>
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
