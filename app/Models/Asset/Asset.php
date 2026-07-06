<?php

namespace App\Models\Asset;

use App\Enums\Asset\AssetSource;
use App\Enums\Asset\AssetStatus;
use App\Models\Contract\Contract;
use App\Models\Ticket\Ticket;
use Database\Factories\AssetFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

class Asset extends Model
{
    /** @use HasFactory<AssetFactory> */
    use HasFactory;

    /**
     * Bind to the flat AssetFactory explicitly — factory auto-discovery would look for
     * Database\Factories\Asset\AssetFactory under this domain sub-namespace and miss it.
     */
    protected static function newFactory(): AssetFactory
    {
        return AssetFactory::new();
    }

    protected $fillable = [
        'tag', 'nickname', 'type', 'brand', 'model', 'serial', 'source', 'status',
        'owner', 'initial_owner', 'department', 'location', 'warehouse', 'value', 'supplier',
        'purchase_date', 'warranty_end', 'warranty_lifetime', 'contract_id', 'lease_start', 'lease_end',
        'registered_date', 'owned_since', 'notes', 'last_reason',
    ];

    protected function casts(): array
    {
        return [
            'source' => AssetSource::class,
            'status' => AssetStatus::class,
            'value' => 'decimal:2',
            'purchase_date' => 'date',
            'warranty_end' => 'date',
            'warranty_lifetime' => 'boolean',
            'lease_start' => 'date',
            'lease_end' => 'date',
            'registered_date' => 'date',
            'owned_since' => 'date',
        ];
    }

    /** The vendor contract a rented asset is billed under (null for purchased assets). */
    public function contract(): BelongsTo
    {
        return $this->belongsTo(Contract::class);
    }

    /** Ownership/custody trail — transfers and returns-to-pool, most recent first. */
    public function transfers(): HasMany
    {
        return $this->hasMany(AssetTransfer::class)->latest();
    }

    /** Repair/service tickets that reference this asset, most recent first. */
    public function tickets(): HasMany
    {
        return $this->hasMany(Ticket::class, 'related_asset_id')->latest();
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

    /**
     * Build the Asset ID as INK-IT-YY-NNNN: a fixed INK-IT prefix, the 2-digit
     * year, and a 4-digit running number that restarts each year.
     */
    public function generateTag(): string
    {
        $prefix = 'INK-IT-'.now()->format('y').'-';

        // Highest sequence already issued under this year's prefix, then +1.
        $last = static::where('tag', 'like', $prefix.'%')
            ->pluck('tag')
            ->map(fn (string $tag) => (int) substr($tag, strlen($prefix)))
            ->max() ?? 0;

        return sprintf('%s%04d', $prefix, $last + 1);
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
