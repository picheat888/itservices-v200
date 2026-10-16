import { ChangePasswordDialog, SessionTimeoutModal, SetPasswordDialog, useAuth, useSessionTimeout, useUserPreferences } from '@/modules/auth';
import { PROFILE_SECTION_PARAM, ProfileDrawer } from '@/modules/profile';
import { settingsApi } from '@/modules/settings';
import { useDialogParam, useShownDialogParam } from '@/shared/hooks/use-dialog-param';
import { useDocumentTitle } from '@/shared/hooks/use-document-title';
import { useUiStore } from '@/stores/ui';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { NotificationsDropdown } from './notifications-dropdown';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { useNotificationToasts } from './use-notification-toasts';

const SHELL_DIALOGS = ['profile', 'password'] as const;
const SHELL_DIALOG_COMPANIONS = [PROFILE_SECTION_PARAM];

export function AppShell() {
    useDocumentTitle();
    useUserPreferences();
    const density = useUiStore((s) => s.density);
    const { user } = useAuth();

    // Same query key as SecurityTab.
    const { data: security } = useQuery({
        queryKey: ['security-settings'],
        queryFn: settingsApi.getSecurity,
        staleTime: 5 * 60_000,
    });
    // Remembered sign-ins skip the idle timer, as the server does.
    const idleMinutes = user?.remembered ? 0 : (security?.session_timeout_minutes ?? 0);
    const { showWarning, secondsLeft, warnSeconds, extendSession, doLogout } = useSessionTimeout(idleMinutes, !user?.remembered);
    const [notifOpen, setNotifOpen] = useState(false);
    // My Profile and Change password live in the URL (?dialog=), so Back closes them.
    const [shellDialog, setShellDialog, shellDialogUnder] = useDialogParam(SHELL_DIALOGS, SHELL_DIALOG_COMPANIONS);
    // Set your password is raised by the account itself, so the URL only follows it.
    useShownDialogParam('set-password', !!user?.must_change_password, SHELL_DIALOG_COMPANIONS);
    // An owed password change is the only thing on screen: no My Profile over the wall
    const passwordOwed = !!user?.must_change_password || !!user?.password_expired;
    // The expiry wall replaces any open shell dialog, so it does not come back afterwards (set-password swaps the param itself)
    const expiryWall = passwordOwed && !user?.must_change_password;
    useEffect(() => {
        if (expiryWall && shellDialog !== null) setShellDialog(null, { inPlace: true });
    }, [expiryWall, shellDialog, setShellDialog]);
    const openChangePassword = () => setShellDialog('password');
    // Inside the router: tapping a toast navigates
    useNotificationToasts(openChangePassword);

    return (
        <div className="bg-background flex h-screen overflow-hidden" data-density={density}>
            <Sidebar onProfile={(section) => setShellDialog('profile', section ? { with: { section } } : undefined)} />

            <div className="flex min-w-0 flex-1 flex-col">
                <div className="relative">
                    <Topbar notifOpen={notifOpen} onToggleNotif={() => setNotifOpen((v) => !v)} />
                    {notifOpen && <NotificationsDropdown onClose={() => setNotifOpen(false)} onChangePassword={openChangePassword} />}
                </div>

                <main className="bg-content relative flex-1 overflow-y-auto p-6 [--sticky-top:-1.5rem] [scrollbar-gutter:stable]">
                    <Outlet />
                </main>
            </div>

            <ProfileDrawer
                open={!passwordOwed && (shellDialog === 'profile' || shellDialogUnder === 'profile')}
                onClose={() => setShellDialog(null)}
                onChangePassword={() => setShellDialog('password', { over: true })}
            />

            {showWarning && <SessionTimeoutModal secondsLeft={secondsLeft} warnSeconds={warnSeconds} onStay={extendSession} onLogout={doLogout} />}
            {/* Forced password changes first; the voluntary one is dismissable */}
            {user?.must_change_password ? (
                <SetPasswordDialog />
            ) : user?.password_expired ? (
                <ChangePasswordDialog />
            ) : shellDialog === 'password' ? (
                <ChangePasswordDialog onClose={() => setShellDialog(null)} />
            ) : null}
        </div>
    );
}
