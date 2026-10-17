import { findNavItem, navGroups } from '@/app/nav';
import { useT } from '@/lang';
import { useNotifications } from '@/modules/notification';
import { FlagEN, FlagTH } from '@/shared/components/flags';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { cn } from '@/shared/lib/utils';
import { useUiStore } from '@/stores/ui';
import { Bell, Menu, Moon, Sun } from 'lucide-react';
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
    const { toggle: toggleSidebar } = useSidebarStyle();
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
                onClick={toggleSidebar}
                className="text-muted-foreground hover:bg-accent flex h-9 w-9 items-center justify-center rounded-md"
                title={t('toggle_sidebar')}
                aria-label={t('toggle_sidebar')}
            >
                <Menu className="h-[18px] w-[18px]" aria-hidden />
            </button>

            <div className="flex items-center gap-2 text-sm">
                {section && (
                    <>
                        <span className="text-muted-foreground">{t(section.label)}</span>
                        <span className="text-muted-foreground">/</span>
                    </>
                )}
                {crumbTail && current ? (
                    // A page below its menu entry (a report): the entry leads back up, the tail names the page.
                    <>
                        <Link to={current.to} className="text-muted-foreground hover:text-foreground">
                            {here}
                        </Link>
                        <span className="text-muted-foreground">/</span>
                        <span className="max-w-[40ch] truncate font-medium">{crumbTail}</span>
                    </>
                ) : (
                    <span className="font-medium">{here}</span>
                )}
            </div>

            <div className="flex-1" />

            <button
                onClick={toggleLang}
                className="text-muted-foreground hover:bg-accent flex h-9 items-center gap-2 rounded-md px-2.5"
                title={lang === 'en' ? 'เปลี่ยนเป็นภาษาไทย' : 'Switch to English'}
                aria-label={lang === 'en' ? 'เปลี่ยนเป็นภาษาไทย' : 'Switch to English'}
            >
                <span aria-hidden>{lang === 'en' ? <FlagEN /> : <FlagTH />}</span>
                <span className="text-[11px] font-bold tracking-wide">{lang === 'en' ? 'EN' : 'TH'}</span>
            </button>

            <button
                onClick={toggleDark}
                className="text-muted-foreground hover:bg-accent flex h-9 w-9 items-center justify-center rounded-md"
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
                    'relative flex h-9 w-9 items-center justify-center rounded-md transition-colors',
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
        </header>
    );
}
