import { ChangePasswordDialog, SessionTimeoutModal, SetPasswordDialog, useAuth, useSessionTimeout, useUserPreferences } from '@/modules/auth';
import { settingsApi } from '@/modules/settings';
import { useDocumentTitle } from '@/shared/hooks/use-document-title';
import { useUiStore } from '@/stores/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { NotificationsDropdown } from './notifications-dropdown';
import { ProfileDrawer } from './profile-drawer';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { useNotificationToasts } from './use-notification-toasts';

export function AppShell() {
    useDocumentTitle();
    useUserPreferences();
    // Inside the router: tapping a toast navigates.
    useNotificationToasts();
    const density = useUiStore((s) => s.density);
    const passwordDialogOpen = useUiStore((s) => s.passwordDialogOpen);
    const setPasswordDialog = useUiStore((s) => s.setPasswordDialog);
    const { user } = useAuth();

    // Same query key as SecurityTab.
    const { data: security } = useQuery({
        queryKey: ['security-settings'],
        queryFn: settingsApi.getSecurity,
        staleTime: 5 * 60_000,
    });
    // Remembered sign-ins skip the idle timer, as the server does.
    const idleMinutes = user?.remembered ? 0 : (security?.session_timeout_minutes ?? 0);
    const { showWarning, secondsLeft, extendSession, doLogout } = useSessionTimeout(idleMinutes);
    const [notifOpen, setNotifOpen] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);

    return (
        <div className="bg-background flex h-screen overflow-hidden" data-density={density}>
            <Sidebar onProfile={() => setProfileOpen(true)} />

            <div className="flex min-w-0 flex-1 flex-col">
                <div className="relative">
                    <Topbar notifOpen={notifOpen} onToggleNotif={() => setNotifOpen((v) => !v)} />
                    {notifOpen && <NotificationsDropdown onClose={() => setNotifOpen(false)} />}
                </div>

                <main className="bg-content relative flex-1 overflow-y-auto p-6 [--sticky-top:-1.5rem] [scrollbar-gutter:stable]">
                    <Outlet />
                </main>
            </div>

            <ProfileDrawer open={profileOpen} onClose={() => setProfileOpen(false)} />

            {showWarning && <SessionTimeoutModal secondsLeft={secondsLeft} onStay={extendSession} onLogout={doLogout} />}
            {/* Forced password changes first; the voluntary one is dismissable */}
            {user?.must_change_password ? (
                <SetPasswordDialog />
            ) : user?.password_expired ? (
                <ChangePasswordDialog />
            ) : passwordDialogOpen ? (
                <ChangePasswordDialog onClose={() => setPasswordDialog(false)} />
            ) : null}
        </div>
    );
}
