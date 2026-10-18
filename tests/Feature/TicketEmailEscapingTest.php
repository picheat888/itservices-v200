<?php

// Typed values (ticket subject, people's names, item names) reach HTML emails escaped.

namespace Tests\Feature;

use App\Enums\Ticket\TicketCategory;
use App\Enums\Ticket\TicketPriority;
use App\Jobs\SendTemplatedEmail;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockRequest;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Services\Stock\StockNotificationService;
use App\Services\Ticket\TicketService;
use Database\Seeders\EmailTemplateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use ReflectionObject;
use Tests\TestCase;

class TicketEmailEscapingTest extends TestCase
{
    use RefreshDatabase;

    private const LINK = '<a href="https://evil.example/sso">Sign in again</a>';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(EmailTemplateSeeder::class);
    }

    private function ticket(): Ticket
    {
        $requester = Employee::create([
            'code' => 'EMP-1042', 'first_name' => '<b>Somchai</b>', 'last_name' => 'Suksawat', 'status' => 'active',
        ]);

        return Ticket::create([
            'subject' => 'Printer '.self::LINK,
            'description' => 'Paper jam',
            'category' => TicketCategory::Hardware->value,
            'status' => 'open',
            'requester_id' => $requester->id,
        ]);
    }

    /** @return array{html: string, subject: string}|null */
    private function mail(string $key): ?array
    {
        $job = collect(Bus::dispatched(SendTemplatedEmail::class))
            ->first(fn (SendTemplatedEmail $queued) => $this->prop($queued, 'templateKey') === $key);

        return $job === null ? null : [
            'html' => $this->prop($job, 'html'),
            'subject' => $this->prop($job, 'subject'),
        ];
    }

    private function prop(object $job, string $name): string
    {
        $property = (new ReflectionObject($job))->getProperty($name);
        $property->setAccessible(true);

        return (string) $property->getValue($job);
    }

    private function assertEscaped(string $html): void
    {
        $this->assertStringNotContainsString(self::LINK, $html);
        $this->assertStringNotContainsString('<b>Somchai</b>', $html);
        $this->assertStringContainsString(e(self::LINK), $html);
    }

    public function test_the_assigned_mail_escapes_the_subject_and_the_requester(): void
    {
        Bus::fake();
        $staff = User::factory()->create(['name' => 'Piches Srisuk', 'email' => 'piches@inaba.co.th']);
        $admin = User::factory()->create(['name' => '<i>Anong</i> Wattana', 'email' => 'anong@inaba.co.th']);

        app(TicketService::class)->assign($this->ticket(), $staff, TicketPriority::Medium, $admin);

        $mail = $this->mail('ticket.assigned');
        $this->assertNotNull($mail);
        $this->assertEscaped($mail['html']);
        $this->assertStringNotContainsString('<i>Anong</i>', $mail['html']);
        $this->assertStringContainsString('&lt;i&gt;Anong&lt;/i&gt;', $mail['html']);
    }

    public function test_the_forwarded_mail_escapes_the_subject(): void
    {
        Bus::fake();
        $first = User::factory()->create(['name' => 'First Tech', 'email' => 'first@inaba.co.th']);
        $second = User::factory()->create(['name' => 'Second Tech', 'email' => 'second@inaba.co.th']);
        $ticket = $this->ticket();
        $service = app(TicketService::class);
        $service->assign($ticket, $first, TicketPriority::Medium, $first);

        $service->forward($ticket->fresh(), $second, $first);

        $mail = $this->mail('ticket.forwarded');
        $this->assertNotNull($mail);
        $this->assertStringNotContainsString(self::LINK, $mail['html']);
        $this->assertStringContainsString(e(self::LINK), $mail['html']);
    }

    public function test_the_subject_line_stays_plain_text(): void
    {
        Bus::fake();
        $staff = User::factory()->create(['name' => 'Piches Srisuk', 'email' => 'piches@inaba.co.th']);
        $ticket = $this->ticket();
        $ticket->update(['subject' => 'Wi-Fi & VPN down']);

        app(TicketService::class)->assign($ticket->fresh(), $staff, TicketPriority::Medium, $staff);

        $mail = $this->mail('ticket.assigned');
        $this->assertNotNull($mail);
        $this->assertStringNotContainsString('&amp;', $mail['subject']);
        $this->assertStringContainsString('Wi-Fi &amp; VPN down', $mail['html']);
    }

    public function test_the_stock_request_mail_escapes_names(): void
    {
        Bus::fake();
        $role = Role::create(['key' => 'approver_'.uniqid(), 'name' => 'A', 'is_system' => false]);
        RolePermission::create(['role_id' => $role->id, 'permission' => 'stock.approve', 'allowed' => true]);
        User::factory()->create(['role_id' => $role->id, 'email' => 'approver@inaba.co.th']);
        $owner = User::factory()->create();
        $item = StockItem::create(['sku' => 'MS-1', 'name' => 'Mouse '.self::LINK, 'unit' => 'unit']);
        $request = StockRequest::create([
            'stock_item_id' => $item->id, 'user_id' => $owner->id, 'requester_name' => '<b>Somchai</b>',
            'qty' => 1, 'reason' => 'r', 'status' => 'pending',
        ]);

        app(StockNotificationService::class)->requestCreated($request);

        $mail = $this->mail('stock.request_created');
        $this->assertNotNull($mail);
        $this->assertStringNotContainsString(self::LINK, $mail['html']);
        $this->assertStringNotContainsString('<b>Somchai</b>', $mail['html']);
    }
}
