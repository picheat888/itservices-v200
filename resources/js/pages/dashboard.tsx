import { StatusBadge } from '@/components/shared/status-badge';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { useContractSummary } from '@/hooks/use-contracts';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui';
import { Box, Construction, FileText, Inbox, type LucideIcon, Ticket } from 'lucide-react';

interface Kpi {
    key: string;
    label: string;
    value: string | number;
    delta: string;
    deltaClass?: string;
    icon: LucideIcon;
    tone: string;
}

interface DemoTicket {
    id: string;
    subject: string;
    status: string;
    tone: 'blue' | 'green' | 'amber' | 'gray';
}

const iconTone: Record<DemoTicket['tone'], string> = {
    blue: 'bg-brand/10 text-brand',
    green: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    gray: 'bg-muted text-muted-foreground',
};

const demoTickets: DemoTicket[] = [
    { id: 'TKT-2861', subject: 'Cannot connect to production VPN', status: 'Open', tone: 'blue' },
    { id: 'TKT-2860', subject: 'Outlook crashing on launch', status: 'In progress', tone: 'amber' },
    { id: 'TKT-2856', subject: 'Printer toner replacement — HR', status: 'Resolved', tone: 'green' },
    { id: 'TKT-2853', subject: 'New mouse for QA station 7', status: 'Closed', tone: 'gray' },
];

export default function DashboardPage() {
    const t = useT();
    const { user } = useAuth();
    const lang = useUiStore((s) => s.lang);
    const { data: contracts } = useContractSummary();

    const kpis: Kpi[] = [
        { key: 'open', label: t('kpi_open_tickets'), value: '14', delta: lang === 'th' ? '↑ 12% จากสัปดาห์ก่อน' : '↑ 12% vs last week', icon: Ticket, tone: 'text-brand bg-brand/10' },
        { key: 'req', label: t('kpi_pending_requests'), value: '5', delta: lang === 'th' ? 'รอคุณดำเนินการ 4' : '4 awaiting you', icon: Inbox, tone: 'text-brand bg-brand/10' },
        { key: 'assets', label: t('kpi_total_assets'), value: '128', delta: lang === 'th' ? '↑ เพิ่ม 2 สัปดาห์นี้' : '↑ 2 this week', icon: Box, tone: 'text-brand bg-brand/10' },
        { key: 'contracts', label: t('kpi_expiring_contracts'), value: contracts?.expiring ?? '—', delta: lang === 'th' ? 'อยู่ในช่วงแจ้งเตือน' : 'in reminder window', deltaClass: (contracts?.expiring ?? 0) > 0 ? 'text-destructive' : undefined, icon: FileText, tone: 'text-brand bg-brand/10' },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">
                    {lang === 'th' ? `สวัสดี, ${user?.name ?? ''}` : `Welcome back, ${user?.name ?? ''}`}
                </h1>
                <p className="text-sm text-muted-foreground">{t('dash_welcome_sub')}</p>
            </div>

            {/* KPI cards with icons */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {kpis.map((k) => {
                    const Icon = k.icon;
                    return (
                        <Card key={k.key} className="p-5">
                            <div className="flex items-start justify-between">
                                <div className="text-sm text-muted-foreground">{k.label}</div>
                                <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', k.tone)}>
                                    <Icon className="h-[18px] w-[18px]" />
                                </span>
                            </div>
                            <div className="mt-2 font-mono text-3xl font-bold">{k.value}</div>
                            <div className={cn('mt-1 text-xs', k.deltaClass ?? 'text-muted-foreground')}>{k.delta}</div>
                        </Card>
                    );
                })}
            </div>

            {/* Row 1: tickets overview + team workload (data-dependent → coming soon) */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <ComingSoonCard title={t('dash_tickets_overview')} icon={Ticket} />
                <ComingSoonCard title={t('dash_team_workload')} icon={Box} />
            </div>

            {/* Row 2: recent tickets (white card) + recent activity (coming soon) */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card className="overflow-hidden">
                    <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
                        <div className="flex items-center gap-2">
                            <Ticket className="h-4 w-4 text-muted-foreground" />
                            <span className="font-semibold">{t('dash_recent_tickets')}</span>
                        </div>
                        <span className="text-xs font-medium text-muted-foreground">{t('view_all')} →</span>
                    </div>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border">
                                <th className="px-5 py-2.5 text-left text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">ID</th>
                                <th className="px-5 py-2.5 text-left text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    {lang === 'th' ? 'หัวข้อ' : 'Subject'}
                                </th>
                                <th className="px-5 py-2.5 text-left text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    {lang === 'th' ? 'สถานะ' : 'Status'}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {demoTickets.map((tk) => (
                                <tr key={tk.id} className="border-b border-border/60 last:border-0">
                                    <td className="px-5 py-2.5 font-mono text-xs text-muted-foreground">{tk.id}</td>
                                    <td className="px-5 py-2.5">
                                        <div className="flex items-center gap-2.5">
                                            <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', iconTone[tk.tone])}>
                                                <Ticket className="h-3.5 w-3.5" />
                                            </span>
                                            <span className="font-medium">{tk.subject}</span>
                                        </div>
                                    </td>
                                    <td className="px-5 py-2.5">
                                        <StatusBadge tone={tk.tone}>{tk.status}</StatusBadge>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Card>

                <ComingSoonCard title={t('dash_recent_activity')} icon={Inbox} />
            </div>
        </div>
    );
}

function ComingSoonCard({ title, icon: Icon }: { title: string; icon: LucideIcon }) {
    const t = useT();
    return (
        <Card className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <div className="font-semibold">{title}</div>
            </div>
            <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
                <Construction className="h-9 w-9 text-muted-foreground" />
                <div className="text-sm font-medium text-muted-foreground">{t('coming_soon')}</div>
            </div>
        </Card>
    );
}
