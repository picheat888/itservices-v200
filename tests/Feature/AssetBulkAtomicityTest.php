<?php

// Bulk asset actions are all or nothing: a failure part-way leaves every asset and the audit log as they were.

namespace Tests\Feature;

use App\Models\Asset\Asset;
use App\Models\AuditLog;
use App\Models\Settings\Location;
use App\Models\Settings\WriteoffReason;
use App\Models\User;
use App\Services\Asset\AssetBulkActionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

class AssetBulkAtomicityTest extends TestCase
{
    use RefreshDatabase;

    private User $actor;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actor = User::factory()->create(['role' => 'super']);
        $this->actingAs($this->actor);
    }

    private function service(): AssetBulkActionService
    {
        return app(AssetBulkActionService::class);
    }

    /** The second audit row of the action throws, after the first asset already changed. */
    private function failOnSecondAudit(): void
    {
        $seen = 0;
        AuditLog::creating(function () use (&$seen) {
            if (++$seen === 2) {
                throw new RuntimeException('audit down');
            }
        });
    }

    /** @return list<Asset> */
    private function assets(string $status, array $extra = []): array
    {
        return [
            Asset::factory()->create(['status' => $status, ...$extra]),
            Asset::factory()->create(['status' => $status, ...$extra]),
        ];
    }

    /** @param  list<Asset>  $assets */
    private function assertUnchanged(array $assets, string $column, mixed $value): void
    {
        foreach ($assets as $asset) {
            $this->assertSame($value, $asset->fresh()->getRawOriginal($column), "asset {$asset->id} {$column}");
        }
        $this->assertSame(0, AuditLog::count());
    }

    public function test_write_off_rolls_back(): void
    {
        $assets = $this->assets('ready');
        $reason = WriteoffReason::create(['name' => 'Broken']);
        $this->failOnSecondAudit();

        try {
            $this->service()->writeOff(array_map(fn (Asset $a) => $a->id, $assets), $reason->id, null);
            $this->fail('expected the audit failure');
        } catch (RuntimeException) {
        }

        $this->assertUnchanged($assets, 'status', 'ready');
    }

    public function test_return_to_vendor_rolls_back(): void
    {
        $assets = $this->assets('ready', ['source' => 'rented']);
        $this->failOnSecondAudit();

        try {
            $this->service()->returnToVendor(array_map(fn (Asset $a) => $a->id, $assets), null);
            $this->fail('expected the audit failure');
        } catch (RuntimeException) {
        }

        $this->assertUnchanged($assets, 'status', 'ready');
    }

    public function test_relocate_rolls_back(): void
    {
        $from = Location::create(['name' => 'Floor 1']);
        $to = Location::create(['name' => 'Floor 2']);
        $assets = $this->assets('deployed', ['location_id' => $from->id]);
        $this->failOnSecondAudit();

        try {
            $this->service()->relocate(collect($assets), $to, $this->actor, null);
            $this->fail('expected the audit failure');
        } catch (RuntimeException) {
        }

        $this->assertUnchanged($assets, 'location_id', $from->id);
    }

    public function test_receive_rolls_back(): void
    {
        $assets = $this->assets('pending_return');
        $this->failOnSecondAudit();

        try {
            $this->service()->receive(collect($assets), $this->actor, 'Main');
            $this->fail('expected the audit failure');
        } catch (RuntimeException) {
        }

        $this->assertUnchanged($assets, 'status', 'pending_return');
    }

    public function test_transfer_rolls_back(): void
    {
        $location = Location::create(['name' => 'Floor 1']);
        $assets = $this->assets('ready');
        $this->failOnSecondAudit();

        try {
            $this->service()->transfer(collect($assets), ['mode' => 'shared', 'owner_label' => 'Meeting room', 'location_id' => $location->id], $this->actor);
            $this->fail('expected the audit failure');
        } catch (RuntimeException) {
        }

        $this->assertUnchanged($assets, 'status', 'ready');
    }

    public function test_a_failed_delete_leaves_no_audit_row(): void
    {
        $asset = Asset::factory()->create(['status' => 'ready']);
        Asset::deleting(fn () => throw new RuntimeException('delete refused'));

        try {
            $this->service()->delete($asset);
            $this->fail('expected the delete failure');
        } catch (RuntimeException) {
        }

        $this->assertModelExists($asset);
        $this->assertSame(0, AuditLog::count());
    }
}
