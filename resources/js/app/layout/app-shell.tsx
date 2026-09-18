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
    // Turns newly-arrived notifications into toasts. Lives here (inside the router)
    // because tapping one navigates; the toasts themselves render in the app-wide
    // Toaster mounted at the root.
    useNotificationToasts();
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
                    <Topbar notifOpen={notifOpen} onToggleNotif={() => setNotifOpen((v) => !v)} />
                    {notifOpen && <NotificationsDropdown onClose={() => setNotifOpen(false)} />}
                </div>

                {/* scrollbar-gutter keeps the bar's width reserved whether or not a page needs
                    one, so moving between a long list and a short one does not shift the layout. */}
                <main className="bg-content flex-1 overflow-y-auto p-6 [scrollbar-gutter:stable]">
                    <Outlet />
                </main>
            </div>

            <ProfileDrawer open={profileOpen} onClose={() => setProfileOpen(false)} />

            {showWarning && <SessionTimeoutModal secondsLeft={secondsLeft} onStay={extendSession} onLogout={doLogout} />}
            {/* Both block the app until a new password is set, but they explain different
                reasons: an admin set this one, versus the policy aged it out. */}
            {user?.must_change_password ? <SetPasswordDialog /> : user?.password_expired ? <ChangePasswordDialog /> : null}
        </div>
    );
}
