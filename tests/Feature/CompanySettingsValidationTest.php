<?php

namespace Tests\Feature;

use App\Models\AppSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CompanySettingsValidationTest extends TestCase
{
    use RefreshDatabase;

    /** A super admin bypasses the settings.company permission gate. */
    private function admin(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    /** @return array<string, string> A complete, valid company payload. */
    private function validPayload(): array
    {
        return [
            'company_name' => 'Acme Co., Ltd.',
            'legal_name' => 'บริษัท แอคมี จำกัด',
            'tax_id' => '0105556000000',
            'industry' => 'Manufacturing',
            'address' => '123 Main Street, Bangkok',
        ];
    }

    public function test_full_valid_company_payload_is_saved(): void
    {
        $this->actingAs($this->admin())
            ->putJson('/api/settings/company', $this->validPayload())
            ->assertOk()
            ->assertJsonPath('data.company_name', 'Acme Co., Ltd.');

        $this->assertSame('0105556000000', AppSetting::get('tax_id'));
    }

    public function test_required_company_fields_cannot_be_blank_when_present(): void
    {
        $payload = array_merge($this->validPayload(), [
            'company_name' => '',
            'legal_name' => '',
            'industry' => '',
            'address' => '',
        ]);

        $this->actingAs($this->admin())
            ->putJson('/api/settings/company', $payload)
            ->assertStatus(422)
            ->assertJsonValidationErrors(['company_name', 'legal_name', 'industry', 'address']);
    }

    public function test_tax_id_must_be_exactly_13_digits(): void
    {
        foreach (['123', '01055560000001', 'ABCDEFGHIJKLM', '010-5556-0000'] as $badTaxId) {
            $this->actingAs($this->admin())
                ->putJson('/api/settings/company', array_merge($this->validPayload(), ['tax_id' => $badTaxId]))
                ->assertStatus(422)
                ->assertJsonValidationErrors(['tax_id']);
        }
    }

    public function test_partial_update_still_allowed_for_untouched_fields(): void
    {
        // Only company_name sent — other "required" rules use `sometimes`, so they
        // are skipped when their key is absent (keeps partial PATCH-style saves working).
        $this->actingAs($this->admin())
            ->putJson('/api/settings/company', ['company_name' => 'Solo Co.'])
            ->assertOk()
            ->assertJsonPath('data.company_name', 'Solo Co.');
    }
}
