// Dashboard "พนักงานและกิจกรรม": active staff per department and the latest audit-log entries.
import { useT } from '@/lang';
import { CardEmpty, CardTitle, FILL, fold, FoldToggle, heldStyle, useFoldRow } from '@/modules/report';
import { relativeTime } from '@/shared/lib/datetime';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { useUiStore } from '@/stores/ui';
import { Users } from 'lucide-react';
import type { DashboardActivity, DashboardHr } from '../api/dashboardApi';
import { useDashLinks } from '../hooks/use-dash-links';
import { localName } from '../lib/dash-math';
import { CardLink, HBarRow, NARROW, PAIR_GRID, rowDelay, SectionHeading, WIDE } from './dash-parts';

const FOLDS = ['departments'] as const;
const DEPARTMENTS_TOP = 10;
const FULL = 'flex min-w-0 flex-col xl:col-span-5';

export function PeopleSection({ hr, activity }: { hr?: DashboardHr; activity?: DashboardActivity }) {
    const t = useT();
    const links = useDashLinks();
    const row = useFoldRow(FOLDS);
    const both = !!hr && !!activity;

    return (
        <section aria-labelledby="dash-people" className="space-y-3">
            <SectionHeading
                id="dash-people"
                icon={Users}
                title={t('dash_sec_people')}
                link={hr && links.employeesHome ? { to: links.employeesHome, label: t('dash_go_employees') } : null}
            />
            <div className={cn(PAIR_GRID, row.anyOpen && 'xl:items-start')}>
                {hr && (
                    <DepartmentsCard
                        hr={hr}
                        className={both ? WIDE : FULL}
                        open={row.open.departments}
                        onToggle={() => row.toggle('departments')}
                        cardRef={row.left}
                        heldHeight={row.heldLeft}
                    />
                )}
                {activity && (
                    <ActivityCard
                        activity={activity}
                        className={both ? NARROW : FULL}
                        cardRef={row.right}
                        heldHeight={row.heldRight}
                        auditLog={links.auditLog}
                    />
                )}
            </div>
        </section>
    );
}

function DepartmentsCard({
    hr,
    className,
    open,
    onToggle,
    cardRef,
    heldHeight,
}: {
    hr: DashboardHr;
    className: string;
    open: boolean;
    onToggle: () => void;
    cardRef: React.Ref<HTMLDivElement>;
    heldHeight: number | null;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const scale = Math.max(1, hr.no_department, ...hr.by_department.map((d) => d.count));
    // Up to 12 show in full; more fold to the top 10.
    const { folds, shown } = fold(hr.by_department, DEPARTMENTS_TOP, open, 2);

    return (
        <Card ref={cardRef} style={heldStyle(heldHeight)} className={className}>
            <CardTitle
                level="h3"
                title={t('dash_by_department')}
                note={t('dash_n_departments').replace('{n}', String(hr.by_department.length))}
                sub={t('dash_active_people').replace('{n}', String(hr.headcount))}
            />
            {hr.headcount === 0 ? (
                <CardEmpty>{t('dash_empty_staff')}</CardEmpty>
            ) : (
                <ul className="flex flex-1 flex-col justify-between gap-1.5 px-5 py-3">
                    {shown.map((d, i) => (
                        <HBarRow key={d.id} label={localName(d.name, d.name_th, lang)} value={d.count} scale={scale} fill={FILL.violet} index={i} />
                    ))}
                    {hr.no_department > 0 && (
                        <HBarRow label={t('dash_no_department')} value={hr.no_department} scale={scale} fill={FILL.gray} index={shown.length} muted />
                    )}
                </ul>
            )}
            {folds && <FoldToggle open={open} total={hr.by_department.length} onToggle={onToggle} />}
        </Card>
    );
}

function ActivityCard({
    activity,
    className,
    cardRef,
    heldHeight,
    auditLog,
}: {
    activity: DashboardActivity;
    className: string;
    cardRef: React.Ref<HTMLDivElement>;
    heldHeight: number | null;
    auditLog: string | null;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);

    return (
        <Card ref={cardRef} style={heldStyle(heldHeight)} className={className}>
            <CardTitle
                level="h3"
                title={t('dash_recent_activity')}
                note={t('dash_latest_n').replace('{n}', String(activity.items.length))}
                sub={t('dash_today_n').replace('{n}', String(activity.today_count))}
            />
            {activity.items.length === 0 ? (
                <CardEmpty>{t('dash_empty_activity')}</CardEmpty>
            ) : (
                <ul className="divide-border/60 flex flex-1 flex-col justify-between divide-y px-5 py-1">
                    {activity.items.map((item, i) => (
                        <li key={item.id} className="dash-row flex items-start justify-between gap-3 py-2" style={rowDelay(i)}>
                            <div className="min-w-0">
                                <div className="truncate text-sm font-medium">
                                    {item.action}
                                    {item.target && <span className="text-muted-foreground ml-1.5 font-normal">{item.target}</span>}
                                </div>
                                {item.actor && <div className="text-muted-foreground truncate text-xs">{item.actor}</div>}
                            </div>
                            <span className="text-muted-foreground shrink-0 text-xs">{relativeTime(item.at, lang, '')}</span>
                        </li>
                    ))}
                </ul>
            )}
            {auditLog && <CardLink to={auditLog} total={0} shown={0} label={t('dash_view_audit')} />}
        </Card>
    );
}
