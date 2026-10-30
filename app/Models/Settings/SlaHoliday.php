<?php

// One company holiday (date + name) that the business-time SLA clock treats as a day off.

namespace App\Models\Settings;

use App\Support\TicketSla;
use Database\Factories\SlaHolidayFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SlaHoliday extends Model
{
    /** @use HasFactory<SlaHolidayFactory> */
    use HasFactory;

    protected $fillable = ['date', 'name'];

    protected static function newFactory(): SlaHolidayFactory
    {
        return SlaHolidayFactory::new();
    }

    protected function casts(): array
    {
        return [
            'date' => 'date:Y-m-d',
        ];
    }

    // Any change drops TicketSla's per-request holiday memo
    protected static function booted(): void
    {
        $forget = fn () => TicketSla::flush();

        static::saved($forget);
        static::deleted($forget);
    }
}
