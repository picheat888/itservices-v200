<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Every detail screen is deep-linkable as ?view=<id>, and each one now answers a dead
 * link with a "record is not here" panel instead of a skeleton that never resolves.
 *
 * That panel keys off ONE thing: the detail endpoint answering 404. If an endpoint ever
 * starts answering 200 with an empty body (or 500), the SPA is back to a dialog that
 * waits for data that will never come — the exact bug this guards.
 */
class RecordNotFoundContractTest extends TestCase
{
    use RefreshDatabase;

    /**
     * The detail endpoints behind the deep links, by the id in the URL.
     *
     * @return list<array{0: string}>
     */
    public static function detailEndpoints(): array
    {
        return [
            ['/api/service-requests/99999'],
            ['/api/assets/99999'],
            ['/api/tickets/99999'],
            ['/api/employees/99999'],
            ['/api/contracts/99999'],
            ['/api/stock-items/99999'],
        ];
    }

    #[DataProvider('detailEndpoints')]
    public function test_a_detail_endpoint_answers_not_found_for_an_id_that_does_not_exist(string $endpoint): void
    {
        // Super admin: the point is the missing record, not a permission gate — a 403 here
        // would prove nothing about what the dialog does with a deleted record.
        $this->actingAs(User::factory()->create(['role' => 'super']))
            ->getJson($endpoint)
            ->assertNotFound();
    }
}
