import { findNavItem, navGroups } from '@/app/nav';
import { useT } from '@/lang';
import { useNotifications } from '@/modules/notification';
import { FlagEN, FlagTH } from '@/shared/components/flags';
import { cn } from '@/shared/lib/utils';
import { useUiStore } from '@/stores/ui';
import { Bell, Menu, Moon, Sun } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useSidebarStyle } from './use-sidebar-style';

interface TopbarProps {
    /** Whether the notifications panel is open — keeps the bell lit while it is. */
    notifOpen: boolean;
    onToggleNotif: () => void;
}

export function Topbar({ notifOpen, onToggleNotif }: TopbarProps) {
    const t = useT();
    const { pathname } = useLocation();
    const dark = useUiStore((s) => s.dark);
    const toggleDark = useUiStore((s) => s.toggleDark);
    const lang = useUiStore((s) => s.lang);
    const toggleLang = useUiStore((s) => s.toggleLang);
    const { toggle: toggleSidebar } = useSidebarStyle();
    const { data: notifData } = useNotifications();
    const unreadCount = notifData?.unread ?? 0;

    const current = findNavItem(pathname);
    const here = current ? t(current.label) : t('overall');
    /**
     * The sidebar section this page sits in — the same heading the user walked past to get
     * here, so the trail names a place.
     *
     * It used to be the viewer's Role Template name, which answers "who am I" in a spot
     * that asks "where am I" (and "Template" is our word for a permission preset, not
     * anything a manager is looking at). Their role and group are on the account card at
     * the foot of the sidebar, where the rest of "who am I" lives.
     */
    const section = current ? navGroups.find((g) => g.items.includes(current)) : undefined;

    return (
        <header className="border-border bg-background flex h-16 shrink-0 items-center gap-3 border-b px-4">
            <button
                onClick={toggleSidebar}
                className="text-muted-foreground hover:bg-accent flex h-9 w-9 items-center justify-center rounded-md"
                title="Toggle sidebar"
            >
                <Menu className="h-[18px] w-[18px]" />
            </button>

            <div className="flex items-center gap-2 text-sm">
                {section && (
                    <>
                        <span className="text-muted-foreground">{t(section.label)}</span>
                        <span className="text-muted-foreground">/</span>
                    </>
                )}
                <span className="font-medium">{here}</span>
            </div>

            <div className="flex-1" />

            <button
                onClick={toggleLang}
                className="text-muted-foreground hover:bg-accent flex h-9 items-center gap-2 rounded-md px-2.5"
                title={lang === 'en' ? 'เปลี่ยนเป็นภาษาไทย' : 'Switch to English'}
            >
                {lang === 'en' ? <FlagEN /> : <FlagTH />}
                <span className="font-mono text-[11px] font-bold tracking-wide">{lang === 'en' ? 'EN' : 'TH'}</span>
            </button>

            <button
                onClick={toggleDark}
                className="text-muted-foreground hover:bg-accent flex h-9 w-9 items-center justify-center rounded-md"
                title={dark ? t('light_mode') : t('dark_mode')}
            >
                {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>

            {/* Stays visibly "on" while its panel is open, so the panel reads as
                belonging to this button instead of floating on its own. */}
            <button
                data-notif-btn
                onClick={onToggleNotif}
                aria-haspopup="true"
                aria-expanded={notifOpen}
                className={cn(
                    'relative flex h-9 w-9 items-center justify-center rounded-md transition-colors',
                    notifOpen ? 'bg-accent text-brand' : 'text-muted-foreground hover:bg-accent',
                )}
                title={t('notif_title')}
            >
                <Bell className="h-[18px] w-[18px]" />
                {unreadCount > 0 && (
                    <span className="bg-destructive absolute top-px right-px flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>
        </header>
    );
}
