import { findNavItem, navGroups } from '@/app/nav';
import { useT } from '@/lang';
import { useNotifications } from '@/modules/notification';
import { FlagEN, FlagTH } from '@/shared/components/flags';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { cn } from '@/shared/lib/utils';
import { useUiStore } from '@/stores/ui';
import { Bell, Moon, Sun } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { countRose } from './count-rise';
import { useSidebarStyle } from './use-sidebar-style';

/** Topbar buttons share one look: 36px (40px below 1280px), hover fades in, press shrinks the content. */
const TOPBAR_BTN = 'group flex h-9 shrink-0 items-center justify-center rounded-md transition-colors duration-150 max-xl:h-10';
const TOPBAR_ICON_BTN = cn(TOPBAR_BTN, 'w-9 max-xl:w-10');

interface TopbarProps {
    /** Whether the notifications panel is open — keeps the bell lit while it is. */
    notifOpen: boolean;
    onToggleNotif: () => void;
}

export function Topbar({ notifOpen, onToggleNotif }: TopbarProps) {
    const t = useT();
    const fmtN = useNumberFormat();
    const { pathname } = useLocation();
    const dark = useUiStore((s) => s.dark);
    const toggleDark = useUiStore((s) => s.toggleDark);
    const lang = useUiStore((s) => s.lang);
    const toggleLang = useUiStore((s) => s.toggleLang);
    const { toggle: toggleSidebar, iconsOnly, narrow } = useSidebarStyle();
    // Narrow screens: the menu covers the page, so only ≡ (now X) stays reachable
    const menuOpen = narrow && !iconsOnly;
    const toggleLabel = narrow ? t(menuOpen ? 'nav_close_menu' : 'nav_open_menu') : t('toggle_sidebar');
    // Written in the language it switches to (the button carries that lang)
    const langSwitchLabel = t(lang === 'en' ? 'lang_switch_to_th' : 'lang_switch_to_en');
    const { data: notifData } = useNotifications();
    const unreadCount = notifData?.unread ?? 0;
    const [themeTurned, setThemeTurned] = useState(false);
    const bellPops = useCountRises(notifData ? unreadCount : null);

    const crumbTail = useUiStore((s) => s.crumbTail);
    const current = findNavItem(pathname);
    const here = current ? t(current.label) : t('overall');
    // Breadcrumb: the sidebar section this page sits in
    const section = current ? navGroups.find((g) => g.items.includes(current)) : undefined;

    return (
        <header className="border-border bg-background flex h-16 shrink-0 items-center gap-3 border-b px-4">
            <button
                data-nav-toggle
                onClick={toggleSidebar}
                className={cn('nav-toggle text-muted-foreground hover:bg-accent', TOPBAR_ICON_BTN)}
                title={toggleLabel}
                aria-label={toggleLabel}
                aria-expanded={!iconsOnly}
                aria-controls="app-sidebar"
            >
                <Press>
                    <BurgerIcon />
                </Press>
            </button>

            <nav aria-label={t('nav_breadcrumb')} inert={menuOpen} className="flex min-w-0 flex-1 items-center gap-2 text-sm whitespace-nowrap">
                {section && (
                    <>
                        <span className="text-muted-foreground shrink-0">{t(section.label)}</span>
                        <span aria-hidden className="text-muted-foreground shrink-0">
                            /
                        </span>
                    </>
                )}
                {crumbTail && current ? (
                    // A page below its menu entry (a report): the entry leads back up, the tail names the page.
                    <>
                        <Link to={current.to} className="text-muted-foreground hover:text-foreground shrink-0">
                            {here}
                        </Link>
                        <span aria-hidden className="text-muted-foreground shrink-0">
                            /
                        </span>
                        <span aria-current="page" className="min-w-0 truncate font-medium">
                            {crumbTail}
                        </span>
                    </>
                ) : (
                    <span aria-current="page" className="min-w-0 truncate font-medium">
                        {here}
                    </span>
                )}
            </nav>

            <div inert={menuOpen} className="flex shrink-0 items-center gap-3">
                <button
                    onClick={toggleLang}
                    className={cn('text-muted-foreground hover:bg-accent px-2.5', TOPBAR_BTN)}
                    title={langSwitchLabel}
                    aria-label={langSwitchLabel}
                    lang={lang === 'en' ? 'th' : 'en'}
                >
                    <Press>
                        <span aria-hidden>{lang === 'en' ? <FlagEN /> : <FlagTH />}</span>
                        <span className="text-[11px] font-bold tracking-wide">{lang === 'en' ? 'EN' : 'TH'}</span>
                    </Press>
                </button>

                <button
                    onClick={() => {
                        setThemeTurned(true);
                        toggleDark();
                    }}
                    className={cn('text-muted-foreground hover:bg-accent', TOPBAR_ICON_BTN)}
                    title={dark ? t('light_mode') : t('dark_mode')}
                    aria-label={dark ? t('light_mode') : t('dark_mode')}
                >
                    <Press>
                        {/* Keyed so the new icon turns in (a keyframe: the theme swap pauses transitions for a frame) */}
                        <span key={dark ? 'sun' : 'moon'} className={cn('flex', themeTurned && 'theme-icon-in')}>
                            {dark ? <Sun className="h-[18px] w-[18px]" aria-hidden /> : <Moon className="h-[18px] w-[18px]" aria-hidden />}
                        </span>
                    </Press>
                </button>

                {/* Bell: lit while its panel is open */}
                <button
                    data-notif-btn
                    onClick={onToggleNotif}
                    aria-haspopup="dialog"
                    aria-expanded={notifOpen}
                    aria-controls={notifOpen ? 'notif-tray' : undefined}
                    className={cn('relative', TOPBAR_ICON_BTN, notifOpen ? 'bg-accent text-brand' : 'text-muted-foreground hover:bg-accent')}
                    title={t('notif_title')}
                    aria-label={unreadCount > 0 ? `${t('notif_title')} (${fmtN(unreadCount)})` : t('notif_title')}
                >
                    <Press>
                        <Bell className="h-[18px] w-[18px]" aria-hidden />
                    </Press>
                    {unreadCount > 0 && (
                        // Keyed by rises, so the count pops each time a notification arrives
                        <span
                            key={bellPops}
                            aria-hidden
                            className={cn(
                                'bg-destructive text-destructive-foreground ring-background absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold ring-2',
                                bellPops > 0 && 'badge-pop',
                            )}
                        >
                            {unreadCount > 9 ? '9+' : fmtN(unreadCount)}
                        </span>
                    )}
                </button>
            </div>
        </header>
    );
}

/** Button content that shrinks a touch while pressed. */
function Press({ children }: { children: ReactNode }) {
    return (
        <span className="flex items-center gap-2 transition-transform duration-75 group-active:scale-[0.92] motion-reduce:transition-none">
            {children}
        </span>
    );
}

/** How many times the count has gone up since it first loaded (null while loading). */
function useCountRises(count: number | null): number {
    const [seen, setSeen] = useState<number | null>(null);
    const [rises, setRises] = useState(0);
    if (count !== null && count !== seen) {
        if (countRose(seen, count)) setRises(rises + 1);
        setSeen(count);
    }
    return rises;
}

/** Menu icon drawn as three lines, so on narrow screens they can fold into an X (app.css `.nav-burger`). */
function BurgerIcon() {
    return (
        <svg
            className="nav-burger h-[18px] w-[18px]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            aria-hidden
        >
            <path className="nav-burger-top" d="M4 6h16" />
            <path className="nav-burger-mid" d="M4 12h16" />
            <path className="nav-burger-bot" d="M4 18h16" />
        </svg>
    );
}
