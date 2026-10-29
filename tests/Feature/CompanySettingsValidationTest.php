<?php

namespace Tests\Feature;

use App\Models\Settings\AppSetting;
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

    /** A new install shows empty company fields (the samples are placeholders), so no sample ever reaches a PDF. */
    public function test_a_new_install_has_no_sample_company_details(): void
    {
        $data = $this->actingAs($this->admin())->getJson('/api/settings')->assertOk()->json('data');

        foreach (['company_name', 'legal_name', 'tax_id', 'industry', 'address'] as $key) {
            $this->assertSame('', $data[$key], $key);
        }
        $this->assertSame('Thailand', $data['country']);
        $this->assertSame('THB', $data['currency']);
    }

    public function test_timezone_is_not_a_setting_anymore(): void
    {
        // The app runs on local wall time fixed by .env (APP_TIMEZONE). Sent along
        // with a valid payload the field is simply ignored — never persisted, and
        // no longer part of the settings payload at all.
        $this->actingAs($this->admin())
            ->putJson('/api/settings/company', array_merge($this->validPayload(), ['timezone' => 'Asia/Tokyo']))
            ->assertOk();

        $this->assertNull(AppSetting::get('timezone'));
        $this->assertArrayNotHasKey('timezone', $this->getJson('/api/settings')->json('data'));
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
