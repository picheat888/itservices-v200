<?php

namespace Tests\Unit;

use App\Enums\Request\ApprovalSkipReason;
use PHPUnit\Framework\TestCase;

/**
 * A skip reason is stored as a code and written out by the SPA, which means a new
 * enum case has to be given wording in three places or the trail renders an empty
 * amber note — exactly what NoMatchingPosition did after it was added here and
 * nowhere else. This test walks the enum and checks each one is spelled out, so
 * the gap is a failing test rather than a blank line somebody notices in a
 * screenshot weeks later.
 */
class SkipReasonWordingTest extends TestCase
{
    public function test_every_skip_reason_is_typed_and_translated(): void
    {
        $root = dirname(__DIR__, 2);
        $types = (string) file_get_contents($root.'/resources/js/shared/types/index.ts');
        $labels = (string) file_get_contents($root.'/resources/js/shared/lib/request-meta.ts');
        $en = (string) file_get_contents($root.'/resources/js/lang/en/requests.ts');
        $th = (string) file_get_contents($root.'/resources/js/lang/th/requests.ts');

        foreach (ApprovalSkipReason::cases() as $case) {
            $code = $case->value;

            $this->assertStringContainsString(
                "'{$code}'",
                $types,
                "ApprovalSkipReason::{$case->name} is missing from the ApprovalSkipReason union in shared/types.",
            );
            $this->assertStringContainsString(
                "{$code}: 'req_skip_{$code}'",
                $labels,
                "ApprovalSkipReason::{$case->name} has no entry in REQUEST_SKIP_REASON_LABEL.",
            );
            $this->assertStringContainsString(
                "req_skip_{$code}:",
                $en,
                "ApprovalSkipReason::{$case->name} has no English wording (lang/en/requests.ts).",
            );
            $this->assertStringContainsString(
                "req_skip_{$code}:",
                $th,
                "ApprovalSkipReason::{$case->name} has no Thai wording (lang/th/requests.ts).",
            );
        }
    }
}
