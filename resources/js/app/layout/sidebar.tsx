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
import { ChevronDown, Loader2, LogOut } from 'lucide-react';
import { useEffect, useRef, type RefObject } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { nextFocusIndex } from './menu-focus';
import { useNavScroll } from './use-nav-scroll';
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

/** The menu the user may see, badge counts and the account. */
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

/** 1280px and up: the sidebar pushes the page; its width animates between rail and menu (app.css `.nav-push`). */
function WideSidebar({ onProfile }: SidebarProps) {
    const t = useT();
    const { iconsOnly } = useSidebarStyle();
    return (
        <aside
            id="app-sidebar"
            aria-label={t('nav_menu')}
            className="nav-push border-sidebar-border bg-sidebar relative flex h-dvh shrink-0 overflow-clip border-r"
        >
            {/* Fixed width inside, so nothing reflows while the rail widens */}
            <div className="flex h-full w-64 shrink-0 flex-col">
                <SidebarPanel open={!iconsOnly} onProfile={onProfile} />
            </div>
        </aside>
    );
}

/** The ≡ button in the topbar, which rides above the open menu on narrow screens. */
const toggleButton = () => document.querySelector<HTMLElement>('[data-nav-toggle]');

/** Below 1280px: a 64px icon rail that opens into the full menu over the page (app.css `.nav-drawer`). */
function NarrowSidebar({ onProfile }: SidebarProps) {
    const t = useT();
    const { iconsOnly } = useSidebarStyle();
    const open = !iconsOnly;
    const setOpen = useUiStore((s) => s.setNarrowSidebarOpen);
    const asideRef = useRef<HTMLElement>(null);
    const { pathname } = useLocation();

    // Focus inside the menu goes back to ≡ so it is never left on a hidden element
    const closeMenu = () => {
        if (asideRef.current?.contains(document.activeElement)) toggleButton()?.focus();
        setOpen(false);
    };

    // Back / Forward closes the menu too
    useEffect(() => setOpen(false), [pathname, setOpen]);
    // Leaving the narrow layout drops the "open for now" state
    useEffect(() => () => setOpen(false), [setOpen]);
    useMenuKeyboard(open, asideRef);

    return (
        <>
            <div className="relative w-16 shrink-0">
                <span aria-hidden="true" className="nav-drawer-shadow pointer-events-none absolute inset-y-0 left-0 z-40 w-64" />
                <aside
                    id="app-sidebar"
                    ref={asideRef}
                    aria-label={t('nav_menu')}
                    className="nav-drawer border-sidebar-border bg-sidebar absolute inset-y-0 left-0 z-40 flex w-64 flex-col border-r"
                >
                    {/* Rail edge, hidden while the menu is open */}
                    <span aria-hidden="true" className="nav-mark bg-sidebar-border absolute inset-y-0 left-[63px] w-px" />
                    <SidebarPanel
                        open={open}
                        toggleSlot
                        onPick={closeMenu}
                        onProfile={(section) => {
                            setOpen(false);
                            onProfile(section);
                        }}
                    />
                </aside>
            </div>

            {/* Backdrop: tap to close (Esc and ≡ close it from the keyboard) */}
            <div aria-hidden="true" onClick={closeMenu} className="nav-scrim fixed inset-0 z-30 bg-black/30 backdrop-blur-sm" />
        </>
    );
}

interface SidebarPanelProps {
    /** Menu (labels) rather than the icon rail; both are drawn and cross-fade. */
    open: boolean;
    /** Leave room at the top-right for the ≡ / X that rides over the narrow menu. */
    toggleSlot?: boolean;
    onPick?: () => void;
    onProfile: (section?: ProfileSection) => void;
}

/** Logo, menu and account, laid out on a 256px panel whose first 64px are the icon rail. */
function SidebarPanel({ open, toggleSlot = false, onPick, onProfile }: SidebarPanelProps) {
    const t = useT();
    const logout = useLogout();
    const brandName = useUiStore((s) => s.brandName);
    const brandSub = useUiStore((s) => s.brandSub);
    const logoUrl = useUiStore((s) => s.logoUrl);
    const lang = useUiStore((s) => s.lang);
    const { data: settings } = useSettings();
    const { user, counts, badges, groups } = useSidebarData();
    const navRef = useRef<HTMLElement>(null);
    const { pathname } = useLocation();
    const { edges, pageDown } = useNavScroll(navRef, `${pathname}|${groups.length}`);
    // Name follows the UI language; avatar initials stay on the English name
    const displayName = localPair(user?.name, user?.name_th, lang);
    // Kit waiting for acceptance opens the profile straight on its Assets tab.
    const openProfile = () => onProfile(counts.my_assets > 0 ? 'assets' : undefined);

    return (
        <>
            <div className={cn('flex h-16 shrink-0 items-center pl-2', toggleSlot ? 'pr-14' : 'pr-2')}>
                {/* Logo and names lead to the Dashboard */}
                <Link
                    to="/"
                    title={t('overall')}
                    onClick={onPick}
                    className="group flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-1.5 focus-visible:outline-none"
                >
                    {/* Custom uploaded logo, else the bundled default (public/logo.svg). */}
                    <img
                        src={logoUrl || '/logo.svg'}
                        alt=""
                        className="group-focus-visible:ring-ring group-focus-visible:ring-offset-sidebar h-9 w-9 shrink-0 rounded-lg object-contain group-focus-visible:ring-2 group-focus-visible:ring-offset-2"
                    />
                    <div className="nav-label min-w-0">
                        <div className="text-sidebar-foreground truncate text-sm font-bold">{brandName}</div>
                        <div className="text-muted-foreground truncate text-xs">{brandSub}</div>
                    </div>
                </Link>
            </div>

            <div className="relative min-h-0 flex-1">
                <nav
                    ref={navRef}
                    className="absolute inset-0 scroll-pt-7 scroll-pb-14 overflow-x-hidden overflow-y-auto overscroll-contain px-2 py-3"
                >
                    <div className="space-y-5">
                        {groups.map((group, idx) => (
                            <div key={group.label}>
                                {/* Rail: a short rule in place of the group name (app.css .nav-head) */}
                                <div className={cn('nav-head relative overflow-hidden', idx === 0 && 'nav-head-first')}>
                                    <div className="nav-label text-muted-foreground px-3 text-[11px] font-semibold tracking-wide whitespace-nowrap uppercase">
                                        {t(group.label)}
                                    </div>
                                    {idx > 0 && (
                                        <span aria-hidden="true" className="nav-mark bg-sidebar-border absolute top-0 left-3 h-px w-6 rounded-full" />
                                    )}
                                </div>
                                <div className="space-y-0.5">
                                    {group.items.map((item) => (
                                        <NavRow key={item.id} item={item} badge={badges[item.id] ?? 0} onPick={onPick} />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </nav>
                <NavScrollCue edges={edges} open={open} onPageDown={pageDown} />
            </div>

            {settings?.company_name && (
                <div inert={!open} className="nav-label px-4 pt-1 pb-2 text-center">
                    <p className="text-muted-foreground truncate text-[10px]">
                        &copy; {new Date().getFullYear()} {settings.company_name}
                    </p>
                </div>
            )}

            {/* Rail footer is taller (avatar over sign-out); its height animates with the menu (app.css .nav-foot) */}
            <div className="nav-foot border-sidebar-border relative shrink-0 overflow-hidden border-t">
                {/* Rail: avatar over sign-out */}
                <div inert={open} className="nav-mark absolute top-3 left-3 flex flex-col items-center gap-1">
                    <button
                        onClick={openProfile}
                        title={t('profile')}
                        aria-label={t('profile')}
                        className="hover:bg-sidebar-accent flex h-10 w-10 items-center justify-center rounded-md transition-colors"
                    >
                        <span className="relative shrink-0">
                            <UserAvatar name={user?.name ?? 'IN'} photoUrl={user?.photo_url} className="h-8 w-8 shrink-0" textClassName="text-xs" />
                            <PendingAssetsPill count={counts.my_assets} />
                        </span>
                    </button>
                    <SignOutButton pending={logout.isPending} onClick={() => logout.mutate()} className="h-10 w-10" />
                </div>
                {/* Menu: name row */}
                <div inert={!open} className="nav-label absolute inset-x-3 top-3">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={openProfile}
                            title={t('profile')}
                            aria-label={`${t('profile')}, ${displayName}`}
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
                        <SignOutButton
                            pending={logout.isPending}
                            onClick={() => logout.mutate()}
                            className="h-8 w-8 shrink-0 max-xl:h-10 max-xl:w-10"
                        />
                    </div>
                </div>
            </div>
        </>
    );
}

/** Fades over the menu's hidden ends; ▾ pages down by touch (keyboard and screen readers reach every item anyway). */
function NavScrollCue({ edges, open, onPageDown }: { edges: { above: boolean; below: boolean }; open: boolean; onPageDown: () => void }) {
    return (
        <>
            <span
                aria-hidden="true"
                className={cn(
                    'from-sidebar to-sidebar/0 pointer-events-none absolute inset-x-0 top-0 h-7 bg-linear-to-b transition-opacity duration-150 motion-reduce:transition-none',
                    edges.above ? 'opacity-100' : 'opacity-0',
                )}
            />
            <span
                aria-hidden="true"
                className={cn(
                    'from-sidebar/0 to-sidebar pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-linear-to-b to-70% transition-opacity duration-150 motion-reduce:transition-none',
                    edges.below ? 'opacity-100' : 'opacity-0',
                )}
            />
            <button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                onClick={onPageDown}
                className={cn(
                    'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground absolute bottom-1 flex h-7 w-12 items-center justify-center rounded-md transition-opacity duration-150 motion-reduce:transition-none',
                    open ? 'left-1/2 -translate-x-1/2' : 'left-2',
                    edges.below ? 'opacity-100' : 'pointer-events-none opacity-0',
                )}
            >
                <ChevronDown className="h-4 w-4" />
            </button>
        </>
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

/** One menu row: rail icon + dot when closed, label + count pill when open. */
function NavRow({ item, badge, onPick }: { item: NavItem; badge: number; onPick?: () => void }) {
    const t = useT();
    const fmtN = useNumberFormat();
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
                            <span
                                aria-hidden="true"
                                className="nav-label bg-brand/15 text-brand-ink dark:group-aria-[current=page]:bg-brand dark:group-aria-[current=page]:text-brand-foreground relative shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold"
                            >
                                {fmtN(badge)}
                            </span>
                            <span className="sr-only">, {t('nav_badge_sr').replace('{n}', fmtN(badge))}</span>
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
