<?php

namespace Tests\Feature;

use App\Support\EmailTemplates;
use Tests\TestCase;

/**
 * Every system email is supposed to end in a button that opens the thing it is about.
 *
 * The preview on the Email screen draws one unconditionally, so a template whose sender
 * passes no actionUrl looks finished on the page while the message that leaves has nothing
 * to click. Five ticket mails, both contract alerts and the new-employee mail shipped that
 * way, and nothing on screen could have shown it.
 *
 * This reads the send sites rather than sending: a source scan is crude, but it is the only
 * thing that fails when somebody adds a NEW sendTemplate() call and forgets the URL — which
 * is exactly how the seven above happened.
 */
class EmailActionButtonTest extends TestCase
{
    /** Every file that sends mail. */
    private function senders(): array
    {
        return array_merge(
            glob(base_path('app/Services/*/*.php')),
            glob(base_path('app/Console/Commands/*.php')),
        );
    }

    /**
     * The arguments of every sendTemplate() call, paired with whether that call passes a URL.
     *
     * @return list<array{file: string, args: string, url: bool}>
     */
    private function calls(): array
    {
        $calls = [];

        foreach ($this->senders() as $file) {
            $source = file_get_contents($file);
            if (! preg_match_all('/sendTemplate\(\s*(.*?)\);/s', $source, $matches)) {
                continue;
            }

            foreach ($matches[1] as $args) {
                $calls[] = [
                    'file' => basename($file),
                    'args' => $args,
                    // The four shapes a destination takes in this codebase: url(), one of
                    // the little helpers that build one (ownerUrl, staffUrl, stockUrl…),
                    // config('app.url') composed by hand, or a URL passed in by the caller.
                    'url' => (bool) preg_match("/\burl\(|Url\(|config\('app\.url'\)|\\\$actionUrl/", $args),
                ];
            }
        }

        return $calls;
    }

    public function test_every_send_passes_somewhere_for_the_reader_to_go(): void
    {
        $this->assertNotEmpty($this->calls(), 'no sendTemplate() calls found — the scan is broken, not the code');

        foreach ($this->calls() as $call) {
            $this->assertTrue(
                $call['url'],
                "A sendTemplate() call in {$call['file']} passes no action URL, so its mail arrives with no button "
                ."— while the preview draws one anyway. Pass a url() and a label.\n\n".trim($call['args'])
            );
        }
    }

    public function test_the_helpers_that_forward_a_url_are_given_one_by_every_caller(): void
    {
        // emailEach()/emailUser()/emailRecipients() take the URL as a parameter, so the scan
        // above sees "$actionUrl" and is satisfied — the real question is what the callers pass.
        $helpers = [
            'app/Services/Stock/StockNotificationService.php' => 'emailEach',
            'app/Services/Asset/AssetService.php' => 'emailEach',
        ];

        foreach ($helpers as $path => $helper) {
            $source = file_get_contents(base_path($path));
            preg_match_all('/\$this->'.$helper.'\((.*?)\);/s', $source, $matches);

            foreach ($matches[1] as $args) {
                // The declaration itself is not a call site.
                if (str_contains($args, 'Collection $recipients') || str_contains($args, 'iterable $recipients')) {
                    continue;
                }
                $this->assertMatchesRegularExpression(
                    '/url\(|Url\(|\'\/[a-z-]+\'/',
                    $args,
                    "A {$helper}() call in {$path} passes no action URL.\n\n".trim($args)
                );
            }
        }
    }

    public function test_the_catalogue_and_the_senders_know_the_same_templates(): void
    {
        // A template nothing sends is dead weight in the editor; a key nothing defines sends
        // silently nothing at all, because sendTemplate() returns early on a missing row.
        $sent = [];
        foreach ($this->calls() as $call) {
            if (preg_match("/^\s*'([a-z_]+\.[a-z_]+)'/", $call['args'], $m)) {
                $sent[] = $m[1];
            }
        }

        $defined = array_column(EmailTemplates::all(), 'key');

        foreach (array_unique($sent) as $key) {
            $this->assertContains($key, $defined, "{$key} is sent but has no standard definition — it will send nothing.");
        }
    }
}
