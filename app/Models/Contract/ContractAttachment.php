<?php

namespace App\Models\Contract;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A single PDF document attached to a contract. The binary lives on the PRIVATE
 * disk at {path}; this record holds the display metadata. It is only reachable
 * through the authenticated files.contract-attachment route.
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

    /** Authenticated URL the browser can open/download the file from. */
    public function url(): string
    {
        return route('files.contract-attachment', $this);
    }
}
