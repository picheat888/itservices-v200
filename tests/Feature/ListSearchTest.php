<?php

// Multi-word search on every server-paginated list: words in any order, across fields,
// wildcards taken literally, and never past what the reader is allowed to see.

namespace Tests\Feature;

use App\Models\Asset\Asset;
use App\Models\AuditLog;
use App\Models\Contract\Contract;
use App\Models\Email\EmailLog;
use App\Models\Employee\Employee;
use App\Models\Request\ServiceRequest;
use App\Models\Settings\AssetModel;
use App\Models\Settings\Brand;
use App\Models\Settings\Vendor;
use App\Models\Stock\StockItem;
use App\Models\Ticket\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ListSearchTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::factory()->create(['role' => 'super', 'name' => 'Root Admin']);
    }

    /** @return list<string> */
    private function search(string $url, string $field, mixed $search): array
    {
        $query = http_build_query(['page' => 1, 'per_page' => 100, 'search' => $search]);

        return collect($this->actingAs($this->admin)->getJson("{$url}?{$query}")->assertOk()->json('data'))
            ->pluck($field)->sort()->values()->all();
    }

    private function employee(string $code, string $first, string $last, ?string $firstTh = null, ?string $lastTh = null, array $extra = []): Employee
    {
        return Employee::create([
            'code' => $code, 'first_name' => $first, 'last_name' => $last,
            'first_name_th' => $firstTh, 'last_name_th' => $lastTh, 'status' => 'active', ...$extra,
        ]);
    }

    // Employees

    public function test_employee_words_match_in_any_order_and_across_fields(): void
    {
        $this->employee('680001', 'Somchai', 'Jaidee', 'สมชาย', 'ใจดี');
        $this->employee('680002', 'Somying', 'Jaidee', 'สมหญิง', 'ใจดี');
        $this->employee('680003', 'Somchai', 'Rakdee');

        $this->assertSame(['680001'], $this->search('/api/employees', 'code', 'สมชาย ใจดี'));
        $this->assertSame(['680001'], $this->search('/api/employees', 'code', 'ใจดี สมชาย'));
        $this->assertSame(['680003'], $this->search('/api/employees', 'code', 'Somchai 680003'));
        $this->assertSame(['680001', '680003'], $this->search('/api/employees', 'code', 'somchai'));
        $this->assertSame(['680001', '680002'], $this->search('/api/employees', 'code', "   ใจดี \u{00A0}  "));
        $this->assertSame(['680001'], $this->search('/api/employees', 'code', "สม\u{200B}ชาย"));
        $this->assertSame([], $this->search('/api/employees', 'code', 'สมชาย Rakdee 999'));
    }

    public function test_employee_first_and_last_name_typed_together_are_found(): void
    {
        $this->employee('680001', 'Somchai', 'Jaidee', 'สมชาย', 'ใจดี');
        $this->employee('680002', 'Somying', 'Jaidee', 'สมหญิง', 'ใจดี');
        $this->employee('680003', 'Somchai', 'Rakdee');

        $this->assertSame(['680001'], $this->search('/api/employees', 'code', 'สมชายใจดี'));
        $this->assertSame(['680001'], $this->search('/api/employees', 'code', 'SomchaiJaidee'));
        $this->assertSame(['680001'], $this->search('/api/employees', 'code', 'ชายใจ'));
        $this->assertSame(['680003'], $this->search('/api/employees', 'code', 'somchairakdee'));
        $this->assertSame(['680001'], $this->search('/api/employees', 'code', 'สมชายใจดี 680001'));
        $this->assertSame([], $this->search('/api/employees', 'code', 'ใจดีสมชาย'));
    }

    public function test_employee_empty_or_odd_input_does_not_filter_or_fail(): void
    {
        $this->employee('680001', 'Somchai', 'Jaidee');
        $this->employee('680002', 'Somying', 'Jaidee');

        $this->assertSame(['680001', '680002'], $this->search('/api/employees', 'code', ''));
        $this->assertSame(['680001', '680002'], $this->search('/api/employees', 'code', "  \u{200B} "));
        $this->assertSame(['680001', '680002'], $this->search('/api/employees', 'code', ['x']));
    }

    public function test_wildcards_in_the_search_are_taken_literally(): void
    {
        $this->employee('680001', 'Under', 'Score', extra: ['email' => 'a_b@corp.test']);
        $this->employee('680002', 'Any', 'Char', extra: ['email' => 'axb@corp.test']);
        $this->employee('680003', 'Bang', 'Mark', extra: ['email' => 'wow!@corp.test']);

        $this->assertSame(['680001'], $this->search('/api/employees', 'code', 'a_b'));
        $this->assertSame([], $this->search('/api/employees', 'code', '%'));
        $this->assertSame(['680003'], $this->search('/api/employees', 'code', 'wow!'));
        $this->assertSame([], $this->search('/api/employees', 'code', "Score' OR 1=1 --"));
    }

    // Tickets

    public function test_ticket_search_matches_the_requester_and_stays_inside_the_readers_own_tickets(): void
    {
        $mine = $this->employee('680010', 'Manee', 'Meena', 'มานี', 'มีนา');
        $other = $this->employee('680011', 'Somchai', 'Jaidee', 'สมชาย', 'ใจดี');
        $reader = User::factory()->create(['role' => 'user', 'employee_id' => $mine->id]);
        Ticket::factory()->create(['requester_id' => $mine->id, 'subject' => 'Printer jammed']);
        Ticket::factory()->create(['requester_id' => $other->id, 'subject' => 'Printer broken']);

        $subjects = fn (string $search) => collect($this->actingAs($reader)
            ->getJson('/api/tickets?'.http_build_query(['page' => 1, 'search' => $search]))->assertOk()->json('data'))
            ->pluck('subject')->all();

        $this->assertSame(['Printer jammed'], $subjects('printer มานี'));
        $this->assertSame(['Printer jammed'], $subjects('มานีมีนา'));
        $this->assertSame([], $subjects('สมชายใจดี'));
        $this->assertSame(['Printer jammed'], $subjects('printer'));
        $this->assertSame([], $subjects('สมชาย'));
        $this->assertSame([], $subjects('broken'));
    }

    // Assets

    public function test_asset_search_matches_the_holders_thai_name_with_the_model(): void
    {
        $holder = $this->employee('680020', 'Somchai', 'Jaidee', 'สมชาย', 'ใจดี');
        $other = $this->employee('680021', 'Somying', 'Rakdee', 'สมหญิง', 'รักดี');
        $first = Asset::factory()->create(['owner_employee_id' => $holder->id, 'owner' => null, 'model_id' => AssetModel::create(['name' => 'Latitude 5440'])->id]);
        Asset::factory()->create(['owner_employee_id' => $other->id, 'owner' => null, 'model_id' => AssetModel::create(['name' => 'Latitude 7440'])->id]);

        $this->assertSame([$first->asset_code], $this->search('/api/assets', 'asset_code', 'ใจดี latitude'));
        $this->assertSame([$first->asset_code], $this->search('/api/assets', 'asset_code', '5440 สมชาย'));
        $this->assertSame([$first->asset_code], $this->search('/api/assets', 'asset_code', 'สมชายใจดี'));
    }

    // Contracts

    private function contract(string $vendor, string $name, string $endDate): Contract
    {
        return Contract::create([
            'vendor_id' => Vendor::firstOrCreate(['name' => $vendor])->id, 'name' => $name, 'details' => '-', 'type' => 'hardware',
            'start_date' => '2026-01-01', 'end_date' => $endDate, 'value' => 100, 'billing_cycle' => 'yearly',
        ]);
    }

    public function test_contract_search_matches_name_and_vendor_together(): void
    {
        $ricoh = $this->contract('Ricoh Thailand', 'Copier lease', '2027-12-31');
        $this->contract('Canon', 'Copier rental', '2027-12-31');

        $this->assertSame([$ricoh->id], $this->search('/api/contracts', 'id', 'copier ricoh'));
    }

    public function test_contracts_ending_on_the_same_day_keep_a_stable_order(): void
    {
        $ids = collect(range(1, 5))->map(fn (int $i) => $this->contract('Vendor', "Lease {$i}", '2027-06-30')->id)->all();

        $listed = collect($this->actingAs($this->admin)->getJson('/api/contracts?page=1&per_page=100')->assertOk()->json('data'))->pluck('id')->all();

        $this->assertSame($ids, $listed);
    }

    // Stock

    public function test_stock_search_matches_name_and_brand_together(): void
    {
        $hp = StockItem::create(['sku' => 'SKU-1', 'name' => 'Toner 85A', 'brand_id' => Brand::create(['name' => 'HP'])->id, 'current_stock' => 1, 'min_stock' => 0, 'max_stock' => 5]);
        StockItem::create(['sku' => 'SKU-2', 'name' => 'Toner 337', 'brand_id' => Brand::create(['name' => 'Canon'])->id, 'current_stock' => 1, 'min_stock' => 0, 'max_stock' => 5]);

        $this->assertSame([$hp->sku], $this->search('/api/stock-items', 'sku', '85a hp'));
        $this->assertSame([$hp->sku], $this->search('/api/stock-items', 'sku', 'HP toner'));
    }

    // Requests

    public function test_request_words_match_the_service_name_in_thai_with_the_requester(): void
    {
        foreach ([['RQ-2026-0001', 'computer', 'Computer for Somchai'], ['RQ-2026-0002', 'cctv', 'CCTV for Somchai']] as [$reference, $type, $title]) {
            ServiceRequest::create([
                'reference' => $reference, 'type' => $type, 'origin' => 'direct', 'user_id' => $this->admin->id,
                'requester_name' => 'Somchai', 'title' => $title, 'reason' => '-', 'status' => 'pending',
            ]);
        }

        $this->assertSame(['RQ-2026-0001'], $this->search('/api/service-requests', 'reference', 'somchai คอมพิวเตอร์'));
        $this->assertSame(['RQ-2026-0001', 'RQ-2026-0002'], $this->search('/api/service-requests', 'reference', 'somchai'));
    }

    // Email log

    public function test_email_log_search_matches_recipient_and_subject_together(): void
    {
        EmailLog::create(['template_key' => 'welcome', 'recipient_name' => 'Manee', 'to_email' => 'manee@corp.test', 'subject' => 'Welcome aboard', 'status' => 'sent']);
        EmailLog::create(['template_key' => 'reset', 'recipient_name' => 'Manee', 'to_email' => 'manee@corp.test', 'subject' => 'Password reset', 'status' => 'sent']);

        $this->assertSame(['welcome'], $this->search('/api/email-logs', 'template_key', 'welcome manee'));
    }

    // Audit log

    public function test_audit_log_is_searched_through_search_not_q(): void
    {
        $this->actingAs($this->admin);
        AuditLog::record('Updated asset', 'NB-0001');
        AuditLog::record('Updated asset', 'NB-0002');
        AuditLog::record('Deleted contract', 'NB-0001');

        $this->assertSame(['NB-0001'], $this->search('/api/audit-logs', 'target', 'nb-0001 asset'));
    }
}
