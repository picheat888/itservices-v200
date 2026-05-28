<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Support\Permissions;
// use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $roles = [
            ['key' => 'super', 'name' => 'Administrator Template', 'color' => '#2563eb', 'is_system' => true],
            ['key' => 'admin', 'name' => 'IT Technician Template', 'color' => '#0284c7', 'is_system' => false],
            ['key' => 'hr', 'name' => 'HR Template', 'color' => '#059669', 'is_system' => false],
            ['key' => 'user', 'name' => 'Staff Template', 'color' => '#64748b', 'is_system' => false],
        ];
        foreach ($roles as $r) {
            Role::updateOrCreate(['key' => $r['key']], $r);
        }

        $demoUsers = [
            ['name' => 'Wichai Suwannarat', 'email' => 'super@inaba.co.th', 'username' => 'super', 'role' => 'super'],
            ['name' => 'Kanya Phakdee', 'email' => 'it@inaba.co.th', 'username' => 'it', 'role' => 'admin'],
            ['name' => 'Ratana Klinprathum', 'email' => 'hr@inaba.co.th', 'username' => 'hr', 'role' => 'hr'],
            ['name' => 'Pimchanok Wongwai', 'email' => 'user@inaba.co.th', 'username' => 'user', 'role' => 'user'],
        ];

        foreach ($demoUsers as $data) {
            User::updateOrCreate(
                ['email' => $data['email']],
                ['name' => $data['name'], 'username' => $data['username'], 'role' => $data['role'], 'password' => 'password'],
            );
        }

        // Default RBAC grants (super bypasses, not stored).
        foreach (Permissions::defaults() as $role => $granted) {
            foreach (Permissions::all() as $key) {
                RolePermission::updateOrCreate(
                    ['role' => $role, 'permission' => $key],
                    ['allowed' => in_array($key, $granted, true)],
                );
            }
        }

        $this->call(OrgSeeder::class);
        $this->call(AvatarDemoSeeder::class);
        $this->call(ContractSeeder::class);
        $this->call(MasterDataSeeder::class);
        $this->call(StockSeeder::class);
    }
}
