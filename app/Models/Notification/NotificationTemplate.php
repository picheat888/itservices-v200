<?php

namespace App\Models\Notification;

use Illuminate\Database\Eloquent\Model;

/**
 * One configurable in-app notification: its wording in each language, and whether it fires.
 *
 * The descriptive half (name, trigger, audience, module) is not stored — it lives in
 * App\Support\NotificationCatalogue and is joined on `key` when the settings page asks for it.
 */
class NotificationTemplate extends Model
{
    protected $fillable = ['key', 'message_en', 'message_th', 'enabled', 'last_sent_at'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'enabled' => 'boolean',
            'last_sent_at' => 'datetime',
        ];
    }
}
