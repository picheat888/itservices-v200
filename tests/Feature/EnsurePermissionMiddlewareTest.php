<?php

namespace Tests\Feature;

use App\Http\Middleware\EnsurePermission;
use App\Models\RolePermission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class EnsurePermissionMiddlewareTest extends TestCase
{
    use RefreshDatabase;

    private function requestFor(User $user): Request
    {
        $request = Request::create('/api/settings/company', 'PUT');
        $request->setUserResolver(fn () => $user);

        return $request;
    }

    public function test_guest_without_user_is_rejected(): void
    {
        $request = Request::create('/api/settings/company', 'PUT');

        $this->expectException(HttpException::class);
        (new EnsurePermission)->handle($request, fn () => response('ok'), 'settings.company');
    }

    public function test_blocks_user_without_permission(): void
    {
        $user = User::factory()->create(['role' => 'user']);
        $this->assertFalse($user->hasPermission('settings.company'));
        $request = $this->requestFor($user);

        $this->expectException(HttpException::class);
        (new EnsurePermission)->handle($request, fn () => response('ok'), 'settings.company');
    }

    public function test_allows_user_with_permission(): void
    {
        $user = User::factory()->create(['role' => 'admin']);
        RolePermission::create(['role_id' => $user->role_id, 'permission' => 'settings.company', 'allowed' => true]);

        $response = (new EnsurePermission)->handle($this->requestFor($user), fn () => response('ok'), 'settings.company');

        $this->assertSame('ok', (string) $response->getContent());
    }

    public function test_super_bypasses_any_permission(): void
    {
        $response = (new EnsurePermission)->handle(
            $this->requestFor(User::factory()->create(['role' => 'super'])),
            fn () => response('ok'),
            'settings.company'
        );

        $this->assertSame('ok', (string) $response->getContent());
    }
}
