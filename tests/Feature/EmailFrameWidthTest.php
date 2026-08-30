<?php

namespace Tests\Feature;

use App\Mail\TemplatedMail;
use App\Models\Email\EmailLog;
use App\Models\Email\EmailTemplate;
use App\Models\Permission\Role;
use App\Models\User;
use App\Support\EmailTemplates;
use Database\Seeders\EmailTemplateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Most mail is a paragraph and a reference and fits the standard frame. A template may ask
 * for a wider one (EmailTemplates::widthFor) because of what it carries — the weekly contract
 * summary has six columns including a vendor and a contract name.
 *
 * Four things render that frame: the mail itself, the saved-template preview, the live
 * preview in the edit drawer, and the delivery log's copy of what was sent. A width that
 * applied to only some of them would mean an author lays out a table against a preview the
 * recipient never sees, so all four are checked here rather than just the send.
 */
class EmailFrameWidthTest extends TestCase
{
    use RefreshDatabase;

    private const WIDE = 'contract.weekly_digest';

    private const ORDINARY = 'ticket.created';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(EmailTemplateSeeder::class);
    }

    private function admin(): User
    {
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);

        return User::factory()->create(['role' => 'super']);
    }

    /** The pixel width of the outer frame in a rendered message. */
    private function frameWidthOf(string $html): int
    {
        $this->assertMatchesRegularExpression(
            '/class="container" width="(\d+)"/',
            $html,
            'The rendered mail has no container frame at all.'
        );
        preg_match('/class="container" width="(\d+)"/', $html, $matches);

        return (int) $matches[1];
    }

    public function test_the_weekly_contract_summary_asks_for_a_wider_frame_than_the_standard(): void
    {
        $this->assertSame(980, EmailTemplates::widthFor(self::WIDE));
        $this->assertSame(EmailTemplates::DEFAULT_WIDTH, EmailTemplates::widthFor(self::ORDINARY));
        // A test send and anything with no template at all still get the standard frame.
        $this->assertSame(EmailTemplates::DEFAULT_WIDTH, EmailTemplates::widthFor(null));
    }

    public function test_the_mail_itself_is_rendered_at_the_width_its_template_asks_for(): void
    {
        $wide = (new TemplatedMail('Subject', '<p>Body</p>', null, null, null, 'IT', null, EmailTemplates::widthFor(self::WIDE)))
            ->render();
        $this->assertSame(980, $this->frameWidthOf($wide));

        $ordinary = (new TemplatedMail('Subject', '<p>Body</p>', null, null, null, 'IT', null, EmailTemplates::widthFor(self::ORDINARY)))
            ->render();
        $this->assertSame(EmailTemplates::DEFAULT_WIDTH, $this->frameWidthOf($ordinary));
    }

    public function test_the_saved_template_preview_matches_the_mail(): void
    {
        $this->actingAs($this->admin());

        foreach ([self::WIDE => 980, self::ORDINARY => EmailTemplates::DEFAULT_WIDTH] as $key => $expected) {
            $template = EmailTemplate::where('key', $key)->firstOrFail();
            $html = $this->get("/api/email-templates/{$template->id}/preview")->assertOk()->getContent();

            $this->assertSame($expected, $this->frameWidthOf($html), "Preview of {$key} is the wrong width.");
        }
    }

    public function test_the_live_edit_preview_matches_the_mail(): void
    {
        $this->actingAs($this->admin());

        // What the edit drawer posts while somebody types: unsaved wording, plus the key,
        // which is the only thing that can tell this endpoint which frame to draw.
        $wide = $this->post('/api/email-templates/render-preview', [
            'key' => self::WIDE, 'name' => 'Draft', 'subject' => 'Draft', 'body_html' => '<p>Draft</p>',
        ])->assertOk()->getContent();
        $this->assertSame(980, $this->frameWidthOf($wide));

        $ordinary = $this->post('/api/email-templates/render-preview', [
            'key' => self::ORDINARY, 'name' => 'Draft', 'subject' => 'Draft', 'body_html' => '<p>Draft</p>',
        ])->assertOk()->getContent();
        $this->assertSame(EmailTemplates::DEFAULT_WIDTH, $this->frameWidthOf($ordinary));
    }

    public function test_the_delivery_log_shows_a_message_at_the_width_it_was_sent_at(): void
    {
        $this->actingAs($this->admin());

        $log = EmailLog::create([
            'template_key' => self::WIDE,
            'to_email' => 'it@inaba.co.th',
            'subject' => 'Contract Management: 2 expiring, 1 overdue',
            'body_html' => '<p>Body</p>',
            'status' => 'sent',
        ]);

        // The log rebuilds the frame around the stored body — the layout is the same on
        // every send and so is not itself stored.
        $html = $this->getJson("/api/email-logs/{$log->id}")->assertOk()->json('data.preview_html');
        $this->assertSame(980, $this->frameWidthOf((string) $html));
    }
}
