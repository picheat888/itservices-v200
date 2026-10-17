<?php

// The Requests list filed-date filter, and that the dashboard's request tiles count exactly the list they open.

namespace Tests\Feature;

use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Request\ServiceRequest;
use App\Models\User;
use App\Services\Dashboard\RequestsBlock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RequestListFiledFilterTest extends TestCase
{
    use RefreshDatabase;

    private User $viewer;

    private int $created = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $this->freezeTime();
        $role = Role::firstOrCreate(['key' => 'viewer'], ['name' => 'viewer', 'color' => '#64748b', 'is_system' => false]);
        foreach (['requests.module', 'requests.view_all'] as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }
        $this->viewer = User::factory()->create(['role' => 'viewer']);
    }

    private function filed(string $status, \DateTimeInterface $at): ServiceRequest
    {
        $this->created++;
        $request = ServiceRequest::create([
            'reference' => sprintf('RQ-2026-%04d', $this->created), 'type' => 'computer', 'origin' => 'direct',
            'requester_name' => 'Somchai', 'title' => 'Request', 'reason' => 'Needed for work.', 'status' => $status,
        ]);
        $request->forceFill(['created_at' => $at])->save();

        return $request;
    }

    /** @return list<string> */
    private function references(string $query): array
    {
        $response = $this->actingAs($this->viewer)->getJson('/api/service-requests?per_page=100&'.$query)->assertOk();

        return collect($response->json('data'))->pluck('reference')->sort()->values()->all();
    }

    public function test_filed_days_keeps_the_last_n_days_to_the_minute(): void
    {
        $inside = $this->filed('pending', now()->subDays(30)->addMinute());
        $this->filed('pending', now()->subDays(30)->subMinute());

        $this->assertSame([$inside->reference], $this->references('filed_days=30'));
    }

    public function test_filed_from_and_to_are_whole_days_both_ends_included(): void
    {
        $first = $this->filed('pending', now()->subDays(13)->startOfDay());
        $last = $this->filed('pending', now()->endOfDay());
        $this->filed('pending', now()->subDays(14)->endOfDay());

        $from = now()->subDays(13)->toDateString();
        $to = now()->toDateString();

        $this->assertSame([$first->reference, $last->reference], $this->references("filed_from={$from}&filed_to={$to}"));
    }

    public function test_a_bad_filed_range_is_refused(): void
    {
        $this->actingAs($this->viewer)->getJson('/api/service-requests?filed_from=2026-10-10&filed_to=2026-10-01')->assertUnprocessable();
        $this->actingAs($this->viewer)->getJson('/api/service-requests?filed_from=2026-10-10')->assertUnprocessable();
        $this->actingAs($this->viewer)->getJson('/api/service-requests?filed_days=0')->assertUnprocessable();
    }

    public function test_dashboard_thirty_day_tiles_match_the_list_they_open(): void
    {
        $this->filed('completed', now()->subDays(5));
        $this->filed('completed', now()->subDays(40));
        $this->filed('rejected', now()->subDays(2));
        $this->filed('rejected', now()->subDays(45));
        $this->filed('cancelled', now()->subDays(29));

        $block = app(RequestsBlock::class)->build();

        foreach (['completed' => 'completed_30d', 'rejected' => 'rejected_30d', 'cancelled' => 'cancelled_30d'] as $status => $key) {
            $this->assertCount($block[$key], $this->references("status={$status}&filed_days=30"), $key);
        }
        $from = now()->subDays(13)->toDateString();
        $this->assertCount($block['filed']['total'], $this->references("filed_from={$from}&filed_to=".now()->toDateString()));
    }
}
