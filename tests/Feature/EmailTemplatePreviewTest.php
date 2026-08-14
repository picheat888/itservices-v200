<?php

namespace Tests\Feature;

use App\Models\Email\EmailTemplate;
use App\Models\Permission\Role;
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
            'subject' => 'Daily stock alert โ€” {{count}} item(s)',
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

    /**
     * Every variable any standard template uses has a sample value.
     *
     * The sample data lives beside the controller, the variables live in the catalog, and
     * adding one to a template without the other shows the administrator a raw
     * {{ticket.requester}} where the recipient will see a name — which is exactly what
     * happened when the new-case mail started naming who raised the case.
     */
    public function test_no_standard_template_previews_with_an_unfilled_variable(): void
    {
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $admin = User::factory()->create(['role' => 'super']);

        foreach (EmailTemplate::all() as $template) {
            $html = $this->actingAs($admin)
                ->get("/api/email-templates/{$template->id}/preview")
                ->assertOk()
                ->getContent();

            preg_match_all('/\{\{\s*([\w.]+)\s*\}\}/', $html, $matches);
            $this->assertSame(
                [],
                array_unique($matches[1]),
                "Template {$template->key} previews with variables that have no sample value.",
            );
        }
    }

    public function test_render_preview_renders_unsaved_draft_content(): void
    {
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $admin = User::factory()->create(['role' => 'super']);

        $res = $this->actingAs($admin)->post('/api/email-templates/render-preview', [
            'name' => 'Draft Eyebrow',
            'subject' => 'Subject {{count}}',
            'body_html' => '<p>Hi {{user.first_name}},</p>{{items}}',
        ]);

        $res->assertOk();
        $html = $res->getContent();

        $this->assertStringContainsString('Draft Eyebrow', $html);  // eyebrow from unsaved name
        $this->assertStringContainsString('Open in portal', $html); // CTA present
        $this->assertStringNotContainsString('{{items}}', $html);   // placeholders filled
    }
}
