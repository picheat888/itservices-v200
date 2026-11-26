<?php

// Importing a checked batch of assets: all or nothing, codes from one lock, contract link and rights.

namespace Tests\Feature;

use App\Models\Asset\Asset;
use App\Models\AuditLog;
use App\Models\Contract\Contract;
use App\Models\Permission\RolePermission;
use App\Models\Settings\AppSetting;
use App\Models\Settings\AssetModel;
use App\Models\Settings\Brand;
use App\Models\Settings\Category;
use App\Models\Settings\Vendor;
use App\Models\Stock\Warehouse;
use App\Models\User;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class AssetImportRunTest extends TestCase
{
    use RefreshDatabase;

    private Category $notebook;

    private Brand $lenovo;

    private AssetModel $thinkpad;

    private Warehouse $warehouse;

    private Vendor $vendor;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        AppSetting::flushCache();
        $this->notebook = Category::create(['name' => 'Notebook']);
        $this->lenovo = Brand::create(['name' => 'Lenovo']);
        $this->thinkpad = AssetModel::create(['name' => 'ThinkPad E14 Gen 6', 'brand_id' => $this->lenovo->id]);
        $this->warehouse = Warehouse::create(['name' => 'Main']);
        $this->vendor = Vendor::create(['name' => 'IT City']);
        $this->user = User::factory()->create(['role' => 'user']);
        RolePermission::create(['role_id' => $this->user->role_id, 'permission' => 'assets.register', 'allowed' => true]);
    }

    /**
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>
     */
    private function row(int $line, array $row = []): array
    {
        return $row + [
            'line' => $line, 'category_id' => $this->notebook->id, 'brand_id' => $this->lenovo->id, 'model_id' => $this->thinkpad->id,
            'serial' => "SN-{$line}", 'warehouse_id' => $this->warehouse->id,
        ];
    }

    /**
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>
     */
    private function purchasedRow(int $line, array $row = []): array
    {
        return $this->row($line, $row + [
            'value' => 28500, 'vendor_id' => $this->vendor->id, 'purchase_date' => '2026-11-12', 'warranty_end' => '2029-11-12',
        ]);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function import(array $payload): TestResponse
    {
        return $this->actingAs($this->user)->postJson('/api/assets/import', $payload);
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function hardwareContract(array $attributes = []): Contract
    {
        return Contract::create($attributes + [
            'vendor_id' => $this->vendor->id, 'name' => 'Notebook lease', 'type' => 'hardware',
            'start_date' => '2026-01-01', 'end_date' => '2027-12-31', 'value' => 8500, 'billing_cycle' => 'monthly',
        ]);
    }

    public function test_rented_rows_become_ready_assets_waiting_for_a_contract(): void
    {
        Notification::fake();
        Mail::fake();

        $this->import(['kind' => 'rented', 'rows' => [
            $this->row(2, ['vendor_id' => $this->vendor->id, 'value' => 900]), $this->row(3), $this->row(4),
        ]])->assertOk()->assertJsonPath('data.imported', 3)->assertJsonPath('data.contract_code', null);

        $this->assertSame(3, Asset::count());
        foreach (Asset::all() as $asset) {
            $this->assertSame('ready', $asset->status->value);
            $this->assertSame('rented', $asset->source->value);
            $this->assertNull($asset->contract_id);
            $this->assertNull($asset->vendor_id);
            $this->assertEquals(0, $asset->value);
        }
        $this->assertSame(3, AuditLog::where('action', 'Registered asset')->count());
        Notification::assertNothingSent();
        Mail::assertNothingSent();
    }

    public function test_a_chosen_open_contract_is_linked_to_every_row(): void
    {
        $contract = $this->hardwareContract();

        $this->import(['kind' => 'rented', 'contract_id' => $contract->id, 'rows' => [$this->row(2), $this->row(3)]])
            ->assertOk()->assertJsonPath('data.contract_code', $contract->code);

        $this->assertSame(2, Asset::where('contract_id', $contract->id)->count());
    }

    public function test_a_contract_closed_before_the_import_refuses_it_and_writes_nothing(): void
    {
        $contract = $this->hardwareContract();
        $contract->forceFill(['expired_at' => now()->subDay()])->save();

        $this->import(['kind' => 'rented', 'contract_id' => $contract->id, 'rows' => [$this->row(2)]])
            ->assertStatus(422)
            ->assertJsonPath('errors.contract_id.0', 'link_contract_not_open');

        $this->assertSame(0, Asset::count());
    }

    public function test_a_contract_is_refused_for_purchased_rows(): void
    {
        $contract = $this->hardwareContract();

        $this->import(['kind' => 'purchased', 'contract_id' => $contract->id, 'rows' => [$this->purchasedRow(2)]])
            ->assertStatus(422)->assertJsonValidationErrors('contract_id');

        $this->assertSame(0, Asset::count());
    }

    public function test_codes_continue_the_year_sequence_and_come_back_as_a_range(): void
    {
        $this->travelTo(now()->setDate(2026, 11, 27));
        Asset::factory()->create(['asset_code' => 'INK-IT-26-0007']);

        $this->import(['kind' => 'rented', 'rows' => [
            $this->row(2), $this->row(3, ['asset_code' => 'MY-CODE-1']), $this->row(4), $this->row(5),
        ]])->assertOk()
            ->assertJsonPath('data.first_code', 'INK-IT-26-0008')
            ->assertJsonPath('data.last_code', 'INK-IT-26-0010');

        $this->assertSame(
            ['INK-IT-26-0008', 'MY-CODE-1', 'INK-IT-26-0009', 'INK-IT-26-0010'],
            Asset::whereIn('serial', ['SN-2', 'SN-3', 'SN-4', 'SN-5'])->orderBy('serial')->pluck('asset_code')->all(),
        );
    }

    public function test_a_code_typed_in_the_same_batch_is_never_issued_to_a_blank_row(): void
    {
        $this->travelTo(now()->setDate(2026, 11, 27));
        Asset::factory()->create(['asset_code' => 'INK-IT-26-0007']);

        $this->assertSame(
            ['INK-IT-26-0008', 'INK-IT-26-0010', 'INK-IT-26-0011'],
            Asset::nextFreeCodes(3, ['ink-it-26-0009']),
        );

        $this->import(['kind' => 'rented', 'rows' => [
            $this->row(2), $this->row(3, ['asset_code' => 'INK-IT-26-0009']), $this->row(4),
        ]])->assertOk()
            ->assertJsonPath('data.first_code', 'INK-IT-26-0008')
            ->assertJsonPath('data.last_code', 'INK-IT-26-0010');
    }

    public function test_a_serial_registered_in_the_meantime_refuses_the_whole_batch(): void
    {
        Asset::factory()->create(['serial' => 'SN-3', 'status' => 'ready']);
        $before = Asset::count();

        $response = $this->import(['kind' => 'rented', 'rows' => [$this->row(2), $this->row(3)]])
            ->assertStatus(422)
            ->assertJsonPath('message', 'import_rows_invalid')
            ->assertJsonPath('errors.0.row', 3);

        $this->assertSame('serial_taken', $response->json('errors.0.issues.0.code'));
        $this->assertSame($before, Asset::count());
    }

    public function test_purchased_rows_keep_their_price_vendor_and_warranty(): void
    {
        $this->import(['kind' => 'purchased', 'rows' => [
            $this->purchasedRow(2), $this->purchasedRow(3, ['warranty_lifetime' => true]),
        ]])->assertOk();

        $first = Asset::where('serial', 'SN-2')->first();
        $this->assertSame('purchased', $first->source->value);
        $this->assertEquals(28500, $first->value);
        $this->assertSame($this->vendor->id, $first->vendor_id);
        $this->assertSame('2026-11-12', $first->purchase_date->toDateString());
        $this->assertSame('2029-11-12', $first->warranty_end->toDateString());

        $lifetime = Asset::where('serial', 'SN-3')->first();
        $this->assertTrue($lifetime->warranty_lifetime);
        $this->assertNull($lifetime->warranty_end);
    }

    public function test_the_import_needs_the_register_right_and_at_most_500_rows(): void
    {
        $viewer = User::factory()->create(['role' => 'viewer']);
        RolePermission::create(['role_id' => $viewer->role_id, 'permission' => 'assets.view', 'allowed' => true]);
        $this->actingAs($viewer)->postJson('/api/assets/import', ['kind' => 'rented', 'rows' => [$this->row(2)]])->assertForbidden();

        $rows = array_map(fn (int $i) => $this->row($i + 1), range(1, 501));
        $this->import(['kind' => 'rented', 'rows' => $rows])->assertStatus(422)->assertJsonValidationErrors('rows');
        $this->assertSame(0, Asset::count());
    }

    public function test_the_recheck_sees_rows_committed_by_an_earlier_import(): void
    {
        $payload = ['kind' => 'rented', 'rows' => [$this->row(2), $this->row(3)]];
        $this->import($payload)->assertOk();
        $this->assertSame(2, Asset::count());

        $response = $this->import($payload)->assertStatus(422)->assertJsonPath('message', 'import_rows_invalid');
        $this->assertSame('serial_taken', $response->json('errors.0.issues.0.code'));
        $this->assertSame(2, Asset::count());
    }

    public function test_a_lock_wait_timeout_answers_import_conflict_and_writes_nothing(): void
    {
        $lock = \Mockery::mock();
        $lock->shouldReceive('block')->andThrow(new LockTimeoutException);
        Cache::shouldReceive('lock')->andReturn($lock);

        $this->import(['kind' => 'rented', 'rows' => [$this->row(2)]])
            ->assertStatus(422)->assertJsonPath('message', 'import_conflict');

        $this->assertSame(0, Asset::count());
    }

    public function test_a_code_clash_while_writing_answers_import_conflict_and_writes_nothing(): void
    {
        $taken = Asset::factory()->create(['asset_code' => 'INK-IT-TAKEN-1', 'serial' => 'OTHER-1']);
        Asset::creating(function (Asset $asset) use ($taken): void {
            if ($asset->serial === 'SN-3') {
                $asset->asset_code = $taken->asset_code;
            }
        });

        $this->import(['kind' => 'rented', 'rows' => [$this->row(2), $this->row(3)]])
            ->assertStatus(422)->assertJsonPath('message', 'import_conflict');

        $this->assertSame(1, Asset::count());
        $this->assertSame(0, AuditLog::where('action', 'Registered asset')->count());
    }

    public function test_a_purchased_row_without_a_lifetime_flag_is_stored_as_not_lifetime(): void
    {
        $this->import(['kind' => 'purchased', 'rows' => [$this->purchasedRow(2, ['warranty_lifetime' => null])]])->assertOk();

        $this->assertFalse(Asset::where('serial', 'SN-2')->first()->warranty_lifetime);
    }
}
