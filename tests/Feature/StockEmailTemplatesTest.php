<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** The Stock notification tab must expose the eight desk topics with their labels. */
class StockEmailTemplatesTest extends TestCase
{
    use RefreshDatabase;

    public function test_stock_templates_cover_the_eight_topics(): void
    {
        $expected = [
            'stock.low_alert' => 'Stock - Low alert',
            'stock.overstock_alert' => 'Stock - Overstock alert',
            'stock.out_of_stock' => 'Stock - Out of stock alert',
            'stock.request_created' => 'Stock - New Request',
            'stock.request_approval_needed' => 'Stock - waiting approve & fulfill',
            'stock.request_approved' => 'Stock - Respond to the request (Approved)',
            'stock.request_rejected' => 'Stock - Respond to the request (Rejected)',
            'stock.request_fulfilled' => 'Stock - Respond to the request (fulfilled)',
        ];

        foreach ($expected as $key => $name) {
            $this->assertDatabaseHas('email_templates', ['key' => $key, 'name' => $name]);
        }
    }

    public function test_templates_carry_a_cadence_flag(): void
    {
        // Scheduled (daily sweep) templates.
        $this->assertDatabaseHas('email_templates', ['key' => 'stock.alert_digest', 'cadence' => 'daily']);
        $this->assertDatabaseHas('email_templates', ['key' => 'stock.request_approval_needed', 'cadence' => 'daily']);

        // Event-driven (real-time) templates.
        $this->assertDatabaseHas('email_templates', ['key' => 'stock.low_alert', 'cadence' => 'realtime']);
        $this->assertDatabaseHas('email_templates', ['key' => 'stock.request_created', 'cadence' => 'realtime']);
    }
}
