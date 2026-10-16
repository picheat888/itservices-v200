// Dashboard "ของฉัน": the reader's own tickets, requests, assets and access, plus their two latest lists.
import { useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { PROFILE_ASSETS_SEARCH, PROFILE_SECTION_PARAM } from '@/modules/profile';
import { CardEmpty, CardTitle, CODE_LINK, FILL } from '@/modules/report';
import { TICKET_STATUS_META } from '@/modules/ticket';
import { StatusBadge } from '@/shared/components/status-badge';
import { dialogPushedState } from '@/shared/hooks/use-dialog-param';
import { REQUEST_STATUS_META } from '@/shared/lib/request-meta';
import { Card } from '@/shared/ui/card';
import { Box, CircleCheck, Inbox, MonitorCog, Ticket, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { DashboardMine } from '../api/dashboardApi';
import { sharePieces } from '../lib/dash-math';
import { dashLinks } from '../lib/links';
import { CardLink, DashTile, LegendFooter, LIST_LIMIT, NARROW, PAIR_GRID, rowDelay, SectionHeading, TILE_GRID, WIDE } from './dash-parts';

const ACCESS_TYPES = [
    { key: 'email_group', label: 'rep_ac_type_email_group_short', fill: 'access-email' },
    { key: 'file_share', label: 'rep_ac_type_file_share_short', fill: 'access-file' },
    { key: 'social_platform', label: 'rep_ac_type_social_platform_short', fill: 'access-social' },
    { key: 'software', label: 'rep_ac_type_software', fill: 'access-software' },
] as const;

const profileSection = (section: string) => ({ search: `?dialog=profile&${PROFILE_SECTION_PARAM}=${section}` });

export function MineSection({ mine }: { mine: DashboardMine }) {
    const t = useT();
    const { can } = useAuth();
    const links = dashLinks(can);
    const k = mine.kpi;

    return (
        <section aria-labelledby="dash-mine" className="space-y-3">
            <SectionHeading
                id="dash-mine"
                icon={UserRound}
                title={t('dash_sec_mine')}
                link={{ to: { search: '?dialog=profile' }, state: dialogPushedState(), label: t('dash_go_profile') }}
            />
            <div className={TILE_GRID}>
                <DashTile
                    to={links.myTickets}
                    icon={Ticket}
                    label={t('dash_kpi_my_open')}
                    value={k.open_tickets}
                    bar={sharePieces([
                        { key: 'open', value: k.open_split.open, className: FILL.blue },
                        { key: 'in_progress', value: k.open_split.in_progress, className: FILL.amber },
                    ])}
                    footer={
                        <LegendFooter
                            items={[
                                { key: 'open', label: t('ticket_open'), value: k.open_split.open, dot: FILL.blue },
                                { key: 'in_progress', label: t('ticket_in_progress'), value: k.open_split.in_progress, dot: FILL.amber },
                            ]}
                        />
                    }
                />
                <DashTile
                    to={links.myRequests}
                    icon={Inbox}
                    label={t('dash_kpi_requests_unfinished')}
                    value={k.requests_unfinished}
                    bar={sharePieces([
                        { key: 'pending', value: k.requests_split.pending, className: FILL.amber },
                        { key: 'approved', value: k.requests_split.approved, className: FILL.blue },
                    ])}
                    footer={
                        <LegendFooter
                            items={[
                                { key: 'pending', label: t('req_status_pending'), value: k.requests_split.pending, dot: FILL.amber },
                                { key: 'approved', label: t('req_status_approved'), value: k.requests_split.approved, dot: FILL.blue },
                            ]}
                        />
                    }
                />
                <DashTile
                    to={{ search: PROFILE_ASSETS_SEARCH }}
                    state={dialogPushedState()}
                    icon={Box}
                    label={t('dash_kpi_my_assets')}
                    value={k.assets}
                    footer={
                        k.assets_pending > 0 ? t('dash_pending_handover_n').replace('{n}', String(k.assets_pending)) : t('dash_no_pending_handover')
                    }
                />
                <DashTile
                    to={profileSection('access')}
                    state={dialogPushedState()}
                    icon={MonitorCog}
                    label={t('dash_kpi_access')}
                    value={k.access_total}
                    bar={sharePieces(ACCESS_TYPES.map((type) => ({ key: type.key, value: k.access_by_type[type.key], className: FILL[type.fill] })))}
                    footer={
                        <LegendFooter
                            items={ACCESS_TYPES.map((type) => ({
                                key: type.key,
                                label: t(type.label),
                                value: k.access_by_type[type.key],
                                dot: FILL[type.fill],
                            }))}
                        />
                    }
                />
                <DashTile
                    to={links.myTickets}
                    icon={CircleCheck}
                    label={t('dash_kpi_my_closed')}
                    value={k.closed_this_month}
                    footer={t('dash_tickets_you_filed')}
                />
            </div>
            <div className={PAIR_GRID}>
                <MyTicketsCard mine={mine} />
                <MyRequestsCard mine={mine} />
            </div>
        </section>
    );
}

function MyTicketsCard({ mine }: { mine: DashboardMine }) {
    const t = useT();
    const { can } = useAuth();
    const links = dashLinks(can);

    return (
        <Card className={WIDE}>
            <CardTitle title={t('dash_my_tickets')} sub={t('dash_n_cases').replace('{n}', String(mine.tickets_total))} />
            {mine.tickets.length === 0 ? (
                <CardEmpty>{t('dash_empty_tickets')}</CardEmpty>
            ) : (
                <table className="w-full text-sm">
                    <thead className="text-muted-foreground text-xs">
                        <tr className="border-border/60 border-b">
                            <th className="px-5 py-2 text-left font-medium">{t('dash_col_ticket')}</th>
                            <th className="px-2 py-2 text-left font-medium">{t('dash_col_subject')}</th>
                            <th className="hidden px-2 py-2 text-left font-medium md:table-cell">{t('dash_col_assignee')}</th>
                            <th className="px-5 py-2 text-right font-medium">{t('dash_col_status')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {mine.tickets.map((row, i) => {
                            const meta = TICKET_STATUS_META[row.status as keyof typeof TICKET_STATUS_META];
                            const to = links.ticket(row.id);
                            return (
                                <tr key={row.id} className="dash-row border-border/60 border-b last:border-0" style={rowDelay(i)}>
                                    <td className="px-5 py-2.5 whitespace-nowrap tabular-nums">
                                        {to ? (
                                            <Link to={to} className={CODE_LINK}>
                                                {row.ticket_no}
                                            </Link>
                                        ) : (
                                            row.ticket_no
                                        )}
                                    </td>
                                    <td className="w-full max-w-0 truncate px-2 py-2.5" title={row.subject}>
                                        {row.subject}
                                    </td>
                                    <td className="text-muted-foreground hidden px-2 py-2.5 whitespace-nowrap md:table-cell">
                                        {row.assignee_name ?? t('dash_no_assignee')}
                                    </td>
                                    <td className="px-5 py-2.5 text-right">{meta && <StatusBadge tone={meta.tone}>{t(meta.key)}</StatusBadge>}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}
            {links.myTickets && <CardLink to={links.myTickets} total={mine.tickets_total} shown={LIST_LIMIT} />}
        </Card>
    );
}

function MyRequestsCard({ mine }: { mine: DashboardMine }) {
    const t = useT();
    const { can } = useAuth();
    const links = dashLinks(can);

    return (
        <Card className={NARROW}>
            <CardTitle title={t('dash_my_requests')} sub={t('dash_n_requests').replace('{n}', String(mine.requests_total))} />
            {mine.requests.length === 0 ? (
                <CardEmpty>{t('dash_empty_requests')}</CardEmpty>
            ) : (
                <table className="w-full text-sm">
                    <thead className="text-muted-foreground text-xs">
                        <tr className="border-border/60 border-b">
                            <th className="px-5 py-2 text-left font-medium">{t('dash_col_request')}</th>
                            <th className="px-2 py-2 text-left font-medium">{t('dash_col_title')}</th>
                            <th className="px-5 py-2 text-right font-medium">{t('dash_col_status')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {mine.requests.map((row, i) => {
                            const meta = REQUEST_STATUS_META[row.status as keyof typeof REQUEST_STATUS_META];
                            const to = links.request(row.id);
                            return (
                                <tr key={row.id} className="dash-row border-border/60 border-b last:border-0" style={rowDelay(i)}>
                                    <td className="px-5 py-2.5 whitespace-nowrap tabular-nums">
                                        {to ? (
                                            <Link to={to} className={CODE_LINK}>
                                                {row.reference}
                                            </Link>
                                        ) : (
                                            row.reference
                                        )}
                                    </td>
                                    <td className="w-full max-w-0 truncate px-2 py-2.5" title={row.title}>
                                        {row.title}
                                    </td>
                                    <td className="px-5 py-2.5 text-right">
                                        {meta && <StatusBadge tone={meta.tone}>{t(meta.labelKey)}</StatusBadge>}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}
            {links.myRequests && <CardLink to={links.myRequests} total={mine.requests_total} shown={LIST_LIMIT} />}
        </Card>
    );
}
