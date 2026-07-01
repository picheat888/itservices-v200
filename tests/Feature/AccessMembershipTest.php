<?php

namespace Tests\Feature;

use App\Models\Access\EmailGroup;
use App\Models\Employee;
use App\Services\Access\AccessService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class AccessMembershipTest extends TestCase
{
    use RefreshDatabase;

    private function svc(): AccessService
    {
        return app(AccessService::class);
    }

    public function test_grant_then_duplicate_active_is_rejected(): void
    {
        $g = EmailGroup::create(['name' => 'QA', 'email' => 'qa@x.co']);
        $e = Employee::create(['first_name' => 'A', 'last_name' => 'B']);

        $m = $this->svc()->grant($g, $e->id, ['access_level' => 'Member']);
        $this->assertNull($m->revoked_at);

        $this->expectException(ValidationException::class);
        $this->svc()->grant($g, $e->id, ['access_level' => 'Member']);
    }

    public function test_revoke_is_soft_and_allows_regrant(): void
    {
        $g = EmailGroup::create(['name' => 'QA', 'email' => 'qa@x.co']);
        $e = Employee::create(['first_name' => 'A', 'last_name' => 'B']);

        $m = $this->svc()->grant($g, $e->id, ['access_level' => 'Member']);
        $this->svc()->revoke($m);
        $this->assertNotNull($m->fresh()->revoked_at);
        $this->assertSame(0, $g->memberships()->active()->count());

        $m2 = $this->svc()->grant($g, $e->id, ['access_level' => 'Owner']);
        $this->assertNull($m2->revoked_at);
    }
}
