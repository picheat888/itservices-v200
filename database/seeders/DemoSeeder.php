<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Everything a developer wants in front of them and a customer must never see: a
 * demo org tree with a login per person, the master-data lists, and sample
 * contracts, stock, assets, tickets and access records.
 *
 * Runs the production seed first, so on an empty database
 *
 *     php artisan db:seed --class=DemoSeeder
 *
 * gives a complete working dataset in one command. Nothing in DatabaseSeeder
 * depends on anything here — dropping this file would still leave a usable install.
 */
class DemoSeeder extends Seeder
{
    public function run(): void
    {
        $this->call(DatabaseSeeder::class);
        $this->seedDemoLogins();

        $this->call(OrgSeeder::class);
        $this->call(AccessSeeder::class);
        $this->call(AvatarDemoSeeder::class);
        $this->call(ContractSeeder::class);
        $this->call(MasterDataSeeder::class);
        $this->call(StockSeeder::class);
        $this->call(AssetSeeder::class);
        $this->call(TicketSeeder::class);
    }

    /**
     * One account per person in the demo tree, all sharing the password
     * `password` and none of them forced to change it.
     *
     * These are created here rather than next to the administrator because a
     * production install ships with exactly one account. Every level of the tree
     * gets one on purpose: an approval step resolves to a manager only if that
     * manager can sign in, so account-less managers would collapse every
     * multi-step workflow onto whoever was left.
     *
     * Keyed on username so `super` — created by DatabaseSeeder as a nameless
     * "Administrator" with a generated password — takes on its demo persona here.
     */
    private function seedDemoLogins(): void
    {
        $logins = [
            ['name' => 'Krit Saengthong', 'email' => 'super@abcd.co.th', 'username' => 'super', 'role' => 'super'],
            ['name' => 'Thanapon Inthawong', 'email' => 'it@abcd.co.th', 'username' => 'it', 'role' => 'admin'],
            ['name' => 'Siriporn Chaiyo', 'email' => 'hr@abcd.co.th', 'username' => 'hr', 'role' => 'hr'],
            ['name' => 'Waraporn Sri', 'email' => 'user@abcd.co.th', 'username' => 'user', 'role' => 'user'],
            ['name' => 'Wanchai Rung', 'email' => 'director@abcd.co.th', 'username' => 'director', 'role' => 'user'],
            ['name' => 'Somchai Wattana', 'email' => 'vp@abcd.co.th', 'username' => 'vp', 'role' => 'user'],
        ];

        foreach ($logins as $login) {
            User::updateOrCreate(
                ['username' => $login['username']],
                [...$login, 'password' => 'password', 'must_change_password' => false],
            );
        }
    }
}
