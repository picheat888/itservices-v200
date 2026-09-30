<?php

namespace App\Models\Report;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One report file somebody asked for, built on the queue (App\Jobs\GenerateReportExport) and
 * kept for KEEP_DAYS on the private disk. Queued and managed through
 * App\Services\Report\ReportExportService.
 */
class ReportExport extends Model
{
    public const QUEUED = 'queued';

    public const RUNNING = 'running';

    public const READY = 'ready';

    public const FAILED = 'failed';

    /** How long a finished file stays downloadable. */
    public const KEEP_DAYS = 7;

    protected $fillable = [
        'user_id', 'report_key', 'format', 'filters', 'columns', 'status',
        'file_name', 'file_path', 'rows_count', 'size_bytes', 'error',
        'started_at', 'finished_at', 'expires_at',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'filters' => 'array',
            'columns' => 'array',
            'rows_count' => 'integer',
            'size_bytes' => 'integer',
            'started_at' => 'datetime',
            'finished_at' => 'datetime',
            'expires_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Still worth listing: waiting or being built, or finished and not yet past its expiry.
     *
     * @param  Builder<ReportExport>  $query
     * @return Builder<ReportExport>
     */
    public function scopeCurrent(Builder $query): Builder
    {
        return $query->where(fn (Builder $q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()));
    }
}
