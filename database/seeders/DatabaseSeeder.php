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
 *   php artisan db:seed --class=EmployeeDepartmentSeeder   # 11 departments, DEP-#### codes
 *   php artisan db:seed --class=EmployeePositionSeeder     # 14 job titles, PST-#### codes
 *   php artisan db:seed --class=EmployeeSectionSeeder      # 26 sections (needs departments first)
 *   php artisan db:seed --class=MasterDataSeeder           # brands, models, categories, vendors, warehouses
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
        $this->call(NotificationTemplateSeeder::class);     // App\Support\NotificationCatalogue
        $this->call(WorkflowSeeder::class);         // App\Support\DefaultWorkflows
        $this->call(RequestOptionSeeder::class);    // the managed choice lists in RequestSchemas
        $this->call(SlaTargetSeeder::class);        // one resolution target per request type
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

    /**
     * Sign-in name of the one account a fresh install ships with.
     *
     * Not to be confused with UserRole::SuperAdmin, whose value is also 'super': that
     * is the ROLE that bypasses every permission check, and it is stored in a different
     * column. This is only what somebody types at the sign-in box.
     */
    public const SUPER_USERNAME = 'admin';

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
     * Where the administrator's own details come from, in order of how deliberate they are.
     *
     * 1. The environment, when SEED_SUPER_* is set. Scripted installs and CI keep working
     *    exactly as before, and nothing below can interrupt them.
     * 2. A question, when there is somebody at the console to answer it. Putting a password
     *    in .env means it survives in a file on the server long after it is needed, and the
     *    step is easy to miss: a cached config makes env() return null (Laravel skips
     *    loading .env entirely when the config is cached), so the account is quietly created
     *    on the fallback below instead, with no error to notice.
     * 3. The documented starting password, when nobody is there to ask — tests, and any
     *    run passed --no-interaction.
     *
     * A password typed and confirmed at the console is not a known starting point, so that
     * one path does NOT flag the account: there is nothing for a forced change to protect
     * against. The other two do, for the reason spelled out on SUPER_TEMP_PASSWORD.
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
     * Whether there is somebody at the console to answer a question.
     *
     * Read from --no-interaction rather than the input object: the seeder is handed the
     * SeedCommand, which exposes options but not the input itself. Laravel's own
     * $this->seed() helper passes --no-interaction, so a test can never hang here.
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
