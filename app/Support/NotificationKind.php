<?php

namespace App\Support;

/**
 * A bell row's kind, "type|module": the payload type plus the module a test sample imitates.
 * Stored on notifications.kind so the tray counts and pages in SQL; the SPA maps kinds to modules.
 */
final class NotificationKind
{
    /** @param array<string, mixed> $data */
    public static function of(array $data): string
    {
        return ($data['type'] ?? '').'|'.($data['module'] ?? '');
    }

    /**
     * The type and module halves back, null when empty (the shape the tray's counts carry).
     *
     * @return array{type: ?string, module: ?string}
     */
    public static function split(string $kind): array
    {
        [$type, $module] = array_pad(explode('|', $kind, 2), 2, '');

        return ['type' => $type === '' ? null : $type, 'module' => $module === '' ? null : $module];
    }
}
