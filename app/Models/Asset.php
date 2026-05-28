<?php

namespace App\Models;

use App\Enums\AssetSource;
use App\Enums\AssetStatus;
use App\Enums\AssetType;
use Database\Factories\AssetFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

class Asset extends Model
{
    /** @use HasFactory<AssetFactory> */
    use HasFactory;

    protected $fillable = [
        'tag', 'type', 'brand', 'model', 'serial', 'source', 'status',
        'owner', 'initial_owner', 'department', 'location', 'value', 'supplier',
        'purchase_date', 'warranty_end', 'contract_id', 'lease_start', 'lease_end',
        'registered_date', 'notes', 'last_reason',
    ];

    protected function casts(): array
    {
        return [
            'type' => AssetType::class,
            'source' => AssetSource::class,
            'status' => AssetStatus::class,
            'value' => 'decimal:2',
            'purchase_date' => 'date',
            'warranty_end' => 'date',
            'lease_start' => 'date',
            'lease_end' => 'date',
            'registered_date' => 'date',
        ];
    }

    /** The vendor contract a rented asset is billed under (null for purchased assets). */
    public function contract(): BelongsTo
    {
        return $this->belongsTo(Contract::class);
    }

    /** Auto-generate an INB-XX-NNNNN / RNT-XX-NNNNN tag and registration date on create. */
    protected static function booted(): void
    {
        static::creating(function (Asset $asset) {
            if (blank($asset->tag)) {
                $asset->tag = $asset->generateTag();
            }
            if (blank($asset->registered_date)) {
                $asset->registered_date = now();
            }
        });
    }

    /** Build a unique asset tag from its source prefix + type code + a running number. */
    public function generateTag(): string
    {
        $source = $this->source instanceof AssetSource ? $this->source : AssetSource::tryFrom((string) $this->source);
        $type = $this->type instanceof AssetType ? $this->type : AssetType::tryFrom((string) $this->type);
        $prefix = $source === AssetSource::Rented ? 'RNT' : 'INB';
        $code = strtoupper(substr($type?->value ?? 'as', 0, 2));
        $next = (static::max('id') ?? 0) + 1;

        return sprintf('%s-%s-%05d', $prefix, $code, $next);
    }

    /** True when the asset is actively deployed to an owner (blocks a direct transfer). */
    public function isDeployed(): bool
    {
        return $this->status === AssetStatus::Deployed;
    }

    /** The relevant cover end date: lease end for rented assets, warranty end otherwise. */
    public function coverEndsOn(): ?Carbon
    {
        return $this->source === AssetSource::Rented ? $this->lease_end : $this->warranty_end;
    }

    /** Annualised value: a rented asset's monthly fee ×12, otherwise the raw purchase price. */
    public function annualValue(): float
    {
        return $this->source === AssetSource::Rented ? (float) $this->value * 12 : (float) $this->value;
    }
}
