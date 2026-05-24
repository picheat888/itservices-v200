<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * An automated system email keyed by the event that triggers it.
 * Body holds {{variables}} substituted at send time.
 */
class EmailTemplate extends Model
{
    protected $fillable = [
        'key', 'name', 'subject', 'body_html', 'enabled', 'last_sent_at',
    ];

    protected function casts(): array
    {
        return [
            'enabled'      => 'boolean',
            'last_sent_at' => 'datetime',
        ];
    }
}
