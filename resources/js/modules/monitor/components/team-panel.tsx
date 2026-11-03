// "ทีม IT ตอนนี้": each resolver's held in-progress cases, most first.
import { cn } from '@/shared/lib/utils';
import { useChangeCount } from '../hooks/use-change-count';
import { useMonitorT } from '../hooks/use-monitor-prefs';
import type { MonitorMember } from '../types';

export function TeamPanel({ team }: { team: MonitorMember[] }) {
    const t = useMonitorT();
    const peak = Math.max(1, ...team.map((m) => m.count));

    return (
        <section className="bg-card flex min-h-0 flex-col gap-6 overflow-hidden rounded-2xl border px-6.5 py-4">
            <div className="flex items-baseline justify-between pb-1">
                <h2 className="text-[32px] font-bold">{t('mon_team_title')}</h2>
                <span className="text-muted-foreground text-[20px]">{t('mon_team_hint')}</span>
            </div>
            {team.map((member) => (
                <MemberRow key={member.id} member={member} peak={peak} />
            ))}
        </section>
    );
}

/** One team member; the count pops when it changes. */
function MemberRow({ member, peak }: { member: MonitorMember; peak: number }) {
    const changes = useChangeCount(member.count);

    return (
        <div className="grid grid-cols-[50px_minmax(0,1fr)_64px] items-center gap-4">
            <span className="bg-muted grid size-[50px] place-items-center rounded-full text-[19px] font-bold">{member.initials}</span>
            <div className="min-w-0">
                <b className="block truncate text-[25px] leading-[1.2]">{member.name}</b>
                <div className="bg-muted mt-2 h-2.5 overflow-hidden rounded-full">
                    <div
                        className="h-full rounded-full bg-violet-600 transition-[width] duration-500 motion-reduce:transition-none dark:bg-violet-400"
                        style={{ width: `${(member.count / peak) * 100}%` }}
                    />
                </div>
            </div>
            <div className={cn('text-right text-[42px] leading-none font-bold', member.count === 0 && 'text-muted-foreground')}>
                <span key={changes} className={cn('inline-block origin-right', changes > 0 && 'badge-pop')}>
                    {member.count}
                </span>
            </div>
        </div>
    );
}
