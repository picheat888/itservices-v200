<?php

namespace Tests\Feature;

use App\Http\Resources\Access\AccessMembershipResource;
use App\Models\Access\EmailGroup;
use App\Models\Access\FileShare;
use App\Models\Employee\Employee;
use App\Models\User;
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

    public function test_revoke_records_who_revoked_and_keeps_the_first_stamp(): void
    {
        $g = EmailGroup::create(['name' => 'QA', 'email' => 'qa@x.co']);
        $e = Employee::create(['first_name' => 'A', 'last_name' => 'B']);
        $m = $this->svc()->grant($g, $e->id, ['access_level' => 'Member']);

        $admin = User::factory()->create();
        $this->actingAs($admin);
        $this->svc()->revoke($m);
        $this->assertSame($admin->id, $m->fresh()->revoked_by);
        $this->assertSame($admin->name, $m->fresh()->revokedBy->name);

        $this->actingAs(User::factory()->create());
        $this->svc()->revoke($m->fresh());
        $this->assertSame($admin->id, $m->fresh()->revoked_by);
    }

    public function test_making_a_member_the_owner_records_who_revoked_their_membership(): void
    {
        $share = FileShare::create(['name' => 'Finance', 'path' => '//fs/finance']);
        $e = Employee::create(['first_name' => 'A', 'last_name' => 'B']);
        $m = $this->svc()->grant($share, $e->id, ['access_level' => 'Read']);

        $admin = User::factory()->create();
        $this->actingAs($admin);
        $this->svc()->setOwner($share, $e->id);

        $this->assertNotNull($m->fresh()->revoked_at);
        $this->assertSame($admin->id, $m->fresh()->revoked_by);
    }

    public function test_grant_and_revoke_keep_the_time_and_the_api_sends_it(): void
    {
        $g = EmailGroup::create(['name' => 'QA', 'email' => 'qa@x.co']);
        $e = Employee::create(['first_name' => 'A', 'last_name' => 'B']);
        $this->actingAs(User::factory()->create(['name' => 'Grant Admin']));

        $this->travelTo('2026-10-09 09:15:42');
        $m = $this->svc()->grant($g, $e->id, ['access_level' => 'Member']);
        $this->travelTo('2026-10-10 16:40:05');
        $this->svc()->revoke($m);

        $m = $m->fresh();
        $this->assertSame('2026-10-09 09:15:42', $m->granted_at->format('Y-m-d H:i:s'));
        $this->assertSame('2026-10-10 16:40:05', $m->revoked_at->format('Y-m-d H:i:s'));

        $json = (new AccessMembershipResource($m->load('grantedBy', 'revokedBy')))->resolve();
        $this->assertSame('2026-10-09 09:15', $json['granted_at']);
        $this->assertSame('2026-10-10 16:40', $json['revoked_at']);
        $this->assertSame('Grant Admin', $json['revoked_by']);
    }
}
