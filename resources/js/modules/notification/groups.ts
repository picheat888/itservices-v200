/**
 * The groups a notification can belong to, in display order.
 *
 * `id` is the `module` field NotificationCatalogue writes on every bell, and `label`
 * is the i18n key that names it. Defined once because two screens read it — the bell
 * tray's filter tabs and the chips on Settings → Notifications — and a group that
 * exists in one of them and not the other is a group of notifications nobody can find.
 *
 * `system` is the catch-all for notices that belong to no business module: the account
 * itself, and whatever else the platform has to say for its own sake.
 */
export const NOTIFICATION_GROUPS: { id: string; label: string }[] = [
    { id: 'employees', label: 'employees' },
    { id: 'tickets', label: 'tickets' },
    { id: 'requests', label: 'requests' },
    { id: 'assets', label: 'assets' },
    { id: 'access', label: 'access_title' },
    { id: 'contracts', label: 'contracts' },
    { id: 'stock', label: 'stock' },
    { id: 'system', label: 'notif_group_system' },
];

/** The i18n key naming one group, falling back to the raw id for one added in code first. */
export function notificationGroupLabel(id: string): string {
    return NOTIFICATION_GROUPS.find((g) => g.id === id)?.label ?? id;
}
