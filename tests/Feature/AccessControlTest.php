<?php

namespace Tests\Feature;

use App\Models\Access\AccessMembership;
use App\Models\Access\EmailGroup;
use App\Models\Access\FileShare;
use App\Models\Access\SocialPlatform;
use App\Models\Access\Software;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Settings\Brand;
use App\Models\User;
use App\Support\Permissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class AccessControlTest extends TestCase
{
    use RefreshDatabase;

    /** Seed each role's default permissions into role_permissions (mirrors DatabaseSeeder). */
    protected function seedDefaultPermissions(): void
    {
        foreach (Permissions::defaults() as $roleKey => $granted) {
            $roleId = Role::firstOrCreate(['key' => $roleKey], ['name' => ucfirst($roleKey)])->id;
            foreach ($granted as $permission) {
                RolePermission::updateOrCreate(
                    ['role_id' => $roleId, 'permission' => $permission],
                    ['allowed' => true],
                );
            }
        }
    }

    public function test_access_tables_exist_with_expected_columns(): void
    {
        $this->assertTrue(Schema::hasColumns('email_groups', ['code', 'name', 'email', 'department_id', 'owner_employee_id']));
        $this->assertTrue(Schema::hasColumns('file_shares', ['code', 'name', 'path', 'size', 'size_unit', 'description', 'owner_employee_id']));
        $this->assertTrue(Schema::hasColumns('social_platforms', ['code', 'name', 'url', 'color', 'policy']));
        $this->assertTrue(Schema::hasColumns('softwares', ['code', 'name', 'brand_id', 'logo_path', 'license_type', 'seats', 'product_key', 'notes']));
        $this->assertFalse(Schema::hasColumn('softwares', 'version'));
        $this->assertFalse(Schema::hasColumn('softwares', 'department_id'));
        $this->assertTrue(Schema::hasColumns('access_memberships', ['resource_type', 'resource_id', 'employee_id', 'access_level', 'purpose', 'granted_at', 'revoked_at']));
    }

    public function test_access_permission_keys_are_registered(): void
    {
        $this->assertContains('access.module', Permissions::all());
        $this->assertContains('access.overview', Permissions::all());
        foreach (['email', 'file', 'social', 'software'] as $registry) {
            foreach (['view', 'add', 'edit', 'delete'] as $action) {
                $this->assertContains("access.{$registry}_{$action}", Permissions::all());
            }
        }
        // The legacy pair is gone; admin defaults carry the full granular set.
        $this->assertNotContains('access.view', Permissions::all());
        $this->assertNotContains('access.manage', Permissions::all());
        $this->assertContains('access.module', Permissions::defaults()['admin']);
        $this->assertContains('access.email_edit', Permissions::defaults()['admin']);
        // HR keeps read-only visibility: module + overview + every registry view, no actions.
        $this->assertContains('access.module', Permissions::defaults()['hr']);
        $this->assertContains('access.email_view', Permissions::defaults()['hr']);
        $this->assertNotContains('access.email_edit', Permissions::defaults()['hr']);
    }

    public function test_normalize_access_enforces_the_hierarchy(): void
    {
        // No master → every access key drops.
        $this->assertSame([], Permissions::normalizeAccess(['access.email_view', 'access.email_edit']));
        // A management child without its registry's view key drops; the rest survive.
        $normalized = Permissions::normalizeAccess(['access.module', 'access.email_edit', 'access.file_view', 'access.file_add']);
        $this->assertNotContains('access.email_edit', $normalized);
        $this->assertContains('access.file_add', $normalized);
    }

    public function test_models_auto_code_and_relations(): void
    {
        $g = EmailGroup::create(['name' => 'QA Team', 'email' => 'qa@x.co']);
        $this->assertStringStartsWith('MG-', $g->fresh()->code);

        $fs = FileShare::create(['name' => 'Recipes', 'path' => '\\\\F\\R']);
        $this->assertStringStartsWith('FS-', $fs->fresh()->code);

        $sp = SocialPlatform::create(['name' => 'LINE']);
        $this->assertStringStartsWith('SM-', $sp->fresh()->code);

        $emp = Employee::create(['first_name' => 'A', 'last_name' => 'B']);
        $m = $g->memberships()->create(['employee_id' => $emp->id, 'access_level' => 'Member', 'granted_at' => '2026-01-01']);
        $this->assertTrue($g->memberships()->whereNull('revoked_at')->exists());
        $this->assertSame($emp->id, $m->employee->id);
        $this->assertInstanceOf(EmailGroup::class, $m->resource);
    }

    public function test_manage_permission_required_to_create_group(): void
    {
        $this->seedDefaultPermissions();

        // user role lacks access.manage
        $this->actingAs(User::factory()->create(['role' => 'user']));
        $this->postJson('/api/email-groups', ['name' => 'X', 'email' => 'x@x.co'])->assertForbidden();

        // admin role has it — but an email group requires an owner + department from creation.
        $this->actingAs(User::factory()->create(['role' => 'admin']));
        $this->postJson('/api/email-groups', ['name' => 'QA', 'email' => 'qa@x.co'])
            ->assertStatus(422)->assertJsonValidationErrors(['owner_employee_id', 'department_id']);

        // A malformed email is rejected with a field error (not silently).
        $owner = Employee::create(['first_name' => 'Ap', 'last_name' => 'Prover']);
        $dept = Department::create(['name' => 'Quality', 'tag' => 'QC']);
        $this->postJson('/api/email-groups', ['name' => 'QA', 'email' => 'not-an-email', 'owner_employee_id' => $owner->id, 'department_id' => $dept->id])
            ->assertStatus(422)->assertJsonValidationErrors('email');

        $this->postJson('/api/email-groups', ['name' => 'QA', 'email' => 'qa@x.co', 'owner_employee_id' => $owner->id, 'department_id' => $dept->id])
            ->assertStatus(201)
            ->assertJsonPath('data.code', fn ($c) => str_starts_with($c, 'MG-'))
            ->assertJsonPath('data.owner_employee_id', $owner->id)
            ->assertJsonPath('data.department_id', $dept->id);
    }

    public function test_grant_and_soft_revoke_member(): void
    {
        $this->seedDefaultPermissions();
        $this->actingAs(User::factory()->create(['role' => 'admin']));
        $g = EmailGroup::create(['name' => 'QA', 'email' => 'qa@x.co']);
        $e = Employee::create(['first_name' => 'A', 'last_name' => 'B']);

        $m = $this->postJson("/api/email-groups/{$g->id}/members", ['employee_id' => $e->id, 'access_level' => 'Member'])
            ->assertStatus(201)->json('data.id');

        $this->postJson("/api/email-groups/{$g->id}/members/{$m}/revoke")->assertOk();
        $this->assertNotNull(AccessMembership::find($m)->revoked_at);
    }

    public function test_cannot_delete_group_with_active_members(): void
    {
        $this->seedDefaultPermissions();
        $this->actingAs(User::factory()->create(['role' => 'admin']));
        $g = EmailGroup::create(['name' => 'QA', 'email' => 'qa@x.co']);
        $e = Employee::create(['first_name' => 'A', 'last_name' => 'B']);
        $g->memberships()->create(['employee_id' => $e->id, 'access_level' => 'Member', 'granted_at' => '2026-01-01']);

        $this->deleteJson("/api/email-groups/{$g->id}")->assertStatus(422)->assertJsonPath('message', 'resource_has_members');
    }

    public function test_set_owner_updates_the_group_and_is_gated(): void
    {
        $this->seedDefaultPermissions();
        $g = EmailGroup::create(['name' => 'QA', 'email' => 'qa@x.co']);
        $owner = Employee::create(['first_name' => 'Ap', 'last_name' => 'Prover']);

        // A plain user (no access.manage) cannot set the owner.
        $this->actingAs(User::factory()->create(['role' => 'user']));
        $this->putJson("/api/email-groups/{$g->id}/owner", ['owner_employee_id' => $owner->id])->assertForbidden();

        // Admin can — the group's owner_employee_id (the workflow approver) is updated.
        $this->actingAs(User::factory()->create(['role' => 'admin']));
        $this->putJson("/api/email-groups/{$g->id}/owner", ['owner_employee_id' => $owner->id])
            ->assertOk()
            ->assertJsonPath('data.owner_employee_id', $owner->id);
        $this->assertSame($owner->id, $g->fresh()->owner_employee_id);

        // Owner is required — clearing it is rejected.
        $this->putJson("/api/email-groups/{$g->id}/owner", ['owner_employee_id' => null])
            ->assertStatus(422)->assertJsonValidationErrors('owner_employee_id');
        $this->assertSame($owner->id, $g->fresh()->owner_employee_id);
    }

    public function test_file_share_owner_set_and_cleared_via_endpoint(): void
    {
        $this->seedDefaultPermissions();
        $fs = FileShare::create(['name' => 'Recipes', 'path' => '\\\\F\\R']);
        $owner = Employee::create(['first_name' => 'Own', 'last_name' => 'Er']);

        // Gated: a plain user (no access.manage) cannot set the owner.
        $this->actingAs(User::factory()->create(['role' => 'user']));
        $this->putJson("/api/file-shares/{$fs->id}/owner", ['owner_employee_id' => $owner->id])->assertForbidden();

        // Admin sets the owner.
        $this->actingAs(User::factory()->create(['role' => 'admin']));
        $this->putJson("/api/file-shares/{$fs->id}/owner", ['owner_employee_id' => $owner->id])
            ->assertOk()
            ->assertJsonPath('data.owner_employee_id', $owner->id)
            ->assertJsonPath('data.owner', 'Own Er');
        $this->assertSame($owner->id, $fs->fresh()->owner_employee_id);

        // Unlike email groups, a file share's owner is optional — null clears it.
        $this->putJson("/api/file-shares/{$fs->id}/owner", ['owner_employee_id' => null])->assertOk();
        $this->assertNull($fs->fresh()->owner_employee_id);
    }

    public function test_owned_resources_appear_in_employee_access_flagged_as_owner(): void
    {
        $this->seedDefaultPermissions();
        $this->actingAs(User::factory()->create(['role' => 'admin']));

        $emp = Employee::create(['first_name' => 'Own', 'last_name' => 'Er']);
        // Owner lives on the resource (not a membership) — the employee owns but isn't a member.
        EmailGroup::create(['name' => 'Approvers', 'email' => 'appr@x.co', 'owner_employee_id' => $emp->id]);
        FileShare::create(['name' => 'Vault', 'path' => '\\\\F\\V', 'owner_employee_id' => $emp->id]);

        $this->getJson("/api/employees/{$emp->id}/access")
            ->assertOk()
            ->assertJsonCount(1, 'data.email_groups')
            ->assertJsonPath('data.email_groups.0.resource_name', 'Approvers')
            ->assertJsonPath('data.email_groups.0.is_owner', true)
            ->assertJsonCount(1, 'data.file_shares')
            ->assertJsonPath('data.file_shares.0.resource_name', 'Vault')
            ->assertJsonPath('data.file_shares.0.is_owner', true);
    }

    public function test_the_owner_cannot_also_be_added_as_a_member(): void
    {
        $this->seedDefaultPermissions();
        $this->actingAs(User::factory()->create(['role' => 'admin']));

        $emp = Employee::create(['first_name' => 'Own', 'last_name' => 'Er']);
        $g = EmailGroup::create(['name' => 'QA', 'email' => 'qa@x.co', 'owner_employee_id' => $emp->id]);

        $this->postJson("/api/email-groups/{$g->id}/members", ['employee_id' => $emp->id])
            ->assertStatus(422)->assertJsonValidationErrors('employee_id');
    }

    public function test_promoting_a_member_to_owner_revokes_their_membership(): void
    {
        $this->seedDefaultPermissions();
        $this->actingAs(User::factory()->create(['role' => 'admin']));

        $emp = Employee::create(['first_name' => 'Mem', 'last_name' => 'Ber']);
        $g = EmailGroup::create(['name' => 'QA', 'email' => 'qa@x.co']);
        $g->memberships()->create(['employee_id' => $emp->id, 'granted_at' => '2026-01-01']);
        $this->assertTrue($g->memberships()->active()->where('employee_id', $emp->id)->exists());

        $this->putJson("/api/email-groups/{$g->id}/owner", ['owner_employee_id' => $emp->id])->assertOk();

        $this->assertSame($emp->id, $g->fresh()->owner_employee_id);
        // Owner and member are mutually exclusive — the membership is dropped.
        $this->assertFalse($g->memberships()->active()->where('employee_id', $emp->id)->exists());
    }

    public function test_replacing_the_owner_demotes_the_previous_owner_to_member(): void
    {
        $this->seedDefaultPermissions();
        $this->actingAs(User::factory()->create(['role' => 'admin']));

        $a = Employee::create(['first_name' => 'A', 'last_name' => 'Owner']);
        $b = Employee::create(['first_name' => 'B', 'last_name' => 'Owner']);
        $g = EmailGroup::create(['name' => 'QA', 'email' => 'qa@x.co', 'owner_employee_id' => $a->id]);

        $this->putJson("/api/email-groups/{$g->id}/owner", ['owner_employee_id' => $b->id])->assertOk();

        $this->assertSame($b->id, $g->fresh()->owner_employee_id);
        // Previous owner A keeps access as a member; new owner B is not also a member.
        $this->assertTrue($g->memberships()->active()->where('employee_id', $a->id)->exists());
        $this->assertFalse($g->memberships()->active()->where('employee_id', $b->id)->exists());
    }

    public function test_access_directory_actions_are_audit_logged(): void
    {
        $this->seedDefaultPermissions();
        $this->actingAs(User::factory()->create(['role' => 'admin']));
        $dept = Department::create(['name' => 'IT', 'tag' => 'IT']);
        $owner = Employee::create(['first_name' => 'Ow', 'last_name' => 'Ner']);
        $emp = Employee::create(['first_name' => 'Mem', 'last_name' => 'Ber']);

        $id = $this->postJson('/api/email-groups', ['name' => 'QA', 'email' => 'qa@x.co', 'department_id' => $dept->id, 'owner_employee_id' => $owner->id])
            ->assertStatus(201)->json('data.id');
        $this->assertDatabaseHas('audit_logs', ['action' => 'Created email group', 'target' => 'QA']);

        $this->postJson("/api/email-groups/{$id}/members", ['employee_id' => $emp->id])->assertStatus(201);
        $this->assertDatabaseHas('audit_logs', ['action' => 'Added member to email group', 'target' => 'QA']);

        $id2 = $this->postJson('/api/email-groups', ['name' => 'Ops', 'email' => 'ops@x.co', 'department_id' => $dept->id, 'owner_employee_id' => $owner->id])
            ->assertStatus(201)->json('data.id');
        $this->deleteJson("/api/email-groups/{$id2}")->assertOk();
        $this->assertDatabaseHas('audit_logs', ['action' => 'Deleted email group', 'target' => 'Ops']);
    }

    public function test_updating_a_file_share_keeps_its_owner(): void
    {
        $this->seedDefaultPermissions();
        $this->actingAs(User::factory()->create(['role' => 'admin']));
        $owner = Employee::create(['first_name' => 'Own', 'last_name' => 'Er']);
        $dept = Department::create(['name' => 'Quality', 'tag' => 'QC']);
        $fs = FileShare::create(['name' => 'Recipes', 'path' => '\\\\F\\R', 'owner_employee_id' => $owner->id, 'department_id' => $dept->id]);

        // Department is now mandatory on file shares — an update without it is rejected.
        $this->putJson("/api/file-shares/{$fs->id}", ['name' => 'Recipes v2', 'path' => '\\\\F\\R2'])
            ->assertStatus(422)->assertJsonValidationErrors('department_id');

        // The edit form no longer sends owner_employee_id — the owner must survive the update.
        $this->putJson("/api/file-shares/{$fs->id}", ['name' => 'Recipes v2', 'path' => '\\\\F\\R2', 'department_id' => $dept->id, 'size' => 10, 'size_unit' => 'GB', 'description' => 'Plant 1 recipe archive'])
            ->assertOk()
            ->assertJsonPath('data.name', 'Recipes v2')
            ->assertJsonPath('data.description', 'Plant 1 recipe archive');
        $this->assertSame($owner->id, $fs->fresh()->owner_employee_id);
    }

    public function test_index_and_members_include_photo_urls_for_avatars(): void
    {
        $this->seedDefaultPermissions();
        $this->actingAs(User::factory()->create(['role' => 'admin']));

        $owner = Employee::create(['first_name' => 'Own', 'last_name' => 'Er', 'photo_path' => 'employee-photos/own.jpg']);
        $member = Employee::create(['first_name' => 'Mem', 'last_name' => 'Ber', 'photo_path' => 'employee-photos/mem.jpg']);
        $bare = Employee::create(['first_name' => 'No', 'last_name' => 'Photo']);

        $g = EmailGroup::create(['name' => 'QA', 'email' => 'qa@x.co', 'owner_employee_id' => $owner->id]);
        $g->memberships()->create(['employee_id' => $member->id, 'granted_at' => '2026-01-01']);
        $g->memberships()->create(['employee_id' => $bare->id, 'granted_at' => '2026-01-01']);

        // Photos are now served through the authenticated per-employee route, so the
        // URL points at /files/employees/{id}/photo rather than the raw storage path.
        // Index: owner + inline member previews carry photo URLs (null when no photo uploaded).
        $this->getJson('/api/email-groups')
            ->assertOk()
            ->assertJsonPath('data.0.owner_photo_url', fn ($u) => is_string($u) && str_contains($u, "/files/employees/{$owner->id}/photo"))
            ->assertJsonPath('data.0.members.0.photo_url', fn ($u) => is_string($u) && str_contains($u, "/files/employees/{$member->id}/photo"))
            ->assertJsonPath('data.0.members.1.photo_url', null);

        // Members endpoint: each membership row carries the employee's photo URL too.
        $this->getJson("/api/email-groups/{$g->id}/members")
            ->assertOk()
            ->assertJsonPath('data.0.photo_url', fn ($u) => is_string($u) && str_contains($u, "/files/employees/{$member->id}/photo"))
            ->assertJsonPath('data.1.photo_url', null);
    }

    public function test_email_group_member_added_without_a_level(): void
    {
        $this->seedDefaultPermissions();
        $this->actingAs(User::factory()->create(['role' => 'admin']));
        $g = EmailGroup::create(['name' => 'QA', 'email' => 'qa@x.co']);
        $e = Employee::create(['first_name' => 'No', 'last_name' => 'Level']);

        // Owner moved to the group field, so email-group members carry no access_level.
        $id = $this->postJson("/api/email-groups/{$g->id}/members", ['employee_id' => $e->id, 'purpose' => 'daily digest'])
            ->assertStatus(201)->json('data.id');

        $this->assertNull(AccessMembership::find($id)->access_level);
    }

    public function test_software_stores_encrypted_key_and_exposes_it_to_managers(): void
    {
        $this->seedDefaultPermissions();
        $this->actingAs(User::factory()->create(['role' => 'admin']));

        $brand = Brand::create(['name' => 'Adobe']);
        $id = $this->postJson('/api/software', [
            'name' => 'Acrobat', 'brand_id' => $brand->id, 'license_type' => 'subscription', 'seats' => 10, 'product_key' => 'ABCDE-12345',
        ])->assertStatus(201)
            ->assertJsonPath('data.has_product_key', true)
            ->assertJsonPath('data.product_key', 'ABCDE-12345')
            ->json('data.id');

        // Encrypted at rest: the stored column is not the plaintext, but the model decrypts it.
        $raw = DB::table('softwares')->where('id', $id)->value('product_key');
        $this->assertNotSame('ABCDE-12345', $raw);
        $this->assertSame('ABCDE-12345', Software::find($id)->product_key);

        // Turning the key switch off sends an empty value, which clears it.
        $this->putJson("/api/software/{$id}", ['name' => 'Acrobat', 'license_type' => 'subscription', 'product_key' => ''])
            ->assertOk()
            ->assertJsonPath('data.has_product_key', false);
        $this->assertNull(Software::find($id)->product_key);
    }

    public function test_software_key_is_hidden_from_viewers_without_manage(): void
    {
        $this->seedDefaultPermissions();
        Software::create(['name' => 'Acrobat', 'license_type' => 'subscription', 'product_key' => 'SECRET-KEY']);

        // hr can view the access directory but not manage → sees only that a key exists, not its value.
        $this->actingAs(User::factory()->create(['role' => 'hr']));
        $this->getJson('/api/software')
            ->assertOk()
            ->assertJsonPath('data.0.has_product_key', true)
            ->assertJsonPath('data.0.product_key', null);
    }

    public function test_access_dashboard_summarizes_channels_and_governance(): void
    {
        $this->seedDefaultPermissions();

        // A plain user without access.view cannot read the overview.
        $this->actingAs(User::factory()->create(['role' => 'user']));
        $this->getJson('/api/access/dashboard')->assertForbidden();

        $this->actingAs(User::factory()->create(['role' => 'admin']));

        $owner = Employee::create(['first_name' => 'Ow', 'last_name' => 'Ner']);
        $active = Employee::create(['first_name' => 'Ac', 'last_name' => 'Tive']);
        $resigned = Employee::create(['first_name' => 'Re', 'last_name' => 'Signed', 'status' => 'resigned']);

        // Email group with one active member.
        $g = EmailGroup::create(['name' => 'QA', 'email' => 'qa@x.co', 'owner_employee_id' => $owner->id]);
        $g->memberships()->create(['employee_id' => $active->id, 'granted_at' => now()]);

        // Two file shares (both owned → owners_complete stays true): one empty, one with a resigned holder.
        FileShare::create(['name' => 'Public (Center)', 'path' => '\\\\F\\P', 'owner_employee_id' => $owner->id]);
        $recipes = FileShare::create(['name' => 'Recipes', 'path' => '\\\\F\\R', 'owner_employee_id' => $owner->id]);
        $recipes->memberships()->create(['employee_id' => $resigned->id, 'granted_at' => now()]);

        $res = $this->getJson('/api/access/dashboard')->assertOk();

        $res->assertJsonPath('data.channels.email_groups.resources', 1)
            ->assertJsonPath('data.channels.email_groups.grants', 1)
            ->assertJsonPath('data.channels.file_shares.resources', 2)
            ->assertJsonPath('data.channels.file_shares.grants', 1)
            ->assertJsonPath('data.total_grants', 2)
            ->assertJsonPath('data.governance.empty_resources', 1)
            ->assertJsonPath('data.governance.empty_sample', 'Public (Center)')
            ->assertJsonPath('data.governance.owners_complete', true)
            ->assertJsonPath('data.governance.resigned_holders', 1)
            // Drill-down lists: the empty resource and the resigned grant, each with its kind + id.
            ->assertJsonPath('data.governance.issues.empty.0.kind', 'file-shares')
            ->assertJsonPath('data.governance.issues.empty.0.name', 'Public (Center)')
            ->assertJsonPath('data.governance.issues.resigned.0.name', 'Recipes')
            ->assertJsonPath('data.governance.issues.resigned.0.employee', 'Re Signed');

        // Most-reached list ranks by active grants; the empty share sits at the bottom with 0.
        $top = collect($res->json('data.top_resources'));
        $this->assertSame(1, $top->firstWhere('name', 'Recipes')['grants']);
        $this->assertSame('file-shares', $top->firstWhere('name', 'Recipes')['kind']);
        $this->assertSame(0, $top->firstWhere('name', 'Public (Center)')['grants']);
    }

    public function test_social_platform_logo_upload_is_stored(): void
    {
        Storage::fake('local');
        $this->seedDefaultPermissions();
        $this->actingAs(User::factory()->create(['role' => 'admin']));

        $this->post('/api/social-platforms', [
            'name' => 'LINE', 'logo' => UploadedFile::fake()->image('line.png', 128, 128),
        ], ['Accept' => 'application/json'])
            ->assertStatus(201)
            ->assertJsonPath('data.logo_url', fn ($u) => is_string($u) && $u !== '');

        $path = SocialPlatform::firstWhere('name', 'LINE')->logo_path;
        $this->assertNotNull($path);
        Storage::disk('local')->assertExists($path);
    }

    public function test_software_logo_upload_is_stored(): void
    {
        Storage::fake('local');
        $this->seedDefaultPermissions();
        $this->actingAs(User::factory()->create(['role' => 'admin']));

        $this->post('/api/software', [
            'name' => 'Acrobat', 'license_type' => 'perpetual', 'logo' => UploadedFile::fake()->image('logo.png', 128, 128),
        ], ['Accept' => 'application/json'])
            ->assertStatus(201)
            ->assertJsonPath('data.logo_url', fn ($u) => is_string($u) && $u !== '');

        $path = Software::firstWhere('name', 'Acrobat')->logo_path;
        $this->assertNotNull($path);
        Storage::disk('local')->assertExists($path);
    }

    /** Deleting a software / platform record takes its logo off the disk with it. */
    public function test_deleting_a_resource_removes_its_logo(): void
    {
        Storage::fake('local');
        $this->seedDefaultPermissions();
        $this->actingAs(User::factory()->create(['role' => 'admin']));

        Storage::disk('local')->put('social-logos/sm.png', 'bytes');
        Storage::disk('local')->put('software-logos/sw.png', 'bytes');
        $platform = SocialPlatform::create(['name' => 'LINE', 'logo_path' => 'social-logos/sm.png']);
        $software = Software::create(['name' => 'Acrobat', 'license_type' => 'perpetual', 'logo_path' => 'software-logos/sw.png']);

        $this->deleteJson("/api/social-platforms/{$platform->id}")->assertOk();
        $this->deleteJson("/api/software/{$software->id}")->assertOk();

        Storage::disk('local')->assertMissing('social-logos/sm.png');
        Storage::disk('local')->assertMissing('software-logos/sw.png');
    }

    /**
     * Both logo routes are one fixed URL per record and their responses are cached,
     * so a replaced logo has to come back under a different URL or the browser keeps
     * showing the previous one.
     */
    public function test_logo_url_changes_when_a_logo_is_replaced(): void
    {
        Storage::fake('local');
        $this->seedDefaultPermissions();
        $this->actingAs(User::factory()->create(['role' => 'admin']));

        $platform = SocialPlatform::create(['name' => 'LINE', 'logo_path' => 'social-logos/old.png']);
        $software = Software::create(['name' => 'Acrobat', 'license_type' => 'perpetual', 'logo_path' => 'software-logos/old.png']);
        $platformBefore = $platform->logo_url;
        $softwareBefore = $software->logo_url;

        $platformAfter = $this->post("/api/social-platforms/{$platform->id}", [
            '_method' => 'PUT', 'name' => 'LINE', 'logo' => UploadedFile::fake()->image('new.png', 128, 128),
        ], ['Accept' => 'application/json'])->assertOk()->json('data.logo_url');

        $softwareAfter = $this->post("/api/software/{$software->id}", [
            '_method' => 'PUT', 'name' => 'Acrobat', 'license_type' => 'perpetual',
            'logo' => UploadedFile::fake()->image('new.png', 128, 128),
        ], ['Accept' => 'application/json'])->assertOk()->json('data.logo_url');

        $this->assertNotSame($platformBefore, $platformAfter, 'a replaced platform logo must not reuse the previous URL');
        $this->assertNotSame($softwareBefore, $softwareAfter, 'a replaced software logo must not reuse the previous URL');
        // Nothing changed about the logo → the URL stays put, so it keeps its cache.
        $this->assertSame($platformAfter, $platform->fresh()->logo_url);
        $this->assertSame($softwareAfter, $software->fresh()->logo_url);
    }
}
