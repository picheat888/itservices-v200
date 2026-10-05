<?php

namespace Tests\Feature;

use App\Models\Access\EmailGroup;
use App\Models\Access\FileShare;
use App\Models\Access\SocialPlatform;
use App\Models\Access\Software;
use App\Models\Asset\Asset;
use App\Models\AuditLog;
use App\Models\Contract\Contract;
use App\Models\Email\EmailTemplate;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Employee\Section;
use App\Models\Notification\NotificationTemplate;
use App\Models\Settings\AssetModel;
use App\Models\Settings\Brand;
use App\Models\Settings\Category;
use App\Models\Settings\Location;
use App\Models\Settings\Unit;
use App\Models\Settings\Vendor;
use App\Models\Settings\WarrantyType;
use App\Models\Stock\StockItem;
use App\Models\Stock\Warehouse;
use App\Models\User;
use App\Services\Contract\ContractService;
use Database\Seeders\EmailTemplateSeeder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Who did it: created_by / updated_by on assets, contracts, employees, stock items and the master data
 * (App\Models\Concerns\RecordsActors),
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

    /** @return array<string, array{class-string<Model>, array<string, mixed>, array<string, mixed>}> */
    public static function masterData(): array
    {
        return [
            'brand' => [Brand::class, ['name' => 'Acme'], ['description' => 'Printers']],
            'asset model' => [AssetModel::class, ['name' => 'X1'], ['description' => 'Gen 2']],
            'category' => [Category::class, ['name' => 'Scanner'], ['name_th' => 'สแกนเนอร์']],
            'vendor' => [Vendor::class, ['name' => 'Supplier Co'], ['phone' => '02-000-0000']],
            'warehouse' => [Warehouse::class, ['name' => 'Annex'], ['description' => 'Back room']],
            'location' => [Location::class, ['name' => 'HQ - 2nd floor'], ['name' => 'HQ - 3rd floor']],
            'unit' => [Unit::class, ['name' => 'Box'], ['description' => '10 pcs']],
            'warranty type' => [WarrantyType::class, ['name' => '3y onsite'], ['description' => 'Next day']],
            'department' => [Department::class, ['code' => 'DEP-9001', 'tag' => 'LOG', 'name' => 'Logistics'], ['name_th' => 'โลจิสติกส์']],
            'position' => [Position::class, ['code' => 'PST-9001', 'title' => 'Driver'], ['title' => 'Senior driver']],
            'section' => [Section::class, ['code' => 'SEC-9001', 'name' => 'Fleet'], ['name_th' => 'ยานพาหนะ']],
        ];
    }

    /**
     * @param  class-string<Model>  $class
     * @param  array<string, mixed>  $create
     * @param  array<string, mixed>  $change
     */
    #[DataProvider('masterData')]
    public function test_master_data_records_who_added_it_and_who_changed_it_last(string $class, array $create, array $change): void
    {
        $adder = $this->super();
        $this->actingAs($adder);
        if ($class === Section::class) {
            $create['department_id'] = Department::create(['code' => 'DEP-9002', 'tag' => 'OPS', 'name' => 'Operations'])->id;
        }
        $record = $class::create($create);

        $editor = $this->super();
        $this->actingAs($editor);
        $record->update($change);

        $record->refresh();
        $this->assertSame($adder->id, $record->created_by);
        $this->assertSame($editor->id, $record->updated_by);
    }

    public function test_an_employee_records_who_added_it_and_the_detail_names_them(): void
    {
        $adder = User::factory()->create(['role' => 'super', 'name' => 'HR Adder']);
        $this->actingAs($adder);
        $employee = Employee::create(['code' => 'EMP-9001', 'first_name' => 'New', 'last_name' => 'Hire']);

        $editor = User::factory()->create(['role' => 'super', 'name' => 'HR Editor']);
        $this->actingAs($editor);
        $employee->update(['phone' => '080-000-0000']);

        $this->getJson("/api/employees/{$employee->id}")
            ->assertOk()
            ->assertJsonPath('data.created_by_name', 'HR Adder')
            ->assertJsonPath('data.updated_by_name', 'HR Editor')
            ->assertJsonPath('data.created_at', now()->toDateString());
    }

    public function test_a_stock_item_records_who_added_it_and_who_last_moved_it(): void
    {
        $adder = User::factory()->create(['role' => 'super', 'name' => 'Store Adder']);
        $this->actingAs($adder);
        $item = StockItem::create([
            'sku' => 'SKU-9000001', 'name' => 'Toner', 'current_stock' => 0, 'min_stock' => 0, 'max_stock' => 10,
        ]);

        $receiver = User::factory()->create(['role' => 'super', 'name' => 'Store Receiver']);
        $this->actingAs($receiver);
        $this->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 4])->assertCreated();

        $this->getJson("/api/stock-items/{$item->id}")
            ->assertOk()
            ->assertJsonPath('data.created_by_name', 'Store Adder')
            ->assertJsonPath('data.updated_by_name', 'Store Receiver');
    }

    /** @return array<string, array{class-string<Model>, array<string, mixed>, string}> */
    public static function accessCatalogues(): array
    {
        return [
            'email group' => [EmailGroup::class, ['name' => 'QC Team', 'email' => 'qc@example.com'], '/api/email-groups'],
            'file share' => [FileShare::class, ['name' => 'QC Documents', 'path' => '\\fs\qc'], '/api/file-shares'],
            'social platform' => [SocialPlatform::class, ['name' => 'LINE Official', 'url' => 'https://line.me'], '/api/social-platforms'],
            'software' => [Software::class, ['name' => 'Office', 'license_type' => 'subscription'], '/api/software'],
        ];
    }

    /**
     * @param  class-string<Model>  $class
     * @param  array<string, mixed>  $create
     */
    #[DataProvider('accessCatalogues')]
    public function test_an_access_catalogue_records_who_added_it_and_lists_the_names(string $class, array $create, string $index): void
    {
        $adder = User::factory()->create(['role' => 'super', 'name' => 'IT Adder']);
        $this->actingAs($adder);
        $record = $class::create($create);

        $editor = User::factory()->create(['role' => 'super', 'name' => 'IT Editor']);
        $this->actingAs($editor);
        $record->update(['name' => $create['name'].' 2']);

        $record->refresh();
        $this->assertSame($adder->id, $record->created_by);
        $this->assertSame($editor->id, $record->updated_by);
        $this->getJson($index)
            ->assertOk()
            ->assertJsonPath('data.0.created_by_name', 'IT Adder')
            ->assertJsonPath('data.0.updated_by_name', 'IT Editor');
    }

    public function test_a_template_records_who_reworded_it_but_not_the_system_sending_it(): void
    {
        $this->seed(EmailTemplateSeeder::class);
        $template = EmailTemplate::where('key', 'ticket.created')->sole();
        $this->assertNull($template->updated_by);

        $editor = User::factory()->create(['role' => 'super', 'name' => 'Mail Editor']);
        $this->actingAs($editor);
        $template->update(['subject' => 'New ticket']);
        $this->assertSame($editor->id, $template->fresh()->updated_by);

        // Sending bumps last_sent_at by a query update — bookkeeping, not an edit by whoever is signed in.
        $other = $this->super();
        $this->actingAs($other);
        EmailTemplate::where('key', 'ticket.created')->update(['last_sent_at' => now()]);
        $this->assertSame($editor->id, $template->fresh()->updated_by);

        $this->getJson('/api/email-templates')->assertOk()
            ->assertJsonFragment(['key' => 'ticket.created', 'updated_by_name' => 'Mail Editor']);
    }

    public function test_a_bell_records_who_reworded_it(): void
    {
        $editor = User::factory()->create(['role' => 'super', 'name' => 'Bell Editor']);
        $this->actingAs($editor);
        $this->putJson('/api/notification-templates/notif_asset_assigned', [
            'message_en' => 'Asset {asset} is yours', 'message_th' => 'ทรัพย์สิน {asset} เป็นของคุณ', 'enabled' => true,
        ])->assertOk();

        $this->assertSame($editor->id, NotificationTemplate::where('key', 'notif_asset_assigned')->sole()->updated_by);
        $this->getJson('/api/notification-templates')->assertOk()
            ->assertJsonFragment(['key' => 'notif_asset_assigned', 'updated_by_name' => 'Bell Editor']);
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
