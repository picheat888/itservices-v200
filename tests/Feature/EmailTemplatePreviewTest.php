<?php

namespace Tests\Feature;

use App\Models\Email\EmailTemplate;
use App\Models\Permission\Role;
use App\Models\Settings\MailSetting;
use App\Models\User;
use App\Support\EmailTemplates;
use Database\Seeders\EmailTemplateSeeder;
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
            'body_html' => '<p>Hi {{user.first_name}},</p><p>{{count}} item(s):</p>{{stock.items_table}}',
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
        $this->assertStringNotContainsString('{{stock.items_table}}', $html);
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

        // The templates have to be put there on purpose. They used to arrive by
        // accident — inserted by the data migrations that the squashed baseline
        // dropped — and with the table empty this loop ran zero times and proved
        // nothing while still reporting green.
        $this->seed(EmailTemplateSeeder::class);
        $templates = EmailTemplate::all();
        $this->assertNotEmpty($templates, 'the standard templates are what this test is about');

        foreach ($templates as $template) {
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

    /**
     * Every standard template closes the paragraphs it opens — the whole catalogue, not
     * only asset.* (AssetHandoverEmailTest covers those, from when two of them broke at once).
     *
     * The way this breaks is always the same: somebody deletes a sentence in the editor and
     * takes the `</p>` at the end of it with them. request.approved carried exactly that,
     * with a `<br>` left hanging over nothing, until the wording was pulled in here.
     */
    public function test_every_standard_template_closes_the_tags_it_opens(): void
    {
        foreach (EmailTemplates::all() as $template) {
            $this->assertSame(
                preg_match_all('/<p(\s[^>]*)?>/i', $template['body_html']),
                substr_count(strtolower($template['body_html']), '</p>'),
                "{$template['key']} opens and closes a different number of paragraphs",
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
            'body_html' => '<p>Hi {{user.first_name}},</p>{{stock.items_table}}',
        ]);

        $res->assertOk();
        $html = $res->getContent();

        $this->assertStringContainsString('Draft Eyebrow', $html);  // eyebrow from unsaved name
        $this->assertStringContainsString('Open in portal', $html); // CTA present
        $this->assertStringNotContainsString('{{stock.items_table}}', $html); // placeholders filled
    }

    /**
     * The preview's From line is the configured sender, not one the screen made up.
     *
     * It used to print `no-reply@` + the brand name with the spaces taken out — plausible,
     * never checked against mail_settings, and the one line of a preview that promises to
     * match what the recipient sees.
     */
    public function test_the_template_list_carries_the_address_the_system_sends_from(): void
    {
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $admin = User::factory()->create(['role' => 'super']);

        MailSetting::current()->update([
            'host' => 'smtp.example.com',
            'from_address' => 'servicedesk@inaba-foods.co.th',
            'from_name' => 'IT Service Desk',
        ]);

        $this->actingAs($admin)->getJson('/api/email-templates')
            ->assertOk()
            ->assertJsonPath('mail.from_address', 'servicedesk@inaba-foods.co.th')
            ->assertJsonPath('mail.from_name', 'IT Service Desk');
    }

    /** With no SMTP configured the sender falls back to .env, exactly as a real send does. */
    public function test_an_unconfigured_install_shows_the_env_sender_rather_than_a_guess(): void
    {
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $admin = User::factory()->create(['role' => 'super']);

        config(['mail.from.address' => 'fallback@example.com']);

        $this->actingAs($admin)->getJson('/api/email-templates')
            ->assertOk()
            ->assertJsonPath('mail.from_address', 'fallback@example.com');
    }
}
