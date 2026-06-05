<?php

namespace Tests\Feature;

use App\Models\EmailTemplate;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** The in-app preview must render through the real branded email layout. */
class EmailTemplatePreviewTest extends TestCase
{
    use RefreshDatabase;

    public function test_preview_renders_branded_wrapper_with_cta_and_filled_placeholders(): void
    {
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $admin = User::factory()->create(['role' => 'super']);

        $tpl = EmailTemplate::create([
            'key' => 'preview.sample',
            'name' => 'Preview Sample Digest',
            'subject' => 'Daily stock alert — {{count}} item(s)',
            'body_html' => '<p>Hi {{user.first_name}},</p><p>{{count}} item(s):</p>{{items}}',
            'enabled' => true,
        ]);

        $res = $this->actingAs($admin)->get("/api/email-templates/{$tpl->id}/preview");

        $res->assertOk();
        $html = $res->getContent();

        // Branded wrapper + eyebrow + CTA are present.
        $this->assertStringContainsString('Preview Sample Digest', $html); // eyebrow (template name)
        $this->assertStringContainsString('Open in portal', $html);             // Quick link CTA
        $this->assertStringContainsString('sign in', $html);                    // login note

        // Placeholders are substituted (no literal {{...}} leaks into the preview).
        $this->assertStringNotContainsString('{{items}}', $html);
        $this->assertStringNotContainsString('{{count}}', $html);
    }
}
