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
        // The login name and the role key are different things that used to read the
        // same. 'admin' is what somebody types at the sign-in box; 'super' is the role
        // that bypasses every permission check, and nothing about renaming the account
        // touches it.
        $this->assertSame('admin', $super->username);
        $this->assertSame('super', $super->role?->key);
        $this->assertTrue($super->must_change_password, 'the seeded password must be replaced at first sign-in');
    }

    /**
     * The starting password is a known literal on purpose, so it is pinned here: the
     * deploy runbook prints it, and a change to one without the other would send an
     * administrator hunting through the database. What keeps that acceptable is the
     * assertion below it — the account cannot do anything until the password changes.
     */
    public function test_the_administrator_starts_on_the_documented_password(): void
    {
        $this->seed(DatabaseSeeder::class);

        $super = User::firstOrFail();

        $this->assertTrue(
            Hash::check(DatabaseSeeder::SUPER_TEMP_PASSWORD, $super->password),
            'the documented starting password must actually open the account'
        );
        $this->assertTrue(
            $super->must_change_password,
            'a guessable starting password is only safe because it buys exactly one sign-in'
        );
    }

    /** The starting password stops working the moment it is replaced. */
    public function test_the_starting_password_stops_working_once_changed(): void
    {
        $this->seed(DatabaseSeeder::class);

        $super = User::firstOrFail();
        $super->update(['password' => 'ChosenByTheAdmin1!', 'must_change_password' => false]);

        $this->assertFalse(Hash::check(DatabaseSeeder::SUPER_TEMP_PASSWORD, $super->fresh()->password));
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

    /**
     * The interactive path: run without --no-interaction and the seeder asks instead of
     * inventing a password.
     *
     * Worth a test of its own because the guard is easy to get wrong in the direction that
     * hangs a test suite forever — and because a password the administrator typed and
     * confirmed is not a known starting point, so this path deliberately does NOT flag the
     * account for a forced change.
     */
    public function test_it_asks_for_the_administrator_when_somebody_is_there_to_ask(): void
    {
        $this->artisan('db:seed')
            ->expectsQuestion('Display name', 'Piches')
            ->expectsQuestion('Email address (leave blank for none)', 'admin@inaba.co.th')
            ->expectsQuestion('Password (at least 8 characters)', 'ChosenAtTheConsole1!')
            ->expectsQuestion('Confirm password', 'ChosenAtTheConsole1!')
            ->assertSuccessful();

        $super = User::firstOrFail();
        $this->assertSame('Piches', $super->name);
        $this->assertSame('admin@inaba.co.th', $super->email);
        $this->assertTrue(Hash::check('ChosenAtTheConsole1!', $super->password));
        $this->assertFalse($super->must_change_password, 'they chose it themselves — there is nothing to force');
        // And the documented fallback must not also open the account.
        $this->assertFalse(Hash::check(DatabaseSeeder::SUPER_TEMP_PASSWORD, $super->password));
    }

    /** An answer that would undo the point of asking is refused, not accepted quietly. */
    public function test_it_refuses_a_short_password_and_a_mismatched_confirmation(): void
    {
        $this->artisan('db:seed')
            ->expectsQuestion('Display name', 'super')
            ->expectsQuestion('Email address (leave blank for none)', '')
            ->expectsQuestion('Password (at least 8 characters)', 'short')
            ->expectsOutputToContain('Too short')
            ->expectsQuestion('Password (at least 8 characters)', 'LongEnoughOne1!')
            ->expectsQuestion('Confirm password', 'SomethingElse1!')
            ->expectsOutputToContain('The two did not match.')
            ->expectsQuestion('Password (at least 8 characters)', 'LongEnoughOne1!')
            ->expectsQuestion('Confirm password', 'LongEnoughOne1!')
            ->assertSuccessful();

        $this->assertTrue(Hash::check('LongEnoughOne1!', User::firstOrFail()->password));
    }

    public function test_it_leaves_every_business_table_empty(): void
    {
        $this->seed(DatabaseSeeder::class);

        foreach (self::BUSINESS_TABLES as $table) {
            $this->assertDatabaseCount($table, 0);
        }
    }
}
