import { ChangePasswordDialog } from '@/components/auth/change-password-dialog';
import { SessionTimeoutModal } from '@/components/auth/session-timeout-modal';
import { useAuth } from '@/hooks/use-auth';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useSessionTimeout } from '@/hooks/use-session-timeout';
import { useUserPreferences } from '@/hooks/use-user-preferences';
import { settingsApi } from '@/services/settingsApi';
import { useUiStore } from '@/stores/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { NotificationsDropdown } from './notifications-dropdown';
import { ProfileDrawer } from './profile-drawer';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

export function AppShell() {
    useDocumentTitle();
    useUserPreferences();
    const density = useUiStore((s) => s.density);
    const { user } = useAuth();

    // Shared with SecurityTab via the same query key — updates immediately when admin saves.
    const { data: security } = useQuery({
        queryKey: ['security-settings'],
        queryFn: settingsApi.getSecurity,
        staleTime: 5 * 60_000,
    });
    const { showWarning, secondsLeft, extendSession, doLogout } = useSessionTimeout(security?.session_timeout_minutes ?? 0);
    const [notifOpen, setNotifOpen] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);

    return (
        <div className="bg-background flex h-screen overflow-hidden" data-density={density}>
            <Sidebar onProfile={() => setProfileOpen(true)} />

            <div className="flex min-w-0 flex-1 flex-col">
                <div className="relative">
                    <Topbar onToggleNotif={() => setNotifOpen((v) => !v)} />
                    {notifOpen && <NotificationsDropdown onClose={() => setNotifOpen(false)} />}
                </div>

                <main className="bg-content flex-1 overflow-y-auto p-6">
                    <Outlet />
                </main>
            </div>

            <ProfileDrawer open={profileOpen} onClose={() => setProfileOpen(false)} />

            {showWarning && <SessionTimeoutModal secondsLeft={secondsLeft} onStay={extendSession} onLogout={doLogout} />}
            {user?.password_expired && <ChangePasswordDialog />}
        </div>
    );
}
