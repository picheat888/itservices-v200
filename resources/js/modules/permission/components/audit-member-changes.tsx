// Role group audit detail: members who joined or left, and the login accounts whose role moved with them.
import { useT } from '@/lang';
import { ChevronRight } from 'lucide-react';
import type { AuditRoleChange } from '../api/permissionApi';

const HEADING = 'text-muted-foreground mb-1 text-[11px] font-semibold tracking-wide uppercase';

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
                <div>
                    <div className={HEADING}>{t('perm_ui_members')}</div>
                    <div className="flex flex-wrap gap-1">
                        {membersAdded.map((name) => (
                            <span
                                key={`added-${name}`}
                                className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                            >
                                + {name}
                            </span>
                        ))}
                        {membersRemoved.map((name) => (
                            <span
                                key={`removed-${name}`}
                                className="rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"
                            >
                                − {name}
                            </span>
                        ))}
                    </div>
                </div>
            )}
            {roleChanges.length > 0 && (
                <div>
                    <div className={HEADING}>{t('audit_field_role_id')}</div>
                    <div className="space-y-1.5">
                        {roleChanges.map((change, index) => (
                            <div key={`${change.name}-${index}`} className="flex items-center gap-2 text-sm">
                                <span className="text-muted-foreground block w-32 shrink-0 truncate text-xs font-medium">{change.name}</span>
                                <span className="bg-muted text-muted-foreground rounded px-2 py-0.5 line-through">{roleName(change.from)}</span>
                                <ChevronRight className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                                <span className="bg-brand/10 text-brand rounded px-2 py-0.5 font-medium">{roleName(change.to)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </>
    );
}
