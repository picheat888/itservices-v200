import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuth, useLogout } from '@/hooks/use-auth';
import { useSettings } from '@/hooks/use-settings';
import { useT } from '@/lib/i18n';
import { navGroups } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui';
import type { Role } from '@/types';
import { LogOut } from 'lucide-react';
import { NavLink } from 'react-router-dom';

function initials(name: string) {
    return name
        .split(' ')
        .map((p) => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
}

export function Sidebar({ onProfile }: { onProfile: () => void }) {
    const t = useT();
    const { user } = useAuth();
    const logout = useLogout();
    const sidebar = useUiStore((s) => s.sidebar);
    const brandName = useUiStore((s) => s.brandName);
    const brandSub = useUiStore((s) => s.brandSub);
    const logoUrl = useUiStore((s) => s.logoUrl);
    const lang = useUiStore((s) => s.lang);
    const role = (user?.role ?? 'user') as Role;
    const { data: settings } = useSettings();
    const iconsOnly = sidebar === 'icons';

    const perms = user?.permissions ?? [];
    const canSee = (i: (typeof navGroups)[number]['items'][number]) => {
        if (i.permission) return perms.includes(i.permission);
        if (i.roles) return i.roles.includes(role);
        return true;
    };
    const groups = navGroups
        .map((g) => ({ ...g, items: g.items.filter(canSee) }))
        .filter((g) => g.items.length > 0);

    return (
        <aside
            className={cn(
                'flex h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-all',
                iconsOnly ? 'w-16' : 'w-64',
            )}
        >
            <div className="flex h-16 items-center gap-3 px-4">
                {logoUrl ? (
                    <img src={logoUrl} alt={brandName} className="h-9 w-9 shrink-0 rounded-lg object-contain" />
                ) : (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand font-bold text-brand-foreground">
                        {brandName.slice(0, 2).toUpperCase()}
                    </div>
                )}
                {!iconsOnly && (
                    <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-sidebar-foreground">{brandName}</div>
                        <div className="truncate text-xs text-muted-foreground">{brandSub}</div>
                    </div>
                )}
            </div>

            <nav className="flex-1 space-y-5 overflow-y-auto px-2 py-3">
                {groups.map((group) => (
                    <div key={group.label}>
                        {!iconsOnly && (
                            <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                {t(group.label)}
                            </div>
                        )}
                        <div className="space-y-0.5">
                            {group.items.map((item) => {
                                const Icon = item.icon;
                                return (
                                    <NavLink
                                        key={item.id}
                                        to={item.to}
                                        end={item.to === '/'}
                                        title={t(item.label)}
                                        className={({ isActive }) =>
                                            cn(
                                                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent',
                                                iconsOnly && 'justify-center px-0',
                                                isActive && 'bg-brand/15 font-semibold text-brand hover:bg-brand/15',
                                            )
                                        }
                                    >
                                        <Icon className="h-[18px] w-[18px] shrink-0" />
                                        {!iconsOnly && <span className="truncate">{t(item.label)}</span>}
                                    </NavLink>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </nav>

            {!iconsOnly && settings?.company_name && (
                <div className="px-4 pb-2 pt-1 text-center">
                    <p className="truncate text-[10px] text-muted-foreground/60">
                        &copy; {new Date().getFullYear()} {settings.company_name}
                    </p>
                </div>
            )}

            <div className="flex items-center gap-2 border-t border-sidebar-border p-3">
                <button
                    onClick={onProfile}
                    title={t('profile')}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 text-left transition-colors hover:bg-sidebar-accent"
                >
                    <Avatar className="h-9 w-9 shrink-0">
                        <AvatarFallback className="bg-brand/10 text-xs font-semibold text-brand">
                            {initials(user?.name ?? 'IN')}
                        </AvatarFallback>
                    </Avatar>
                    {!iconsOnly && (
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{user?.name}</div>
                            <div className="truncate text-xs text-muted-foreground">{t(`role_${role}` as const)}</div>
                        </div>
                    )}
                </button>
                {!iconsOnly && (
                    <button
                        onClick={() => logout.mutate()}
                        title={t('profile_signout')}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        aria-label={lang === 'th' ? 'ออกจากระบบ' : 'Sign out'}
                    >
                        <LogOut className="h-[18px] w-[18px]" />
                    </button>
                )}
            </div>
        </aside>
    );
}
