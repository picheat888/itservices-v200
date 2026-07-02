<?php

namespace Tests\Feature;

use App\Models\Employee\Department;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DepartmentApiTest extends TestCase
{
    use RefreshDatabase;

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    public function test_creates_a_department_without_a_head_field(): void
    {
        $this->actingAs($this->super());

        $this->postJson('/api/departments', ['name' => 'Finance', 'name_th' => 'ฝ่ายการเงิน'])
            ->assertStatus(201)
            ->assertJsonPath('data.name', 'Finance')
            ->assertJsonMissingPath('data.head');

        $this->assertDatabaseHas('departments', ['name' => 'Finance']);
    }

    public function test_department_resource_no_longer_exposes_head(): void
    {
        $this->actingAs($this->super());
        Department::create(['name' => 'Operations', 'name_th' => 'ฝ่ายปฏิบัติการ']);

        $this->getJson('/api/departments')
            ->assertOk()
            ->assertJsonMissingPath('data.0.head');
    }

    public function test_updates_a_department(): void
    {
        $this->actingAs($this->super());
        $dept = Department::create(['name' => 'Sales', 'name_th' => 'ฝ่ายขาย']);

        $this->putJson("/api/departments/{$dept->id}", ['name' => 'Sales & Marketing'])
            ->assertOk()
            ->assertJsonPath('data.name', 'Sales & Marketing');

        $this->assertSame('Sales & Marketing', $dept->fresh()->name);
    }
}
