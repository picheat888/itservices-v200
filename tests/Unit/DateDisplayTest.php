<?php

namespace Tests\Unit;

use App\Support\DateDisplay;
use Carbon\Carbon;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class DateDisplayTest extends TestCase
{
    /** @return iterable<string, array{string, array<int, string|int|null>, array<string, string>, string, string}> */
    public static function fixtureCases(): iterable
    {
        $file = json_decode((string) file_get_contents(__DIR__.'/../Fixtures/date-format-cases.json'), true);
        foreach ($file['cases'] as $i => $case) {
            yield "#{$i} {$case['fn']}" => [$case['fn'], $case['args'], $case['config'], $case['lang'], $case['expect']];
        }
    }

    /** @param array<int, string|int|null> $args @param array<string, string> $config */
    #[DataProvider('fixtureCases')]
    public function test_matches_the_shared_fixture(string $fn, array $args, array $config, string $lang, string $expect): void
    {
        $this->assertSame($expect, DateDisplay::{$fn}(...[...$args, $config, $lang]));
    }

    public function test_formats_a_carbon_instance_by_its_wall_clock(): void
    {
        $config = ['format' => 'dmy_slash', 'era' => 'be', 'time' => '24'];

        $this->assertSame('03/10/2569 14:05', DateDisplay::dateTime(Carbon::parse('2026-10-03 14:05:00'), $config));
    }
}
