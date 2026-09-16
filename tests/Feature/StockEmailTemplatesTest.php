<?php

namespace Tests\Feature;

use App\Support\EmailTemplates;
use Database\Seeders\EmailTemplateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** The Stock notification tab must expose the eight desk topics with their labels. */
class StockEmailTemplatesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // Standard templates now live in EmailTemplateSeeder (no longer seeded by migration).
        $this->seed(EmailTemplateSeeder::class);
    }

    public function test_stock_templates_cover_the_eight_topics(): void
    {
        // The keys are the invariant: eight things happen to stock and each has a mail. The
        // display NAMES are not — administrators rename them, and pinning the literals here
        // meant this failed for a rename that changed nothing about what is covered. Each
        // name is checked against the catalogue instead, which is where a rename lands.
        $keys = [
            'stock.low_alert',
            'stock.overstock_alert',
            'stock.out_of_stock',
            'stock.request_created',
            'stock.request_approval_needed',
            'stock.request_approved',
            'stock.request_rejected',
            'stock.request_fulfilled',
        ];

        foreach ($keys as $key) {
            $standard = collect(EmailTemplates::all())->firstWhere('key', $key);
            $this->assertNotNull($standard, "{$key} has no standard definition");
            $this->assertNotSame('', trim($standard['name']), "{$key} has no name to show in the list");
            $this->assertDatabaseHas('email_templates', ['key' => $key, 'name' => $standard['name']]);
        }
    }

    public function test_templates_carry_a_cadence_flag(): void
    {
        // The two summaries. Weekly, not daily: an item crossing a threshold already mails
        // at the moment it happens, so a daily list of the same items is the same news twice
        // — and a list that arrives every morning is one people learn to filter. The daily
        // sweep still runs; it only rings bells now.
        $this->assertDatabaseHas('email_templates', ['key' => 'stock.alert_digest', 'cadence' => 'weekly']);
        $this->assertDatabaseHas('email_templates', ['key' => 'stock.request_approval_needed', 'cadence' => 'weekly']);

        // Event-driven (real-time) templates.
        $this->assertDatabaseHas('email_templates', ['key' => 'stock.low_alert', 'cadence' => 'realtime']);
        $this->assertDatabaseHas('email_templates', ['key' => 'stock.request_created', 'cadence' => 'realtime']);
    }
}
