import { navGroups } from '@/app/nav';
import { useT } from '@/lang';
import { useAuth, useLogout } from '@/modules/auth';
import type { ProfileSection } from '@/modules/profile';
import { useSettings } from '@/modules/settings';
import { UserAvatar } from '@/shared/components/user-avatar';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { useSidebarBadges } from '@/shared/hooks/use-sidebar-badges';
import { localPair } from '@/shared/lib/local-name';
import { cn } from '@/shared/lib/utils';
import type { NavItem, Role } from '@/shared/types';
import { useUiStore } from '@/stores/ui';
import { Loader2, LogOut } from 'lucide-react';
import { useEffect, useRef, type RefObject } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { nextFocusIndex } from './menu-focus';
import { useSidebarStyle } from './use-sidebar-style';

/** Count of hand-overs waiting for the user's acceptance, pinned to the avatar. */
function PendingAssetsPill({ count }: { count: number }) {
    const t = useT();
    const fmtN = useNumberFormat();
    if (count <= 0) return null;
    return (
        <span className="ring-sidebar absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-emerald-700 px-1 text-[10px] font-bold text-white ring-2">
            <span aria-hidden="true">{fmtN(count)}</span>
            <span className="sr-only">{t('profile_pending_assets_badge').replace('{n}', fmtN(count))}</span>
        </span>
    );
}

/** What both sidebar layouts draw from: the menu the user may see, badge counts, the account. */
function useSidebarData() {
    const { user } = useAuth();
    const role = (user?.role ?? 'user') as Role;
    const perms = user?.permissions ?? [];
    // One endpoint returns every count, already 0 for anything this user may not see.
    const counts = useSidebarBadges(user != null);
    // Keyed by nav item id; a count missing here shows no badge.
    const badges: Record<string, number> = {
        stock: counts.stock,
        contracts: counts.contracts,
        assets: counts.assets,
        access: counts.access,
        tickets: counts.tickets,
        employees: counts.employees,
        requests: counts.requests,
    };
    const canSee = (i: NavItem) => {
        if (i.anyOf) return i.anyOf.some((p) => perms.includes(p));
        if (i.permission) return perms.includes(i.permission);
        if (i.roles) return i.roles.includes(role);
        return true;
    };
    const groups = navGroups.map((g) => ({ ...g, items: g.items.filter(canSee) })).filter((g) => g.items.length > 0);

    return { user, counts, badges, groups };
}

interface SidebarProps {
    onProfile: (section?: ProfileSection) => void;
}

export function Sidebar({ onProfile }: SidebarProps) {
    const { narrow } = useSidebarStyle();
    return narrow ? <NarrowSidebar onProfile={onProfile} /> : <WideSidebar onProfile={onProfile} />;
}

/** 1280px and up: the labelled sidebar pushes the page, or the saved icon rail. */
function WideSidebar({ onProfile }: SidebarProps) {
    const t = useT();
    const logout = useLogout();
    const { iconsOnly } = useSidebarStyle();
    const brandName = useUiStore((s) => s.brandName);
    const brandSub = useUiStore((s) => s.brandSub);
    const logoUrl = useUiStore((s) => s.logoUrl);
    const lang = useUiStore((s) => s.lang);
    const { data: settings } = useSettings();
    const { user, counts, badges, groups } = useSidebarData();
    // Name follows the UI language; avatar initials stay on the English name
    const displayName = localPair(user?.name, user?.name_th, lang);
    // Kit waiting for acceptance opens the profile straight on its Assets tab.
    const openProfile = () => onProfile(counts.my_assets > 0 ? 'assets' : undefined);

    return (
        <aside
            id="app-sidebar"
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
                                                'group text-sidebar-foreground hover:bg-sidebar-accent relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                                                iconsOnly && 'justify-center px-0',
                                                isActive && 'bg-brand/15 text-brand-ink hover:bg-brand/15 font-semibold',
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
                                                // Dark mode, active row: solid brand pill (tint-on-tint read ~3.7:1)
                                                <span className="bg-brand/15 text-brand-ink dark:group-aria-[current=page]:bg-brand dark:group-aria-[current=page]:text-brand-foreground ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold">
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
                    <p className="text-muted-foreground truncate text-[10px]">
                        &copy; {new Date().getFullYear()} {settings.company_name}
                    </p>
                </div>
            )}

            {iconsOnly ? (
                <div className="border-sidebar-border flex flex-col items-center gap-1 border-t px-2 py-3">
                    <button
                        onClick={openProfile}
                        title={t('profile')}
                        className="hover:bg-sidebar-accent flex h-10 w-10 items-center justify-center rounded-md transition-colors"
                    >
                        <span className="relative shrink-0">
                            <UserAvatar name={user?.name ?? 'IN'} photoUrl={user?.photo_url} className="h-8 w-8 shrink-0" textClassName="text-xs" />
                            <PendingAssetsPill count={counts.my_assets} />
                        </span>
                    </button>
                    <SignOutButton pending={logout.isPending} onClick={() => logout.mutate()} className="h-10 w-10" />
                </div>
            ) : (
                <div className="border-sidebar-border flex items-center gap-2 border-t p-3">
                    <button
                        onClick={openProfile}
                        title={t('profile')}
                        className="hover:bg-sidebar-accent flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 text-left transition-colors"
                    >
                        <span className="relative shrink-0">
                            <UserAvatar name={user?.name ?? 'IN'} photoUrl={user?.photo_url} className="h-9 w-9 shrink-0" textClassName="text-xs" />
                            <PendingAssetsPill count={counts.my_assets} />
                        </span>
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{displayName}</div>
                            <div className="text-muted-foreground truncate text-xs">{user?.group_name ?? user?.role_label}</div>
                        </div>
                    </button>
                    <SignOutButton pending={logout.isPending} onClick={() => logout.mutate()} className="h-8 w-8 shrink-0" />
                </div>
            )}
        </aside>
    );
}

function SignOutButton({ pending, onClick, className }: { pending: boolean; onClick: () => void; className?: string }) {
    const t = useT();
    return (
        <button
            onClick={onClick}
            disabled={pending}
            title={t('profile_signout')}
            aria-label={t('cmn_sign_out')}
            className={cn(
                'text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-60',
                className,
            )}
        >
            {pending ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <LogOut className="h-[18px] w-[18px]" />}
        </button>
    );
}

/** The ≡ button in the topbar, which rides above the open menu on narrow screens. */
const toggleButton = () => document.querySelector<HTMLElement>('[data-nav-toggle]');

/**
 * Below 1280px: a 64px icon rail that opens into the full menu over the page.
 * One element for both states, so icons stay put while the labels fade in (app.css `.nav-*`).
 */
function NarrowSidebar({ onProfile }: SidebarProps) {
    const t = useT();
    const logout = useLogout();
    const { iconsOnly } = useSidebarStyle();
    const open = !iconsOnly;
    const setOpen = useUiStore((s) => s.setNarrowSidebarOpen);
    const brandName = useUiStore((s) => s.brandName);
    const brandSub = useUiStore((s) => s.brandSub);
    const logoUrl = useUiStore((s) => s.logoUrl);
    const lang = useUiStore((s) => s.lang);
    const { data: settings } = useSettings();
    const { user, counts, badges, groups } = useSidebarData();
    const displayName = localPair(user?.name, user?.name_th, lang);
    const asideRef = useRef<HTMLElement>(null);
    const { pathname } = useLocation();

    // Focus inside the menu goes back to ≡ so it is never left on a hidden element
    const closeMenu = () => {
        if (asideRef.current?.contains(document.activeElement)) toggleButton()?.focus();
        setOpen(false);
    };
    const openProfile = () => {
        setOpen(false);
        onProfile(counts.my_assets > 0 ? 'assets' : undefined);
    };

    // Back / Forward closes the menu too
    useEffect(() => setOpen(false), [pathname, setOpen]);
    // Leaving the narrow layout drops the "open for now" state
    useEffect(() => () => setOpen(false), [setOpen]);
    useMenuKeyboard(open, asideRef);

    return (
        <>
            <div className="relative w-16 shrink-0">
                <aside
                    id="app-sidebar"
                    ref={asideRef}
                    aria-label={t('nav_menu')}
                    className="nav-drawer border-sidebar-border bg-sidebar absolute inset-y-0 left-0 z-40 flex w-64 flex-col border-r"
                >
                    {/* Rail edge, hidden while the menu is open */}
                    <span aria-hidden="true" className="nav-mark bg-sidebar-border absolute inset-y-0 left-[63px] w-px" />

                    <div className="flex h-16 shrink-0 items-center gap-3 pr-14 pl-4">
                        <img src={logoUrl || '/logo.svg'} alt={brandName} className="h-9 w-9 shrink-0 rounded-lg object-contain" />
                        <div className="nav-label min-w-0">
                            <div className="text-sidebar-foreground truncate text-sm font-bold">{brandName}</div>
                            <div className="text-muted-foreground truncate text-xs">{brandSub}</div>
                        </div>
                    </div>

                    <nav className="flex-1 space-y-5 overflow-x-hidden overflow-y-auto overscroll-contain px-2 py-3">
                        {groups.map((group, idx) => (
                            <div key={group.label}>
                                <div className="relative h-5">
                                    <div className="nav-label text-muted-foreground px-3 text-[11px] font-semibold tracking-wide whitespace-nowrap uppercase">
                                        {t(group.label)}
                                    </div>
                                    {idx > 0 && (
                                        <span
                                            aria-hidden="true"
                                            className="nav-mark bg-sidebar-border absolute top-[9px] left-3 h-px w-6 rounded-full"
                                        />
                                    )}
                                </div>
                                <div className="space-y-0.5">
                                    {group.items.map((item) => (
                                        <NarrowNavItem key={item.id} item={item} badge={badges[item.id] ?? 0} onPick={closeMenu} />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </nav>

                    <div className="border-sidebar-border relative h-[104px] shrink-0 border-t">
                        {/* Rail: avatar over sign-out */}
                        <div inert={open} className="nav-mark absolute top-3 left-3 flex flex-col items-center gap-1">
                            <button
                                onClick={openProfile}
                                title={t('profile')}
                                className="hover:bg-sidebar-accent flex h-10 w-10 items-center justify-center rounded-md transition-colors"
                            >
                                <span className="relative shrink-0">
                                    <UserAvatar
                                        name={user?.name ?? 'IN'}
                                        photoUrl={user?.photo_url}
                                        className="h-8 w-8 shrink-0"
                                        textClassName="text-xs"
                                    />
                                    <PendingAssetsPill count={counts.my_assets} />
                                </span>
                            </button>
                            <SignOutButton pending={logout.isPending} onClick={() => logout.mutate()} className="h-10 w-10" />
                        </div>
                        {/* Menu: name row, company line below */}
                        <div inert={!open} className="nav-label absolute inset-x-3 top-3 flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={openProfile}
                                    title={t('profile')}
                                    className="hover:bg-sidebar-accent flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 text-left transition-colors"
                                >
                                    <span className="relative shrink-0">
                                        <UserAvatar
                                            name={user?.name ?? 'IN'}
                                            photoUrl={user?.photo_url}
                                            className="h-9 w-9 shrink-0"
                                            textClassName="text-xs"
                                        />
                                        <PendingAssetsPill count={counts.my_assets} />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm font-medium">{displayName}</div>
                                        <div className="text-muted-foreground truncate text-xs">{user?.group_name ?? user?.role_label}</div>
                                    </div>
                                </button>
                                <SignOutButton pending={logout.isPending} onClick={() => logout.mutate()} className="h-8 w-8 shrink-0" />
                            </div>
                            {settings?.company_name && (
                                <p className="text-muted-foreground truncate text-center text-[10px]">
                                    &copy; {new Date().getFullYear()} {settings.company_name}
                                </p>
                            )}
                        </div>
                    </div>
                </aside>
            </div>

            {/* Backdrop: tap to close (Esc and ≡ close it from the keyboard) */}
            <div aria-hidden="true" onClick={closeMenu} className="nav-scrim fixed inset-0 z-30 bg-black/30 backdrop-blur-sm" />
        </>
    );
}

/** One menu row: rail icon + dot when closed, label + count pill when open. */
function NarrowNavItem({ item, badge, onPick }: { item: NavItem; badge: number; onPick: () => void }) {
    const t = useT();
    const Icon = item.icon;
    return (
        <NavLink
            to={item.to}
            end={item.to === '/'}
            title={t(item.label)}
            onClick={onPick}
            className={({ isActive }) =>
                cn(
                    'group relative flex items-center gap-3 overflow-hidden rounded-md py-2 pr-3 pl-[15px] text-sm font-medium focus-visible:outline-none',
                    isActive ? 'text-brand-ink font-semibold' : 'text-sidebar-foreground',
                )
            }
        >
            {({ isActive }) => (
                <>
                    <span
                        aria-hidden="true"
                        className={cn(
                            'nav-row-bg group-focus-visible:ring-ring absolute inset-0 rounded-md group-focus-visible:ring-2 group-focus-visible:ring-inset',
                            isActive ? 'bg-brand/15' : 'group-hover:bg-sidebar-accent',
                        )}
                    />
                    <Icon className="relative h-[18px] w-[18px] shrink-0" />
                    <span className="nav-label relative min-w-0 flex-1 truncate">{t(item.label)}</span>
                    {badge > 0 && (
                        <>
                            <span aria-hidden="true" className="nav-mark bg-brand absolute top-1.5 left-[35px] h-2 w-2 rounded-full" />
                            <span className="nav-label bg-brand/15 text-brand-ink dark:group-aria-[current=page]:bg-brand dark:group-aria-[current=page]:text-brand-foreground relative shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold">
                                {badge}
                            </span>
                        </>
                    )}
                </>
            )}
        </NavLink>
    );
}

/** While the menu is open: Esc closes it, Tab cycles through ≡ and the menu only. */
function useMenuKeyboard(open: boolean, asideRef: RefObject<HTMLElement | null>) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                useUiStore.getState().setNarrowSidebarOpen(false);
                toggleButton()?.focus();
                return;
            }
            if (e.key !== 'Tab' || !asideRef.current) return;
            const inMenu = [...asideRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')].filter(
                (el) => !el.closest('[inert]'),
            );
            const stops = [toggleButton(), ...inMenu].filter((el): el is HTMLElement => el != null);
            e.preventDefault();
            stops[nextFocusIndex(stops.length, stops.indexOf(document.activeElement as HTMLElement), e.shiftKey)]?.focus();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, asideRef]);
}
