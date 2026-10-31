<?php

// The list page size: 20 by default, kept between the floor (10, Tickets 5) and 100, junk read as the floor.

namespace Tests\Unit;

use App\Support\PerPage;
use Illuminate\Http\Request;
use PHPUnit\Framework\TestCase;

class PerPageTest extends TestCase
{
    public function test_the_default_and_the_bounds(): void
    {
        $this->assertSame(20, PerPage::from(Request::create('/x')));
        $this->assertSame(10, PerPage::from(Request::create('/x', 'GET', ['per_page' => '1'])));
        $this->assertSame(100, PerPage::from(Request::create('/x', 'GET', ['per_page' => '500'])));
        $this->assertSame(50, PerPage::from(Request::create('/x', 'GET', ['per_page' => '50'])));
    }

    public function test_a_lower_floor_and_junk_input(): void
    {
        $this->assertSame(5, PerPage::from(Request::create('/x', 'GET', ['per_page' => '1']), min: 5));
        $this->assertSame(10, PerPage::from(Request::create('/x', 'GET', ['per_page' => 'abc'])));
        $this->assertSame(10, PerPage::from(Request::create('/x', 'GET', ['per_page' => ['9']])));
        $this->assertSame(30, PerPage::clamp('30'));
        $this->assertSame(10, PerPage::clamp(null));
    }
}
