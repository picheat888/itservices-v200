<?php

namespace App\Support\Perf;

use Carbon\CarbonImmutable;
use Generator;

/** What the perf steps share: id counters, document-number counters, remembered facts and the event log. */
class Registry
{
    /** @var array<string, int> */
    private array $ids = [];

    /** @var array<string, int> */
    private array $counters = [];

    /** @var array<string, mixed> */
    private array $facts = [];

    /** @var list<array{0: string, 1: array}> */
    private array $events = [];

    public function seedId(string $table, int $max): void
    {
        $this->ids[$table] = $max;
    }

    public function nextId(string $table): int
    {
        return $this->ids[$table] = ($this->ids[$table] ?? 0) + 1;
    }

    private function bump(string $key): int
    {
        return $this->counters[$key] = ($this->counters[$key] ?? 0) + 1;
    }

    // <PREFIX>-<YEAR>-<NNN> per (prefix, year), like DocNumber
    public function docNo(string $prefix, int $year): string
    {
        return sprintf('%s-%d-%03d', $prefix, $year, $this->bump("doc|{$prefix}|{$year}"));
    }

    // <PREFIX>-<YEAR>-<N padded> per (prefix, year): RQ and REQ pad 4, SC pads 3
    public function yearNo(string $prefix, int $year, int $pad): string
    {
        return sprintf("%s-%d-%0{$pad}d", $prefix, $year, $this->bump("year|{$prefix}|{$year}"));
    }

    public function ticketNo(string $category, CarbonImmutable $day): string
    {
        $ymd = $day->format('ymd');

        return sprintf('TKT-%s-%s-%03d', $category, $ymd, $this->bump("ticket|{$category}|{$ymd}"));
    }

    public function assetCode(CarbonImmutable $day): string
    {
        $yy = $day->format('y');

        return sprintf('INK-IT-%s-%04d', $yy, $this->bump("asset|{$yy}"));
    }

    public function remember(string $key, mixed $value): void
    {
        $this->facts[$key] = $value;
    }

    public function get(string $key): mixed
    {
        return $this->facts[$key] ?? null;
    }

    /** @param array<string, mixed> $payload */
    public function event(string $kind, array $payload): void
    {
        $this->events[] = [$kind, $payload];
    }

    /** @return Generator<int, array{0: string, 1: array}> */
    public function events(): Generator
    {
        yield from $this->events;
    }
}
