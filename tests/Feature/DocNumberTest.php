<?php

namespace Tests\Feature;

use App\Models\Stock\StockCount;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockMovement;
use App\Models\Stock\StockRequest;
use App\Models\Stock\Warehouse;
use App\Models\User;
use App\Support\DocNumber;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use ReflectionMethod;
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

    public function test_continues_past_three_digits(): void
    {
        $item = $this->item();
        foreach (['ISS-2026-998', 'ISS-2026-999', 'ISS-2026-1000'] as $no) {
            StockMovement::create(['doc_no' => $no, 'type' => 'issue', 'stock_item_id' => $item->id, 'qty' => 1, 'moved_at' => now()]);
        }

        $this->assertSame('ISS-2026-1001', DocNumber::next('issue', 2026));
        $this->assertSame('ISS-2025-001', DocNumber::next('issue', 2025));
    }

    public function test_stock_request_and_count_numbers_continue_past_padding(): void
    {
        $year = now()->year;
        Warehouse::firstOrCreate(['name' => 'WH-A']);
        $item = $this->item();
        $this->actingAs(User::factory()->create(['role' => 'super']))
            ->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 10])
            ->assertCreated();

        foreach (["REQ-{$year}-9999", "REQ-{$year}-10000"] as $reference) {
            StockRequest::create([
                'reference' => $reference, 'stock_item_id' => $item->id, 'requester_name' => 'Earlier',
                'qty' => 1, 'reason' => 'Earlier request', 'status' => 'rejected',
            ]);
        }

        // The number is taken inside the store transaction
        $outside = DB::transactionLevel();
        $levels = [];
        StockRequest::creating(function () use (&$levels): void {
            $levels[] = DB::transactionLevel();
        });

        $this->postJson('/api/stock-requests', ['stock_item_id' => $item->id, 'qty' => 1, 'reason' => 'Spare'])
            ->assertCreated()
            ->assertJsonPath('data.reference', "REQ-{$year}-10001");
        $this->assertGreaterThan($outside, $levels[0]);

        StockCount::create(['reference' => "SC-{$year}-999", 'status' => 'committed']);
        $this->assertSame("SC-{$year}-1000", StockCount::create(['status' => 'draft'])->reference);
        $this->assertSame("SC-{$year}-1001", StockCount::create(['status' => 'draft'])->reference);
    }

    public function test_next_in_reads_the_numeric_max_under_a_lock(): void
    {
        $item = $this->item();
        foreach (['XFR-2026-07', 'XFR-2026-100'] as $no) {
            StockMovement::create(['doc_no' => $no, 'type' => 'transfer', 'stock_item_id' => $item->id, 'qty' => 1, 'moved_at' => now()]);
        }

        $this->assertSame('XFR-2026-101', DocNumber::nextIn(StockMovement::query(), 'doc_no', 'XFR-2026-', 2));
        $this->assertSame('XFR-2025-01', DocNumber::nextIn(StockMovement::query(), 'doc_no', 'XFR-2025-', 2));

        // sqlite ignores the lock, so the source carries the proof
        $this->assertStringContainsString('lockForUpdate()', $this->sourceOf(DocNumber::class, 'nextIn'));
    }

    private function sourceOf(string $class, string $method): string
    {
        $reflection = new ReflectionMethod($class, $method);
        $lines = file((string) $reflection->getFileName());

        return implode('', array_slice($lines, $reflection->getStartLine() - 1, $reflection->getEndLine() - $reflection->getStartLine() + 1));
    }
}
