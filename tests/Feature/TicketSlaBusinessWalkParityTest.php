<?php

// Pins the integer-seconds addBusinessMinutes() to the Carbon reference walk across hours configs and zones.

namespace Tests\Feature;

use App\Enums\Ticket\TicketSlaClock;
use App\Support\TicketSla;
use Carbon\Carbon;
use PHPUnit\Framework\Attributes\DataProvider;
use ReflectionClass;
use Tests\TestCase;

class TicketSlaBusinessWalkParityTest extends TestCase
{
    protected function tearDown(): void
    {
        TicketSla::flush();
        parent::tearDown();
    }

    /** @return array<string, array{0: array<string, mixed>, 1: string}> */
    public static function configs(): array
    {
        $lunch = ['days' => [1, 2, 3, 4, 5], 'start' => '08:00', 'end' => '17:00', 'break_start' => '12:00', 'break_end' => '13:00'];
        $noBreak = ['days' => [1, 2, 3, 4, 5], 'start' => '09:00', 'end' => '18:00', 'break_start' => null, 'break_end' => null];
        $sixDays = ['days' => [1, 2, 3, 4, 5, 6], 'start' => '08:30', 'end' => '16:45', 'break_start' => '12:15', 'break_end' => '13:00'];
        $sunday = ['days' => [7], 'start' => '08:00', 'end' => '17:00', 'break_start' => '12:00', 'break_end' => '13:00'];

        return [
            'lunch Bangkok' => [$lunch, 'Asia/Bangkok'],
            'no break Bangkok' => [$noBreak, 'Asia/Bangkok'],
            'six days Bangkok' => [$sixDays, 'Asia/Bangkok'],
            'sunday only UTC' => [$sunday, 'UTC'],
            'lunch New York (clock changes)' => [$lunch, 'America/New_York'],
        ];
    }

    /** @param array<string, mixed> $hours */
    #[DataProvider('configs')]
    public function test_fast_path_matches_the_carbon_walk(array $hours, string $zone): void
    {
        TicketSla::flush();
        $memo = (new ReflectionClass(TicketSla::class))->getProperty('hoursMemo');
        $memo->setValue(null, $hours);
        $walk = (new ReflectionClass(TicketSla::class))->getMethod('addBusinessMinutesWalk');

        mt_srand(20261017);
        for ($n = 0; $n < 600; $n++) {
            $from = Carbon::createFromTimestamp(mt_rand(1_600_000_000, 1_800_000_000), $zone);
            $minutes = [0, 1, 30, 59, 60, 240, 480, 1440, 4320, mt_rand(0, 60 * 400), mt_rand(0, 60 * 2000)][mt_rand(0, 10)];

            $this->assertSame(
                $walk->invoke(null, $from->copy(), $minutes)->toIso8601String(),
                TicketSla::addBusinessMinutes($from->copy(), $minutes)->toIso8601String(),
                "{$from->toIso8601String()} + {$minutes} min",
            );
        }
    }

    /** @param array<string, mixed> $hours */
    #[DataProvider('configs')]
    public function test_timestamp_variant_matches_add_minutes_on_on_both_clocks(array $hours, string $zone): void
    {
        TicketSla::flush();
        (new ReflectionClass(TicketSla::class))->getProperty('hoursMemo')->setValue(null, $hours);
        $previous = date_default_timezone_get();
        date_default_timezone_set($zone);

        try {
            mt_srand(20261018);
            for ($n = 0; $n < 400; $n++) {
                $at = mt_rand(1_600_000_000, 1_800_000_000);
                $minutes = [0, 1, 59, 240, 1440, mt_rand(0, 60 * 400), mt_rand(0, 60 * 2000)][mt_rand(0, 6)];
                foreach ([TicketSlaClock::Business, TicketSlaClock::Calendar] as $clock) {
                    $this->assertSame(
                        TicketSla::addMinutesOn(Carbon::createFromTimestamp($at, $zone), $minutes, $clock)->getTimestamp(),
                        TicketSla::addMinutesToTimestamp($at, $minutes, $clock),
                        "{$at} + {$minutes} min on {$clock->value}",
                    );
                }
            }
        } finally {
            date_default_timezone_set($previous);
        }
    }
}
