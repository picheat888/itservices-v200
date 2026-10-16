<?php

namespace Tests\Feature\Perf;

use App\Models\Permission\Role;
use App\Models\User;
use App\Support\DefaultWorkflows;
use App\Support\Perf\Copy;
use Database\Seeders\DatabaseSeeder;
use Database\Seeders\EmployeeDepartmentSeeder;
use Database\Seeders\EmployeePositionSeeder;
use Database\Seeders\EmployeeSectionSeeder;
use Database\Seeders\MasterDataSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

// Feature tests for the perf Copy step (configuration and master data from the source database)
class CopyStepTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([EmployeeDepartmentSeeder::class, EmployeePositionSeeder::class, EmployeeSectionSeeder::class, MasterDataSeeder::class, DatabaseSeeder::class]);
    }

    public function test_copies_master_rows_with_their_ids_and_extends_them(): void
    {
        [$ctx, $db] = PerfImport::run([Copy::class]);

        $this->assertSame(Role::count(), $db->table('roles')->count());
        $this->assertSame(DB::table('role_permissions')->count(), $db->table('role_permissions')->count());

        $this->assertSame(25, $db->table('positions')->count());
        $original = DB::table('positions')->orderBy('id')->pluck('title', 'id')->all();
        foreach ($original as $id => $title) {
            $this->assertSame($title, $db->table('positions')->where('id', $id)->value('title'));
        }
        $rungTitles = array_merge(...array_values(DefaultWorkflows::RUNGS));
        $added = $db->table('positions')->whereNotIn('id', array_keys($original))->pluck('title')->all();
        $this->assertCount(25 - count($original), $added);
        $this->assertSame([], array_intersect($added, $rungTitles));

        $this->assertSame(15, $db->table('departments')->count());
        foreach (DB::table('departments')->pluck('name') as $name) {
            $this->assertTrue($db->table('departments')->where('name', $name)->exists());
        }

        $this->assertSame(1, $db->table('users')->count());
        $superId = DB::table('roles')->where('key', 'super')->value('id');
        $this->assertSame($superId, (int) $db->table('users')->value('role_id'));
    }

    public function test_remembers_what_later_steps_need(): void
    {
        [$ctx] = PerfImport::run([Copy::class]);
        $reg = $ctx->reg;

        $this->assertSame((int) User::where('role_id', DB::table('roles')->where('key', 'super')->value('id'))->value('id'), $reg->get('admin_user_id'));
        $this->assertCount(5, $reg->get('workflow_steps')['cctv']);
        $this->assertFalse($reg->get('workflow_auto_ticket')['other']);
        $this->assertTrue($reg->get('workflow_auto_ticket')['computer']);
        $this->assertEqualsCanonicalizing(
            ['laptop', 'desktop', 'printer', 'network', 'mobile', 'server', 'cctv', 'other'],
            array_keys($reg->get('category_by_kind')),
        );
        $this->assertArrayHasKey('Supervisor', $reg->get('position_by_title'));
        $this->assertNotEmpty($reg->get('email_template_keys'));
        $this->assertNotEmpty($reg->get('request_options'));
        $this->assertSame(26, $reg->nextId('positions'));
        $this->assertSame(16, $reg->nextId('departments'));
    }
}
