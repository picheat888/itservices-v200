<?php

namespace Tests\Unit;

use App\Support\ErrorPage;
use PHPUnit\Framework\TestCase;

// ErrorPage colours: the readable ink on an accent-coloured button, and the accent lifted for dark mode.
class ErrorPageTest extends TestCase
{
    public function test_accent_foreground_picks_the_readable_ink(): void
    {
        $this->assertSame('#ffffff', ErrorPage::accentForeground('#2563eb'));
        $this->assertSame('#0f172a', ErrorPage::accentForeground('#fbbf24'));
    }

    public function test_the_dark_brand_matches_the_page_script_for_any_accent(): void
    {
        // Same answers as resolveDarkBrand() in errors/layout.blade.php
        $this->assertSame('#6692f1', ErrorPage::accentDark('#2563eb'));
        $this->assertSame('#22a853', ErrorPage::accentDark('#16a34a'));
        $this->assertSame('#999999', ErrorPage::accentDark('#000000'));
        $this->assertSame('#f59e0b', ErrorPage::accentDark('#f59e0b'));
    }
}
