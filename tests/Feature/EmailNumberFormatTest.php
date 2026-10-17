<?php

namespace Tests\Feature;

use App\Enums\Ticket\TicketCategory;
use App\Jobs\SendTemplatedEmail;
use App\Models\Email\EmailTemplate;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Stock\StockItem;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Services\Stock\StockNotificationService;
use App\Services\Ticket\TicketDigestService;
use Database\Seeders\EmailTemplateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use ReflectionObject;
use Tests\TestCase;

/** Counts and quantities in email variables group thousands. */
class EmailNumberFormatTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(EmailTemplateSeeder::class);
    }

    private function grant(string $roleKey, array $permissions, string $email): void
    {
        $roleId = Role::firstOrCreate(['key' => $roleKey], ['name' => $roleKey, 'is_system' => false])->id;
        foreach ($permissions as $permission) {
            RolePermission::firstOrCreate(['role_id' => $roleId, 'permission' => $permission], ['allowed' => true]);
        }
        User::factory()->create(['role' => $roleKey, 'email' => $email]);
    }

    /** The rendered text of the one queued mail with this template key. */
    private function textFor(string $key): string
    {
        $job = collect(Bus::dispatched(SendTemplatedEmail::class))
            ->first(function (SendTemplatedEmail $queued) use ($key) {
                $property = (new ReflectionObject($queued))->getProperty('templateKey');

                return $property->getValue($queued) === $key;
            });
        $this->assertNotNull($job, "No {$key} mail was queued.");

        return html_entity_decode(strip_tags($job->html));
    }

    public function test_stock_alert_email_groups_the_quantity(): void
    {
        Bus::fake();
        $this->grant('stockrole', ['stock.module'], 'stock@inaba.co.th');
        EmailTemplate::where('key', 'stock.low_alert')->update([
            'body_html' => '<p>On hand {{stock.qty}}, minimum {{stock.min}}.</p>',
        ]);
        $item = StockItem::create([
            'sku' => 'SKU-1', 'name' => 'Cable', 'unit' => 'pcs',
            'current_stock' => 1234, 'min_stock' => 2000, 'max_stock' => 5000,
        ]);

        app(StockNotificationService::class)->alert($item);

        $this->assertStringContainsString('On hand 1,234, minimum 2,000.', $this->textFor('stock.low_alert'));
    }

    public function test_ticket_digest_groups_the_total(): void
    {
        Bus::fake();
        $this->grant('itrole', ['tickets.resolve', 'tickets.level_hardware'], 'it@inaba.co.th');
        EmailTemplate::where('key', 'ticket.weekly_digest')->update([
            'subject' => 'Total {{digest.total}}',
            'body_html' => '<p>Open {{digest.open_count}}</p>',
        ]);
        $requesterId = Employee::create(['first_name' => 'A', 'last_name' => 'B', 'status' => 'active'])->id;
        Ticket::factory()->count(1200)->create([
            'requester_id' => $requesterId,
            'category' => TicketCategory::Hardware,
        ]);

        app(TicketDigestService::class)->send();

        $this->assertStringContainsString('Open 1,200', $this->textFor('ticket.weekly_digest'));
    }
}
