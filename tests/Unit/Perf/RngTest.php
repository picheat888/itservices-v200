<?php

namespace Tests\Unit\Perf;

use App\Support\Perf\Rng;
use PHPUnit\Framework\TestCase;

// Unit tests for the seeded random source
class RngTest extends TestCase
{
    public function test_same_seed_same_sequence(): void
    {
        $a = new Rng(7);
        $b = new Rng(7);
        for ($i = 0; $i < 50; $i++) {
            $this->assertSame($a->int(1, 1000), $b->int(1, 1000));
        }
        $u = (new Rng(7))->uuid();
        $this->assertSame($u, (new Rng(7))->uuid());
        $this->assertMatchesRegularExpression('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/', $u);
    }

    public function test_weighted_respects_weights(): void
    {
        $r = new Rng(3);
        $a = 0;
        for ($i = 0; $i < 2000; $i++) {
            $a += $r->weighted(['a' => 90, 'b' => 10]) === 'a' ? 1 : 0;
        }
        $this->assertGreaterThan(1700, $a);
        $this->assertLessThan(1900, $a);
    }
}
