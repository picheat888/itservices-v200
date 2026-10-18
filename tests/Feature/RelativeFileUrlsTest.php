<?php

// File URLs the SPA shows are paths, so a page served over HTTPS never asks for them over http (mixed content).

namespace Tests\Feature;

use App\Models\Employee\Employee;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RelativeFileUrlsTest extends TestCase
{
    use RefreshDatabase;

    public function test_an_employee_photo_url_is_a_path_not_an_absolute_http_url(): void
    {
        $employee = Employee::create(['first_name' => 'Photo', 'last_name' => 'Test', 'status' => 'active', 'photo_path' => 'employees/photo.jpg']);

        $this->assertStringStartsWith("/files/employees/{$employee->id}/photo?v=", $employee->photo_url);
        $this->assertStringNotContainsString('http', $employee->photo_url);
    }

    public function test_an_employee_without_a_photo_has_no_url(): void
    {
        $employee = Employee::create(['first_name' => 'No', 'last_name' => 'Photo', 'status' => 'active']);

        $this->assertNull($employee->photo_url);
    }
}
