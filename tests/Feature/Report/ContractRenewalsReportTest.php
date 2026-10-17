<?php

namespace Tests\Feature\Report;

use App\Exports\Report\TabularReportExport;
use App\Models\Asset\Asset;
use App\Models\Contract\Contract;
use App\Models\Contract\ContractAlertLog;
use App\Models\Contract\ContractAttachment;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Settings\Vendor;
use App\Models\User;
use App\Services\Report\Contract\ContractRenewalsReport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Maatwebsite\Excel\Facades\Excel;
use Tests\Concerns\ExportsReports;
use Tests\Concerns\GrantsReports;
use Tests\TestCase;

/**
 * "ต่ออายุและสิ้นสุดสัญญา" (contracts.renewals): the list, its reminder and to-do cells, and the breakdown
 * (tiles, months, time-left bands, closed contracts with the bills a cancel saved).
 */
class ContractRenewalsReportTest extends TestCase
{
    use ExportsReports, RefreshDatabase;
    use GrantsReports;

    /** @var array<string, Contract> */
    private array $set;

    private Vendor $beta;

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $this->travelTo('2026-09-25 10:00:00');

        $acme = Vendor::create(['name' => 'Acme', 'name_th' => 'แอคมี']);
        $this->beta = Vendor::create(['name' => 'Beta']);
        $make = fn (string $code, array $attributes) => Contract::create([
            'code' => $code, 'vendor_id' => $acme->id, 'name' => "Contract {$code}", 'type' => 'software',
            'start_date' => '2025-10-01', 'value' => 1000, 'billing_cycle' => 'monthly',
            'notify_60' => false, 'notify_30' => false, 'notify_7' => false, ...$attributes,
        ]);

        $this->set = [
            // Ten days past its end; reminders on but the sweep never logged them.
            'overdue' => $make('CT-A', ['end_date' => '2026-09-15', 'notify_30' => true, 'notify_7' => true]),
            // Ends today, no reminders, a rented laptop still with a user.
            'today' => $make('CT-B', ['type' => 'hardware', 'end_date' => '2026-09-25', 'value' => 2000]),
            // 20 days left, quarterly, the 60-day mail sent; a rented and a bought device; has its PDF.
            'soon' => $make('CT-C', ['type' => 'hardware', 'end_date' => '2026-10-15', 'value' => 3000, 'billing_cycle' => 'quarterly', 'notify_60' => true]),
            // 50 days left, inside its 90-day reminder with nothing sent; a bought device only.
            'ma' => $make('CT-D', ['type' => 'hardware', 'end_date' => '2026-11-14', 'value' => 24000, 'billing_cycle' => 'yearly', 'notify_90' => true]),
            // 80 days left with another vendor; the 120-day mail sent.
            'contact' => $make('CT-E', ['type' => 'connectivity', 'vendor_id' => $this->beta->id, 'end_date' => '2026-12-14', 'value' => 500, 'notify_120' => true, 'notify_30' => true]),
            // 150 days left, reminders start at 60.
            'waiting' => $make('CT-F', ['end_date' => '2027-02-22', 'notify_60' => true]),
            'far' => $make('CT-G', ['type' => 'other', 'end_date' => '2027-10-30']),
            // Cancelled mid-term: started 31 Jan, bills 31 Jan, 30 Apr, 31 Jul, 31 Oct; cancelled 15 Jun.
            'cancelled' => $make('CT-H', [
                'start_date' => '2026-01-31', 'end_date' => '2027-01-30', 'value' => 3000, 'billing_cycle' => 'quarterly',
                'cancelled_at' => '2026-06-15 09:00:00', 'cancel_reason' => 'ย้ายผู้ให้บริการ',
            ]),
            // Ended by hand 10 days after its end date.
            'expired' => $make('CT-I', ['end_date' => '2026-08-31', 'expired_at' => '2026-09-10 09:00:00']),
            'last_year' => $make('CT-J', ['start_date' => '2025-01-01', 'end_date' => '2025-12-31', 'cancelled_at' => '2025-11-20 09:00:00']),
            'long_ago' => $make('CT-K', ['start_date' => '2023-05-01', 'end_date' => '2024-04-30', 'expired_at' => '2024-05-01 09:00:00']),
        ];
        Contract::whereKey($this->set['cancelled']->id)->update(['cancelled_by' => User::factory()->create(['name' => 'Somchai'])->id]);

        $asset = fn (Contract $c, string $source, string $status) => Asset::factory()->create([
            'contract_id' => $c->id, 'source' => $source, 'status' => $status, 'owner_employee_id' => null,
        ]);
        $asset($this->set['today'], 'rented', 'deployed');
        $asset($this->set['soon'], 'rented', 'ready');
        $asset($this->set['soon'], 'purchased', 'deployed');
        $asset($this->set['soon'], 'rented', 'writeoff');
        $asset($this->set['ma'], 'purchased', 'deployed');

        ContractAttachment::create(['contract_id' => $this->set['soon']->id, 'original_name' => 'c.pdf', 'path' => 'x/c.pdf', 'size' => 10, 'mime' => 'application/pdf']);
        ContractAlertLog::create(['contract_id' => $this->set['soon']->id, 'threshold' => 60, 'alerted_at' => '2026-08-20 07:00:00']);
        ContractAlertLog::create(['contract_id' => $this->set['contact']->id, 'threshold' => 120, 'alerted_at' => '2026-08-17 07:00:00']);
    }

    /** @param list<string> $permissions */
    private function userWith(?array $permissions = null): User
    {
        $permissions ??= $this->reportRights('contracts');
        $role = Role::create(['key' => 'rep_'.uniqid(), 'name' => 'Report Test', 'is_system' => false]);
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }

        return User::factory()->create(['role' => $role->key]);
    }

    /** @return array<string, mixed> */
    private function breakdown(string $query = ''): array
    {
        return $this->actingAs($this->userWith())->getJson('/api/reports/contracts/renewals/breakdown'.$query)->assertOk()->json('data');
    }

    /** @return list<int> */
    private function ids(string ...$names): array
    {
        return array_map(fn (string $name) => $this->set[$name]->id, $names);
    }

    public function test_the_list_holds_open_contracts_inside_the_window_oldest_end_first(): void
    {
        $body = $this->actingAs($this->userWith())->getJson('/api/reports/tabular/contracts.renewals/rows')->assertOk()->json();

        $this->assertSame($this->ids('overdue', 'today', 'soon', 'ma', 'contact'), array_column($body['data'], 'id'));
        $rows = collect($body['data'])->keyBy('id');
        $this->assertSame(-10, $rows[$this->set['overdue']->id]['days_left']);
        $this->assertEquals(12000, $rows[$this->set['soon']->id]['yearly']);
        $this->assertSame('30, 7 วัน ยังไม่ได้ส่ง', $rows[$this->set['overdue']->id]['alerts']);
        $this->assertSame('ไม่ได้เปิดแจ้งเตือน', $rows[$this->set['today']->id]['alerts']);
        $this->assertSame(
            'ครบกำหนดวันนี้ ต่ออายุหรือกดสิ้นสุดสัญญา; เครื่องเช่าที่ยังไม่คืน 1 เครื่อง; ผู้ใช้ถือเครื่องอยู่ 1 เครื่อง ต้องเรียกคืนก่อน',
            $rows[$this->set['today']->id]['todo'],
        );
        $this->assertSame('/contracts?view='.$this->set['soon']->id, $rows[$this->set['soon']->id]['_links']['code']);

        $this->assertSame($this->ids('overdue', 'today', 'soon', 'ma', 'contact', 'waiting'), $this->rowIds('?within=180'));
        $this->assertSame($this->ids('overdue', 'today', 'soon'), $this->rowIds('?within=30'));
    }

    public function test_filters_narrow_the_list_and_the_breakdown_and_validate(): void
    {
        $this->assertSame($this->ids('today', 'soon', 'ma'), $this->rowIds('?type=hardware'));
        $this->assertSame($this->ids('contact'), $this->rowIds('?vendor_id='.$this->beta->id));

        $data = $this->breakdown('?type=hardware');
        $this->assertSame(3, $data['open_total']);
        $this->assertSame(0, $data['tiles']['closed_year']['count']);

        $user = $this->userWith();
        $this->actingAs($user)->getJson('/api/reports/tabular/contracts.renewals/rows?within=45')->assertUnprocessable()->assertJsonValidationErrors('within');
        $this->actingAs($user)->getJson('/api/reports/contracts/renewals/breakdown?closed=decade')->assertUnprocessable()->assertJsonValidationErrors('closed');
    }

    public function test_tiles_count_the_window_the_next_30_days_overdue_files_and_this_years_closures(): void
    {
        $tiles = $this->breakdown()['tiles'];

        $this->assertSame(3, $tiles['within']['count']);
        $this->assertEquals(42000, $tiles['within']['yearly']);
        $this->assertSame(['count' => 1, 'nearest' => ['id' => $this->set['soon']->id, 'code' => 'CT-C', 'days' => 20]], $tiles['soon']);
        $this->assertSame(['count' => 2, 'oldest' => ['id' => $this->set['overdue']->id, 'code' => 'CT-A', 'days' => 10]], $tiles['overdue']);
        $this->assertSame(['missing' => 6, 'open' => 7], $tiles['files']);
        $this->assertSame(['count' => 2, 'cancelled' => 1, 'expired' => 1], $tiles['closed_year']);

        $summary = collect($this->actingAs($this->userWith())->getJson('/api/reports/tabular/contracts.renewals/summary')->assertOk()->json('data.summary'))
            ->pluck('value', 'key');
        $this->assertSame(['total' => 5, 'within' => 3, 'within_30' => 1, 'overdue' => 2, 'no_file' => 6, 'closed_year' => 2], $summary->all());
    }

    public function test_months_hold_contracts_still_running_by_their_end_month(): void
    {
        $months = $this->breakdown()['months'];

        $this->assertCount(12, $months);
        $this->assertSame(['2026-09', '2027-08'], [$months[0]['month'], $months[11]['month']]);
        // Ending today is overdue, not this month's bar.
        $this->assertSame([], $months[0]['items']);
        $this->assertSame([[
            'id' => $this->set['soon']->id, 'code' => 'CT-C', 'name' => 'Contract CT-C', 'type' => 'hardware',
            'amount' => 1, 'date' => '2026-10-15', 'yearly' => 12000,
        ]], $months[1]['items']);
        $this->assertSame(['CT-D'], array_column($months[2]['items'], 'code'));
        $this->assertSame(['CT-F'], array_column($months[5]['items'], 'code'));
        // 400 days out is past the 12 months.
        $this->assertSame(4, array_sum(array_map(fn (array $m) => count($m['items']), $months)));
    }

    public function test_bands_split_open_contracts_by_time_left_with_yearly_cost_and_types(): void
    {
        $bands = collect($this->breakdown()['bands'])->keyBy('key');

        $this->assertSame(['overdue', 'd30', 'd90', 'd180', 'd365', 'later'], $bands->keys()->all());
        $this->assertSame(2, $bands['overdue']['total']);
        $this->assertEquals(36000, $bands['overdue']['yearly']);
        $this->assertSame(['software' => 1, 'hardware' => 1, 'service' => 0, 'connectivity' => 0, 'other' => 0], $bands['overdue']['types']);
        $this->assertSame(1, $bands['d30']['total']);
        $this->assertSame(2, $bands['d90']['total']);
        $this->assertSame(1, $bands['d180']['total']);
        $this->assertSame(0, $bands['d365']['total']);
        $this->assertSame(1, $bands['later']['total']);
        $this->assertSame(1, $bands['later']['types']['other']);
    }

    public function test_reminders_read_the_switches_and_the_alert_log(): void
    {
        $list = collect($this->breakdown('?within=180')['list'])->keyBy('id');
        $alert = fn (string $name) => $list[$this->set[$name]->id]['alert'];

        $this->assertSame(['days' => [30, 7], 'sent' => [], 'sent_at' => null, 'state' => 'missed', 'starts_in' => null], $alert('overdue'));
        $this->assertSame('off', $alert('today')['state']);
        $this->assertSame(['days' => [60], 'sent' => [60], 'sent_at' => '2026-08-20', 'state' => 'sent', 'starts_in' => null], $alert('soon'));
        // Inside its 90-day reminder with no log row: the sweep has not sent it.
        $this->assertSame('missed', $alert('ma')['state']);
        $this->assertSame([120, 30], $alert('contact')['days']);
        $this->assertSame('sent', $alert('contact')['state']);
        $this->assertSame(['days' => [60], 'sent' => [], 'sent_at' => null, 'state' => 'waiting', 'starts_in' => 90], $alert('waiting'));

        $this->assertTrue($list[$this->set['soon']->id]['in_reminder']);
        $this->assertFalse($list[$this->set['waiting']->id]['in_reminder']);
    }

    public function test_a_passed_threshold_without_a_log_row_is_missed_even_after_an_earlier_mail(): void
    {
        $make = fn (string $code, array $attributes) => Contract::create([
            'code' => $code, 'vendor_id' => $this->beta->id, 'name' => "Contract {$code}", 'type' => 'service',
            'start_date' => '2025-10-01', 'end_date' => '2026-10-20', 'value' => 100, 'billing_cycle' => 'monthly', 'notify_7' => false, ...$attributes,
        ]);
        // 25 days left: the 90-day mail went out, the 30-day one never did.
        $partial = $make('CT-P', ['notify_90' => true, 'notify_30' => true]);
        ContractAlertLog::create(['contract_id' => $partial->id, 'threshold' => 90, 'alerted_at' => '2026-07-22 07:00:00']);
        // One catch-up mail logs every threshold it covers; only the latest counts as sent.
        $caught = $make('CT-Q', ['notify_120' => true, 'notify_90' => true, 'notify_60' => true, 'notify_30' => true]);
        foreach ([120, 90, 60, 30] as $threshold) {
            ContractAlertLog::create(['contract_id' => $caught->id, 'threshold' => $threshold, 'alerted_at' => '2026-09-21 07:00:00']);
        }

        $list = collect($this->breakdown('?within=30')['list'])->keyBy('id');

        $this->assertSame('missed', $list[$partial->id]['alert']['state']);
        $this->assertSame(['days' => [120, 90, 60, 30], 'sent' => [30], 'sent_at' => '2026-09-21', 'state' => 'sent', 'starts_in' => null], $list[$caught->id]['alert']);
    }

    /** With every reminder off there is no window to wait for: a contract ending soon says to contact the vendor. */
    public function test_a_contract_with_no_reminders_is_not_waiting_for_a_window(): void
    {
        $silent = Contract::create([
            'code' => 'CT-S', 'vendor_id' => $this->beta->id, 'name' => 'Silent', 'type' => 'service',
            'start_date' => '2025-10-01', 'end_date' => '2026-09-30', 'value' => 100, 'billing_cycle' => 'monthly',
            'notify_60' => false, 'notify_30' => false, 'notify_7' => false,
        ]);

        $row = collect($this->breakdown('?within=30')['list'])->keyBy('id')[$silent->id];

        $this->assertSame('off', $row['alert']['state']);
        $this->assertSame('contact', $row['todo']['main']);
    }

    /** Once overdue the sweep only ever sends the "ended" mail, so earlier thresholds are not reported as missed. */
    public function test_an_overdue_contract_whose_ended_mail_went_out_is_sent_not_missed(): void
    {
        ContractAlertLog::create(['contract_id' => $this->set['overdue']->id, 'threshold' => 0, 'alerted_at' => '2026-09-16 07:00:00']);

        $alert = collect($this->breakdown('?within=30')['list'])->keyBy('id')[$this->set['overdue']->id]['alert'];

        $this->assertSame('sent', $alert['state']);
        $this->assertSame([0], $alert['sent']);
    }

    public function test_todo_follows_the_fixed_rules_in_order(): void
    {
        $list = collect($this->breakdown('?within=180')['list'])->keyBy('id');
        $todo = fn (string $name) => $list[$this->set[$name]->id]['todo'];

        $this->assertSame('overdue', $todo('overdue')['main']);
        $this->assertSame(['main' => 'today', 'rented' => 1, 'bought' => 0, 'held' => 1], $todo('today'));
        // Rented beats bought; the written-off rented device does not count.
        $this->assertSame(['main' => 'return_rent', 'rented' => 1, 'bought' => 1, 'held' => 0], $todo('soon'));
        $this->assertSame(['main' => 'decide_ma', 'rented' => 0, 'bought' => 1, 'held' => 0], $todo('ma'));
        $this->assertSame('contact', $todo('contact')['main']);
        $this->assertSame('not_yet', $todo('waiting')['main']);
    }

    public function test_closed_contracts_follow_the_card_range_and_count_the_bills_a_cancel_saved(): void
    {
        $closed = $this->breakdown()['closed'];

        $this->assertSame('year', $closed['range']);
        $this->assertSame(['CT-I', 'CT-H'], array_column($closed['rows'], 'code'));
        $this->assertSame(1, $closed['cancelled']);
        $this->assertSame(1, $closed['expired']);
        // 31 Jul and 31 Oct fall after the 15 Jun cancel and before the 30 Jan end.
        $this->assertEquals(6000, $closed['unpaid']);

        [$expired, $cancelled] = $closed['rows'];
        $this->assertSame(['kind' => 'expired', 'closed_at' => '2026-09-10', 'gap' => 10, 'reason' => null, 'by' => null], array_intersect_key($expired, array_flip(['kind', 'closed_at', 'gap', 'reason', 'by'])));
        $this->assertEquals(0, $expired['unpaid']);
        $this->assertSame('cancelled', $cancelled['kind']);
        $this->assertSame(-229, $cancelled['gap']);
        $this->assertEquals(6000, $cancelled['unpaid']);
        $this->assertSame('ย้ายผู้ให้บริการ', $cancelled['reason']);
        $this->assertSame('Somchai', $cancelled['by']);

        $this->assertSame(['CT-I', 'CT-H', 'CT-J'], array_column($this->breakdown('?closed=12m')['closed']['rows'], 'code'));
        $all = $this->breakdown('?closed=all')['closed'];
        $this->assertSame(['CT-I', 'CT-H', 'CT-J', 'CT-K'], array_column($all['rows'], 'code'));
        // CT-J: monthly from 1 Jan 2025, cancelled 20 Nov, so the 1 Dec bill was saved too.
        $this->assertEquals(7000, $all['unpaid']);
        // The card's range never moves the tiles.
        $this->assertSame(2, $this->breakdown('?closed=all')['tiles']['closed_year']['count']);
    }

    public function test_a_yearly_contract_from_29_february_bills_on_28_february_after_a_cancel(): void
    {
        $vendor = Vendor::create(['name' => 'Leap']);
        Contract::create([
            'code' => 'CT-L', 'vendor_id' => $vendor->id, 'name' => 'Leap', 'type' => 'service', 'start_date' => '2024-02-29',
            'end_date' => '2028-02-27', 'value' => 5000, 'billing_cycle' => 'yearly', 'cancelled_at' => '2026-01-10 09:00:00',
        ]);

        $closed = $this->breakdown('?closed=all&vendor_id='.$vendor->id)['closed'];

        // 28 Feb 2026 and 28 Feb 2027 are still ahead of the cancel; 29 Feb 2028 is past the end.
        $this->assertEquals(10000, $closed['rows'][0]['unpaid']);
    }

    public function test_an_empty_scope_draws_empty_figures(): void
    {
        $data = $this->breakdown('?vendor_id='.Vendor::create(['name' => 'Nobody'])->id);

        $this->assertSame(0, $data['open_total']);
        $this->assertSame([], $data['list']);
        $this->assertSame([], $data['closed']['rows']);
        $this->assertNull($data['tiles']['soon']['nearest']);
        $this->assertNull($data['tiles']['overdue']['oldest']);
        $this->assertSame(0, array_sum(array_column($data['bands'], 'total')));
    }

    public function test_breakdown_needs_contracts_view(): void
    {
        $this->actingAs($this->userWith([...$this->reportRights('assets')]))->getJson('/api/reports/contracts/renewals/breakdown')->assertForbidden();
    }

    public function test_the_file_carries_the_breakdown_as_sheets_and_the_rows_with_their_reminders(): void
    {
        $report = app(ContractRenewalsReport::class);
        $sections = $report->exportSections($this->userWith(), $report->resolveFilters(['closed' => 'all']));

        $this->assertSame(['สัญญาที่จะหมดในแต่ละเดือน', 'สัญญาตามเวลาที่เหลือ', 'สัญญาที่ปิดไปแล้ว (ทั้งหมด)'], array_column($sections, 'title'));
        $this->assertSame(['เกินกำหนด', 2, 36000.0, 1, 1, 0, 0, 0], $sections[1]['rows'][0]);
        $this->assertSame(['CT-I', 'CT-H', 'CT-J', 'CT-K'], array_column($sections[2]['rows'], 0));
        $this->assertSame('ยกเลิกแล้ว', $sections[2]['rows'][1][3]);

        Excel::fake();
        $this->actingAs($this->userWith())
            ->exportReport('/api/reports/tabular/contracts.renewals/export?format=xlsx&type=hardware')->assertAccepted();
        $this->assertExportStored('Report_contracts-renewals_2026-09-25.xlsx', function (TabularReportExport $export) {
            $sheets = $export->sheets();
            $rows = end($sheets);

            return $export->rows->count() === 3
                && in_array('สิ่งที่ต้องทำ', $rows->headings(), true)
                && count($sheets) === 5;
        });
    }

    public function test_pdf_export_streams_a_pdf(): void
    {
        $response = $this->actingAs($this->userWith())->exportReport('/api/reports/tabular/contracts.renewals/export?format=pdf');

        $response->assertOk();
        $this->assertSame('application/pdf', $response->headers->get('Content-Type'));
    }

    /** @return list<int> */
    private function rowIds(string $query = ''): array
    {
        return array_column($this->actingAs($this->userWith())->getJson('/api/reports/tabular/contracts.renewals/rows'.$query)->assertOk()->json('data'), 'id');
    }
}
