<?php

// Input sent as an array where text is expected (?status[]=x, username[]) is ignored or refused with 422, never a 500.

namespace Tests\Feature;

use App\Models\Employee\Employee;
use App\Models\Stock\StockItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ListFilterArrayInputTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_email_log_ignores_an_array_status(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));

        $this->getJson('/api/email-logs?status[]=sent')->assertOk()->assertJsonPath('meta.total', 0);
    }

    public function test_the_stock_item_list_ignores_an_array_status(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));

        $this->getJson('/api/stock-items?status[]=low')->assertOk();
        $this->getJson('/api/stock-items?category[]=Toner&warehouse[]=Main')->assertOk();
        $this->getJson('/api/stock-items?all=1&status[]=low')->assertOk();
    }

    public function test_the_ticket_list_ignores_an_array_sort(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));

        $this->getJson('/api/tickets?sort[]=sla_due')->assertOk();
    }

    public function test_the_stock_history_pdf_prints_the_summary_for_an_array_view(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $item = StockItem::create(['sku' => 'SKU-ARR-1', 'name' => 'Toner', 'current_stock' => 0, 'min_stock' => 0, 'max_stock' => 5]);

        $this->get("/pdf/stock-items/{$item->id}/history?v[]=lots")->assertOk();
    }

    public function test_a_request_with_an_array_type_is_refused_with_422(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));

        $this->postJson('/api/service-requests', ['type' => ['access'], 'reason' => 'Need it for the new project'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('type');
    }

    public function test_software_with_an_array_product_key_is_refused_with_422(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));

        $this->postJson('/api/software', ['name' => 'Office', 'product_key' => ['ABC-123']])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('product_key');
    }

    public function test_credentials_with_an_array_username_are_refused_with_422(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $employee = Employee::create(['first_name' => 'Array', 'last_name' => 'Input']);

        $this->postJson("/api/employees/{$employee->id}/credentials", ['username' => ['array.input']])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('username');
    }

    public function test_credentials_with_an_array_username_still_answer_403_without_the_right(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'user']));
        $employee = Employee::create(['first_name' => 'Array', 'last_name' => 'Input']);

        $this->postJson("/api/employees/{$employee->id}/credentials", ['username' => ['array.input']])->assertForbidden();
    }
}
