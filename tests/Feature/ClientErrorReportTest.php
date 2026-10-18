<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// POST /api/client-errors: browser errors land in logs/frontend; every response carries X-Request-Id.
class ClientErrorReportTest extends TestCase
{
    use RefreshDatabase;

    private function frontendLog(): string
    {
        $file = "{$this->logRoot}/frontend/frontend-".now()->toDateString().'.log';

        return is_file($file) ? (string) file_get_contents($file) : '';
    }

    /** @return array<string, string> */
    private function report(array $overrides = []): array
    {
        return array_merge([
            'kind' => 'error',
            'message' => 'Cannot read properties of undefined (reading \'name\')',
            'stack' => "TypeError: Cannot read properties of undefined\n    at AssetRow (app.js:10:5)",
            'source' => 'app.js:10:5',
            'url' => '/assets?search=somchai',
            'request_id' => 'a1b2c3d4e5f6',
        ], $overrides);
    }

    public function test_a_guest_report_is_written_to_the_frontend_log(): void
    {
        $this->postJson('/api/client-errors', $this->report())
            ->assertStatus(202)
            ->assertJson(['message' => 'success']);

        $log = $this->frontendLog();
        $this->assertStringContainsString("Cannot read properties of undefined (reading 'name')", $log);
        $this->assertStringContainsString('"kind":"error"', $log);
        $this->assertStringContainsString('"server_request_id":"a1b2c3d4e5f6"', $log);
        $this->assertStringContainsString('"user_id":null', $log);
    }

    public function test_a_signed_in_report_carries_the_user_id(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/client-errors', $this->report())->assertStatus(202);

        $this->assertStringContainsString('"user_id":'.$user->id, $this->frontendLog());
    }

    public function test_a_report_without_a_message_or_with_an_unknown_kind_is_rejected(): void
    {
        $this->postJson('/api/client-errors', $this->report(['message' => '']))->assertStatus(422)->assertJsonValidationErrors('message');
        $this->postJson('/api/client-errors', $this->report(['kind' => 'other']))->assertStatus(422)->assertJsonValidationErrors('kind');
        $this->postJson('/api/client-errors', $this->report(['stack' => str_repeat('x', 5001)]))->assertStatus(422)->assertJsonValidationErrors('stack');

        $this->assertSame('', $this->frontendLog());
    }

    public function test_reports_are_limited_to_twenty_a_minute_per_address(): void
    {
        for ($i = 0; $i < 20; $i++) {
            $this->postJson('/api/client-errors', $this->report())->assertStatus(202);
        }

        $this->postJson('/api/client-errors', $this->report())->assertStatus(429);
    }

    public function test_every_response_carries_a_short_request_id(): void
    {
        $first = $this->getJson('/api/settings')->headers->get('X-Request-Id');
        $second = $this->getJson('/api/me')->headers->get('X-Request-Id');

        $this->assertMatchesRegularExpression('/^[0-9a-f]{12}$/', (string) $first);
        $this->assertMatchesRegularExpression('/^[0-9a-f]{12}$/', (string) $second);
        $this->assertNotSame($first, $second);
    }
}
