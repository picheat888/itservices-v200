<?php

namespace Database\Seeders;

use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use App\Support\Permissions;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * The production seed: the least a fresh install needs to be usable, and nothing
 * an administrator would have to delete afterwards.
 *
 * Everything here comes from a catalogue in code — permissions, email templates,
 * request workflows, request-form choices — plus one account to sign in with.
 * That is the dividing line: system configuration is seeded, business data is
 * entered by the administrator. Demo content (employees, master data, assets,
 * tickets, contracts, stock, access registries) lives in DemoSeeder, which this
 * seeder never calls.
 *
 * Non-destructive on a second run: it creates what is missing and leaves existing
 * rows alone, so upgrading an installed system never reverts a role that was
 * renamed, a permission that was revoked, or a template that was reworded.
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
            ['key' => 'super', 'name' => 'Administrator Template', 'color' => '#2563eb', 'is_system' => true],
            ['key' => 'admin', 'name' => 'IT Technician Template', 'color' => '#0284c7', 'is_system' => false],
            ['key' => 'hr', 'name' => 'HR Template', 'color' => '#059669', 'is_system' => false],
            ['key' => 'user', 'name' => 'Staff Template', 'color' => '#64748b', 'is_system' => false],
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

    /**
     * The one account a fresh install ships with. The super role bypasses every
     * permission check, so this is enough to sign in and enter everything else.
     *
     * The password is taken from SEED_SUPER_PASSWORD when set and generated
     * otherwise; either way it is printed once and the account must replace it at
     * first sign-in, so no install is reachable with a password published in this
     * repository. (Reading the environment directly means a cached config falls
     * back to a generated password — which is printed, so nothing is lost.)
     *
     * An existing super account is left completely alone: re-seeding an installed
     * system must never reset the administrator's own password.
     */
    private function seedAdministrator(): void
    {
        if (User::where('username', 'super')->exists()) {
            $this->command?->info('Administrator account already exists — left untouched.');

            return;
        }

        $password = (string) (env('SEED_SUPER_PASSWORD') ?: Str::password(16));
        $email = env('SEED_SUPER_EMAIL') ?: null;

        User::create([
            'name' => env('SEED_SUPER_NAME') ?: 'Administrator',
            'email' => $email,
            'username' => 'super',
            'role' => 'super',
            'password' => $password,
            'must_change_password' => true,
        ]);

        $this->command?->warn('Administrator created — sign in as "super" with: '.$password);
        $this->command?->warn('The password must be changed at first sign-in.');

        if ($email === null) {
            $this->command?->warn('No email set on the account. Add one under Profile — alerts (contract expiry, stock, new employee) are only sent to accounts with an address.');
        }
    }
}
