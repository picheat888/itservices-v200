<?php

// A finished report export mails its owner a signed download link, kept 30 days; files build on their own queue.

namespace Tests\Feature\Report;

use App\Jobs\GenerateReportExport;
use App\Jobs\SendScheduledReport;
use App\Mail\TemplatedMail;
use App\Models\Asset\Asset;
use App\Models\AuditLog;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Report\ReportExport;
use App\Models\User;
use Database\Seeders\EmailTemplateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Tests\Concerns\GrantsReports;
use Tests\TestCase;

class ReportExportEmailTest extends TestCase
{
    use GrantsReports;
    use RefreshDatabase;

    private const OVERVIEW = '/api/reports/tabular/assets.overview/export?format=pdf';

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        Storage::fake('local');
        Mail::fake();
        $this->seed(EmailTemplateSeeder::class);
        $this->travelTo('2026-09-25 10:00:00');
    }

    private function exporter(string $email = 'reader@example.com'): User
    {
        $role = Role::create(['key' => 'rep_'.uniqid(), 'name' => 'Report Test', 'is_system' => false]);
        foreach ($this->reportRights('assets') as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }

        return User::factory()->create(['role' => $role->key, 'email' => $email, 'name' => 'Somchai Reader']);
    }

    /** @return array{0: User, 1: ReportExport, 2: string} the owner, the ready export and the emailed link */
    private function readyExport(): array
    {
        Asset::factory()->create(['status' => 'ready']);
        $user = $this->exporter();
        $id = $this->actingAs($user)->postJson(self::OVERVIEW)->assertAccepted()->json('data.id');

        $link = null;
        Mail::assertSent(TemplatedMail::class, function (TemplatedMail $mail) use (&$link) {
            $link = $mail->actionUrl;

            return $mail->hasTo('reader@example.com');
        });

        return [$user, ReportExport::findOrFail($id), (string) $link];
    }

    public function test_report_files_build_on_their_own_queue(): void
    {
        $this->assertSame('reports', (new GenerateReportExport(1))->queue);
        $this->assertSame('reports', (new SendScheduledReport(1, now()->toIso8601String()))->queue);
    }

    public function test_a_ready_export_is_kept_30_days_and_mailed_with_a_download_link(): void
    {
        [, $export, $link] = $this->readyExport();

        $this->assertSame('2026-10-25 10:00:00', $export->expires_at->format('Y-m-d H:i:s'));
        $this->assertStringContainsString("/files/report-exports/{$export->id}?expires=", $link);
        $this->assertStringContainsString('signature=', $link);
        Mail::assertSent(TemplatedMail::class, fn (TemplatedMail $mail) => str_contains($mail->subjectLine, 'your PDF file is ready')
            && str_contains($mail->bodyHtml, 'Somchai')
            && str_contains($mail->bodyHtml, $export->file_name));
    }

    public function test_the_owner_downloads_from_the_link_and_it_is_audit_logged(): void
    {
        [$user, $export, $link] = $this->readyExport();

        $response = $this->actingAs($user)->get($link)->assertOk();
        $this->assertSame('application/pdf', $response->headers->get('Content-Type'));

        $log = AuditLog::query()->where('action', 'Downloaded report export')->latest('id')->firstOrFail();
        $this->assertSame('email', $log->details['via']);
        $this->assertSame($export->id, $log->details['export_id']);
        $this->assertSame(sprintf('RPT-260925-%04d', $export->id), $log->details['document_no']);
    }

    public function test_the_link_is_refused_to_anyone_else_when_tampered_or_after_expiry(): void
    {
        [$user, $export, $link] = $this->readyExport();

        $this->actingAs($this->exporter('colleague@example.com'))->get($link)->assertNotFound();
        $this->actingAs($user)->get(str_replace('signature=', 'signature=x', $link))->assertForbidden();
        $this->actingAs($user)->get("/files/report-exports/{$export->id}")->assertForbidden();

        $this->travel(31)->days();
        // A reader 31 days later arrives on a new session
        $this->flushSession();
        $this->defaultCookies = [];
        $this->actingAs($user)->get($link)->assertForbidden();
    }

    public function test_a_signed_out_reader_is_sent_to_sign_in_and_back_to_the_link(): void
    {
        [, , $link] = $this->readyExport();
        $path = parse_url($link, PHP_URL_PATH).'?'.parse_url($link, PHP_URL_QUERY);

        $this->app['auth']->forgetGuards();
        $this->get($link)->assertRedirect('/login?next='.rawurlencode($path));
    }
}
