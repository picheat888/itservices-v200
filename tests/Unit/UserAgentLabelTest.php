<?php

namespace Tests\Unit;

use App\Services\Auth\UserAgentLabel;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

// UserAgentLabel::parse reduces a User-Agent header to an OS family and a browser family.
class UserAgentLabelTest extends TestCase
{
    /** @return array<string, array{0: ?string, 1: bool, 2: string, 3: string}> */
    public static function agents(): array
    {
        return [
            'windows chrome' => ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', false, 'Windows', 'Chrome'],
            'windows edge' => ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0', false, 'Windows', 'Edge'],
            'windows firefox' => ['Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0', false, 'Windows', 'Firefox'],
            'windows opera' => ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/115.0.0.0', false, 'Windows', 'Opera'],
            'macos safari' => ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15', false, 'macOS', 'Safari'],
            'macos chrome' => ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', false, 'macOS', 'Chrome'],
            'iphone safari' => ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', false, 'iOS', 'Safari'],
            'iphone chrome' => ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1', false, 'iOS', 'Chrome'],
            'ipad classic string' => ['Mozilla/5.0 (iPad; CPU OS 12_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.2 Mobile/15E148 Safari/604.1', false, 'iPadOS', 'Safari'],
            'ipad desktop mode with touch' => ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15', true, 'iPadOS', 'Safari'],
            'android chrome' => ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36', false, 'Android', 'Chrome'],
            'android edge' => ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 EdgA/130.0.0.0', false, 'Android', 'Edge'],
            'linux firefox' => ['Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0', false, 'Linux', 'Firefox'],
            'chromeos chrome' => ['Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', false, 'ChromeOS', 'Chrome'],
            'null' => [null, false, 'Other', 'Other'],
            'empty' => ['', false, 'Other', 'Other'],
            'curl' => ['curl/8.0', false, 'Other', 'Other'],
        ];
    }

    #[DataProvider('agents')]
    public function test_the_families_are_picked_from_the_user_agent(?string $userAgent, bool $touchHint, string $os, string $browser): void
    {
        $this->assertSame(['os' => $os, 'browser' => $browser], UserAgentLabel::parse($userAgent, $touchHint));
    }

    public function test_a_touch_hint_changes_nothing_for_other_systems(): void
    {
        $windows = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

        $this->assertSame(['os' => 'Windows', 'browser' => 'Chrome'], UserAgentLabel::parse($windows, true));
    }
}
