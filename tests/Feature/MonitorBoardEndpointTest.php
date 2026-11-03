<?php

namespace Tests\Feature;

use App\Models\Permission\RolePermission;
use App\Models\User;
use App\Services\Monitor\MonitorPairingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class MonitorBoardEndpointTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
    }

    private function userWith(string $role, string ...$permissions): User
    {
        $user = User::factory()->create(['role' => $role]);
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $user->role_id, 'permission' => $permission, 'allowed' => true]);
        }

        return $user;
    }

    private function pairedToken(): string
    {
        $pairing = app(MonitorPairingService::class);
        $issued = $pairing->issueCode('Test agent');
        $pairing->pair($issued['code'], $this->userWith('monitor_admin', 'settings.access', 'settings.monitor'));

        return $pairing->pollPairing($issued['pairing_id'])['device_token'];
    }

    private function lastSeen(): ?string
    {
        return app(MonitorPairingService::class)->status()['last_seen_at'];
    }

    public function test_guest_is_refused_as_unpaired(): void
    {
        $this->getJson('/api/monitor/board')
            ->assertStatus(401)
            ->assertJsonPath('message', 'monitor_unpaired');
    }

    public function test_unknown_token_is_refused(): void
    {
        $this->pairedToken();

        $this->withHeader('X-Monitor-Token', str_repeat('x', 64))->getJson('/api/monitor/board')
            ->assertStatus(401)
            ->assertJsonPath('message', 'monitor_unpaired');
    }

    public function test_paired_tv_reads_the_board_and_is_seen(): void
    {
        $token = $this->pairedToken();
        $this->assertNull($this->lastSeen());

        $this->withHeader('X-Monitor-Token', $token)->getJson('/api/monitor/board')
            ->assertOk()
            ->assertJsonStructure(['data' => ['generated_at', 'sound', 'kpis', 'rows', 'team'], 'message']);

        $this->assertNotNull($this->lastSeen());
    }

    public function test_a_signed_in_user_still_has_to_pair(): void
    {
        $this->actingAs($this->userWith('desk', 'tickets.module', 'tickets.view_all'))
            ->getJson('/api/monitor/board')
            ->assertStatus(401)
            ->assertJsonPath('message', 'monitor_unpaired');
    }

    public function test_there_is_no_signed_in_board_route(): void
    {
        $this->actingAs($this->userWith('desk', 'tickets.module', 'tickets.view_all'))
            ->getJson('/api/monitor/live')
            ->assertNotFound();
    }
}
