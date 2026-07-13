<?php

namespace Tests\Feature;

use App\Enums\Access\SoftwareLicenseType;
use App\Models\Access\Software;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AccessSoftwareTest extends TestCase
{
    use RefreshDatabase;

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    public function test_software_auto_generates_a_sequential_code(): void
    {
        $a = Software::create(['name' => 'Adobe Acrobat', 'license_type' => 'subscription']);
        $b = Software::create(['name' => 'AutoCAD', 'license_type' => 'perpetual']);

        $this->assertSame('SW-0001', $a->code);
        $this->assertSame('SW-0002', $b->code);
    }

    public function test_software_casts_license_type_to_the_enum(): void
    {
        $s = Software::create(['name' => 'Chrome', 'license_type' => 'free']);

        $this->assertSame(SoftwareLicenseType::Free, $s->fresh()->license_type);
    }
}
