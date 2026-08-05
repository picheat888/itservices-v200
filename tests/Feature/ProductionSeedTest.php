<?php

namespace Tests\Feature;

use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use App\Models\Workflow\Workflow;
use App\Support\DefaultWorkflows;
use App\Support\EmailTemplates;
use App\Support\Permissions;
use App\Support\RequestSchemas;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Guards the line between system configuration and business data.
 *
 * DatabaseSeeder is what a production install runs. It must leave behind enough
 * to sign in and use every module, and nothing an administrator would have to
 * delete — so this asserts both halves: the configuration is present, and every
 * table that holds business data is still empty.
 */
class ProductionSeedTest extends TestCase
{
    use RefreshDatabase;

    /** Tables the administrator fills in themselves; the production seed must not touch them. */
    private const BUSINESS_TABLES = [
        // org chart
        'employees', 'departments', 'positions', 'sections',
        // master data
        'brands', 'categories', 'units', 'vendors', 'warehouses', 'warranty_types', 'asset_models', 'locations',
        // module records
        'assets', 'asset_transfers', 'contracts', 'tickets', 'stock_items', 'stock_movements', 'service_requests',
        // access registries
        'softwares', 'email_groups', 'file_shares', 'social_platforms', 'access_memberships', 'group_roles',
    ];

    public function test_it_creates_exactly_one_administrator_who_must_change_their_password(): void
    {
        $this->seed(DatabaseSeeder::class);

        $this->assertSame(1, User::count(), 'a production install ships with one account');

        $super = User::firstOrFail();
        $this->assertSame('super', $super->username);
        $this->assertSame('super', $super->role?->key);
        $this->assertTrue($super->must_change_password, 'the seeded password must be replaced at first sign-in');
    }

    /** The generated password is never the literal that used to ship with the demo seed. */
    public function test_the_administrator_password_is_not_a_known_literal(): void
    {
        $this->seed(DatabaseSeeder::class);

        $this->assertFalse(
            Hash::check('password', User::firstOrFail()->password),
            'the well-known demo password must not open a production install'
        );
    }

    /** Re-seeding an installed system must not reset the administrator's own password. */
    public function test_re_seeding_leaves_an_existing_administrator_untouched(): void
    {
        $this->seed(DatabaseSeeder::class);
        $before = User::firstOrFail();
        $before->update(['password' => 'chosen-by-the-admin', 'must_change_password' => false]);
        $hash = $before->fresh()->password;

        $this->seed(DatabaseSeeder::class);

        $after = User::firstOrFail();
        $this->assertSame(1, User::count());
        $this->assertSame($hash, $after->password, 'a second seed must not reset the password');
        $this->assertFalse($after->must_change_password);
    }

    public function test_it_seeds_every_role_and_its_default_permissions(): void
    {
        $this->seed(DatabaseSeeder::class);

        $this->assertSame(['admin', 'hr', 'super', 'user'], Role::orderBy('key')->pluck('key')->all());

        // One row per (role, permission key) — including the denied ones, so revoking
        // later is a value change rather than a delete.
        $expected = count(Permissions::defaults()) * count(Permissions::all());
        $this->assertSame($expected, RolePermission::count());

        $this->assertTrue(
            Role::where('key', 'super')->value('is_system'),
            'the super role is system-owned and must not be deletable'
        );
    }

    /** A revoked permission must survive an upgrade that re-runs the seed. */
    public function test_re_seeding_preserves_a_permission_an_admin_revoked(): void
    {
        $this->seed(DatabaseSeeder::class);

        $roleId = Role::where('key', 'admin')->value('id');
        $grant = RolePermission::where('role_id', $roleId)->where('allowed', true)->firstOrFail();
        $grant->update(['allowed' => false]);

        $this->seed(DatabaseSeeder::class);

        $this->assertFalse(
            (bool) $grant->fresh()->allowed,
            'the seed must not reinstate a permission the administrator turned off'
        );
    }

    /**
     * Each of these is read from a catalogue in code, so the assertion is against
     * the catalogue rather than a number that would rot.
     */
    public function test_it_seeds_the_configuration_every_module_needs(): void
    {
        $this->seed(DatabaseSeeder::class);

        $this->assertDatabaseCount('email_templates', count(EmailTemplates::all()));
        $this->assertDatabaseCount('workflows', count(DefaultWorkflows::all()));
        $this->assertDatabaseCount('mail_settings', 1);

        // Every workflow carries its steps, or a request of that type cannot route.
        $this->assertSame(
            0,
            Workflow::doesntHave('steps')->count(),
            'a workflow with no steps would leave a submitted request with nobody to approve it'
        );

        // The managed request-form fields are required, so an empty choice list
        // would make those request types impossible to submit.
        foreach (RequestSchemas::all() as $type => $fields) {
            foreach ($fields as $field) {
                if (! ($field['managed'] ?? false)) {
                    continue;
                }
                $this->assertDatabaseHas('request_options', [
                    'request_type' => $type,
                    'field_key' => $field['key'],
                ]);
            }
        }
    }

    public function test_it_leaves_every_business_table_empty(): void
    {
        $this->seed(DatabaseSeeder::class);

        foreach (self::BUSINESS_TABLES as $table) {
            $this->assertDatabaseCount($table, 0);
        }
    }
}
