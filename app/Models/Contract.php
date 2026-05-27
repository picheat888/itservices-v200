<?php

namespace App\Models;

use App\Enums\ContractType;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Contract extends Model
{
    protected $fillable = [
        'code', 'vendor', 'name', 'type', 'start_date', 'end_date',
        'value', 'billing_cycle', 'auto_renew', 'owner_id', 'cancelled_at',
        'notify_150', 'notify_120', 'notify_90', 'notify_60', 'notify_45', 'notify_30', 'notify_7', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'start_date' => 'date',
            'end_date' => 'date',
            'value' => 'decimal:2',
            'auto_renew' => 'boolean',
            'cancelled_at' => 'datetime',
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

    public function owner(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'owner_id');
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
        if ($this->cancelled_at !== null) {
            return false;
        }

        $threshold = $this->reminderThreshold();
        $days = $this->daysRemaining();

        return $threshold !== null && $days > 0 && $days <= $threshold;
    }

    /** Derived lifecycle status: cancelled takes precedence, then active/expired by date. */
    protected function status(): Attribute
    {
        return Attribute::get(function () {
            if ($this->cancelled_at !== null) {
                return 'cancelled';
            }

            return $this->daysRemaining() > 0 ? 'active' : 'expired';
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
}
