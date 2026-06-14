<?php

namespace Tests\Feature;

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
}
