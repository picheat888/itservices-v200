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

    /** UAT SET-02-09: the message names the field as the screen does, not "brand name". */
    public function test_a_too_long_application_name_is_named_as_on_screen(): void
    {
        Role::firstOrCreate(['key' => 'super'], ['name' => 'Administrator Template', 'is_system' => true]);
        $super = User::factory()->create(['role' => 'super']);
        $save = fn (string $lang) => $this->actingAs($super)
            ->putJson('/api/settings/branding', ['brand_name' => str_repeat('L', 61)], ['X-Locale' => $lang])
            ->assertUnprocessable()
            ->json('errors.brand_name');

        $this->assertSame(['ชื่อแอปพลิเคชัน ต้องยาวไม่เกิน 60 ตัวอักษร'], $save('th'));
        $this->assertSame(['The application name field must not be greater than 60 characters.'], $save('en'));
    }

    /** UAT SET-02-09, SET-06-06: the branding and request-choice fields carry the screen's names in both languages. */
    public function test_branding_and_request_choice_fields_have_screen_names(): void
    {
        $names = [
            'th' => ['brand_name' => 'ชื่อแอปพลิเคชัน', 'brand_sub' => 'ชื่อรอง', 'label_en' => 'ชื่อ (อังกฤษ)', 'label_th' => 'ชื่อ (ไทย)'],
            'en' => ['brand_name' => 'application name', 'brand_sub' => 'secondary name', 'label_en' => 'name (English)', 'label_th' => 'name (Thai)'],
        ];
        foreach ($names as $lang => $fields) {
            foreach ($fields as $field => $name) {
                $this->assertSame($name, trans("validation.attributes.{$field}", [], $lang), "{$lang} {$field}");
            }
        }
        $this->assertSame('ชื่อ (อังกฤษ) นี้มีอยู่ในระบบแล้ว', trans('validation.unique', ['attribute' => trans('validation.attributes.label_en', [], 'th')], 'th'));
    }
}
