// Role group audit detail: members who joined or left, and the login accounts whose role moved with them.
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { ChevronRight } from 'lucide-react';
import type { AuditRoleChange } from '../api/permissionApi';

const HEADING = 'text-muted-foreground mb-1 text-[11px] font-semibold tracking-wide uppercase';

function NameList({ heading, tone, names }: { heading: string; tone: string; names: string[] }) {
    return (
        <div className="min-w-0">
            <div className={cn(HEADING, tone)}>{heading}</div>
            <p className="text-sm break-words">{names.join(', ')}</p>
        </div>
    );
}

export function AuditMemberChanges({
    membersAdded,
    membersRemoved,
    roleChanges,
}: {
    membersAdded: string[];
    membersRemoved: string[];
    roleChanges: AuditRoleChange[];
}) {
    const t = useT();
    const roleName = (name: string | null) => name ?? <span className="text-muted-foreground">—</span>;

    return (
        <>
            {(membersAdded.length > 0 || membersRemoved.length > 0) && (
                <div className="grid gap-3 sm:grid-cols-2">
                    {membersAdded.length > 0 && (
                        <NameList heading={t('audit_members_added')} tone="text-emerald-700 dark:text-emerald-400" names={membersAdded} />
                    )}
                    {membersRemoved.length > 0 && (
                        <NameList heading={t('audit_members_removed')} tone="text-rose-700 dark:text-rose-400" names={membersRemoved} />
                    )}
                </div>
            )}
            {roleChanges.length > 0 && (
                <div>
                    <div className={HEADING}>{t('audit_role_changes')}</div>
                    <div className="space-y-1.5">
                        {roleChanges.map((change, index) => (
                            <div key={`${change.name}-${index}`} className="flex items-center gap-2 text-sm">
                                <span className="text-muted-foreground block w-32 shrink-0 truncate text-xs font-medium">{change.name}</span>
                                <span className="text-muted-foreground line-through">{roleName(change.from)}</span>
                                <ChevronRight aria-hidden className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                                <span className="font-medium">{roleName(change.to)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </>
    );
}
