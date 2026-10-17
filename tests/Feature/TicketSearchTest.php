<?php

// The Ticket list search finds the assignee, requester code, related asset and request number.

namespace Tests\Feature;

use App\Models\Asset\Asset;
use App\Models\Employee\Employee;
use App\Models\Request\ServiceRequest;
use App\Models\Ticket\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TicketSearchTest extends TestCase
{
    use RefreshDatabase;

    /** @return list<int> */
    private function ids(string $search): array
    {
        $rows = $this->getJson('/api/tickets?search='.urlencode($search))->assertOk()->json('data');

        return array_column($rows, 'id');
    }

    public function test_ticket_search_finds_assignee_requester_code_asset_and_request_number(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $assigneeEmp = Employee::create(['code' => 'EMP-AS1', 'first_name' => 'Kittipong', 'last_name' => 'Tech', 'first_name_th' => 'กิตติพงษ์', 'last_name_th' => 'ช่าง']);
        $assignee = User::factory()->create(['name' => 'Kittipong Tech', 'employee_id' => $assigneeEmp->id]);
        $byAssignee = Ticket::factory()->create(['assignee_id' => $assignee->id]);
        $requester = Employee::create(['code' => 'EMP-RQ9', 'first_name' => 'Napat', 'last_name' => 'User']);
        $byRequesterCode = Ticket::factory()->create(['requester_id' => $requester->id]);
        $asset = Asset::factory()->create(['asset_code' => 'NB-7788', 'tag' => 'FIN-LAPTOP-7']);
        $byAsset = Ticket::factory()->create(['related_asset_id' => $asset->id]);
        $byRequest = Ticket::factory()->create();
        ServiceRequest::create([
            'reference' => 'RQ-2026-0777', 'type' => 'computer', 'origin' => 'direct', 'requester_name' => 'Somchai',
            'title' => 'Request', 'reason' => 'Needed for work.', 'status' => 'approved', 'ticket_id' => $byRequest->id,
        ]);
        Ticket::factory()->create();

        $this->assertSame([$byAssignee->id], $this->ids('ช่าง กิตติพงษ์'));
        $this->assertSame([$byAssignee->id], $this->ids('Kittipong'));
        $this->assertSame([$byRequesterCode->id], $this->ids('EMP-RQ9'));
        $this->assertSame([$byAsset->id], $this->ids('NB-7788'));
        $this->assertSame([$byAsset->id], $this->ids('FIN-LAPTOP'));
        $this->assertSame([$byRequest->id], $this->ids('RQ-2026-0777'));
    }
}
