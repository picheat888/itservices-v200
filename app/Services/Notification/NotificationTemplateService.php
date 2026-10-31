<?php

// The bell (in-app notification) page: catalogue joined to stored wording, the rights a save needs, save and reset.

namespace App\Services\Notification;

use App\Models\AuditLog;
use App\Models\Notification\NotificationTemplate;
use App\Support\EmailTemplates;
use App\Support\NotificationCatalogue;
use App\Support\SystemTime;
use Illuminate\Support\Collection;

class NotificationTemplateService
{
    /**
     * Every bell that has a row (opened by its id), with `has_email` when its event also sends a mail.
     *
     * @return Collection<int, array<string, mixed>>
     */
    public function rows(): Collection
    {
        $stored = NotificationTemplate::with('updater.employee')->get()->keyBy('key');
        $emailModules = collect(EmailTemplates::all())
            ->map(fn (array $template) => explode('.', $template['key'])[0])
            ->unique()
            ->all();

        return collect(NotificationCatalogue::all())->filter(fn (array $bell) => $stored->has($bell['key']))->map(function (array $bell) use ($stored, $emailModules) {
            $row = $stored->get($bell['key']);

            return [
                'id' => $row->id,
                'code' => sprintf('NT-%02d', $row->id), // display id, like the email templates' ET-##
                'key' => $bell['key'],
                'module' => $bell['module'],
                // name / trigger / audience stay in the SPA per language; the catalogue's English is for the audit log
                'message_en' => $row->message_en,
                'message_th' => $row->message_th,
                'enabled' => $row->enabled,
                'last_sent_at' => $row->last_sent_at?->toIso8601String(),
                // Who reworded or switched it last; null while nobody has
                'updated_at' => SystemTime::date($row->updated_at),
                'updated_by_name' => $row->updater?->name,
                'updated_by_name_th' => $row->updater?->name_th,
                'is_standard' => $row->message_en === $bell['message_en'] && $row->message_th === $bell['message_th'],
                // Reset also restores this, so the page offers it when only the switch moved
                'standard_enabled' => (bool) $bell['enabled'],
                'has_email' => in_array(self::emailPrefixFor($bell['module']), $emailModules, true),
            ];
        })->values();
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $rows
     * @return array{total: int, enabled: int, disabled: int, edited: int}
     */
    public function stats(Collection $rows): array
    {
        return [
            'total' => $rows->count(),
            'enabled' => $rows->where('enabled', true)->count(),
            // A switched-off bell looks exactly like a broken one
            'disabled' => $rows->where('enabled', false)->count(),
            'edited' => $rows->where('is_standard', false)->count(),
        ];
    }

    /** The email-template prefix of the same module, or null when no mail does (NotificationEmailPairingTest keeps it complete). */
    public static function emailPrefixFor(string $module): ?string
    {
        return [
            'employees' => 'employee',
            'contracts' => 'contract',
            'requests' => 'request',
            'assets' => 'asset',
            'tickets' => 'ticket',
            'stock' => 'stock',
            'access' => 'access',
        ][$module] ?? null;
    }

    /**
     * The wording every signed-in user's tray renders: just the two strings per key.
     *
     * @return array<string, array{en: string, th: string}>
     */
    public function messages(): array
    {
        return NotificationTemplate::get()
            ->mapWithKeys(fn (NotificationTemplate $bell) => [$bell->key => ['en' => $bell->message_en, 'th' => $bell->message_th]])
            ->all();
    }

    /**
     * The rights a save needs, from what it changes (a bell with no row is compared with its standard): toggle first, then edit.
     *
     * @param  array{name: string, message_en: string, message_th: string, enabled: bool}  $standard
     * @param  array<string, mixed>  $data
     * @return list<string>
     */
    public function requiredRights(NotificationTemplate $bell, array $standard, array $data): array
    {
        $currentEnabled = $bell->exists ? (bool) $bell->enabled : (bool) $standard['enabled'];
        $currentEn = $bell->exists ? $bell->message_en : $standard['message_en'];
        $currentTh = $bell->exists ? $bell->message_th : $standard['message_th'];

        return array_values(array_filter([
            (bool) $data['enabled'] !== $currentEnabled ? 'notifications.inapp_toggle' : null,
            $data['message_en'] !== $currentEn || $data['message_th'] !== $currentTh ? 'notifications.inapp_edit' : null,
        ]));
    }

    /**
     * @param  array{name: string}  $standard
     * @param  array<string, mixed>  $data
     */
    public function save(NotificationTemplate $bell, array $standard, array $data): void
    {
        $before = $bell->exists ? $bell->getOriginal() : [];
        $bell->fill($data)->save();
        NotificationCatalogue::forgetSwitches();

        AuditLog::record('Updated bell', $standard['name'], AuditLog::changes($before, $bell), subject: $bell);
    }

    /** @param  array{name: string, message_en: string, message_th: string, enabled: bool}  $standard */
    public function reset(string $key, array $standard): void
    {
        $bell = NotificationTemplate::updateOrCreate(['key' => $key], [
            'message_en' => $standard['message_en'],
            'message_th' => $standard['message_th'],
            'enabled' => $standard['enabled'],
        ]);
        NotificationCatalogue::forgetSwitches();

        AuditLog::record('Reset bell to standard', $standard['name'], subject: $bell);
    }
}
