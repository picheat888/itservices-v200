<?php

namespace Tests\Unit;

use App\Support\ErrorPage;
use PHPUnit\Framework\TestCase;

// ErrorPage::accentForeground — the readable ink on an accent-coloured button.
class ErrorPageTest extends TestCase
{
    public function test_accent_foreground_picks_the_readable_ink(): void
    {
        $this->assertSame('#ffffff', ErrorPage::accentForeground('#2563eb'));
        $this->assertSame('#0f172a', ErrorPage::accentForeground('#fbbf24'));
    }
}
