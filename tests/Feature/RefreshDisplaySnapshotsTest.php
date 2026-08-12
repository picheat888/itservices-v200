<?php

namespace Tests\Feature;

use App\Enums\Request\RequestOrigin;
use App\Enums\Request\RequestStatus;
use App\Enums\Request\RequestType;
use App\Models\Employee\Employee;
use App\Models\Request\ServiceRequest;
use Database\Seeders\RequestOptionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * requests:refresh-display brings the frozen `_display` snapshot back in step with the
 * schema — the labels and the Thai twin of a chosen value — and must never touch the
 * value itself. The value is what the requester chose; the label is our own wording, and
 * shortening it otherwise leaves older requests quoting words the app no longer uses.
 */
class RefreshDisplaySnapshotsTest extends TestCase
{
    use RefreshDatabase;

    /** A mobile request carrying a snapshot written before the current wording. */
    private function staleRequest(): ServiceRequest
    {
        $employee = Employee::create(['first_name' => 'Stale']);

        return ServiceRequest::create([
            'reference' => 'RQ-2026-9001',
            'type' => RequestType::Mobile->value,
            'origin' => RequestOrigin::Direct->value,
            'employee_id' => $employee->id,
            'requester_name' => $employee->name,
            'title' => 'Phone for the site supervisor',
            'reason' => 'On the road daily.',
            'status' => RequestStatus::Pending->value,
            'fields' => [
                '_display' => [
                    // Yesterday's wording, and no Thai value at all.
                    ['key' => 'device_id', 'label_en' => 'Device type', 'label_th' => 'อุปกรณ์ที่ต้องการ', 'value' => 'Tablet', 'mono' => false],
                    ['key' => 'sim', 'label_en' => 'SIM', 'label_th' => 'ซิม', 'value' => 'Yes', 'mono' => false],
                    // A field the schema no longer has: the snapshot is the only record of it.
                    ['key' => 'retired_field', 'label_en' => 'Old thing', 'label_th' => 'ของเก่า', 'value' => 'Whatever', 'mono' => false],
                ],
            ],
        ]);
    }

    /** @return array<string, array<string, mixed>> the refreshed rows, keyed by field key */
    private function rows(ServiceRequest $request): array
    {
        return collect(($request->fresh()->fields ?? [])['_display'] ?? [])->keyBy('key')->all();
    }

    public function test_it_refreshes_labels_and_fills_the_thai_value_without_touching_the_value(): void
    {
        $this->seed(RequestOptionSeeder::class);
        $request = $this->staleRequest();

        $this->artisan('requests:refresh-display')->assertSuccessful();

        $rows = $this->rows($request);
        // Labels now say what the schema says.
        $this->assertSame('Device', $rows['device_id']['label_en']);
        $this->assertSame('ประเภทอุปกรณ์', $rows['device_id']['label_th']);
        $this->assertSame('SIM & data plan', $rows['sim']['label_en']);
        // The Thai twin of the answer — from the managed row for device_id, from the schema
        // for the sim select.
        $this->assertSame('แท็บเล็ต', $rows['device_id']['value_th']);
        $this->assertSame('ต้องการ', $rows['sim']['value_th']);
        // …and the answers themselves are exactly as submitted.
        $this->assertSame('Tablet', $rows['device_id']['value']);
        $this->assertSame('Yes', $rows['sim']['value']);
    }

    public function test_a_field_the_schema_no_longer_has_is_left_verbatim(): void
    {
        $this->seed(RequestOptionSeeder::class);
        $request = $this->staleRequest();

        $this->artisan('requests:refresh-display')->assertSuccessful();

        // Nothing to refresh it from, and the snapshot is the only record that this was
        // ever asked — so it keeps its own words, including having no value_th key.
        $this->assertSame(
            ['key' => 'retired_field', 'label_en' => 'Old thing', 'label_th' => 'ของเก่า', 'value' => 'Whatever', 'mono' => false],
            $this->rows($request)['retired_field'],
        );
    }

    public function test_a_dry_run_writes_nothing(): void
    {
        $this->seed(RequestOptionSeeder::class);
        $request = $this->staleRequest();
        $before = $request->fields;

        $this->artisan('requests:refresh-display', ['--dry-run' => true])->assertSuccessful();

        $this->assertSame($before, $request->fresh()->fields);
    }

    public function test_a_second_run_changes_nothing_more(): void
    {
        $this->seed(RequestOptionSeeder::class);
        $request = $this->staleRequest();

        $this->artisan('requests:refresh-display')->assertSuccessful();
        $afterFirst = $request->fresh()->fields;
        $this->artisan('requests:refresh-display')->assertSuccessful();

        // Re-runnable: a row with no Thai form keeps an explicit null rather than being
        // rewritten (and re-counted) on every future run.
        $this->assertSame($afterFirst, $request->fresh()->fields);
    }
}
