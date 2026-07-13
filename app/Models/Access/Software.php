<?php

namespace App\Models\Access;

use App\Enums\Access\SoftwareLicenseType;
use App\Models\Employee\Department;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class Software extends Model
{
    /**
     * Eloquent's pluralizer treats "software" as uncountable (plural ===
     * singular), so the default table-name guess would be "software" instead
     * of the "softwares" table this migration actually creates. Pin it
     * explicitly to avoid a "table not found" error.
     */
    protected $table = 'softwares';

    protected $fillable = ['code', 'name', 'publisher', 'version', 'license_type', 'seats', 'department_id', 'notes'];

    protected function casts(): array
    {
        return [
            'license_type' => SoftwareLicenseType::class,
            'seats' => 'integer',
        ];
    }

    protected static function booted(): void
    {
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

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }
}
