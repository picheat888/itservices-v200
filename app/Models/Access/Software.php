<?php

namespace App\Models\Access;

use App\Enums\Access\SoftwareLicenseType;
use App\Models\Settings\Brand;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Support\Facades\Storage;

class Software extends Model
{
    /**
     * Eloquent's pluralizer treats "software" as uncountable (plural ===
     * singular), so the default table-name guess would be "software" instead
     * of the "softwares" table this migration actually creates. Pin it
     * explicitly to avoid a "table not found" error.
     */
    protected $table = 'softwares';

    protected $fillable = ['code', 'name', 'brand_id', 'logo_path', 'license_type', 'seats', 'product_key', 'notes'];

    protected function casts(): array
    {
        return [
            'license_type' => SoftwareLicenseType::class,
            'seats' => 'integer',
            // Product keys are secrets — encrypt at rest, decrypt transparently on read.
            'product_key' => 'encrypted',
        ];
    }

    /**
     * Authenticated URL of the software logo (private disk), or null when none
     * uploaded. Tagged with the stored filename (random per upload) so a replaced
     * logo arrives under a new URL — the route alone never changes, and the
     * response is cached, which left the browser painting the previous logo.
     */
    public function getLogoUrlAttribute(): ?string
    {
        if (! $this->logo_path) {
            return null;
        }

        return route('files.software-logo', ['software' => $this, 'v' => substr(sha1($this->logo_path), 0, 8)]);
    }

    protected static function booted(): void
    {
        // Replacing or removing a logo already deletes the file it replaces;
        // deleting the record has to take the last one with it, or the binary
        // stays on the private disk with nothing left that names it.
        static::deleting(function (Software $sw) {
            if ($sw->logo_path) {
                Storage::disk('local')->delete($sw->logo_path);
            }
        });

        static::creating(function (Software $sw) {
            if (blank($sw->code)) {
                $max = (int) str_replace('SW-', '', (string) static::max('code'));
                $sw->code = 'SW-'.str_pad((string) ($max + 1), 4, '0', STR_PAD_LEFT);
            }
        });
    }

    public function memberships(): MorphMany
    {
        return $this->morphMany(AccessMembership::class, 'resource');
    }

    /** Publisher / manufacturer brand (Master Data). */
    public function brand(): BelongsTo
    {
        return $this->belongsTo(Brand::class);
    }
}
