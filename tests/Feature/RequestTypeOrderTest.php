<?php

namespace Tests\Feature;

use App\Enums\Request\RequestType;
use App\Models\User;
use App\Support\DefaultWorkflows;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * How request types are ordered on screen is a decision, and it lives in four places: the
 * enum, the front end's REQUEST_TYPE_META, the seeded workflow definitions, and the Workflows
 * list endpoint. The enum is the one that decides; the rest must agree with it.
 *
 * Before this, the Workflows page sorted on the request_type column, so it read in
 * alphabetical order of an internal key — Computer next to Email, Hardware after Fileshare.
 */
class RequestTypeOrderTest extends TestCase
{
    use RefreshDatabase;

    /** @return list<string> */
    private function enumOrder(): array
    {
        return array_column(RequestType::cases(), 'value');
    }

    public function test_the_front_end_lists_types_in_the_same_order_as_the_enum(): void
    {
        $source = file_get_contents(base_path('resources/js/shared/lib/request-meta.ts'));
        $body = substr($source, strpos($source, 'REQUEST_TYPE_META'));
        $body = substr($body, 0, strpos($body, '};'));

        preg_match_all('/^\s{4}(\w+): \{ icon:/m', $body, $matches);

        // REQUEST_TYPES is derived from these keys, and the Requests filter renders that.
        $this->assertSame($this->enumOrder(), $matches[1]);
    }

    public function test_the_seeded_workflows_are_defined_in_the_same_order(): void
    {
        $this->assertSame($this->enumOrder(), array_keys(DefaultWorkflows::all()));
    }

    public function test_the_workflows_endpoint_returns_them_in_that_order(): void
    {
        $this->seed();
        $this->actingAs(User::factory()->create(['role' => 'super']));

        $returned = collect($this->getJson('/api/workflows')->assertOk()->json('data'))
            ->pluck('request_type')->all();

        $this->assertSame($this->enumOrder(), $returned);
    }
}
