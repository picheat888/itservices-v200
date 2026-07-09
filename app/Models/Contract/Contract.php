<?php

namespace App\Models\Contract;

use App\Enums\Contract\ContractType;
use App\Models\Asset\Asset;
use App\Models\Settings\Vendor;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Contract extends Model
{
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
        return $this->hasMany(Asset::class)->orderBy('tag');
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

    /** Auto-generate a CT-YYYY-NNN code when one isn't supplied. */
    protected static function booted(): void
    {
        static::creating(function (Contract $contract) {
            if (blank($contract->code)) {
                $year = $contract->start_date ? $contract->start_date->year : now()->year;
                $next = (static::max('id') ?? 0) + 1;
                $contract->code = sprintf('CT-%d-%03d', $year, $next);
            }
        });
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

    /**
     * The earliest enabled reminder threshold — the point at which this contract
     * first enters its reminder window. Null when no reminders are enabled.
     */
    public function reminderThreshold(): ?int
    {
        $enabled = $this->enabledReminderDays();

        return $enabled === [] ? null : max($enabled);
    }

    /**
     * True when the contract is still active but has crossed into its own
     * reminder window (days remaining ≤ earliest enabled threshold).
     */
    public function isInReminder(): bool
    {
        if ($this->cancelled_at !== null || $this->expired_at !== null) {
            return false;
        }

        $threshold = $this->reminderThreshold();
        $days = $this->daysRemaining();

        return $threshold !== null && $days > 0 && $days <= $threshold;
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

            return $this->daysRemaining() > 0 ? 'active' : 'overdue';
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

    /**
     * Contract term length in whole months (rounded to the nearest month, min 1),
     * e.g. 12 / 24 / 36. Shown in the detail view instead of days-remaining.
     */
    public function durationMonths(): int
    {
        return max(1, (int) round($this->start_date->diffInDays($this->end_date) / (365.25 / 12)));
    }
}
