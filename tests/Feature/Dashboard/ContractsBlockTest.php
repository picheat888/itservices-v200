<?php

namespace Tests\Feature\Dashboard;

use App\Models\Contract\Contract;
use App\Models\Permission\Role;
use App\Models\Settings\Vendor;
use App\Models\User;
use App\Services\Dashboard\ContractsBlock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** The "expiring soon" tile counts what the Contracts list and banner count. */
class ContractsBlockTest extends TestCase
{
    use RefreshDatabase;

    /** @param array<string, mixed> $attributes */
    private function contract(array $attributes, array $stamps = []): Contract
    {
        $vendor = Vendor::firstOrCreate(['name' => 'Acme'], ['name_th' => 'แอคมี']);
        $contract = Contract::create(array_merge([
            'vendor_id' => $vendor->id, 'name' => 'Contract', 'type' => 'software',
            'start_date' => now()->subYear()->toDateString(), 'end_date' => now()->addYear()->toDateString(),
            'value' => 1000, 'billing_cycle' => 'monthly',
        ], $attributes));
        if ($stamps !== []) {
            $contract->forceFill($stamps)->save();
        }

        return $contract;
    }

    public function test_expiring_counts_the_reminder_window_split_at_thirty_days_with_overdue_apart(): void
    {
        $this->freezeTime();
        $this->contract(['end_date' => now()->addDays(10)->toDateString()]);
        $this->contract(['end_date' => now()->addDays(45)->toDateString()]);
        $this->contract(['end_date' => now()->addDays(200)->toDateString()]);
        $this->contract(['end_date' => now()->subDays(3)->toDateString()]);
        $this->contract(['end_date' => now()->addDays(10)->toDateString()], ['cancelled_at' => now()]);

        $block = app(ContractsBlock::class)->build();

        $this->assertSame(['total' => 2, 'd30' => 1, 'd31_plus' => 1, 'overdue' => 1], $block['expiring']);

        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $summary = $this->actingAs(User::factory()->create(['role' => 'super']))->getJson('/api/contracts/summary')->assertOk()->json();
        $this->assertSame($summary['expiring'], $block['expiring']['total']);
        $this->assertSame($summary['overdue'], $block['expiring']['overdue']);
    }
}
