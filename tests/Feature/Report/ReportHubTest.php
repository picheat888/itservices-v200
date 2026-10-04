<?php

namespace Tests\Feature\Report;

use App\Exports\Report\TabularReportExport;
use App\Models\Asset\Asset;
use App\Models\Contract\Contract;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Report\ReportPin;
use App\Models\Request\ServiceRequest;
use App\Models\Settings\Vendor;
use App\Models\Stock\StockItem;
use App\Models\Ticket\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Maatwebsite\Excel\Facades\Excel;
use Tests\Concerns\ExportsReports;
use Tests\TestCase;

/**
 * Report Center extras (Phase 5a): pinning reports, the number strip on top of the hub
 * (GET /api/reports/snapshot), and exporting only the columns picked on the page.
 */
class ReportHubTest extends TestCase
{
    use ExportsReports, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $this->travelTo('2026-09-25 10:00:00');
    }

    /** @param list<string> $permissions */
    private function userWith(array $permissions): User
    {
        $role = Role::create(['key' => 'rep_'.uniqid(), 'name' => 'Report Test', 'is_system' => false]);
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }

        return User::factory()->create(['role' => $role->key]);
    }

    // ── pins ────────────────────────────────────────────────────────────────────────

    public function test_a_pin_is_kept_per_user_and_flagged_in_the_catalogue(): void
    {
        $user = $this->userWith(['assets.view']);
        $other = $this->userWith(['assets.view']);

        $this->actingAs($user)->putJson('/api/reports/assets.overview/pin')
            ->assertOk()->assertJsonPath('data.pinned', true);
        // Pinning twice is still one pin.
        $this->actingAs($user)->putJson('/api/reports/assets.overview/pin')->assertOk();
        $this->assertSame(1, ReportPin::query()->where('user_id', $user->id)->count());

        $pinned = collect($this->actingAs($user)->getJson('/api/reports')->assertOk()->json('data'))->pluck('pinned', 'key');
        $this->assertTrue($pinned['assets.overview']);
        $this->assertFalse($pinned['assets.warranty_expiring']);
        $this->assertFalse(collect($this->actingAs($other)->getJson('/api/reports')->json('data'))->pluck('pinned', 'key')['assets.overview']);

        $this->actingAs($user)->deleteJson('/api/reports/assets.overview/pin')
            ->assertOk()->assertJsonPath('data.pinned', false);
        $this->assertSame(0, ReportPin::query()->count());
    }

    /** The hub lists pinned reports in the order they were pinned (pin_order), whatever the catalogue order. */
    public function test_the_catalogue_carries_the_order_reports_were_pinned_in(): void
    {
        $user = $this->userWith(['assets.view']);
        $this->actingAs($user)->putJson('/api/reports/assets.warranty_expiring/pin')->assertOk();
        $this->actingAs($user)->putJson('/api/reports/assets.overview/pin')->assertOk();

        $order = collect($this->actingAs($user)->getJson('/api/reports')->assertOk()->json('data'))->pluck('pin_order', 'key');

        $this->assertSame(0, $order['assets.warranty_expiring']);
        $this->assertSame(1, $order['assets.overview']);
        $this->assertNull($order['assets.transfer_history']);
    }

    public function test_only_a_report_the_reader_may_open_can_be_pinned(): void
    {
        $user = $this->userWith(['assets.view']);

        $this->actingAs($user)->putJson('/api/reports/stock.valuation/pin')->assertForbidden();
        $this->actingAs($user)->putJson('/api/reports/stock.nothing/pin')->assertNotFound();
        $this->assertSame(0, ReportPin::query()->count());
    }

    public function test_a_pin_on_a_report_that_lost_its_access_just_stops_showing(): void
    {
        $user = $this->userWith(['assets.view']);
        ReportPin::create(['user_id' => $user->id, 'report_key' => 'stock.valuation']);

        $keys = collect($this->actingAs($user)->getJson('/api/reports')->assertOk()->json('data'))->pluck('key');

        $this->assertNotContains('stock.valuation', $keys);
    }

    // ── snapshot ────────────────────────────────────────────────────────────────────

    public function test_snapshot_shows_only_tiles_whose_report_the_reader_may_open(): void
    {
        $user = $this->userWith(['tickets.view_all', 'tickets.resolve', 'tickets.level_hardware', 'assets.view', 'stock.view']);
        Ticket::factory()->create(['category' => 'hardware', 'status' => 'in_progress', 'created_at' => '2026-09-10 10:00:00', 'responded_at' => '2026-09-10 11:00:00', 'sla_resolve_due_at' => '2026-09-12 10:00:00']);
        Ticket::factory()->create(['category' => 'hardware', 'status' => 'completed', 'created_at' => '2026-09-05 10:00:00', 'resolved_at' => '2026-09-06 10:00:00', 'sla_resolve_due_at' => '2026-09-07 10:00:00']);
        Ticket::factory()->create(['category' => 'hardware', 'status' => 'completed', 'created_at' => '2026-08-20 10:00:00', 'resolved_at' => '2026-08-25 10:00:00', 'sla_resolve_due_at' => '2026-08-21 10:00:00']);
        // Outside the reader's levels: never counted.
        Ticket::factory()->create(['category' => 'network', 'status' => 'open', 'created_at' => '2026-09-10 10:00:00']);
        Asset::factory()->create(['status' => 'deployed']);
        Asset::factory()->create(['status' => 'ready']);
        Asset::factory()->create(['status' => 'writeoff']);
        StockItem::create(['sku' => 'SKU-0000001', 'name' => 'Toner', 'current_stock' => 0, 'min_stock' => 5, 'max_stock' => 10]);

        $body = $this->actingAs($user)->getJson('/api/reports/snapshot')->assertOk()->json('data');

        // Default: the last 30 days, today included.
        $this->assertSame('30d', $body['period']);
        $this->assertSame('2026-08-27', $body['from']);
        $this->assertSame('2026-09-25', $body['to']);
        $tiles = collect($body['tiles'])->keyBy('key');
        $this->assertSame(['tickets_open', 'sla_rate', 'assets_in_use', 'stock_below_min'], $tiles->keys()->all());

        $this->assertSame(1, $tiles['tickets_open']['value']);
        $this->assertSame(['key' => 'over_sla', 'value' => 1], $tiles['tickets_open']['secondary']);
        $this->assertSame('tickets.backlog', $tiles['tickets_open']['report_key']);
        $this->assertEquals(100.0, $tiles['sla_rate']['value']);
        // Against 0% in the 30 days before.
        $this->assertEquals(100.0, $tiles['sla_rate']['delta']);
        $this->assertSame(1, $tiles['assets_in_use']['value']);
        $this->assertSame(2, $tiles['assets_in_use']['total']);
        $this->assertSame(50, $tiles['assets_in_use']['secondary']['value']);
        $this->assertSame(1, $tiles['stock_below_min']['value']);
    }

    /** The open-ticket tile carries how the open count moved over the period (the mockup's sparkline). */
    public function test_snapshot_open_tickets_trend_across_the_period(): void
    {
        $user = $this->userWith(['tickets.view_all', 'tickets.resolve', 'tickets.level_hardware']);
        // Open since before the 30 days and still open: counted at every point.
        Ticket::factory()->create(['category' => 'hardware', 'status' => 'open', 'created_at' => '2026-08-20 10:00:00']);
        // Closed on the 5th: open at the start only.
        Ticket::factory()->create(['category' => 'hardware', 'status' => 'completed', 'created_at' => '2026-08-25 10:00:00', 'resolved_at' => '2026-09-05 10:00:00']);
        // Raised on the 20th and still open: open at the end only.
        Ticket::factory()->create(['category' => 'hardware', 'status' => 'in_progress', 'created_at' => '2026-09-20 10:00:00']);
        // Outside the reader's levels: never counted.
        Ticket::factory()->create(['category' => 'network', 'status' => 'open', 'created_at' => '2026-08-01 10:00:00']);

        $tile = collect($this->actingAs($user)->getJson('/api/reports/snapshot?period=30d')->assertOk()->json('data.tiles'))->keyBy('key')['tickets_open'];

        $this->assertSame(2, $tile['value']);
        $this->assertCount(7, $tile['trend']);
        $this->assertSame(2, $tile['trend'][0]);
        $this->assertSame(2, $tile['trend'][6]);
        $this->assertSame(1, min($tile['trend']));
        $this->assertEquals(0.0, $tile['delta']);
        $this->assertCount(7, collect($this->actingAs($user)->getJson('/api/reports/snapshot?period=30d')->json('data.tiles'))->keyBy('key')['sla_rate']['trend']);
    }

    public function test_snapshot_period_moves_the_counted_over_time_tiles(): void
    {
        $user = $this->userWith(['requests.view_all', 'contracts.view']);
        $request = fn (string $status) => ServiceRequest::create([
            'type' => 'computer', 'origin' => 'direct', 'requester_name' => 'A', 'title' => 'T', 'reason' => 'R', 'status' => $status,
        ]);
        $request('pending');
        $old = $request('pending');
        ServiceRequest::query()->whereKey($old->id)->update(['created_at' => '2026-02-01 09:00:00']);
        $vendor = Vendor::create(['name' => 'Acme']);
        Contract::create(['vendor_id' => $vendor->id, 'name' => 'Soon', 'type' => 'software', 'start_date' => '2025-10-01', 'end_date' => '2026-10-10', 'value' => 1, 'billing_cycle' => 'yearly']);
        Contract::create(['vendor_id' => $vendor->id, 'name' => 'Late', 'type' => 'software', 'start_date' => '2025-10-01', 'end_date' => '2026-12-31', 'value' => 1, 'billing_cycle' => 'yearly']);

        $tilesFor = fn (string $query) => collect($this->actingAs($user)->getJson('/api/reports/snapshot?'.$query)->assertOk()->json('data.tiles'))->keyBy('key');

        $last30 = $tilesFor('period=30d');
        $this->assertSame(['requests_pending', 'contracts_expiring'], $last30->keys()->all());
        $this->assertSame(2, $last30['requests_pending']['value']);
        $this->assertSame(1, $last30['requests_pending']['secondary']['value']);
        // 1 Feb is past 90 days back, inside a range the reader picks from 1 Jan.
        $this->assertSame(1, $tilesFor('period=90d')['requests_pending']['secondary']['value']);
        $this->assertSame(2, $tilesFor('period=custom&from=2026-01-01&to=2026-09-25')['requests_pending']['secondary']['value']);
        $this->assertSame(0, $tilesFor('period=custom&from=2026-03-01&to=2026-09-24')['requests_pending']['secondary']['value']);
        // Same rule as "สัญญาใกล้หมดอายุ" at 30 days.
        $this->assertSame(1, $last30['contracts_expiring']['value']);

        $this->actingAs($user)->getJson('/api/reports/snapshot?period=decade')->assertUnprocessable();
        // The calendar periods the strip used to offer are gone.
        $this->actingAs($user)->getJson('/api/reports/snapshot?period=month')->assertUnprocessable();
    }

    /** A custom period is the reader's own from / to — both needed, in order, and not past today. */
    public function test_snapshot_custom_period_needs_a_valid_range(): void
    {
        $user = $this->userWith(['requests.view_all']);
        $get = fn (string $query) => $this->actingAs($user)->getJson('/api/reports/snapshot?'.$query);

        $get('period=custom&from=2026-09-01&to=2026-09-10')->assertOk()
            ->assertJsonPath('data.period', 'custom')->assertJsonPath('data.from', '2026-09-01')->assertJsonPath('data.to', '2026-09-10');
        $get('period=custom&from=2026-09-10&to=2026-09-10')->assertOk();

        $get('period=custom')->assertUnprocessable()->assertJsonValidationErrors(['from', 'to']);
        $get('period=custom&from=2026-09-10&to=2026-09-01')->assertUnprocessable()->assertJsonValidationErrors(['to']);
        $get('period=custom&from=2026-09-01&to=2026-09-26')->assertUnprocessable()->assertJsonValidationErrors(['to']);
        $get('period=custom&from=01/09/2026&to=2026-09-10')->assertUnprocessable()->assertJsonValidationErrors(['from']);
        // A preset ignores stray dates.
        $get('period=7d&from=2026-01-01&to=2026-01-02')->assertOk()->assertJsonPath('data.from', '2026-09-19');
    }

    public function test_snapshot_for_someone_with_no_report_is_empty(): void
    {
        $this->actingAs($this->userWith(['tickets.create']))->getJson('/api/reports/snapshot')
            ->assertOk()->assertJsonPath('data.tiles', []);
    }

    // ── column picker ───────────────────────────────────────────────────────────────

    public function test_export_carries_only_the_picked_columns_in_report_order(): void
    {
        Excel::fake();
        Asset::factory()->create(['status' => 'ready']);
        $user = $this->userWith(['assets.view']);

        $this->actingAs($user)
            ->exportReport('/api/reports/r/assets.overview/export?format=xlsx&columns[]=status&columns[]=asset_code')->assertAccepted();

        $this->assertExportStored('Report_assets-overview_2026-09-25.xlsx', function (TabularReportExport $export) {
            return last($export->sheets())->headings() === ['รหัสทรัพย์สิน', 'สถานะ']
                && count(last($export->sheets())->map($export->rows->first())) === 2;
        });
    }

    public function test_export_refuses_a_column_the_report_does_not_have(): void
    {
        $user = $this->userWith(['assets.view']);

        $this->actingAs($user)->exportReport('/api/reports/r/assets.overview/export?format=xlsx&columns[]=salary')->assertUnprocessable();
    }

    public function test_pdf_export_with_picked_columns_streams(): void
    {
        Asset::factory()->create(['status' => 'ready']);

        $response = $this->actingAs($this->userWith(['assets.view']))
            ->exportReport('/api/reports/r/assets.overview/export?format=pdf&columns[]=asset_code');

        $response->assertOk();
        $this->assertSame('application/pdf', $response->headers->get('Content-Type'));
    }
}
