<?php

namespace App\Models\Report;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One report a user pinned on the Report Center. `report_key` names a ReportCatalogue entry;
 * written and read through App\Services\Report\ReportPinService.
 */
class ReportPin extends Model
{
    protected $fillable = ['user_id', 'report_key'];

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
