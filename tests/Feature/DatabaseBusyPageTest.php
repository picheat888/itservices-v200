<?php

namespace Tests\Feature;

use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Route;
use PDOException;
use Tests\TestCase;

class DatabaseBusyPageTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['app.debug' => false]);

        // /files and /api are outside the SPA catch-all, so these reach the exception handler
        $busy = fn () => throw new QueryException('mysql', 'select 1', [], new PDOException('SQLSTATE[HY000] [1040] Too many connections', 1040));
        $bug = fn () => throw new QueryException('mysql', 'select 1', [], new PDOException('SQLSTATE[42S22]: Column not found: 1054 Unknown column'));
        Route::get('/files/__test-busy', $busy);
        Route::get('/api/__test-busy', $busy);
        Route::get('/api/__test-bug', $bug);
    }

    public function test_a_full_database_answers_the_spa_with_503_server_busy(): void
    {
        $response = $this->getJson('/api/__test-busy');

        $response->assertStatus(503);
        $response->assertJson(['message' => 'server_busy']);
        $response->assertHeader('Retry-After', '15');
    }

    public function test_a_full_database_shows_the_busy_page_in_the_browser(): void
    {
        $response = $this->get('/files/__test-busy');

        $response->assertStatus(503);
        $response->assertHeader('Retry-After', '15');
        $response->assertSee('ระบบมีผู้ใช้งานมาก');
        $response->assertSee('มีผู้ใช้งานพร้อมกันมาก กรุณารอสักครู่แล้วลองใหม่อีกครั้ง');
        $response->assertDontSee('ปิดปรับปรุงชั่วคราว');
    }

    public function test_an_english_reader_gets_the_busy_words_in_english(): void
    {
        $response = $this->withHeaders(['Accept-Language' => 'en-US,en;q=0.9'])->get('/files/__test-busy');

        $response->assertSee('Many people are using the system right now. Please wait a moment and try again.');
    }

    public function test_any_other_database_error_stays_a_500(): void
    {
        $this->getJson('/api/__test-bug')->assertStatus(500)->assertHeaderMissing('Retry-After');
    }
}
