// Feeds the bell poll's unread total to the tab title while the signed-in shell is mounted; back to 0 when it leaves.
import { useNotifications } from '@/modules/notification';
import { useUiStore } from '@/stores/ui';
import { useEffect } from 'react';

export function useUnreadInTitle(): void {
    const { data } = useNotifications();
    const unread = data?.unread ?? 0;
    const setTitleUnread = useUiStore((s) => s.setTitleUnread);

    useEffect(() => setTitleUnread(unread), [unread, setTitleUnread]);
    useEffect(() => () => setTitleUnread(0), [setTitleUnread]);
}
