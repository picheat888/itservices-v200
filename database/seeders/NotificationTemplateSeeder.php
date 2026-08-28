<?php

namespace Database\Seeders;

use App\Models\Notification\NotificationTemplate;
use App\Support\NotificationCatalogue;
use Illuminate\Database\Seeder;

/**
 * Establishes the in-app notifications from App\Support\NotificationCatalogue.
 *
 * firstOrCreate, NOT updateOrCreate: a notification an administrator has reworded or switched off
 * keeps their value, and re-running only adds bells introduced by a later release. This is
 * deliberately unlike EmailTemplateSeeder, whose updateOrCreate turns `db:seed` into a
 * command that quietly discards every edit somebody made on the Settings page.
 */
class NotificationTemplateSeeder extends Seeder
{
    public function run(): void
    {
        foreach (NotificationCatalogue::all() as $bell) {
            NotificationTemplate::firstOrCreate(
                ['key' => $bell['key']],
                [
                    'message_en' => $bell['message_en'],
                    'message_th' => $bell['message_th'],
                    'enabled' => $bell['enabled'],
                ],
            );
        }

        $this->command?->info('Bells: '.NotificationTemplate::count().' rows.');
    }
}
