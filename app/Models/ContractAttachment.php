<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

/**
 * A single PDF document attached to a contract. The binary lives on the public
 * disk at {path}; this record holds the display metadata.
 */
class ContractAttachment extends Model
{
    protected $fillable = ['contract_id', 'original_name', 'path', 'size', 'mime'];

    protected function casts(): array
    {
        return [
            'size' => 'integer',
        ];
    }

    /** The contract this file belongs to. */
    public function contract(): BelongsTo
    {
        return $this->belongsTo(Contract::class);
    }

    /** Public URL the browser can open/download the file from. */
    public function url(): string
    {
        return Storage::disk('public')->url($this->path);
    }
}
