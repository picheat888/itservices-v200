<?php

namespace App\Models\Contract;

use App\Enums\Contract\ContractType;
use App\Models\Asset\Asset;
use App\Models\Concerns\RecordsActors;
use App\Models\Settings\Vendor;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;

class Contract extends Model
{
    use RecordsActors;

    /** Who cancelled the contract (cancelled_by, stamped with cancelled_at); null while it is not cancelled. */
    public function canceller(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cancelled_by');
    }

    /** Uploaded PDF documents for this contract (newest first). */
    public function attachments(): HasMany
    {
        return $this->hasMany(ContractAttachment::class)->latest();
    }

    /** The vendor this contract is with (Master Data). */
    public function vendor(): BelongsTo
    {
        return $this->belongsTo(Vendor::class);
    }

    /** Assets linked to this contract (e.g. leased hardware), ordered by tag. */
    public function assets(): HasMany
    {
        return $this->hasMany(Asset::class)->orderBy('asset_code');
    }

    protected $fillable = [
        'code', 'vendor_id', 'name', 'details', 'type', 'start_date', 'end_date',
        'value', 'total_value', 'billing_cycle', 'cancelled_at', 'expired_at', 'cancel_reason',
        'notify_150', 'notify_120', 'notify_90', 'notify_60', 'notify_45', 'notify_30', 'notify_7', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'start_date' => 'date',
            'end_date' => 'date',
            'value' => 'decimal:2',
            'total_value' => 'decimal:2',
            'cancelled_at' => 'datetime',
            'expired_at' => 'datetime',
            'notify_150' => 'boolean',
            'notify_120' => 'boolean',
            'notify_90' => 'boolean',
            'notify_60' => 'boolean',
            'notify_45' => 'boolean',
            'notify_30' => 'boolean',
            'notify_7' => 'boolean',
            'type' => ContractType::class,
        ];
    }

    /** Fills a missing CT-YYYY-NNN code and stamps who cancelled (set with cancelled_at, cleared on reactivate). */
    protected static function booted(): void
    {
        static::creating(function (Contract $contract) {
            if (blank($contract->code)) {
                $contract->code = static::nextFreeCode($contract->start_date?->toDateString());
            }
        });

        static::saving(function (Contract $contract) {
            if ($contract->isDirty('cancelled_at')) {
                $contract->cancelled_by = $contract->cancelled_at === null ? null : Auth::id();
            }
        });
    }

    /**
     * The next CT-<year>-### nobody holds; codes can be typed by hand, so max(id) is only where the search starts.
     *
     * @param  string|null  $startDate  the contract's own start date — the year is part of the code
     */
    public static function nextFreeCode(?string $startDate = null): string
    {
        $year = $startDate ? Carbon::parse($startDate)->year : now()->year;
        $taken = static::query()->where('code', 'like', "CT-{$year}-%")->pluck('code')
            ->mapWithKeys(fn (string $code) => [strtoupper($code) => true])
            ->all();

        $next = (static::max('id') ?? 0) + 1;
        while (isset($taken[sprintf('CT-%d-%03d', $year, $next)])) {
            $next++;
        }

        return sprintf('CT-%d-%03d', $year, $next);
    }

    /** All supported reminder thresholds, in days before expiry (earliest first). */
    public const REMINDER_DAYS = [150, 120, 90, 60, 45, 30, 7];

    /** Whole days from today until expiry — negative once expired. */
    public function daysRemaining(): int
    {
        return (int) round(now()->startOfDay()->diffInDays($this->end_date->startOfDay(), false));
    }

    /**
     * The reminder thresholds enabled on this contract (e.g. [120, 60, 30]).
     *
     * @return array<int, int>
     */
    public function enabledReminderDays(): array
    {
        return array_values(array_filter(self::REMINDER_DAYS, fn (int $d) => (bool) $this->{"notify_{$d}"}));
    }

    /** The earliest enabled reminder threshold, where the reminder window starts; null with no reminders on. */
    public function reminderThreshold(): ?int
    {
        $enabled = $this->enabledReminderDays();

        return $enabled === [] ? null : max($enabled);
    }

    /** A cancelled or expired contract is closed: its record is frozen. */
    public function isClosed(): bool
    {
        return $this->cancelled_at !== null || $this->expired_at !== null;
    }

    /** Valid through its end date: overdue from the day after, while still live. */
    public function isOverdue(): bool
    {
        return ! $this->isClosed() && $this->daysRemaining() < 0;
    }

    /** Live and inside its reminder window (earliest enabled threshold); the end date itself always counts. */
    public function isInReminder(): bool
    {
        if ($this->isClosed()) {
            return false;
        }

        $threshold = $this->reminderThreshold();
        $days = $this->daysRemaining();

        return $days === 0 || ($threshold !== null && $days > 0 && $days <= $threshold);
    }

    /** Live contracts inside their reminder window, ending today or overdue: isInReminder() || isOverdue(), in SQL. */
    public function scopeNeedsRenewal(Builder $query): void
    {
        $today = now()->startOfDay();

        $query->whereNull('cancelled_at')
            ->whereNull('expired_at')
            ->where(function (Builder $due) use ($today) {
                $due->whereDate('end_date', '<=', $today);
                foreach (self::REMINDER_DAYS as $days) {
                    $due->orWhere(fn (Builder $window) => $window
                        ->where("notify_{$days}", true)
                        ->whereDate('end_date', '<=', $today->copy()->addDays($days)));
                }
            });
    }

    /** The list's ใกล้หมดอายุ tab: isInReminder() in SQL (live, ending today, or inside an enabled threshold). */
    public function scopeExpiring(Builder $query): void
    {
        $query->whereNull('cancelled_at')
            ->whereNull('expired_at')
            ->whereDate('end_date', '>=', today())
            ->where(function ($w) {
                $w->whereDate('end_date', today());
                foreach (self::REMINDER_DAYS as $d) {
                    $w->orWhere(function ($q) use ($d) {
                        $q->where("notify_{$d}", true)
                            ->whereDate('end_date', '<=', now()->copy()->addDays($d));
                    });
                }
            });
    }

    /** The list's เกินกำหนด tab: isOverdue() in SQL (live, end date before today). */
    public function scopeExpired(Builder $query): void
    {
        $query->whereNull('cancelled_at')
            ->whereNull('expired_at')
            ->whereDate('end_date', '<', today());
    }

    /** Derived lifecycle status: expired (manual, permanent) › cancelled › active/overdue by date. */
    protected function status(): Attribute
    {
        return Attribute::get(function () {
            if ($this->expired_at !== null) {
                return 'expired';
            }

            if ($this->cancelled_at !== null) {
                return 'cancelled';
            }

            return $this->daysRemaining() >= 0 ? 'active' : 'overdue';
        });
    }

    /** Annual-normalised contract value, used for the "Annual value" stat. */
    public function annualValue(): float
    {
        $multiplier = match ($this->billing_cycle) {
            'monthly' => 12,
            'quarterly' => 4,
            default => 1,
        };

        return (float) $this->value * $multiplier;
    }

    /** Whole months of the term, end date inclusive (1 Jan to 31 Dec = 12; start = end = 0 months 1 day). */
    public function durationMonths(): int
    {
        $diff = $this->start_date->diff($this->end_date->copy()->addDay());

        return $diff->y * 12 + $diff->m;
    }

    /** Leftover days after whole months in the contract term (0–30, end-inclusive). */
    public function durationDays(): int
    {
        return $this->start_date->diff($this->end_date->copy()->addDay())->d;
    }
}
