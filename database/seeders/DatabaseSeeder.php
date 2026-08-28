<?php

namespace Database\Seeders;

use App\Enums\UserRole;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use App\Support\Permissions;
use Illuminate\Database\Seeder;

/**
 * The production seed: the least a fresh install needs to be usable, and nothing
 * an administrator would have to delete afterwards.
 *
 * Everything here comes from a catalogue in code — permissions, email templates,
 * request workflows, request-form choices — plus one account to sign in with.
 * That is the dividing line: system configuration is seeded, business data is
 * entered by the administrator.
 *
 * There is no demo dataset any more. The seeders that invented employees, assets,
 * tickets, contracts, stock and access records were removed once the system carried
 * real data — fake rows in the repository are only a liability at that point.
 *
 * Four seeders remain outside this one, run by hand on a fresh install because they
 * carry the ORGANISATION's own reference data rather than invented content:
 *
 *   php artisan db:seed --class=DepartmentSeeder   # 11 departments, DEP-#### codes
 *   php artisan db:seed --class=PositionSeeder     # 14 job titles, PST-#### codes
 *   php artisan db:seed --class=SectionSeeder      # 26 sections (needs departments first)
 *   php artisan db:seed --class=MasterDataSeeder   # brands, models, categories, vendors, warehouses
 *
 * They are deliberately not called from here: an install that is not this company
 * should start with an empty org chart rather than somebody else's.
 *
 * Non-destructive on a second run: it creates what is missing and leaves existing
 * rows alone, so upgrading an installed system never reverts a role that was
 * renamed, a permission that was revoked, or a template that was reworded.
 *
 * Deliberately NOT seeded: a Role Group, and the default-group setting that decides
 * which role new employees receive. Those are the administrator's own answer about
 * their organisation, and an install is free to delete every template below and write
 * its own. Until one is created and marked the default on the Permissions page,
 * EmployeeService refuses to provision login accounts rather than guessing a role.
 * The administrator account itself is exempt: it carries the super role directly, so
 * there is always a way in to set this up.
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->seedRolesAndPermissions();
        $this->seedAdministrator();

        // Each of these reads its own catalogue class and is itself idempotent.
        $this->call(MailSettingSeeder::class);      // the single editable SMTP row
        $this->call(EmailTemplateSeeder::class);    // App\Support\EmailTemplates
        $this->call(WorkflowSeeder::class);         // App\Support\DefaultWorkflows
        $this->call(RequestOptionSeeder::class);    // the managed choice lists in RequestSchemas
    }

    /**
     * The four role templates and their default grants.
     *
     * firstOrCreate on both, so a permission key introduced by a later release
     * lands on its default for every role, while anything an administrator has
     * since changed keeps their value instead of being reset to the default.
     */
    private function seedRolesAndPermissions(): void
    {
        $roles = [
            ['key' => UserRole::SuperAdmin->value, 'name' => 'Administrator Template', 'color' => '#2563eb', 'is_system' => true],
            ['key' => UserRole::ITStaff->value, 'name' => 'IT Technician Template', 'color' => '#0284c7', 'is_system' => false],
            ['key' => UserRole::HR->value, 'name' => 'HR Template', 'color' => '#059669', 'is_system' => false],
            ['key' => UserRole::Employee->value, 'name' => 'Staff Template', 'color' => '#64748b', 'is_system' => false],
        ];
        foreach ($roles as $role) {
            Role::firstOrCreate(['key' => $role['key']], $role);
        }

        // role_permissions references roles by role_id (the legacy `role` string
        // column was dropped), so resolve each key to its persisted id first.
        $roleIdByKey = Role::pluck('id', 'key');

        foreach (Permissions::defaults() as $roleKey => $granted) {
            $roleId = $roleIdByKey[$roleKey] ?? null;
            if ($roleId === null) {
                continue;
            }

            // A row per key — including the denied ones — so revoking later is a
            // value change rather than a delete.
            foreach (Permissions::all() as $key) {
                RolePermission::firstOrCreate(
                    ['role_id' => $roleId, 'permission' => $key],
                    ['allowed' => in_array($key, $granted, true)],
                );
            }
        }
    }

    /** Sign-in name of the one account a fresh install ships with. */
    public const SUPER_USERNAME = 'super';

    /**
     * The password that account is created with — deliberately the most ordinary
     * string there is, and deliberately in the repository.
     *
     * A generated password has to be copied out of the console before it scrolls away,
     * and losing it means editing the database to get back in, which is what happened on
     * the first deployment. Nothing is gained by hiding this one, because it is not what
     * protects the account: must_change_password is. A flagged account is refused on
     * every route except the four it needs to replace the password
     * (see CheckPasswordExpiry), so this buys exactly one sign-in and no access at all.
     *
     * The cost is real and worth naming: between seeding and that first sign-in the
     * account is open to anyone who can reach the site. Change it as the very next step
     * after seeding — before the address is given to anyone.
     *
     * SEED_SUPER_PASSWORD in the environment overrides it when an install would rather
     * not have a known starting point at all.
     */
    public const SUPER_TEMP_PASSWORD = 'password';

    /**
     * The one account a fresh install ships with. The super role bypasses every
     * permission check, so this is enough to sign in and enter everything else.
     *
     * An existing super account is left completely alone: re-seeding an installed
     * system must never reset the administrator's own password.
     */
    private function seedAdministrator(): void
    {
        if (User::where('username', self::SUPER_USERNAME)->exists()) {
            $this->command?->info('Administrator account already exists - left untouched.');

            return;
        }

        $password = (string) (env('SEED_SUPER_PASSWORD') ?: self::SUPER_TEMP_PASSWORD);

        User::create([
            'name' => env('SEED_SUPER_NAME') ?: self::SUPER_USERNAME,
            'email' => env('SEED_SUPER_EMAIL') ?: 'super@mail.com',
            'username' => self::SUPER_USERNAME,
            'role' => UserRole::SuperAdmin->value,
            'password' => $password,
            'must_change_password' => true,
        ]);

        $this->command?->warn('Administrator created - sign in as "'.self::SUPER_USERNAME.'" with: '.$password);
        $this->command?->warn('Change it at first sign-in; every other request is refused until you do.');
        $this->command?->warn('Then set a real address under Profile - alerts (contract expiry, stock, new employee) only reach accounts with one.');
    }
}
