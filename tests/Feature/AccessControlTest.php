<?php

namespace Tests\Feature;

use App\Models\AccessMembership;
use App\Models\EmailGroup;
use App\Models\Employee;
use App\Models\FileShare;
use App\Models\SocialPlatform;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class AccessControlTest extends TestCase
{
    use RefreshDatabase;

    public function test_access_tables_exist_with_expected_columns(): void
    {
        $this->assertTrue(Schema::hasColumns('email_groups', ['code', 'name', 'email', 'department_id', 'owner_employee_id']));
        $this->assertTrue(Schema::hasColumns('file_shares', ['code', 'name', 'path', 'size_label', 'owner_employee_id']));
        $this->assertTrue(Schema::hasColumns('social_platforms', ['code', 'name', 'url', 'color', 'policy']));
        $this->assertTrue(Schema::hasColumns('access_memberships', ['resource_type', 'resource_id', 'employee_id', 'access_level', 'purpose', 'granted_at', 'revoked_at']));
    }

    public function test_access_permission_keys_are_registered(): void
    {
        $this->assertContains('access.view', \App\Support\Permissions::all());
        $this->assertContains('access.manage', \App\Support\Permissions::all());
        $this->assertContains('access.manage', \App\Support\Permissions::defaults()['admin']);
    }

    public function test_models_auto_code_and_relations(): void
    {
        $g = EmailGroup::create(['name' => 'QA Team', 'email' => 'qa@x.co']);
        $this->assertStringStartsWith('MG-', $g->fresh()->code);

        $fs = FileShare::create(['name' => 'Recipes', 'path' => '\\\\F\\R']);
        $this->assertStringStartsWith('FS-', $fs->fresh()->code);

        $sp = SocialPlatform::create(['name' => 'LINE']);
        $this->assertStringStartsWith('SM-', $sp->fresh()->code);

        $emp = Employee::create(['first_name' => 'A', 'last_name' => 'B']);
        $m = $g->memberships()->create(['employee_id' => $emp->id, 'access_level' => 'Member', 'granted_at' => '2026-01-01']);
        $this->assertTrue($g->memberships()->whereNull('revoked_at')->exists());
        $this->assertSame($emp->id, $m->employee->id);
        $this->assertInstanceOf(EmailGroup::class, $m->resource);
    }
}
