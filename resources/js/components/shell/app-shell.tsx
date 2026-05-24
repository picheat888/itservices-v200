import { useDocumentTitle } from '@/hooks/use-document-title';
import { useUserPreferences } from '@/hooks/use-user-preferences';
import { useUiStore } from '@/stores/ui';
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
    const [notifOpen, setNotifOpen] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);

    return (
        <div className="flex h-screen overflow-hidden bg-background" data-density={density}>
            <Sidebar onProfile={() => setProfileOpen(true)} />

            <div className="flex min-w-0 flex-1 flex-col">
                <div className="relative">
                    <Topbar onToggleNotif={() => setNotifOpen((v) => !v)} />
                    {notifOpen && <NotificationsDropdown onClose={() => setNotifOpen(false)} />}
                </div>

                <main className="flex-1 overflow-y-auto bg-content p-6">
                    <Outlet />
                </main>
            </div>

            <ProfileDrawer open={profileOpen} onClose={() => setProfileOpen(false)} />
        </div>
    );
}
