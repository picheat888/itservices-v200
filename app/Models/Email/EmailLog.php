<?php

namespace App\Models\Email;

use Illuminate\Database\Eloquent\Model;

/**
 * One row per outgoing email attempt — powers the Sent today / Delivery rate
 * stats. Only created_at is tracked (no updated_at).
 */
class EmailLog extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'template_key', 'to_email', 'recipient_name', 'subject', 'body_html', 'action', 'status', 'is_test', 'error',
    ];

    protected function casts(): array
    {
        return [
            'action' => 'array',
            'is_test' => 'boolean',
        ];
    }
}
