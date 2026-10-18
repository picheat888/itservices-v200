import { findNavItem, navGroups } from '@/app/nav';
import { useT } from '@/lang';
import { useNotifications } from '@/modules/notification';
import { FlagEN, FlagTH } from '@/shared/components/flags';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { cn } from '@/shared/lib/utils';
import { useUiStore } from '@/stores/ui';
import { Bell, Moon, Sun } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useSidebarStyle } from './use-sidebar-style';

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
                className="nav-toggle group text-muted-foreground hover:bg-accent flex h-9 w-9 shrink-0 items-center justify-center rounded-md max-xl:h-10 max-xl:w-10"
                title={toggleLabel}
                aria-label={toggleLabel}
                aria-expanded={!iconsOnly}
                aria-controls="app-sidebar"
            >
                <span className="flex transition-transform duration-75 group-active:scale-[0.92]">
                    <BurgerIcon />
                </span>
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
                    className="text-muted-foreground hover:bg-accent flex h-9 items-center gap-2 rounded-md px-2.5 max-xl:h-10"
                    title={langSwitchLabel}
                    aria-label={langSwitchLabel}
                    lang={lang === 'en' ? 'th' : 'en'}
                >
                    <span aria-hidden>{lang === 'en' ? <FlagEN /> : <FlagTH />}</span>
                    <span className="text-[11px] font-bold tracking-wide">{lang === 'en' ? 'EN' : 'TH'}</span>
                </button>

                <button
                    onClick={toggleDark}
                    className="text-muted-foreground hover:bg-accent flex h-9 w-9 items-center justify-center rounded-md max-xl:h-10 max-xl:w-10"
                    title={dark ? t('light_mode') : t('dark_mode')}
                    aria-label={dark ? t('light_mode') : t('dark_mode')}
                >
                    {dark ? <Sun className="h-[18px] w-[18px]" aria-hidden /> : <Moon className="h-[18px] w-[18px]" aria-hidden />}
                </button>

                {/* Bell: lit while its panel is open */}
                <button
                    data-notif-btn
                    onClick={onToggleNotif}
                    aria-haspopup="dialog"
                    aria-expanded={notifOpen}
                    aria-controls={notifOpen ? 'notif-tray' : undefined}
                    className={cn(
                        'relative flex h-9 w-9 items-center justify-center rounded-md transition-colors max-xl:h-10 max-xl:w-10',
                        notifOpen ? 'bg-accent text-brand' : 'text-muted-foreground hover:bg-accent',
                    )}
                    title={t('notif_title')}
                    aria-label={unreadCount > 0 ? `${t('notif_title')} (${fmtN(unreadCount)})` : t('notif_title')}
                >
                    <Bell className="h-[18px] w-[18px]" aria-hidden />
                    {unreadCount > 0 && (
                        <span
                            aria-hidden
                            className="bg-destructive text-destructive-foreground absolute top-px right-px flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold"
                        >
                            {unreadCount > 9 ? '9+' : fmtN(unreadCount)}
                        </span>
                    )}
                </button>
            </div>
        </header>
    );
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
