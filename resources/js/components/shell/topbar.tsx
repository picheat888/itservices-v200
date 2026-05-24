import { FlagEN, FlagTH } from '@/components/shared/flags';
import { useAuth } from '@/hooks/use-auth';
import { useNotifications } from '@/hooks/use-notifications';
import { useT } from '@/lib/i18n';
import { navGroups } from '@/lib/nav';
import { useUiStore } from '@/stores/ui';
import type { Role } from '@/types';
import { Bell, Menu, Moon, Search, Sun } from 'lucide-react';
import { useLocation } from 'react-router-dom';

interface TopbarProps {
    onToggleNotif: () => void;
}

export function Topbar({ onToggleNotif }: TopbarProps) {
    const t = useT();
    const { user } = useAuth();
    const { pathname } = useLocation();
    const dark = useUiStore((s) => s.dark);
    const toggleDark = useUiStore((s) => s.toggleDark);
    const lang = useUiStore((s) => s.lang);
    const toggleLang = useUiStore((s) => s.toggleLang);
    const toggleSidebar = useUiStore((s) => s.toggleSidebar);
    const role = (user?.role ?? 'user') as Role;
    const { data: notifData } = useNotifications();
    const unreadCount = notifData?.unread ?? 0;

    const current = navGroups.flatMap((g) => g.items).find((i) => i.to === pathname);
    const here = current ? t(current.label) : t('overall');

    return (
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background px-4">
            <button
                onClick={toggleSidebar}
                className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                title="Toggle sidebar"
            >
                <Menu className="h-[18px] w-[18px]" />
            </button>

            <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{t(`role_${role}` as const)}</span>
                <span className="text-muted-foreground">/</span>
                <span className="font-medium">{here}</span>
            </div>

            <div className="flex-1" />

            <div className="hidden w-80 items-center gap-2 rounded-md border border-transparent bg-muted px-3 py-2 text-muted-foreground transition-colors focus-within:border-brand focus-within:bg-background md:flex">
                <Search className="h-4 w-4 shrink-0" />
                <input
                    placeholder={t('search_placeholder')}
                    className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
                <kbd className="rounded border border-border bg-background px-1.5 font-mono text-[10.5px] text-muted-foreground">⌘K</kbd>
            </div>

            <button
                onClick={toggleLang}
                className="flex h-9 items-center gap-2 rounded-md px-2.5 text-muted-foreground hover:bg-accent"
                title={lang === 'en' ? 'เปลี่ยนเป็นภาษาไทย' : 'Switch to English'}
            >
                {lang === 'en' ? <FlagEN /> : <FlagTH />}
                <span className="font-mono text-[11px] font-bold tracking-wide">{lang === 'en' ? 'EN' : 'TH'}</span>
            </button>

            <button
                onClick={toggleDark}
                className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                title={dark ? t('light_mode') : t('dark_mode')}
            >
                {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>

            <button
                data-notif-btn
                onClick={onToggleNotif}
                className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                title={t('notif_title')}
            >
                <Bell className="h-[18px] w-[18px]" />
                {unreadCount > 0 && (
                    <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-white">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>
        </header>
    );
}
