<?php

namespace Tests\Feature\Auth;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

// Only the local tunnel (127.0.0.1 / ::1) may say which client IP a request came from.
class TrustedProxyTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Route::get('/api/_test/ip', fn (Request $request) => $request->ip());
    }

    private function ipSeenFrom(string $peer, string $forwardedFor): string
    {
        return $this->withServerVariables(['REMOTE_ADDR' => $peer])
            ->withHeader('X-Forwarded-For', $forwardedFor)
            ->get('/api/_test/ip')
            ->assertOk()
            ->getContent();
    }

    public function test_the_tunnel_address_is_trusted(): void
    {
        $this->assertSame('203.0.113.9', $this->ipSeenFrom('127.0.0.1', '203.0.113.9'));
        $this->assertSame('203.0.113.9', $this->ipSeenFrom('::1', '203.0.113.9'));
    }

    public function test_other_callers_cannot_spoof_their_ip(): void
    {
        $this->assertSame('198.51.100.7', $this->ipSeenFrom('198.51.100.7', '1.1.1.1'));
    }

    public function test_a_malformed_forwarded_header_falls_back_to_the_peer(): void
    {
        $this->assertSame('127.0.0.1', $this->ipSeenFrom('127.0.0.1', 'x, y'));
    }
}
