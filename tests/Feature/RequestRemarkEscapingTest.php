<?php

namespace Tests\Feature;

use App\Enums\Request\RequestOrigin;
use App\Enums\Request\RequestStatus;
use App\Enums\Request\RequestType;
use App\Jobs\SendTemplatedEmail;
use App\Models\Email\EmailTemplate;
use App\Models\Request\ServiceRequest;
use App\Models\User;
use App\Services\Request\RequestNotificationService;
use Database\Seeders\EmailTemplateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use ReflectionObject;
use Tests\TestCase;

/**
 * A rejection has to carry a reason — the endpoint requires one — so it is the free text in
 * this system most certain to reach a recipient, and it was going into the message raw.
 *
 * The renderer is a plain str_replace with no escaping of its own, so whatever an approver
 * typed became part of the HTML: a stray angle bracket broke the message, and a tag was
 * rendered as that tag.
 */
class RequestRemarkEscapingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(EmailTemplateSeeder::class);
    }

    /** Renders one template for one recipient, whatever extras the caller passes. */
    private function render(string $key, array $extras): string
    {
        $recipient = User::factory()->create(['email' => 'piches@inaba.co.th', 'name' => 'Piches Srisuk']);
        $request = ServiceRequest::create([
            'reference' => 'RQ-2026-9001',
            'type' => RequestType::Mobile->value,
            'origin' => RequestOrigin::Direct->value,
            'requester_name' => 'Piches Srisuk',
            'title' => 'Phone for the site supervisor',
            'reason' => 'On the road daily.',
            'status' => RequestStatus::Pending->value,
        ]);

        $service = app(RequestNotificationService::class);
        $method = (new ReflectionObject($service))->getMethod('emailUser');
        $method->setAccessible(true);
        $method->invoke($service, $recipient, $key, $request, $extras);

        $job = collect(Bus::dispatched(SendTemplatedEmail::class))
            ->first(fn (SendTemplatedEmail $queued) => $this->prop($queued, 'templateKey') === $key);

        $this->assertNotNull($job, "Nothing was queued for {$key}.");

        return $this->prop($job, 'html');
    }

    private function prop(object $job, string $name): string
    {
        $property = (new ReflectionObject($job))->getProperty($name);
        $property->setAccessible(true);

        return (string) $property->getValue($job);
    }

    public function test_a_rejection_reason_arrives_as_text_not_as_markup(): void
    {
        Bus::fake();
        EmailTemplate::where('key', 'request.rejected')->update(['body_html' => '<p>{{remark}}</p>']);

        $service = app(RequestNotificationService::class);
        $remark = (new ReflectionObject($service))->getMethod('remark');
        $remark->setAccessible(true);

        $html = $this->render('request.rejected', [
            'remark' => $remark->invoke($service, "Budget <b>not</b> approved\nTry next quarter."),
        ]);

        $this->assertStringContainsString('&lt;b&gt;not&lt;/b&gt;', $html);
        $this->assertStringNotContainsString('<b>not</b>', $html);
        // Written over two lines on purpose, so it stays that way.
        $this->assertStringContainsString('<br />', $html);
    }

    public function test_an_empty_remark_reads_as_a_dash(): void
    {
        $service = app(RequestNotificationService::class);
        $remark = (new ReflectionObject($service))->getMethod('remark');
        $remark->setAccessible(true);

        // Rejecting requires a reason, but the not-delivered path does not.
        $this->assertSame('-', $remark->invoke($service, null));
        $this->assertSame('-', $remark->invoke($service, '   '));
    }
}
