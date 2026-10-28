<?php

namespace Tests\Unit;

use App\Support\Cidr;
use PHPUnit\Framework\TestCase;

// Cidr::contains and prefixLength for IPv4 and IPv6 ranges and single addresses.
class CidrTest extends TestCase
{
    public function test_an_ipv4_range_contains_its_addresses_only(): void
    {
        $this->assertTrue(Cidr::contains('203.150.12.80/29', '203.150.12.87'));
        $this->assertTrue(Cidr::contains('203.150.12.80/29', '203.150.12.80'));
        $this->assertFalse(Cidr::contains('203.150.12.80/29', '203.150.12.88'));
        $this->assertFalse(Cidr::contains('203.150.12.80/29', '203.150.12.79'));
    }

    public function test_a_single_address_matches_exactly(): void
    {
        $this->assertTrue(Cidr::contains('58.97.45.10', '58.97.45.10'));
        $this->assertFalse(Cidr::contains('58.97.45.10', '58.97.45.11'));
        $this->assertTrue(Cidr::contains('2001:db8::5', '2001:0db8:0:0:0:0:0:5'));
    }

    public function test_an_ipv6_range_contains_its_addresses_only(): void
    {
        $this->assertTrue(Cidr::contains('2001:db8::/32', '2001:db8::1'));
        $this->assertTrue(Cidr::contains('2001:db8::/32', '2001:db8:ffff::1'));
        $this->assertFalse(Cidr::contains('2001:db8::/32', '2001:db9::1'));
    }

    public function test_the_edge_prefixes(): void
    {
        $this->assertTrue(Cidr::contains('0.0.0.0/0', '8.8.8.8'));
        $this->assertTrue(Cidr::contains('10.1.2.3/32', '10.1.2.3'));
        $this->assertFalse(Cidr::contains('10.1.2.3/32', '10.1.2.4'));
        $this->assertTrue(Cidr::contains('::/0', '2001:db8::1'));
    }

    public function test_the_two_address_families_never_match_each_other(): void
    {
        $this->assertFalse(Cidr::contains('10.0.0.0/8', '::1'));
        $this->assertFalse(Cidr::contains('::/0', '10.0.0.1'));
    }

    public function test_an_ipv4_mapped_ipv6_address_counts_as_ipv4(): void
    {
        $this->assertTrue(Cidr::contains('203.150.12.0/24', '::ffff:203.150.12.5'));
        $this->assertFalse(Cidr::contains('203.150.12.0/24', '::ffff:203.150.13.5'));
        $this->assertTrue(Cidr::contains('58.97.45.10', '::ffff:58.97.45.10'));
    }

    public function test_invalid_input_is_false(): void
    {
        $this->assertFalse(Cidr::contains('not-a-cidr', '1.2.3.4'));
        $this->assertFalse(Cidr::contains('10.0.0.0/8', 'garbage'));
        $this->assertFalse(Cidr::contains('10.0.0.0/33', '10.0.0.1'));
        $this->assertFalse(Cidr::contains('2001:db8::/129', '2001:db8::1'));
        $this->assertFalse(Cidr::contains('10.0.0.0/abc', '10.0.0.1'));
        $this->assertFalse(Cidr::contains('10.0.0.0/-1', '10.0.0.1'));
        $this->assertFalse(Cidr::contains('', ''));
    }

    public function test_the_prefix_length(): void
    {
        $this->assertSame(29, Cidr::prefixLength('203.150.12.80/29'));
        $this->assertSame(32, Cidr::prefixLength('58.97.45.10'));
        $this->assertSame(128, Cidr::prefixLength('2001:db8::1'));
        $this->assertSame(32, Cidr::prefixLength('2001:db8::/32'));
        $this->assertSame(0, Cidr::prefixLength('garbage'));
    }

    public function test_an_ipv4_client_is_counted_by_its_whole_address(): void
    {
        $this->assertSame('203.150.12.80', Cidr::clientNetwork('203.150.12.80'));
        $this->assertSame('203.150.12.80', Cidr::clientNetwork('::ffff:203.150.12.80'));
    }

    public function test_an_ipv6_client_is_counted_by_its_64_network_in_one_spelling(): void
    {
        $this->assertSame('2403:6200:8892:a79a::/64', Cidr::clientNetwork('2403:6200:8892:a79a:e04c:c631:4468:1596'));
        $this->assertSame('2403:6200:8892:a79a::/64', Cidr::clientNetwork('2403:6200:8892:A79A:dd5b:8ec7:1274:fc35'));
        $this->assertSame('2001:db8::/64', Cidr::clientNetwork('2001:0db8:0000:0000:0000:0000:0000:0005'));
        $this->assertNotSame(Cidr::clientNetwork('2001:44c8:6730:66dd::1'), Cidr::clientNetwork('2001:44c8:6737:9dce::1'));
    }

    public function test_an_ipv6_address_on_the_local_network_is_counted_whole(): void
    {
        $this->assertSame('fd00:1:2:3::10', Cidr::clientNetwork('fd00:1:2:3::10'));
        $this->assertNotSame(Cidr::clientNetwork('fd00:1:2:3::10'), Cidr::clientNetwork('fd00:1:2:3::99'));
        $this->assertSame('fe80::1', Cidr::clientNetwork('fe80::1'));
        $this->assertSame('::1', Cidr::clientNetwork('::1'));
    }

    public function test_text_that_is_not_an_address_is_kept_as_is(): void
    {
        $this->assertSame('not-an-ip', Cidr::clientNetwork('not-an-ip'));
        $this->assertSame('', Cidr::clientNetwork(null));
    }
}
