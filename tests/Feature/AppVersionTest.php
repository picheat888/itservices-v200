<?php

// Release and build time: Settings → System "About this system", the login page brand block and every log line.

namespace Tests\Feature;

use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use App\Support\AppVersion;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AppVersionTest extends TestCase
{
    use RefreshDatabase;

    private ?string $buildInfo = null;

    protected function tearDown(): void
    {
        if ($this->buildInfo !== null && is_file($this->buildInfo)) {
            unlink($this->buildInfo);
        }
        AppVersion::flush();
        parent::tearDown();
    }

    private function useBuildInfo(?string $json): void
    {
        $this->buildInfo = tempnam(sys_get_temp_dir(), 'build-info');
        if ($json === null) {
            unlink($this->buildInfo);
        } else {
            file_put_contents($this->buildInfo, $json);
        }
        config(['app.build_info_path' => $this->buildInfo]);
        AppVersion::flush();
    }

    private function systemAdmin(): User
    {
        $role = Role::firstOrCreate(['key' => 'system_admin_test'], ['name' => 'System admin', 'color' => '#64748b', 'is_system' => false]);
        RolePermission::firstOrCreate(['role_id' => $role->id, 'permission' => 'settings.system'], ['allowed' => true]);

        return User::factory()->create(['role' => 'system_admin_test']);
    }

    public function test_the_about_card_lists_the_release_build_and_runtime_versions(): void
    {
        $this->useBuildInfo('{"built_at":"2026-11-02 14:05"}');

        $this->actingAs($this->systemAdmin())->getJson('/api/settings/system-info')
            ->assertOk()
            ->assertJsonPath('message', 'success')
            ->assertJsonPath('data.version', config('app.version'))
            ->assertJsonPath('data.built_at', '2026-11-02 14:05')
            ->assertJsonPath('data.php', PHP_VERSION)
            ->assertJsonPath('data.laravel', app()->version())
            ->assertJsonPath('data.database', DB::connection()->getDriverTitle().' '.DB::connection()->getServerVersion());
    }

    public function test_the_build_time_is_null_before_the_first_build_or_when_the_file_is_not_ours(): void
    {
        $admin = $this->systemAdmin();

        $this->useBuildInfo(null);
        $this->actingAs($admin)->getJson('/api/settings/system-info')->assertOk()->assertJsonPath('data.built_at', null);

        $this->useBuildInfo('{"built_at":"<script>alert(1)</script>"}');
        $this->actingAs($admin)->getJson('/api/settings/system-info')->assertOk()->assertJsonPath('data.built_at', null);

        $this->useBuildInfo('not json');
        $this->actingAs($admin)->getJson('/api/settings/system-info')->assertOk()->assertJsonPath('data.built_at', null);
    }

    public function test_the_about_card_needs_the_system_settings_permission(): void
    {
        $this->getJson('/api/settings/system-info')->assertUnauthorized();

        $this->actingAs(User::factory()->create())->getJson('/api/settings/system-info')->assertForbidden();
    }

    public function test_the_login_page_carries_the_release_number_in_the_brand_block(): void
    {
        $this->get('/login')->assertOk()->assertSee('"version":"'.config('app.version').'"', false);
    }

    public function test_a_browser_error_names_its_build_and_the_server_release(): void
    {
        $this->postJson('/api/client-errors', ['kind' => 'error', 'message' => 'Boom', 'build' => '2026-11-02 14:05'])->assertStatus(202);

        $log = (string) file_get_contents("{$this->logRoot}/frontend/frontend-".now()->toDateString().'.log');
        $this->assertStringContainsString('"client_build":"2026-11-02 14:05"', $log);
        $this->assertStringContainsString('"version":"'.config('app.version').'"', $log);
        $this->assertStringContainsString('"build":', $log);
    }

    public function test_a_browser_build_longer_than_a_timestamp_is_refused(): void
    {
        $this->postJson('/api/client-errors', ['kind' => 'error', 'message' => 'Boom', 'build' => str_repeat('9', 33)])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('build');
    }
}
