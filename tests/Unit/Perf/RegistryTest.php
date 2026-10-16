<?php

namespace Tests\Unit\Perf;

use App\Support\Perf\Registry;
use Carbon\CarbonImmutable;
use PHPUnit\Framework\TestCase;

// Unit tests for the perf dataset registry (ids, document numbers, remembered facts)
class RegistryTest extends TestCase
{
    public function test_doc_numbers_count_per_prefix_and_year(): void
    {
        $r = new Registry;
        $this->assertSame('RCV-2026-001', $r->docNo('RCV', 2026));
        $this->assertSame('RCV-2026-002', $r->docNo('RCV', 2026));
        $this->assertSame('ISS-2026-001', $r->docNo('ISS', 2026));
        $this->assertSame('RCV-2025-001', $r->docNo('RCV', 2025));
        for ($i = 3; $i < 1000; $i++) {
            $r->docNo('RCV', 2026);
        }
        $this->assertSame('RCV-2026-1000', $r->docNo('RCV', 2026));
    }

    public function test_year_numbers_pad_as_requested(): void
    {
        $r = new Registry;
        $this->assertSame('RQ-2026-0001', $r->yearNo('RQ', 2026, 4));
        $this->assertSame('SC-2026-001', $r->yearNo('SC', 2026, 3));
        $this->assertSame('RQ-2026-0002', $r->yearNo('RQ', 2026, 4));
    }

    public function test_ticket_numbers_restart_per_category_and_day(): void
    {
        $r = new Registry;
        $d = CarbonImmutable::parse('2026-10-16 10:00:00');
        $this->assertSame('TKT-SW-261016-001', $r->ticketNo('SW', $d));
        $this->assertSame('TKT-SW-261016-002', $r->ticketNo('SW', $d));
        $this->assertSame('TKT-HW-261016-001', $r->ticketNo('HW', $d));
        $this->assertSame('TKT-SW-261017-001', $r->ticketNo('SW', $d->addDay()));
    }

    public function test_asset_codes_count_per_year(): void
    {
        $r = new Registry;
        $this->assertSame('INK-IT-24-0001', $r->assetCode(CarbonImmutable::parse('2024-03-01')));
        $this->assertSame('INK-IT-24-0002', $r->assetCode(CarbonImmutable::parse('2024-04-01')));
        $this->assertSame('INK-IT-25-0001', $r->assetCode(CarbonImmutable::parse('2025-01-01')));
    }

    public function test_next_id_continues_after_seed(): void
    {
        $r = new Registry;
        $this->assertSame(1, $r->nextId('brands'));
        $r->seedId('employees', 17);
        $this->assertSame(18, $r->nextId('employees'));
        $this->assertSame(19, $r->nextId('employees'));
    }

    public function test_remember_and_events(): void
    {
        $r = new Registry;
        $r->remember('k', [1, 2]);
        $this->assertSame([1, 2], $r->get('k'));
        $r->event('ticket.created', ['id' => 1]);
        $this->assertSame([['ticket.created', ['id' => 1]]], iterator_to_array($r->events(), false));
    }
}
