<?php

namespace Tests\Feature;

use App\Jobs\SendTemplatedEmail;
use App\Models\Email\EmailTemplate;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockRequest;
use App\Models\User;
use App\Services\Stock\StockNotificationService;
use Database\Seeders\EmailTemplateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use ReflectionObject;
use Tests\TestCase;

/**
 * A "below the minimum" mail that cannot say what the minimum is leaves the reader to go and
 * look it up — which is the whole point of sending it to them.
 *
 * stock.low_alert already wrote {{stock.min}} and nothing filled it, so it reached recipients
 * as that literal text: the renderer is a plain str_replace, and an unfilled variable does not
 * come out blank, it comes out as the braces.
 */
class StockAlertVariablesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(EmailTemplateSeeder::class);
    }

    private function watcher(): User
    {
        $roleId = Role::firstOrCreate(['key' => 'stockrole'], ['name' => 'Stock', 'is_system' => false])->id;
        RolePermission::firstOrCreate(['role_id' => $roleId, 'permission' => 'stock.module'], ['allowed' => true]);

        return User::factory()->create(['role' => 'stockrole', 'email' => 'stock@inaba.co.th']);
    }

    /** @param  array<string, mixed>  $attrs */
    private function item(array $attrs): StockItem
    {
        // No factory on this model; the other stock tests build the row the same way.
        return StockItem::create($attrs + ['sku' => 'SKU-1042', 'name' => 'USB-C Docking Station', 'unit' => 'pcs']);
    }

    /** Runs the sweep over one item — alert() reads the state off the item's own levels. */
    private function alert(StockItem $item): void
    {
        app(StockNotificationService::class)->alert($item);
    }

    private function mailFor(string $key): ?string
    {
        $job = collect(Bus::dispatched(SendTemplatedEmail::class))
            ->first(fn (SendTemplatedEmail $queued) => $this->prop($queued, 'templateKey') === $key);

        return $job === null ? null : $this->prop($job, 'html');
    }

    private function prop(object $job, string $name): string
    {
        $property = (new ReflectionObject($job))->getProperty($name);
        $property->setAccessible(true);

        return (string) $property->getValue($job);
    }

    public function test_a_low_stock_mail_says_what_low_means_for_that_item(): void
    {
        Bus::fake();
        $this->watcher();
        // The wording in use on this installation already writes {{stock.min}} — the standard
        // definition in the catalogue has not caught up with it yet (the stock templates are
        // still to be synced), so the body is set here rather than seeded.
        EmailTemplate::where('key', 'stock.low_alert')->update([
            'body_html' => '<p>{{stock.sku}} - {{stock.name}}</p>'
                .'<p>On hand {{stock.qty}}, minimum {{stock.min}}.</p>',
        ]);
        $item = $this->item(['current_stock' => 2, 'min_stock' => 5, 'max_stock' => 40]);

        $this->alert($item);

        $html = $this->mailFor('stock.low_alert');
        $this->assertNotNull($html, 'A low-stock alert sent nothing.');
        // Before this, {{stock.min}} reached the recipient as those braces.
        $this->assertStringNotContainsString('{{', $html);

        $text = html_entity_decode(strip_tags($html));
        $this->assertStringContainsString('SKU-1042', $text);
        $this->assertStringContainsString('On hand 2, minimum 5.', $text);
    }

    public function test_the_overstock_mail_can_name_the_maximum(): void
    {
        Bus::fake();
        $this->watcher();
        // The standard body does not print it yet, but the variable has to exist to be
        // insertable from the editor — an author who adds it must not get raw braces.
        EmailTemplate::where('key', 'stock.overstock_alert')
            ->update(['body_html' => '<p>{{stock.sku}} is at {{stock.qty}}, over the maximum of {{stock.max}}.</p>']);
        $item = $this->item(['sku' => 'SKU-9', 'current_stock' => 90, 'min_stock' => 5, 'max_stock' => 40]);

        $this->alert($item);

        $text = html_entity_decode(strip_tags($this->mailFor('stock.overstock_alert')));
        $this->assertStringContainsString('SKU-9 is at 90, over the maximum of 40.', $text);
    }

    public function test_a_new_request_names_itself_its_requester_and_their_reason(): void
    {
        Bus::fake();
        $approver = $this->watcher();
        // requestCreated() goes to whoever can approve, not to the module at large.
        RolePermission::firstOrCreate(
            ['role_id' => $approver->role_id, 'permission' => 'stock.approve'],
            ['allowed' => true],
        );

        $item = $this->item(['current_stock' => 50, 'min_stock' => 5, 'max_stock' => 60]);
        $request = StockRequest::create([
            'stock_item_id' => $item->id,
            'requester_name' => 'Piches S',
            'qty' => 3,
            'reason' => "Meeting room dock died.\nNeed it this week.",
            'status' => 'pending',
        ]);

        app(StockNotificationService::class)->requestCreated($request);

        $html = $this->mailFor('stock.request_created');
        $this->assertNotNull($html, 'A new request told the approvers nothing.');
        // All three were written into the body before anything filled them, so they reached
        // the reader as the braces themselves.
        $this->assertStringNotContainsString('{{', $html);

        $text = html_entity_decode(strip_tags($html));
        $this->assertStringContainsString($request->reference, $text);
        $this->assertStringContainsString('Piches S', $text);
        $this->assertStringContainsString('Meeting room dock died.', $text);
        $this->assertStringContainsString('SKU-1042', $text);
    }

    public function test_a_reason_is_escaped_and_keeps_its_line_breaks(): void
    {
        Bus::fake();
        $approver = $this->watcher();
        RolePermission::firstOrCreate(
            ['role_id' => $approver->role_id, 'permission' => 'stock.approve'],
            ['allowed' => true],
        );

        $item = $this->item([]);
        $request = StockRequest::create([
            'stock_item_id' => $item->id,
            'requester_name' => 'Piches S',
            'qty' => 1,
            // Typed into a form, rendered into an HTML email.
            'reason' => "Broke after <b>update</b>\nSecond line.",
            'status' => 'pending',
        ]);

        app(StockNotificationService::class)->requestCreated($request);

        $html = $this->mailFor('stock.request_created');
        $this->assertStringContainsString('&lt;b&gt;update&lt;/b&gt;', $html);
        $this->assertStringNotContainsString('<b>update</b>', $html);
        $this->assertStringContainsString('<br />', $html);
    }

    /**
     * The three mails that answer a request. Each names a different person doing a different
     * thing, and getting them from the same record was the point of adding fulfilled_by.
     */
    public function test_each_outcome_names_the_person_who_caused_it(): void
    {
        Bus::fake();
        $owner = $this->watcher();
        $item = $this->item(['current_stock' => 50, 'min_stock' => 5, 'max_stock' => 60]);

        $request = StockRequest::create([
            'stock_item_id' => $item->id,
            'user_id' => $owner->id,
            'requester_name' => 'Piches Srisuk',
            'qty' => 2,
            'reason' => 'Meeting room dock died',
            'status' => 'approved',
            'approver_name' => 'Anong Wattana',
            'approved_at' => now(),
        ]);

        $service = app(StockNotificationService::class);
        $service->requestResponded($request->load('item'), 'approved');
        $approved = html_entity_decode(strip_tags($this->mailFor('stock.request_approved')));
        $this->assertStringContainsString('Approved By: Anong Wattana', $approved);
        $this->assertStringContainsString($request->reference, $approved);

        Bus::fake();
        $request->update(['status' => 'fulfilled', 'fulfilled_at' => now(), 'fulfilled_by' => 'Kankanok P']);
        $service->requestResponded($request->fresh()->load('item'), 'fulfilled');
        $fulfilled = html_entity_decode(strip_tags($this->mailFor('stock.request_fulfilled')));
        // Not the approver: releasing the stock is a different act by a different person.
        $this->assertStringContainsString('Fulfilled By: Kankanok P', $fulfilled);
        $this->assertStringNotContainsString('Anong Wattana', $fulfilled);
        $this->assertStringContainsString('Fulfilled Date: '.now()->format('d-m-Y'), $fulfilled);
    }

    public function test_a_request_fulfilled_before_the_name_was_recorded_reads_as_a_dash(): void
    {
        Bus::fake();
        $owner = $this->watcher();
        $item = $this->item([]);

        // fulfilled_by is nullable and null on every row fulfilled before it existed. A name
        // that was never captured cannot be invented, and a label must not stand empty.
        $request = StockRequest::create([
            'stock_item_id' => $item->id, 'user_id' => $owner->id, 'requester_name' => 'Piches Srisuk',
            'qty' => 1, 'reason' => 'Spare', 'status' => 'fulfilled', 'fulfilled_at' => now(),
        ]);

        app(StockNotificationService::class)->requestResponded($request->load('item'), 'fulfilled');

        $text = html_entity_decode(strip_tags($this->mailFor('stock.request_fulfilled')));
        $this->assertStringContainsString('Fulfilled By: -', $text);
    }

    public function test_a_threshold_of_zero_prints_as_zero_and_not_as_a_dash(): void
    {
        Bus::fake();
        $this->watcher();
        // Both columns are NOT NULL and default to 0. Zero is a real setting — "no minimum
        // for this item" — and hiding it behind a dash would misreport the configuration.
        // It has to be the out-of-stock path: status() only calls an item low when current
        // is BELOW min, which a minimum of 0 can never satisfy.
        EmailTemplate::where('key', 'stock.out_of_stock')
            ->update(['body_html' => '<p>min={{stock.min}} max={{stock.max}}</p>']);
        $item = $this->item(['current_stock' => 0, 'min_stock' => 0, 'max_stock' => 0]);

        $this->alert($item);

        $text = html_entity_decode(strip_tags($this->mailFor('stock.out_of_stock')));
        $this->assertStringContainsString('min=0 max=0', $text);
    }
}
