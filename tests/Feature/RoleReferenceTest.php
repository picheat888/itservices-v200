<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class RoleReferenceTest extends TestCase
{
    use RefreshDatabase;

    public function test_users_table_has_role_id_column(): void
    {
        $this->assertTrue(Schema::hasColumn('users', 'role_id'));
        $this->assertTrue(Schema::hasColumn('group_roles', 'role_id'));
        $this->assertTrue(Schema::hasColumn('role_permissions', 'role_id'));
    }
}
