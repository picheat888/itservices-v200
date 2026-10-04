<?php

namespace Tests\Feature;

use App\Models\Asset\Asset;
use App\Models\AuditLog;
use App\Models\Contract\Contract;
use App\Models\Settings\Vendor;
use App\Models\User;
use App\Services\Contract\ContractService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Tests\TestCase;

/**
 * Who did it: created_by / updated_by on assets and contracts (App\Models\Concerns\RecordsActors),
 * written_off_by and cancelled_by, and audit_logs entries tied to the record they are about
 * (subject_type / subject_id, a full-row snapshot on delete, one entry per asset on bulk actions).
 */
class ActorStampsTest extends TestCase
{
    use RefreshDatabase;

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    private function contract(array $overrides = []): Contract
    {
        $vendor = Vendor::create(['name' => 'V-'.uniqid()]);

        return Contract::create(array_merge([
            'vendor_id' => $vendor->id, 'name' => 'Copier lease', 'details' => 'T', 'type' => 'hardware',
            'start_date' => now()->subYear(), 'end_date' => now()->addYear(), 'value' => 100, 'billing_cycle' => 'yearly',
        ], $overrides));
    }

    public function test_an_asset_records_who_added_it_and_who_changed_it_last(): void
    {
        $adder = $this->super();
        $editor = $this->super();

        $this->actingAs($adder);
        $asset = Asset::factory()->create(['status' => 'ready']);
        $this->assertSame($adder->id, $asset->created_by);
        $this->assertSame($adder->id, $asset->updated_by);

        $this->actingAs($editor);
        $asset->update(['notes' => 'Screen replaced']);

        $asset->refresh();
        $this->assertSame($adder->id, $asset->created_by);
        $this->assertSame($editor->id, $asset->updated_by);
        $this->assertSame($adder->id, $asset->creator->id);
        $this->assertSame($editor->id, $asset->updater->id);
    }

    public function test_a_save_with_nobody_signed_in_leaves_the_stamps_alone(): void
    {
        $adder = $this->super();
        $this->actingAs($adder);
        $asset = Asset::factory()->create(['status' => 'ready']);

        Auth::logout();
        $asset->update(['notes' => 'Touched by the scheduler']);

        $this->assertSame($adder->id, $asset->fresh()->updated_by);
    }

    public function test_writing_an_asset_off_records_who_and_cancelling_it_clears_that(): void
    {
        $user = $this->super();
        $this->actingAs($user);
        $asset = Asset::factory()->create(['status' => 'ready']);

        $asset->update(['status' => 'writeoff']);
        $this->assertSame($user->id, $asset->fresh()->written_off_by);
        $this->assertSame($user->id, $asset->fresh()->writtenOffBy->id);

        $asset->update(['status' => 'ready']);
        $this->assertNull($asset->fresh()->written_off_by);
        $this->assertNull($asset->fresh()->written_off_at);
    }

    public function test_a_bulk_write_off_stamps_each_asset_and_logs_one_entry_per_asset(): void
    {
        $this->actingAs($this->super());
        $one = Asset::factory()->create(['status' => 'ready']);
        $two = Asset::factory()->create(['status' => 'ready']);

        $retirer = $this->super();
        $this->actingAs($retirer)
            ->postJson('/api/assets/bulk', ['ids' => [$one->id, $two->id], 'op' => 'writeoff', 'reason' => 'Sold for scrap'])
            ->assertOk()
            ->assertJsonPath('updated', 2);

        foreach ([$one, $two] as $asset) {
            $asset->refresh();
            $this->assertSame($retirer->id, $asset->written_off_by);
            $this->assertSame($retirer->id, $asset->updated_by);

            $entry = AuditLog::forSubject($asset)->where('action', 'Wrote off asset')->sole();
            $this->assertSame($asset->asset_code, $entry->target);
            $this->assertSame(['reason' => 'Sold for scrap'], $entry->details['facts']);
            $this->assertSame($retirer->id, $entry->user_id);
        }
    }

    public function test_a_contract_records_who_cancelled_it_and_reactivating_clears_that(): void
    {
        $adder = $this->super();
        $this->actingAs($adder);
        $contract = $this->contract();
        $this->assertSame($adder->id, $contract->created_by);

        $canceller = $this->super();
        $this->actingAs($canceller);
        $contract = app(ContractService::class)->cancel($contract, 'Moved to a new vendor');
        $this->assertSame($canceller->id, $contract->cancelled_by);
        $this->assertSame($canceller->id, $contract->canceller->id);
        $this->assertSame($canceller->id, $contract->updated_by);
        $this->assertSame($adder->id, $contract->created_by);

        $contract = app(ContractService::class)->reactivate($contract);
        $this->assertNull($contract->cancelled_by);
    }

    public function test_linking_assets_to_a_contract_stamps_only_the_assets_that_changed(): void
    {
        $adder = $this->super();
        $this->actingAs($adder);
        $kept = Asset::factory()->create(['status' => 'ready']);
        $added = Asset::factory()->create(['status' => 'ready']);
        $contract = $this->contract();
        $kept->update(['contract_id' => $contract->id]);

        $editor = $this->super();
        $this->actingAs($editor);
        app(ContractService::class)->update($contract, ['asset_ids' => [$kept->id, $added->id]]);

        $this->assertSame($adder->id, $kept->fresh()->updated_by);
        $this->assertSame($editor->id, $added->fresh()->updated_by);
        $this->assertSame($contract->id, $added->fresh()->contract_id);
    }

    public function test_the_detail_endpoints_name_who_did_it(): void
    {
        $adder = User::factory()->create(['role' => 'super', 'name' => 'Adder']);
        $this->actingAs($adder);
        $asset = Asset::factory()->create(['status' => 'ready']);
        $contract = $this->contract();

        $retirer = User::factory()->create(['role' => 'super', 'name' => 'Retirer']);
        $this->actingAs($retirer);
        $asset->update(['status' => 'writeoff']);
        app(ContractService::class)->cancel($contract, 'Ended early');

        $this->getJson("/api/assets/{$asset->id}")
            ->assertOk()
            ->assertJsonPath('data.created_by_name', 'Adder')
            ->assertJsonPath('data.updated_by_name', 'Retirer')
            ->assertJsonPath('data.written_off_by_name', 'Retirer');

        $this->getJson("/api/contracts/{$contract->id}")
            ->assertOk()
            ->assertJsonPath('data.created_by_name', 'Adder')
            ->assertJsonPath('data.updated_by_name', 'Retirer')
            ->assertJsonPath('data.cancelled_by_name', 'Retirer');

        // The lists stay lean: the names come with the single record only.
        $this->getJson('/api/contracts')->assertOk()->assertJsonMissingPath('data.0.created_by_name');
    }

    public function test_an_audit_entry_is_tied_to_the_record_it_is_about(): void
    {
        $user = $this->super();
        $this->actingAs($user);
        $asset = Asset::factory()->create(['status' => 'ready']);
        $other = Asset::factory()->create(['status' => 'ready']);

        $this->putJson("/api/assets/{$asset->id}", [
            'category_id' => $asset->category_id, 'brand_id' => $asset->brand_id, 'model_id' => $asset->model_id,
            'source' => $asset->source->value, 'status' => 'ready', 'warehouse_id' => $asset->warehouse_id,
            'serial' => 'SN-NEW-1', 'value' => 25000, 'vendor_id' => Vendor::create(['name' => 'Supplier'])->id,
        ])->assertOk();
        AuditLog::record('Something else', $other->asset_code, subject: $other);

        $entry = AuditLog::forSubject($asset)->sole();
        $this->assertSame('Updated asset', $entry->action);
        $this->assertSame(Asset::class, $entry->subject_type);
        $this->assertSame($asset->id, (int) $entry->subject_id);
    }

    public function test_an_entry_without_a_subject_still_records(): void
    {
        $this->actingAs($this->super());
        AuditLog::record('Updated SLA settings', 'ticket_sla');

        $this->assertDatabaseHas('audit_logs', ['action' => 'Updated SLA settings', 'subject_type' => null, 'subject_id' => null]);
    }

    public function test_a_delete_keeps_the_whole_row_in_the_log(): void
    {
        $this->actingAs($this->super());
        $asset = Asset::factory()->create(['status' => 'ready', 'contract_id' => null, 'serial' => 'SN-GONE-1']);

        $this->deleteJson("/api/assets/{$asset->id}")->assertOk();

        $this->assertDatabaseMissing('assets', ['id' => $asset->id]);
        $entry = AuditLog::where('action', 'Deleted asset')->sole();
        $this->assertSame($asset->id, (int) $entry->subject_id);
        $this->assertSame($asset->asset_code, $entry->details['snapshot']['asset_code']);
        $this->assertSame('SN-GONE-1', $entry->details['snapshot']['serial']);
    }

    public function test_a_delete_snapshot_leaves_out_secrets(): void
    {
        $this->actingAs($this->super());
        $gone = User::factory()->create(['name' => 'Leaver']);

        AuditLog::recordDeleted('Deleted user', $gone->name, $gone);

        $snapshot = AuditLog::where('action', 'Deleted user')->sole()->details['snapshot'];
        $this->assertSame('Leaver', $snapshot['name']);
        $this->assertArrayNotHasKey('password', $snapshot);
        $this->assertArrayNotHasKey('remember_token', $snapshot);
    }
}
