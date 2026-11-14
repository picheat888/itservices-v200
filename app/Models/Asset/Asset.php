<?php

namespace App\Models\Asset;

use App\Enums\Asset\AssetSource;
use App\Enums\Asset\AssetStatus;
use App\Enums\Asset\AssetTransferKind;
use App\Models\Concerns\RecordsActors;
use App\Models\Contract\Contract;
use App\Models\Employee\Employee;
use App\Models\Settings\AssetModel;
use App\Models\Settings\Brand;
use App\Models\Settings\Category;
use App\Models\Settings\Location;
use App\Models\Settings\Vendor;
use App\Models\Settings\WriteoffReason;
use App\Models\Stock\Warehouse;
use App\Models\Ticket\Ticket;
use App\Models\User;
use Database\Factories\AssetFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;

class Asset extends Model
{
    /** @use HasFactory<AssetFactory> */
    use HasFactory;

    use RecordsActors;

    /** The flat AssetFactory: auto-discovery would look under Database\Factories\Asset and miss it. */
    protected static function newFactory(): AssetFactory
    {
        return AssetFactory::new();
    }

    protected $fillable = [
        'asset_code', 'tag', 'category_id', 'brand_id', 'model_id', 'serial', 'source', 'status',
        'owner', 'owner_employee_id', 'location_id', 'warehouse_id', 'value', 'vendor_id',
        'purchase_date', 'warranty_end', 'warranty_lifetime', 'contract_id',
        'owned_since', 'notes', 'last_reason', 'writeoff_reason_id', 'written_off_at',
        'returned_to_vendor_at',
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
            'written_off_at' => 'datetime',
            'returned_to_vendor_at' => 'datetime',
        ];
    }

    /** The vendor contract a rented asset is billed under (null for purchased assets). */
    public function contract(): BelongsTo
    {
        return $this->belongsTo(Contract::class);
    }

    /** Who wrote the asset off (written_off_by, stamped with written_off_at); null while it is in service. */
    public function writtenOffBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'written_off_by');
    }

    /** Who returned a rented asset to its lessor (stamped by AssetService::returnToVendor); null otherwise. */
    public function returnedToVendorBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'returned_to_vendor_by');
    }

    /** True when the asset left the register by going back to its lessor, not by an ordinary write-off. */
    public function returnedToVendor(): bool
    {
        return $this->returned_to_vendor_at !== null;
    }

    /** Why it was written off (Settings → Assets); null while it is in service. The note stays in last_reason. */
    public function writeoffReason(): BelongsTo
    {
        return $this->belongsTo(WriteoffReason::class);
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

    /** The employee holding this asset (null when pooled or shared); not owner(), which the `owner` column would shadow. */
    public function ownerEmployee(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'owner_employee_id');
    }

    /** Ownership/custody trail — transfers and returns-to-pool, most recent first. */
    public function transfers(): HasMany
    {
        return $this->hasMany(AssetTransfer::class)->latest();
    }

    /** The most recent hand-over transfer row (when IT pressed transfer). */
    public function latestHandover(): HasOne
    {
        return $this->hasOne(AssetTransfer::class)->ofMany(
            ['created_at' => 'max', 'id' => 'max'],
            fn ($query) => $query->where('kind', AssetTransferKind::Handover->value)
        );
    }

    /** Repair/service tickets that reference this asset, most recent first. */
    public function tickets(): HasMany
    {
        return $this->hasMany(Ticket::class, 'related_asset_id')->latest();
    }

    /** Asset code on create; write-off stamps set on entering writeoff and cleared (with the return to lessor) on leaving it. */
    protected static function booted(): void
    {
        static::creating(function (Asset $asset) {
            if (blank($asset->asset_code)) {
                $asset->asset_code = $asset->generateAssetCode();
            }
        });

        static::saving(function (Asset $asset) {
            if (! $asset->isDirty('status')) {
                return;
            }
            if ($asset->status === AssetStatus::Writeoff) {
                $asset->written_off_at ??= now();
                $asset->written_off_by ??= Auth::id();
            } else {
                $asset->written_off_at = null;
                $asset->written_off_by = null;
                $asset->writeoff_reason_id = null;
                $asset->returned_to_vendor_at = null;
                $asset->returned_to_vendor_by = null;
            }
        });
    }

    /** INK-IT-YY-NNNN: fixed prefix, 2-digit year, and a running number that restarts each year. */
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

    /** Rented assets with no contract yet that are still in the register (a return to the lessor is a write-off too). */
    public function scopeRentedUnlinked(Builder $query): void
    {
        $query->where('source', AssetSource::Rented)
            ->whereNull('contract_id')
            ->where('status', '!=', AssetStatus::Writeoff);
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

    /** Holder for display: the employee's code (read through the FK, never stored), else the shared label, else null. */
    public function ownerCode(): ?string
    {
        return $this->owner_employee_id ? $this->ownerEmployee?->code : $this->owner;
    }

    /** Cover end: the contract's end date for a rented asset (read live), the warranty end for a purchased one. */
    public function coverEndsOn(): ?Carbon
    {
        return $this->source === AssetSource::Rented ? $this->contract?->end_date : $this->warranty_end;
    }

    /** Value per year: a rented asset's contract fee over its billing cycle, otherwise the stored purchase price. */
    public function annualValue(): float
    {
        // The fee is per billing cycle, so the year depends on the contract's cycle
        return $this->source === AssetSource::Rented ? ($this->contract?->annualValue() ?? 0.0) : (float) $this->value;
    }
}
