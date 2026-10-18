<?php

namespace Tests\Feature;

use App\Models\Access\EmailGroup;
use App\Models\Asset\Asset;
use App\Models\AuditLog;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Permission\Role;
use App\Models\Settings\Unit;
use App\Models\Settings\Vendor;
use App\Models\Settings\WriteoffReason;
use App\Models\Stock\StockItem;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class AuditDetailTest extends TestCase
{
    use RefreshDatabase;

    public function test_changes_helper_builds_field_diff_and_hides_noise(): void
    {
        $role = Role::create(['key' => 'editor', 'name' => 'Editor', 'color' => '#111111', 'is_system' => false]);

        $before = $role->getOriginal();
        $role->update(['name' => 'Senior Editor', 'color' => '#222222']);

        $details = AuditLog::changes($before, $role);

        $this->assertNotNull($details);
        $this->assertSame('Editor', $details['changes']['name']['from']);
        $this->assertSame('Senior Editor', $details['changes']['name']['to']);
        $this->assertSame('#111111', $details['changes']['color']['from']);
        $this->assertArrayNotHasKey('updated_at', $details['changes']); // noise hidden
    }

    public function test_changes_helper_returns_null_when_nothing_changed(): void
    {
        $role = Role::create(['key' => 'viewer', 'name' => 'Viewer', 'color' => '#333333', 'is_system' => false]);

        $before = $role->getOriginal();
        $role->update(['name' => 'Viewer']); // same value โ’ no real change

        $this->assertNull(AuditLog::changes($before, $role));
    }

    public function test_audit_index_filters_by_search_category_and_returns_users(): void
    {
        $super = User::factory()->create(['role' => 'super', 'name' => 'Boss']);
        $this->actingAs($super);
        AuditLog::create(['user_name' => 'Boss', 'action' => 'Created brand', 'target' => 'Acme']);
        AuditLog::create(['user_name' => 'Boss', 'action' => 'Updated brand', 'target' => 'Acme']);
        AuditLog::create(['user_name' => 'Boss', 'action' => 'Deleted vendor', 'target' => 'Other']);

        // Category filter: only "created" verbs.
        $this->getJson('/api/audit-logs?category=created')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.action', 'Created brand');

        // Free-text search on target.
        $this->getJson('/api/audit-logs?search=Other')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.action', 'Deleted vendor');

        // Distinct actors exposed for the filter dropdown.
        $this->getJson('/api/audit-logs')
            ->assertOk()
            ->assertJsonPath('meta.users.0', 'Boss');
    }

    public function test_audit_actor_list_is_distinct_sorted_and_user_name_is_indexed(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        foreach (['Zed', 'Amy', 'Zed', 'Amy'] as $name) {
            AuditLog::create(['user_name' => $name, 'action' => 'Created brand']);
        }

        $this->getJson('/api/audit-logs')
            ->assertOk()
            ->assertJsonPath('meta.users', ['Amy', 'Zed']);

        $this->assertContains('audit_user_name_idx', array_column(Schema::getIndexes('audit_logs'), 'name'));
    }

    public function test_changes_helper_resolves_foreign_keys_to_labels(): void
    {
        $director = Position::create(['title' => 'Director']);
        $manager = Position::create(['title' => 'Manager']);
        $sales = Department::create(['name' => 'Sales', 'tag' => 'SALE']);
        $boss = Employee::create(['first_name' => 'Big', 'last_name' => 'Boss']);
        $emp = Employee::create(['first_name' => 'Worker', 'last_name' => 'Test', 'position_id' => $director->id]);

        $before = $emp->getOriginal();
        $emp->update(['position_id' => $manager->id, 'department_id' => $sales->id, 'manager_id' => $boss->id]);

        $details = AuditLog::changes($before, $emp);

        // Foreign-key ids are resolved to entity labels, not raw numbers.
        $this->assertSame('Director', $details['changes']['position_id']['from']);
        $this->assertSame('Manager', $details['changes']['position_id']['to']);
        $this->assertSame('Sales', $details['changes']['department_id']['to']);
        $this->assertSame('Big Boss', $details['changes']['manager_id']['to']);
        // A null foreign key stays null (shown as a dash in the UI).
        $this->assertNull($details['changes']['manager_id']['from']);
        $this->assertNull($details['changes']['department_id']['from']);
    }

    public function test_changes_helper_resolves_master_data_and_actor_keys(): void
    {
        $lost = WriteoffReason::create(['name' => 'Lost']);
        $broken = WriteoffReason::create(['name' => 'Broken']);
        $item = StockItem::create(['sku' => 'SKU-AUD-1', 'name' => 'Toner', 'current_stock' => 0, 'min_stock' => 0, 'max_stock' => 5]);
        $before = $item->getOriginal();
        $item->update(['unit_id' => Unit::create(['name' => 'Box'])->id]);

        $this->assertSame('Box', AuditLog::changes($before, $item)['changes']['unit_id']['to']);

        $asset = new Asset(['writeoff_reason_id' => $lost->id]);
        $asset->syncOriginal();
        $asset->writeoff_reason_id = $broken->id;
        $asset->syncChanges();

        $details = AuditLog::changes(['writeoff_reason_id' => $lost->id], $asset);
        $this->assertSame('Lost', $details['changes']['writeoff_reason_id']['from']);
        $this->assertSame('Broken', $details['changes']['writeoff_reason_id']['to']);
    }

    public function test_employee_update_endpoint_records_resolved_org_labels(): void
    {
        $super = User::factory()->create(['role' => 'super']);
        // Special positions skip the org requirements so this audit-focused test needn't set them.
        $director = Position::create(['title' => 'Director', 'allow_special_position' => true]);
        $manager = Position::create(['title' => 'Manager', 'allow_special_position' => true]);
        $emp = Employee::create(['first_name' => 'Worker', 'last_name' => 'Test', 'position_id' => $director->id]);

        $this->actingAs($super)
            ->putJson("/api/employees/{$emp->id}", ['first_name' => 'Worker', 'last_name' => 'Test', 'position_id' => $manager->id])
            ->assertOk();

        $log = AuditLog::where('action', 'Updated employee')->latest('id')->first();
        $this->assertNotNull($log);
        $this->assertSame('Director', $log->details['changes']['position_id']['from']);
        $this->assertSame('Manager', $log->details['changes']['position_id']['to']);
    }

    public function test_audit_index_returns_the_subject_type(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        AuditLog::create(['user_name' => 'Boss', 'action' => 'Updated asset', 'subject_type' => Asset::class, 'subject_id' => 7]);
        AuditLog::create(['user_name' => 'Boss', 'action' => 'Signed in']);

        $this->getJson('/api/audit-logs')
            ->assertOk()
            ->assertJsonPath('data.0.subject_type', null)
            ->assertJsonPath('data.1.subject_type', Asset::class);
    }

    public function test_changes_helper_resolves_owner_and_vendor_ids(): void
    {
        $holder = Employee::create(['first_name' => 'Hana', 'last_name' => 'Holder']);
        $owner = Employee::create(['first_name' => 'Olly', 'last_name' => 'Owner']);
        $vendor = Vendor::create(['name' => 'Acme Supply']);

        $asset = new Asset(['owner_employee_id' => null, 'vendor_id' => null]);
        $asset->syncOriginal();
        $asset->forceFill(['owner_employee_id' => $holder->id, 'vendor_id' => $vendor->id])->syncChanges();
        $details = AuditLog::changes(['owner_employee_id' => null, 'vendor_id' => null], $asset);
        $this->assertSame('Hana Holder', $details['changes']['owner_employee_id']['to']);
        $this->assertSame('Acme Supply', $details['changes']['vendor_id']['to']);

        $group = EmailGroup::create(['name' => 'QA', 'email' => 'qa@x.co', 'owner_employee_id' => $holder->id]);
        $before = $group->getOriginal();
        $group->update(['owner_employee_id' => $owner->id]);
        $changes = AuditLog::changes($before, $group)['changes'];
        $this->assertSame('Hana Holder', $changes['owner_employee_id']['from']);
        $this->assertSame('Olly Owner', $changes['owner_employee_id']['to']);

        // A deleted vendor reads as its id
        $gone = $vendor->id;
        $vendor->delete();
        $asset->forceFill(['vendor_id' => $gone])->syncChanges();
        $this->assertSame("#{$gone}", AuditLog::changes(['vendor_id' => null], $asset)['changes']['vendor_id']['to']);
    }

    public function test_a_delete_snapshot_leaves_out_encrypted_and_secret_looking_columns(): void
    {
        $record = new class extends Model
        {
            protected $table = 'secret_things';

            protected function casts(): array
            {
                return ['license_blob' => 'encrypted', 'settings' => 'encrypted:array'];
            }
        };
        $record->setRawAttributes([
            'id' => 5,
            'name' => 'Vault',
            'license_blob' => 'cipher-1',
            'settings' => 'cipher-2',
            'smtp_password_hint' => 'p',
            'client_secret' => 's',
            'refresh_token' => 't',
            'tokens_left' => 3,
        ]);

        AuditLog::recordDeleted('Deleted thing', 'Vault', $record);

        $snapshot = AuditLog::where('action', 'Deleted thing')->sole()->details['snapshot'];
        $this->assertSame(['id' => 5, 'name' => 'Vault', 'tokens_left' => 3], $snapshot);
    }

    public function test_role_update_endpoint_records_audit_details(): void
    {
        $super = User::factory()->create(['role' => 'super']);
        $role = Role::create(['key' => 'editor', 'name' => 'Editor', 'color' => '#111111', 'is_system' => false]);

        $this->actingAs($super)
            ->putJson("/api/roles/{$role->key}", ['name' => 'Lead Editor', 'color' => '#111111'])
            ->assertOk();

        $log = AuditLog::where('action', 'Updated role')->latest('id')->first();
        $this->assertNotNull($log);
        $this->assertSame('Editor', $log->details['changes']['name']['from']);
        $this->assertSame('Lead Editor', $log->details['changes']['name']['to']);
    }
}
