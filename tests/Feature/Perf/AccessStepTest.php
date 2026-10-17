<?php

namespace Tests\Feature\Perf;

use App\Support\Perf\Access;
use App\Support\Perf\Assets;
use App\Support\Perf\Copy;
use App\Support\Perf\Org;
use Database\Seeders\DatabaseSeeder;
use Database\Seeders\EmployeeDepartmentSeeder;
use Database\Seeders\EmployeePositionSeeder;
use Database\Seeders\EmployeeSectionSeeder;
use Database\Seeders\MasterDataSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Tests\TestCase;

// Feature tests for the perf Access step (software, social, mail groups, file shares and memberships)
class AccessStepTest extends TestCase
{
    use RefreshDatabase;

    public function test_memberships_never_include_the_owner_and_revoke_on_resignation(): void
    {
        $this->seed([EmployeeDepartmentSeeder::class, EmployeePositionSeeder::class, EmployeeSectionSeeder::class, MasterDataSeeder::class, DatabaseSeeder::class]);
        [, $db] = PerfImport::run([Copy::class, Org::class, Assets::class, Access::class]);

        $this->assertSame(40, $db->table('softwares')->count());
        $this->assertSame(8, $db->table('social_platforms')->count());
        $this->assertSame(60, $db->table('email_groups')->count());
        $this->assertSame(40, $db->table('file_shares')->count());
        $this->assertSame(600, $db->table('access_memberships')->count());

        $table = ['software' => 'softwares', 'social_platform' => 'social_platforms', 'email_group' => 'email_groups', 'file_share' => 'file_shares'];
        $owners = [];
        foreach ($table as $alias => $name) {
            foreach ($db->table($name)->get() as $r) {
                $owners[$alias.'|'.$r->id] = $r->owner_employee_id ?? null;
                if (in_array($alias, ['email_group', 'file_share'], true)) {
                    $this->assertNotNull($r->owner_employee_id, "{$alias} {$r->id} has no owner");
                }
            }
        }

        $resigned = $db->table('employees')->where('status', 'resigned')->pluck('last_day', 'id')->all();
        $seen = [];
        foreach ($db->table('access_memberships')->get() as $m) {
            $this->assertArrayHasKey($m->resource_type, $table);
            $this->assertNotSame($owners[$m->resource_type.'|'.$m->resource_id], $m->employee_id);
            $key = $m->resource_type.'|'.$m->resource_id.'|'.$m->employee_id;
            $this->assertArrayNotHasKey($key, $seen);
            $seen[$key] = true;
            if ($m->resource_type === 'file_share') {
                $this->assertContains($m->access_level, ['Read', 'Write']);
            } else {
                $this->assertNull($m->access_level);
            }
            if (isset($resigned[$m->employee_id])) {
                $this->assertNotNull($m->revoked_at);
                $this->assertLessThanOrEqual(date('Y-m-d H:i:s', strtotime($resigned[$m->employee_id].' +8 days')), $m->revoked_at);
            }
            if ($m->revoked_at !== null) {
                $this->assertGreaterThanOrEqual($m->granted_at, $m->revoked_at);
                $this->assertNotNull($m->revoked_by);
            }
        }

        // product_key is an encrypted column: a plain-text value makes the Software list answer 500
        foreach ($db->table('softwares')->whereNotNull('product_key')->pluck('product_key') as $key) {
            $this->assertNotSame('', Crypt::decryptString($key));
        }

        foreach ($db->table('softwares')->whereNotNull('seats')->get() as $s) {
            $active = $db->table('access_memberships')->where('resource_type', 'software')->where('resource_id', $s->id)->whereNull('revoked_at')->count();
            $this->assertLessThanOrEqual($s->seats, $active);
        }
    }
}
