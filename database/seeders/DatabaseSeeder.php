<?php

namespace Database\Seeders;

use App\Enums\UserRole;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use App\Support\Permissions;
use Illuminate\Database\Seeder;

/**
 * The production seed: system configuration, and one account to sign in with.
 * Business data is the administrator's to enter — there is no demo dataset.
 *
 * Non-destructive on a second run, so upgrading an installed system never reverts a
 * renamed role, a revoked permission or a reworded template.
 *
 * Four seeders are deliberately NOT called from here. They carry this company's own
 * reference data, and an install that is not this company should start empty:
 *
 *   php artisan db:seed --class=EmployeeDepartmentSeeder   # 11 departments, DEP-#### codes
 *   php artisan db:seed --class=EmployeePositionSeeder     # 14 job titles, PST-#### codes
 *   php artisan db:seed --class=EmployeeSectionSeeder      # 25 sections (needs departments first)
 *   php artisan db:seed --class=MasterDataSeeder           # brands, categories, warehouses, units, warranty types
 *
 * Nor is a Role Group, or the setting naming the default one — that is the
 * administrator's answer about their own organisation. Until they give it,
 * EmployeeService refuses to provision login accounts rather than guess a role. The
 * administrator account is exempt: it carries the super role directly, so there is
 * always a way in to set this up.
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
        $this->call(NotificationTemplateSeeder::class);     // App\Support\NotificationCatalogue
        $this->call(WorkflowSeeder::class);         // App\Support\DefaultWorkflows
        $this->call(RequestOptionSeeder::class);    // the managed choice lists in RequestSchemas
        $this->call(SlaTargetSeeder::class);        // one resolution target per request type
    }

    /**
     * The four role templates and their default grants.
     *
     * firstOrCreate throughout, so a permission key added by a later release lands on
     * its default while anything an administrator has changed since keeps their value.
     */
    private function seedRolesAndPermissions(): void
    {
        $roles = [
            ['key' => UserRole::SuperAdmin->value, 'name' => 'Administrator', 'color' => '#2563eb', 'is_system' => true],
            ['key' => UserRole::ITStaff->value, 'name' => 'IT Technician', 'color' => '#0284c7', 'is_system' => false],
            ['key' => UserRole::HR->value, 'name' => 'HR Recruit', 'color' => '#059669', 'is_system' => false],
            ['key' => UserRole::Employee->value, 'name' => 'Staff', 'color' => '#64748b', 'is_system' => false],
        ];
        foreach ($roles as $role) {
            Role::firstOrCreate(['key' => $role['key']], $role);
        }

        // role_permissions references roles by id, not by key.
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

    /** Sign-in name of the one account a fresh install ships with — not its role. */
    public const SUPER_USERNAME = 'admin';

    /**
     * A known password in the repository, on purpose.
     *
     * What protects the account is must_change_password, not secrecy: a flagged account
     * is refused everywhere except the four routes that replace the password (see
     * CheckPasswordExpiry), so this buys one sign-in and no access. A generated password
     * scrolls off the console instead, and losing it means editing the database.
     *
     * The cost is real: between seeding and that first sign-in the account is open to
     * anyone who can reach the site. Change it before giving out the address.
     * SEED_SUPER_PASSWORD overrides it for installs that want no known starting point.
     */
    public const SUPER_TEMP_PASSWORD = 'password';

    /**
     * The one account a fresh install ships with, carrying the super role directly.
     *
     * An existing one is left completely alone: re-seeding an installed system must
     * never reset the administrator's own password.
     */
    private function seedAdministrator(): void
    {
        if (User::where('username', self::SUPER_USERNAME)->exists()) {
            $this->command?->info('Administrator account already exists - left untouched.');

            return;
        }

        $details = $this->administratorDetails();

        User::create([
            'name' => $details['name'],
            'email' => $details['email'],
            'username' => self::SUPER_USERNAME,
            'role' => UserRole::SuperAdmin->value,
            'password' => $details['password'],
            'must_change_password' => $details['must_change_password'],
        ]);

        if ($details['must_change_password']) {
            $this->command?->warn('Administrator created - sign in as "'.self::SUPER_USERNAME.'" with: '.$details['password']);
            $this->command?->warn('Change it at first sign-in; every other request is refused until you do.');
        } else {
            $this->command?->info('Administrator created - sign in as "'.self::SUPER_USERNAME.'" with the password you just chose.');
        }

        if (blank($details['email'])) {
            $this->command?->warn('No address set - alerts (contract expiry, stock, new employee) only reach accounts with one. Add it under Profile.');
        }
    }

    /**
     * Where the administrator's details come from, most deliberate first: the
     * environment, then a question at the console, then the documented password.
     *
     * Only the console path leaves the account unflagged — a password typed there is
     * not a known starting point, so there is nothing for a forced change to protect
     * against.
     *
     * Beware the env path when the config is cached: Laravel then skips .env entirely
     * and env() returns null, so the account is quietly created on the fallback below
     * with nothing to notice.
     *
     * @return array{name: string, email: string, password: string, must_change_password: bool}
     */
    private function administratorDetails(): array
    {
        if (filled(env('SEED_SUPER_PASSWORD'))) {
            return [
                'name' => (string) (env('SEED_SUPER_NAME') ?: self::SUPER_USERNAME),
                'email' => (string) (env('SEED_SUPER_EMAIL') ?: 'admin@mail.com'),
                'password' => (string) env('SEED_SUPER_PASSWORD'),
                'must_change_password' => true,
            ];
        }

        if ($this->canAsk()) {
            return $this->askForAdministrator();
        }

        return [
            'name' => (string) (env('SEED_SUPER_NAME') ?: self::SUPER_USERNAME),
            'email' => (string) (env('SEED_SUPER_EMAIL') ?: 'admin@mail.com'),
            'password' => self::SUPER_TEMP_PASSWORD,
            'must_change_password' => true,
        ];
    }

    /**
     * Whether there is somebody at the console to answer a question. Read off
     * --no-interaction because a seeder is handed the command, not its input — and
     * because $this->seed() passes that flag, so a test can never hang here.
     */
    private function canAsk(): bool
    {
        return $this->command !== null && ! $this->command->option('no-interaction');
    }

    /**
     * Asks for the administrator's details, refusing the answers that would undo the point
     * of asking.
     *
     * @return array{name: string, email: string, password: string, must_change_password: bool}
     */
    private function askForAdministrator(): array
    {
        $command = $this->command;

        $command->line('');
        $command->info('Setting up the administrator account ("'.self::SUPER_USERNAME.'").');

        $name = trim((string) $command->ask('Display name', self::SUPER_USERNAME)) ?: self::SUPER_USERNAME;

        $email = '';
        while (true) {
            $email = trim((string) $command->ask('Email address (leave blank for none)', ''));
            if ($email === '' || filter_var($email, FILTER_VALIDATE_EMAIL)) {
                break;
            }
            $command->error('That is not an email address.');
        }

        $password = '';
        while (true) {
            $password = (string) $command->secret('Password (at least 8 characters)');

            if (mb_strlen($password) < 8) {
                $command->error('Too short - at least 8 characters.');

                continue;
            }

            if ($password === self::SUPER_TEMP_PASSWORD) {
                $command->error('That is the documented fallback password. Choose another.');

                continue;
            }

            if ($password !== (string) $command->secret('Confirm password')) {
                $command->error('The two did not match.');

                continue;
            }

            break;
        }

        return [
            'name' => $name,
            'email' => $email,
            'password' => $password,
            'must_change_password' => false,
        ];
    }
}
