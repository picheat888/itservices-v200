<?php

namespace App\Services\Report\Employee;

use App\Models\Employee\Employee;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One open item of the "สรุปเรื่องค้างของพนักงาน" report, read from the OpenItems union:
 * an asset, a grant, an account or a data issue. Never written; `employee` and `subject`
 * are filled by OpenItems::hydrate().
 */
class OpenItemRow extends Model
{
    protected $table = 'open_items';

    public $timestamps = false;

    protected $guarded = [];

    protected function casts(): array
    {
        return ['last_day' => 'date'];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
