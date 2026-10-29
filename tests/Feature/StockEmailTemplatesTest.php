<?php

namespace Tests\Feature;

use App\Jobs\SendTemplatedEmail;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockRequest;
use App\Models\User;
use App\Notifications\StockRequestNotification;
use App\Support\EmailTemplates;
use Database\Seeders\EmailTemplateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
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
            'stock.request_awaiting_fulfil',
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
        $this->assertDatabaseHas('email_templates', ['key' => 'stock.request_awaiting_fulfil', 'cadence' => 'realtime']);
    }

    public function test_the_ready_to_issue_template_has_the_approved_wording(): void
    {
        $template = EmailTemplates::find('stock.request_awaiting_fulfil');

        $this->assertSame('Stock - Request ready to issue (คำขอเบิกรอจ่าย)', $template['name']);
        $this->assertSame('Stock request ready to issue: {{stock.request_no}}', $template['subject']);
        foreach ([
            '<p>Hi {{user.first_name}},</p>',
            '<p>A stock request has been approved and is ready to issue.</p>',
            '<p>Please pick the items and issue them in the portal.</p>',
            '<strong style="color:#64748b">Request No.: </strong>{{stock.request_no}}<br>',
            '<strong style="color:#64748b">Requester: </strong>{{stock.request_by}}<br>',
            '<strong style="color:#64748b">Approved By: </strong>{{stock.approver}}<br>',
            '<strong style="color:#64748b">Item: </strong>{{stock.name}} ×{{stock.qty}}</p>',
        ] as $line) {
            $this->assertStringContainsString($line, $template['body_html']);
        }
    }

    public function test_approving_mails_every_issuer_but_the_approver(): void
    {
        Notification::fake();
        Queue::fake();
        $approver = $this->userWith(['stock.view', 'stock.view_request', 'stock.approve', 'stock.fulfill']);
        $issuer = $this->userWith(['stock.fulfill']);
        $owner = $this->userWith(['stock.view', 'stock.request']);
        $bystander = $this->userWith(['stock.view']);
        $item = StockItem::create(['sku' => 'MAIL-1', 'name' => 'USB Keyboard Lite', 'unit' => 'unit', 'min_stock' => 0, 'max_stock' => 0, 'current_stock' => 9]);
        $req = StockRequest::create(['stock_item_id' => $item->id, 'user_id' => $owner->id, 'requester_name' => 'Somchai Jaidee', 'qty' => 2, 'reason' => 'r', 'status' => 'pending']);

        $this->actingAs($approver)->postJson("/api/stock-requests/{$req->id}/approve")->assertOk();

        $mails = collect(Queue::pushed(SendTemplatedEmail::class))
            ->filter(fn (SendTemplatedEmail $job) => $job->templateKey === 'stock.request_awaiting_fulfil');
        $this->assertSame([$issuer->email], $mails->pluck('toEmail')->values()->all());

        $mail = $mails->first();
        $this->assertSame("Stock request ready to issue: {$req->reference}", $mail->subject);
        $text = html_entity_decode(strip_tags($mail->html));
        $this->assertStringContainsString("Request No.: {$req->reference}", $text);
        $this->assertStringContainsString('Requester: Somchai Jaidee', $text);
        $this->assertStringContainsString("Approved By: {$approver->name}", $text);
        $this->assertStringContainsString('Item: USB Keyboard Lite ×2', $text);
        $this->assertStringContainsString('/stock?tab=requests', (string) $mail->actionUrl);

        Notification::assertNotSentTo($bystander, StockRequestNotification::class);
    }

    /** A user whose own role grants exactly these permissions. */
    private function userWith(array $permissions): User
    {
        $role = Role::create(['key' => 'mrole_'.uniqid(), 'name' => 'M', 'is_system' => false]);
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }

        return User::factory()->create(['role_id' => $role->id, 'email' => 'm'.uniqid().'@x.test']);
    }
}
