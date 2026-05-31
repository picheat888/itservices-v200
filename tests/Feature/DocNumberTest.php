<?php

namespace Tests\Feature;

use App\Models\StockItem;
use App\Models\StockMovement;
use App\Support\DocNumber;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DocNumberTest extends TestCase
{
    use RefreshDatabase;

    private function item(): StockItem
    {
        return StockItem::create([
            'sku' => 'SK-DOC-'.fake()->unique()->numerify('###'),
            'name' => 'Doc item', 'unit' => 'unit', 'cost' => 0,
            'current_stock' => 0, 'min_stock' => 0, 'max_stock' => 0, 'warehouse' => 'WH-A',
        ]);
    }

    private function record(string $type, int $year): string
    {
        $no = DocNumber::next($type, $year);
        StockMovement::create([
            'doc_no' => $no, 'type' => $type, 'stock_item_id' => $this->item()->id,
            'qty' => 1, 'moved_at' => now(),
        ]);

        return $no;
    }

    public function test_generates_sequential_numbers_per_prefix_and_year(): void
    {
        $this->assertSame('TRF-2026-001', $this->record('transfer', 2026));
        $this->assertSame('TRF-2026-002', $this->record('transfer', 2026));
        $this->assertSame('RCV-2026-001', $this->record('receive', 2026));
    }
}
