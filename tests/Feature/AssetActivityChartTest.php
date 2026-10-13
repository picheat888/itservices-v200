<?php

namespace Tests\Feature;

use App\Enums\Asset\AssetTransferKind;
use App\Models\Asset\Asset;
use App\Models\Asset\AssetTransfer;
use App\Models\Employee\Employee;
use App\Models\Settings\Location;
use App\Models\Stock\Warehouse;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The custody trail records WHAT each move was, and the Assets dashboard counts those kinds
 * over the Overview period. Both halves are tested here: the service stamping `kind`, and the
 * summary turning those rows into chart columns.
 */
class AssetActivityChartTest extends TestCase
{
    use RefreshDatabase;

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    public function test_handing_an_asset_to_an_employee_logs_a_handover(): void
    {
        $employee = Employee::create(['code' => 'EMP-9001', 'first_name' => 'New', 'last_name' => 'Hire']);
        $this->actingAs($this->super());
        $asset = Asset::factory()->create(['status' => 'ready', 'owner' => null, 'owner_employee_id' => null]);
        $location = Location::create(['name' => 'HQ Floor 3']);

        $this->postJson("/api/assets/{$asset->id}/transfer", [
            'mode' => 'employee', 'owner_employee_id' => $employee->id, 'location_id' => $location->id,
        ])->assertOk();

        $this->assertSame(AssetTransferKind::Handover, AssetTransfer::latest('id')->first()->kind);
    }

    public function test_handing_an_asset_to_a_shared_label_also_logs_a_handover(): void
    {
        $this->actingAs($this->super());
        $asset = Asset::factory()->create(['status' => 'ready', 'owner' => null, 'owner_employee_id' => null]);
        $location = Location::create(['name' => 'Server Room']);

        $this->postJson("/api/assets/{$asset->id}/transfer", [
            'mode' => 'shared', 'owner_label' => 'Rack 2', 'location_id' => $location->id,
        ])->assertOk();

        $this->assertSame(AssetTransferKind::Handover, AssetTransfer::latest('id')->first()->kind);
    }

    public function test_receiving_an_asset_back_logs_a_return(): void
    {
        $employee = Employee::create(['code' => 'EMP-9002', 'first_name' => 'Back', 'last_name' => 'Again']);
        $this->actingAs($this->super());
        Warehouse::firstOrCreate(['name' => 'Central IT']);
        $asset = Asset::factory()->create([
            'status' => 'pending_return', 'owner' => 'EMP-9002', 'owner_employee_id' => $employee->id,
        ]);

        $this->postJson("/api/assets/{$asset->id}/receive", ['warehouse' => 'Central IT'])->assertOk();

        $this->assertSame(AssetTransferKind::Return, AssetTransfer::latest('id')->first()->kind);
    }

    /** A recall is its own kind: the asset came back, but nobody ever used it. */
    public function test_recalling_an_asset_logs_a_recall(): void
    {
        $employee = Employee::create(['code' => 'EMP-9003', 'first_name' => 'Never', 'last_name' => 'Accepted']);
        $this->actingAs($this->super());
        Warehouse::firstOrCreate(['name' => 'Central IT']);
        $asset = Asset::factory()->create([
            'status' => 'pending_acceptance', 'owner' => 'EMP-9003', 'owner_employee_id' => $employee->id,
        ]);

        $this->postJson("/api/assets/{$asset->id}/recall", ['warehouse' => 'Central IT'])->assertOk();

        $this->assertSame(AssetTransferKind::Recall, AssetTransfer::latest('id')->first()->kind);
    }

    /** @param  array<string, mixed>  $attributes */
    private function trail(AssetTransferKind $kind, string $when, array $attributes = []): void
    {
        $row = AssetTransfer::create(array_merge([
            'asset_id' => Asset::factory()->create()->id,
            'asset_tag' => 'AST-0001',
            'asset_model' => 'ThinkPad',
            'kind' => $kind->value,
            'to_owner' => 'EMP-0001',
        ], $attributes));

        // created_at is set by the timestamps, so the age has to be written afterwards.
        $row->forceFill(['created_at' => $when])->saveQuietly();
    }

    /** A twelve-month custom range: one column per month, oldest first. */
    private const YEAR = '/api/assets/summary?from=2025-11-01&to=2026-10-14';

    public function test_summary_returns_one_column_per_month_of_the_period(): void
    {
        $this->travelTo('2026-10-14 12:00:00');
        $this->actingAs($this->super());

        $activity = $this->getJson(self::YEAR)->assertOk()->json('activity');

        $this->assertSame('month', $activity['unit']);
        $this->assertCount(12, $activity['data']);
        $this->assertSame('2025-11', $activity['data'][0]['month']);
        $this->assertSame('2026-10', $activity['data'][11]['month']);
    }

    public function test_summary_counts_handovers_and_returns_into_their_month(): void
    {
        $this->travelTo('2026-10-14 12:00:00');
        $this->actingAs($this->super());

        $this->trail(AssetTransferKind::Handover, '2026-10-02 10:00:00');
        $this->trail(AssetTransferKind::Handover, '2026-10-02 11:00:00');
        $this->trail(AssetTransferKind::Return, '2026-10-02 12:00:00');
        $this->trail(AssetTransferKind::Handover, '2026-08-02 10:00:00');

        $months = collect($this->getJson(self::YEAR)->json('activity.data'))->keyBy('month');

        $this->assertSame(2, $months['2026-10']['handover']);
        $this->assertSame(1, $months['2026-10']['returned']);
        $this->assertSame(1, $months['2026-08']['handover']);
        // A month nothing happened in is still present, at zero — otherwise the bars would
        // slide along the axis and carry the wrong labels.
        $this->assertSame(0, $months['2026-09']['handover']);
        $this->assertSame(0, $months['2026-09']['returned']);
    }

    /** Recalls are assets back in the pool, so the returns bar counts them. */
    public function test_summary_counts_recalls_as_returns(): void
    {
        $this->travelTo('2026-10-14 12:00:00');
        $this->actingAs($this->super());
        $this->trail(AssetTransferKind::Recall, '2026-10-02 10:00:00');

        $months = collect($this->getJson(self::YEAR)->json('activity.data'))->keyBy('month');

        $this->assertSame(1, $months['2026-10']['returned']);
        $this->assertSame(0, $months['2026-10']['handover']);
    }

    public function test_summary_ignores_activity_outside_the_period(): void
    {
        $this->travelTo('2026-10-14 12:00:00');
        $this->actingAs($this->super());
        $this->trail(AssetTransferKind::Handover, '2025-10-20 10:00:00');

        $data = $this->getJson(self::YEAR)->json('activity.data');

        $this->assertSame(0, collect($data)->sum('handover'));
        $this->assertCount(12, $data);
    }

    public function test_all_time_starts_at_the_first_move(): void
    {
        $this->travelTo('2026-10-14 12:00:00');
        $this->actingAs($this->super());
        $this->trail(AssetTransferKind::Handover, '2026-09-28 10:00:00');
        $this->trail(AssetTransferKind::Handover, '2026-10-13 10:00:00');

        $activity = $this->getJson('/api/assets/summary')->assertOk()->json('activity');

        // 16 days of history reads in weeks, from the Sunday of the first move.
        $this->assertSame('week', $activity['unit']);
        $this->assertSame('2026-09-27', $activity['data'][0]['month']);
        $this->assertSame(2, collect($activity['data'])->sum('handover'));
    }
}
