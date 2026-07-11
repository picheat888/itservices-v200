<?php

namespace App\Models\Asset;

use App\Enums\Asset\AssetSource;
use App\Enums\Asset\AssetStatus;
use App\Models\Contract\Contract;
use App\Models\Employee\Employee;
use App\Models\Settings\AssetModel;
use App\Models\Settings\Brand;
use App\Models\Settings\Category;
use App\Models\Settings\Location;
use App\Models\Settings\Vendor;
use App\Models\Stock\Warehouse;
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
        'asset_code', 'tag', 'category_id', 'brand_id', 'model_id', 'serial', 'source', 'status',
        'owner', 'owner_employee_id', 'location_id', 'warehouse_id', 'value', 'vendor_id',
        'purchase_date', 'warranty_end', 'warranty_lifetime', 'contract_id',
        'owned_since', 'notes', 'last_reason',
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
            'owned_since' => 'date',
        ];
    }

    /** The vendor contract a rented asset is billed under (null for purchased assets). */
    public function contract(): BelongsTo
    {
        return $this->belongsTo(Contract::class);
    }

    /** Physical location a deployed asset sits at (Master Data). */
    public function location(): BelongsTo
    {
        return $this->belongsTo(Location::class);
    }

    /** Asset category / type (Master Data). */
    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    /** Supplier the asset was bought from (Master Data vendor). */
    public function vendor(): BelongsTo
    {
        return $this->belongsTo(Vendor::class);
    }

    /** Warehouse a pooled asset is stored in (Master Data). */
    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    /** Manufacturer brand (Master Data). */
    public function brand(): BelongsTo
    {
        return $this->belongsTo(Brand::class);
    }

    /** Model/product line, scoped to the brand (Master Data). */
    public function model(): BelongsTo
    {
        return $this->belongsTo(AssetModel::class, 'model_id');
    }

    /**
     * The employee who currently holds this asset (null for pooled or shared assets).
     * Named ownerEmployee, not owner, because the `owner` string column would shadow
     * an owner() relation.
     */
    public function ownerEmployee(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'owner_employee_id');
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

    /** Auto-generate an INK-IT-YY-NNNN Asset code on create. */
    protected static function booted(): void
    {
        static::creating(function (Asset $asset) {
            if (blank($asset->asset_code)) {
                $asset->asset_code = $asset->generateAssetCode();
            }
        });
    }

    /**
     * Build the Asset code as INK-IT-YY-NNNN: a fixed INK-IT prefix, the 2-digit
     * year, and a 4-digit running number that restarts each year.
     */
    public function generateAssetCode(): string
    {
        $prefix = 'INK-IT-'.now()->format('y').'-';

        // Highest sequence already issued under this year's prefix, then +1.
        $last = static::where('asset_code', 'like', $prefix.'%')
            ->pluck('asset_code')
            ->map(fn (string $assetCode) => (int) substr($assetCode, strlen($prefix)))
            ->max() ?? 0;

        return sprintf('%s%04d', $prefix, $last + 1);
    }

    /** True when the asset is actively deployed to an owner (blocks a direct transfer). */
    public function isDeployed(): bool
    {
        return $this->status === AssetStatus::Deployed;
    }

    /** True when an employee currently holds this asset — blocks write-off until returned. */
    public function heldByEmployee(): bool
    {
        return $this->owner_employee_id !== null;
    }

    /**
     * The current holder's identifier for display: the employee's code when an employee
     * holds it (read from the FK — never stored), else the free-text shared/common-use
     * label, else null (pooled). Employee data is never duplicated onto the asset.
     */
    public function ownerCode(): ?string
    {
        return $this->owner_employee_id ? $this->ownerEmployee?->code : $this->owner;
    }

    /**
     * The relevant cover end date: for a rented asset this is the linked contract's
     * end date (read live — never stored on the asset); for a purchased asset it's
     * the warranty end.
     */
    public function coverEndsOn(): ?Carbon
    {
        return $this->source === AssetSource::Rented ? $this->contract?->end_date : $this->warranty_end;
    }

    /**
     * Annualised value: a rented asset's monthly fee ×12 (taken from the linked
     * contract), otherwise the raw purchase price stored on the asset.
     */
    public function annualValue(): float
    {
        return $this->source === AssetSource::Rented ? (float) ($this->contract?->value ?? 0) * 12 : (float) $this->value;
    }
}
