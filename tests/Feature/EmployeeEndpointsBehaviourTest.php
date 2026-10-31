<?php

// Employee directory, overview, import files and the detail tabs: answer shapes, the reference CSV and the preview counts.

namespace Tests\Feature;

use App\Models\Asset\Asset;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Request\ServiceRequest;
use App\Models\Ticket\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

class EmployeeEndpointsBehaviourTest extends TestCase
{
    use RefreshDatabase;

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    public function test_the_directory_and_overview_answer_shapes(): void
    {
        $this->actingAs($this->super());
        Employee::create(['first_name' => 'Somchai', 'last_name' => 'Dee', 'status' => 'active']);

        $this->assertSame(['total', 'per_page', 'current_page', 'last_page'], array_keys($this->getJson('/api/employees')->assertOk()->json('meta')));
        $this->assertSame(
            ['total', 'new_hires', 'active', 'resigned', 'resigned_in_period', 'no_account', 'hires_trend', 'recent', 'recent_resignations'],
            array_keys($this->getJson('/api/employees/summary')->assertOk()->json()),
        );
    }

    public function test_the_detail_tabs_row_keys(): void
    {
        $this->actingAs($this->super());
        $employee = Employee::create(['first_name' => 'Somchai', 'last_name' => 'Dee', 'status' => 'active']);
        Asset::factory()->create(['status' => 'deployed', 'owner_employee_id' => $employee->id]);
        Ticket::factory()->create(['requester_id' => $employee->id]);
        ServiceRequest::create(['reference' => 'RQ-2026-0001', 'type' => 'computer', 'origin' => 'direct', 'requester_name' => 'Somchai',
            'title' => 'Request', 'reason' => 'Needed.', 'status' => 'pending', 'employee_id' => $employee->id]);

        $this->assertSame(['id', 'asset_code', 'tag', 'model', 'type', 'type_th', 'serial', 'status', 'owned_since'], array_keys($this->getJson("/api/employees/{$employee->id}/assets")->assertOk()->json('data.0')));
        $this->assertSame(['id', 'ticket_no', 'subject', 'category', 'priority', 'status', 'created_at'], array_keys($this->getJson("/api/employees/{$employee->id}/tickets")->assertOk()->json('data.0')));
        $this->assertSame(['id', 'reference', 'type', 'origin', 'status', 'created_at'], array_keys($this->getJson("/api/employees/{$employee->id}/requests")->assertOk()->json('data.0')));
        $this->getJson("/api/employees/{$employee->id}/access")->assertOk();
    }

    public function test_the_reference_csv_header_and_bom(): void
    {
        $this->actingAs($this->super());
        Department::create(['name' => 'Information Technology', 'tag' => 'IT']);

        $content = $this->get('/api/employees/import-reference')->assertOk()->streamedContent();

        $this->assertStringStartsWith("\xEF\xBB\xBF", $content);
        $this->assertStringContainsString("column,value,in_department,also_accepted\n", $content);
        $this->assertMatchesRegularExpression('/^department,"Information Technology",,"IT \| DEP-\d{4}"$/m', $content);
    }

    public function test_the_import_preview_meta_and_bad_rows_first(): void
    {
        $this->actingAs($this->super());
        $csv = "first_name,last_name,email,legacy_column\nGood,Row,good@example.com,x\n,Missing,bad,y\n";
        $file = UploadedFile::fake()->createWithContent('employees.csv', $csv);

        $response = $this->post('/api/employees/import/preview', ['file' => $file], ['Accept' => 'application/json'])->assertOk();

        $this->assertSame(['total', 'valid', 'invalid', 'shown', 'ignored_columns'], array_keys($response->json('meta')));
        $this->assertSame(['legacy_column'], $response->json('meta.ignored_columns'));
        $this->assertSame(2, $response->json('meta.total'));
    }
}
