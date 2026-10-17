<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// Grants each role the reports.* switches matching the Workspace rights that opened reports before.
return new class extends Migration
{
    /** Domain => the old `requires` lists of its reports; any one met opens the domain. */
    private const LEGACY = [
        'tickets' => [['tickets.view_all', 'tickets.resolve']],
        'assets' => [['assets.view']],
        'contracts' => [['contracts.view']],
        'stock' => [['stock.view'], ['stock.view_events']],
        'requests' => [['requests.view_all']],
        'employees' => [['employees.view']],
        'access' => [['access.overview'], ['access.email_view', 'access.file_view', 'access.social_view'], ['access.software_view']],
    ];

    /**
     * @param  list<string>  $held
     * @return list<string>
     */
    public function grantsFor(array $held): array
    {
        $domains = [];
        foreach (self::LEGACY as $domain => $gates) {
            foreach ($gates as $gate) {
                if (array_diff($gate, $held) === []) {
                    $domains[] = "reports.{$domain}";
                    break;
                }
            }
        }

        return $domains === [] ? [] : ['reports.module', ...$domains, 'reports.export', 'reports.schedule'];
    }

    public function up(): void
    {
        $now = now();
        $held = DB::table('role_permissions')->where('allowed', true)->get(['role_id', 'permission'])->groupBy('role_id');

        foreach ($held as $roleId => $rows) {
            $grants = $this->grantsFor($rows->pluck('permission')->all());
            if ($grants === []) {
                continue;
            }

            // Upsert: a Role Template saved before this ran already wrote the switch as off.
            DB::table('role_permissions')->upsert(
                array_map(fn (string $key) => ['role_id' => $roleId, 'permission' => $key, 'allowed' => true, 'created_at' => $now, 'updated_at' => $now], $grants),
                ['role_id', 'permission'],
                ['allowed', 'updated_at'],
            );
        }
    }

    public function down(): void
    {
        DB::table('role_permissions')->where('permission', 'like', 'reports.%')->delete();
    }
};
