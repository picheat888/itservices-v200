<?php

namespace Tests\Feature;

use App\Models\Asset\Asset;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use App\Notifications\AssetRecalledNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Recalling an asset tells the person it was taken from. Before this the device simply
 * vanished from their My Assets list with no word.
 *
 * The bell separates the two recalls: a hand-over called off before it was ever accepted
 * (`cancelled`) and a device force-recalled out of someone's hands (`taken_back`).
 */
class AssetRecallNoticeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        Notification::fake();
    }

    /** Create a non-super user holding exactly the given permissions. */
    private function userWith(array $permissions, ?Employee $employee = null): User
    {
        $role = Role::create(['key' => 'rec_'.uniqid(), 'name' => 'Recall Test', 'is_system' => false]);
        foreach ($permissions as $p) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $p, 'allowed' => true]);
        }

        return User::factory()->create(['role' => $role->key, 'employee_id' => $employee?->id]);
    }

    private function holder(string $code = 'EMP-7001'): Employee
    {
        return Employee::create(['code' => $code, 'first_name' => 'Hol', 'last_name' => 'Der']);
    }

    /** @param  array<string, mixed>  $overrides */
    private function assetFor(Employee $employee, string $status, array $overrides = []): Asset
    {
        return Asset::factory()->create([
            'status' => $status,
            'owner' => $employee->code,
            'owner_employee_id' => $employee->id,
            ...$overrides,
        ]);
    }

    private function recall(Asset $asset, User $actor): TestResponse
    {
        return $this->actingAs($actor)->postJson("/api/assets/{$asset->id}/recall", [
            'warehouse' => 'IT Store', 'reason' => 'Wrong person',
        ]);
    }

    public function test_cancelling_a_hand_over_tells_the_person_it_was_meant_for(): void
    {
        $employee = $this->holder();
        $recipient = $this->userWith(['assets.my'], $employee);
        $asset = $this->assetFor($employee, 'pending_acceptance');

        $this->recall($asset, User::factory()->create(['role' => 'super']))->assertOk();

        Notification::assertSentTo($recipient, AssetRecalledNotification::class, function ($notification) use ($recipient, $asset) {
            $payload = $notification->toDatabase($recipient);

            return $payload['type'] === 'asset_recalled'
                && $payload['subtype'] === 'cancelled'
                && $payload['asset_id'] === $asset->id;
        });
    }

    public function test_force_recalling_a_held_asset_says_it_was_taken_back(): void
    {
        $employee = $this->holder();
        $recipient = $this->userWith(['assets.my'], $employee);
        $asset = $this->assetFor($employee, 'deployed');

        // Only force recall reaches an asset an employee is actually holding.
        $this->recall($asset, User::factory()->create(['role' => 'super']))->assertOk();

        Notification::assertSentTo($recipient, AssetRecalledNotification::class, function ($notification) use ($recipient) {
            return $notification->toDatabase($recipient)['subtype'] === 'taken_back';
        });
    }

    public function test_a_shared_asset_has_nobody_to_tell(): void
    {
        $employee = $this->holder();
        $this->userWith(['assets.my'], $employee);
        // Common-use kit is labelled, not held: owner_employee_id is null.
        $asset = Asset::factory()->create([
            'status' => 'common', 'owner' => 'Meeting Room 2', 'owner_employee_id' => null,
        ]);

        $this->recall($asset, User::factory()->create(['role' => 'super']))->assertOk();

        Notification::assertNothingSent();
    }

    public function test_a_holder_who_cannot_open_my_assets_is_not_belled(): void
    {
        $employee = $this->holder();
        // Same gate as the hand-over bell: the alert opens My Assets, which this reader lacks.
        $this->userWith(['tickets.view'], $employee);
        $asset = $this->assetFor($employee, 'pending_acceptance');

        $this->recall($asset, User::factory()->create(['role' => 'super']))->assertOk();

        Notification::assertNothingSent();
    }

    public function test_a_holder_with_no_login_account_does_not_break_the_recall(): void
    {
        $employee = $this->holder();
        $asset = $this->assetFor($employee, 'pending_acceptance');

        $this->recall($asset, User::factory()->create(['role' => 'super']))->assertOk();

        $this->assertSame('ready', $asset->fresh()->status->value);
        Notification::assertNothingSent();
    }

    public function test_bulk_recall_bells_every_holder_it_touches(): void
    {
        $first = $this->holder('EMP-7101');
        $second = $this->holder('EMP-7102');
        $firstUser = $this->userWith(['assets.my'], $first);
        $secondUser = $this->userWith(['assets.my'], $second);
        $assets = [
            $this->assetFor($first, 'pending_acceptance'),
            $this->assetFor($second, 'pending_acceptance'),
        ];

        $this->actingAs(User::factory()->create(['role' => 'super']))
            ->postJson('/api/assets/bulk-recall', [
                'ids' => collect($assets)->pluck('id')->all(),
                'warehouse' => 'IT Store',
            ])->assertOk();

        Notification::assertSentTo($firstUser, AssetRecalledNotification::class);
        Notification::assertSentTo($secondUser, AssetRecalledNotification::class);
    }
}
