<?php

namespace Tests\Feature;

use App\Enums\Request\ApprovalSkipReason;
use App\Services\Request\RequestNotificationService;
use ReflectionClass;
use Tests\TestCase;

/**
 * Why an approval step was skipped is written twice: once in the SPA dictionary, for the
 * Requests screen, and once in PHP, because the approval mail is composed on the server with
 * no reader whose language it could look up.
 *
 * Two copies of one sentence drift. The module→email map in the Notification controller did
 * exactly that and went on lying for weeks; this is the same shape of mistake waiting to
 * happen, so it gets the same kind of guard.
 */
class SkipReasonWordingTest extends TestCase
{
    /** @return array<string, string> the wording the mail uses */
    private function mailWording(): array
    {
        $constants = (new ReflectionClass(RequestNotificationService::class))->getConstants();

        return $constants['SKIP_REASONS'];
    }

    /** @return array<string, string> the wording the SPA shows, parsed out of the dictionary */
    private function screenWording(): array
    {
        $source = file_get_contents(base_path('resources/js/lang/en/requests.ts'));
        preg_match_all("/req_skip_(\w+):\s*'([^']*)'/", $source, $matches, PREG_SET_ORDER);

        return collect($matches)->mapWithKeys(fn (array $m) => [$m[1] => $m[2]])->all();
    }

    public function test_the_mail_and_the_screen_say_the_same_thing(): void
    {
        $this->assertNotEmpty($this->screenWording(), 'no req_skip_* keys found — the parse is broken, not the code');

        foreach ($this->mailWording() as $code => $sentence) {
            $this->assertArrayHasKey($code, $this->screenWording(), "req_skip_{$code} is missing from the dictionary");
            $this->assertSame(
                $this->screenWording()[$code],
                $sentence,
                "The mail and the Requests screen give different reasons for a {$code} skip. "
                .'One of the two was edited on its own.'
            );
        }
    }

    public function test_every_skip_reason_the_system_can_record_has_wording(): void
    {
        // A code with no sentence behind it reaches the reader as the bare enum value, which
        // says nothing to anybody outside this repository.
        foreach (ApprovalSkipReason::cases() as $case) {
            $this->assertArrayHasKey($case->value, $this->mailWording(), "{$case->value} has no wording in the mail");
            $this->assertArrayHasKey($case->value, $this->screenWording(), "{$case->value} has no wording on screen");
        }
    }
}
