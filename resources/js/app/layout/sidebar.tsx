import { navGroups } from '@/app/nav';
import { useT } from '@/lang';
import { useAuth, useLogout } from '@/modules/auth';
import { useSettings } from '@/modules/settings';
import { UserAvatar } from '@/shared/components/user-avatar';
import { useSidebarBadges } from '@/shared/hooks/use-sidebar-badges';
import { cn } from '@/shared/lib/utils';
import type { Role } from '@/shared/types';
import { useUiStore } from '@/stores/ui';
import { Loader2, LogOut } from 'lucide-react';
import { NavLink } from 'react-router-dom';

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
    // All "needs attention" counts arrive together from one endpoint, which decides per
    // count what this user is allowed to see (anything else comes back as 0).
    const counts = useSidebarBadges(user != null);
    const badges: Record<string, number> = {
        stock: counts.stock,
        contracts: counts.contracts,
        'my-assets': counts.my_assets,
        assets: counts.assets,
        access: counts.access,
        tickets: counts.tickets,
        employees: counts.employees,
    };
    const canSee = (i: (typeof navGroups)[number]['items'][number]) => {
        if (i.anyOf) return i.anyOf.some((p) => perms.includes(p));
        if (i.permission) return perms.includes(i.permission);
        if (i.roles) return i.roles.includes(role);
        return true;
    };
    const groups = navGroups.map((g) => ({ ...g, items: g.items.filter(canSee) })).filter((g) => g.items.length > 0);

    return (
        <aside
            className={cn('border-sidebar-border bg-sidebar flex h-screen shrink-0 flex-col border-r transition-all', iconsOnly ? 'w-16' : 'w-64')}
        >
            <div className="flex h-16 items-center gap-3 px-4">
                {/* Custom uploaded logo, else the bundled default (public/logo.svg). */}
                <img src={logoUrl || '/logo.svg'} alt={brandName} className="h-9 w-9 shrink-0 rounded-lg object-contain" />
                {!iconsOnly && (
                    <div className="min-w-0">
                        <div className="text-sidebar-foreground truncate text-sm font-bold">{brandName}</div>
                        <div className="text-muted-foreground truncate text-xs">{brandSub}</div>
                    </div>
                )}
            </div>

            <nav className="flex-1 space-y-5 overflow-y-auto px-2 py-3">
                {groups.map((group, idx) => (
                    <div key={group.label}>
                        {iconsOnly ? (
                            idx > 0 && <div className="bg-sidebar-border mx-auto mb-3 h-px w-6 rounded-full" />
                        ) : (
                            <div className="text-muted-foreground px-3 pb-1 text-[11px] font-semibold tracking-wide uppercase">{t(group.label)}</div>
                        )}
                        <div className="space-y-0.5">
                            {group.items.map((item) => {
                                const Icon = item.icon;
                                const badge = badges[item.id] ?? 0;
                                return (
                                    <NavLink
                                        key={item.id}
                                        to={item.to}
                                        end={item.to === '/'}
                                        title={t(item.label)}
                                        className={({ isActive }) =>
                                            cn(
                                                'text-sidebar-foreground hover:bg-sidebar-accent relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                                                iconsOnly && 'justify-center px-0',
                                                isActive && 'bg-brand/15 text-brand hover:bg-brand/15 font-semibold',
                                            )
                                        }
                                    >
                                        <Icon className="h-[18px] w-[18px] shrink-0" />
                                        {!iconsOnly && <span className="truncate">{t(item.label)}</span>}
                                        {badge > 0 &&
                                            (iconsOnly ? (
                                                // Collapsed rail: just a dot so it doesn't crowd the icon.
                                                <span className="bg-brand absolute top-1.5 right-1.5 h-2 w-2 rounded-full" />
                                            ) : (
                                                <span className="bg-brand/15 text-brand ml-auto shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[11px] font-semibold">
                                                    {badge}
                                                </span>
                                            ))}
                                    </NavLink>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </nav>

            {!iconsOnly && settings?.company_name && (
                <div className="px-4 pt-1 pb-2 text-center">
                    <p className="text-muted-foreground/60 truncate text-[10px]">
                        &copy; {new Date().getFullYear()} {settings.company_name}
                    </p>
                </div>
            )}

            {iconsOnly ? (
                <div className="border-sidebar-border flex flex-col items-center gap-1 border-t px-2 py-3">
                    <button
                        onClick={onProfile}
                        title={t('profile')}
                        className="hover:bg-sidebar-accent flex h-10 w-10 items-center justify-center rounded-md transition-colors"
                    >
                        <UserAvatar name={user?.name ?? 'IN'} photoUrl={user?.photo_url} className="h-8 w-8 shrink-0" textClassName="text-xs" />
                    </button>
                    <button
                        onClick={() => logout.mutate()}
                        disabled={logout.isPending}
                        title={t('profile_signout')}
                        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex h-10 w-10 items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-60"
                        aria-label={lang === 'th' ? 'ออกจากระบบ' : 'Sign out'}
                    >
                        {logout.isPending ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <LogOut className="h-[18px] w-[18px]" />}
                    </button>
                </div>
            ) : (
                <div className="border-sidebar-border flex items-center gap-2 border-t p-3">
                    <button
                        onClick={onProfile}
                        title={t('profile')}
                        className="hover:bg-sidebar-accent flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 text-left transition-colors"
                    >
                        <UserAvatar name={user?.name ?? 'IN'} photoUrl={user?.photo_url} className="h-9 w-9 shrink-0" textClassName="text-xs" />
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{user?.name}</div>
                            <div className="text-muted-foreground truncate text-xs">{user?.group_name ?? user?.role_label}</div>
                        </div>
                    </button>
                    <button
                        onClick={() => logout.mutate()}
                        disabled={logout.isPending}
                        title={t('profile_signout')}
                        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-60"
                        aria-label={lang === 'th' ? 'ออกจากระบบ' : 'Sign out'}
                    >
                        {logout.isPending ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <LogOut className="h-[18px] w-[18px]" />}
                    </button>
                </div>
            )}
        </aside>
    );
}
