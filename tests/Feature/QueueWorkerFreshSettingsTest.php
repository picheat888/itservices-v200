<?php

// A long-lived queue worker reads SLA targets, bell switches and request choices fresh for each job.

namespace Tests\Feature;

use App\Enums\Request\RequestType;
use App\Support\NotificationCatalogue;
use App\Support\RequestSchemas;
use App\Support\TicketSla;
use Illuminate\Contracts\Queue\Job;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Queue\Events\JobProcessing;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class QueueWorkerFreshSettingsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        TicketSla::flush();
        NotificationCatalogue::forgetSwitches();
        RequestSchemas::flushManagedCache();
    }

    public function test_a_queued_job_reads_sla_switches_and_options_fresh(): void
    {
        $this->assertSame(4, TicketSla::resolveHours('critical'));
        $this->assertTrue(NotificationCatalogue::enabled('notif_asset_assigned'));
        $this->assertSame([], $this->hardwareChoices());

        DB::table('sla_targets')->insert(['scope' => 'priority', 'match_value' => 'critical', 'resolve_hours' => 9, 'clock' => 'business', 'enabled' => true]);
        DB::table('notification_templates')->insert(['key' => 'notif_asset_assigned', 'message_en' => 'x', 'message_th' => 'x', 'enabled' => false]);
        DB::table('request_options')->insert(['request_type' => RequestType::Hardware->value, 'field_key' => 'device_id', 'label_en' => 'Monitor', 'active' => true]);

        // Still cached, as a long-lived worker would be mid-job
        $this->assertSame(4, TicketSla::resolveHours('critical'));
        $this->assertTrue(NotificationCatalogue::enabled('notif_asset_assigned'));
        $this->assertSame([], $this->hardwareChoices());

        event(new JobProcessing('database', $this->createMock(Job::class)));

        $this->assertSame(9, TicketSla::resolveHours('critical'));
        $this->assertFalse(NotificationCatalogue::enabled('notif_asset_assigned'));
        $this->assertSame(['Monitor'], $this->hardwareChoices());
    }

    /** @return list<string> the Hardware request's device choices */
    private function hardwareChoices(): array
    {
        $field = collect(RequestSchemas::for(RequestType::Hardware))->firstWhere('key', 'device_id');

        return array_column($field['options'], 'label_en');
    }
}
