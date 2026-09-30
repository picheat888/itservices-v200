<?php

namespace Tests\Feature;

use App\Models\Permission\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Server messages follow the reader's language (SetRequestLocale + lang/th). They used to be
 * English whatever the SPA was in, because APP_LOCALE is en and nothing said otherwise.
 */
class RequestLocaleTest extends TestCase
{
    use RefreshDatabase;

    private function invalidCompanySave(array $headers = []): array
    {
        Role::firstOrCreate(['key' => 'super'], ['name' => 'Administrator Template', 'is_system' => true]);
        $super = User::factory()->create(['role' => 'super']);

        return $this->actingAs($super)
            ->putJson('/api/settings/company', ['tax_id' => '12AB'], $headers)
            ->assertUnprocessable()
            ->json('errors.tax_id');
    }

    public function test_a_thai_reader_gets_thai_validation_messages(): void
    {
        $this->assertSame(['เลขประจำตัวผู้เสียภาษี ต้องเป็นตัวเลข 13 หลัก'], $this->invalidCompanySave(['X-Locale' => 'th']));
    }

    public function test_english_stays_english_and_no_header_keeps_the_default(): void
    {
        $this->assertSame(['The tax id field must be 13 digits.'], $this->invalidCompanySave(['X-Locale' => 'en']));
        $this->assertSame(['The tax id field must be 13 digits.'], $this->invalidCompanySave());
    }

    public function test_an_unknown_language_is_ignored(): void
    {
        $this->assertSame(['The tax id field must be 13 digits.'], $this->invalidCompanySave(['X-Locale' => 'fr']));
    }
}
