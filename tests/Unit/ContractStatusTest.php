<?php

namespace Tests\Unit;

use App\Models\Contract\Contract;
use App\Models\Settings\Vendor;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ContractStatusTest extends TestCase
{
    use RefreshDatabase;

    private function contract(array $overrides = []): Contract
    {
        $vendor = Vendor::create(['name' => 'V-'.uniqid()]);

        return Contract::create(array_merge([
            'vendor_id' => $vendor->id,
            'name' => 'Test',
            'title' => 'Test',
            'type' => 'software',
            'start_date' => '2025-01-01',
            'end_date' => '2027-01-01',
            'value' => 100,
            'billing_cycle' => 'yearly',
        ], $overrides));
    }

    public function test_future_end_date_is_active(): void
    {
        $this->assertSame('active', $this->contract(['end_date' => now()->addYear()])->status);
    }

    public function test_past_end_date_is_overdue_not_expired(): void
    {
        $this->assertSame('overdue', $this->contract(['end_date' => now()->subDay()])->status);
    }

    public function test_cancelled_at_beats_dates(): void
    {
        $c = $this->contract(['end_date' => now()->subDay(), 'cancelled_at' => now()]);
        $this->assertSame('cancelled', $c->status);
    }

    public function test_expired_at_beats_everything(): void
    {
        $c = $this->contract(['end_date' => now()->addYear(), 'cancelled_at' => now(), 'expired_at' => now()]);
        $this->assertSame('expired', $c->status);
    }

    public function test_expired_contract_is_not_in_reminder(): void
    {
        $c = $this->contract(['end_date' => now()->addDays(5), 'notify_7' => true, 'expired_at' => now()]);
        $this->assertFalse($c->isInReminder());
    }
}
