<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class ErrorPagesTest extends TestCase
{
    /**
     * Path ที่ไม่รู้จัก (ไม่ใช่ prefix ที่ถูกยกเว้น) ต้องถูก SPA catch-all รับไปแสดง React (200)
     * — เอกสารยืนยันพฤติกรรม: หน้า 404 ฝั่ง React เป็นคนจัดการ ไม่ใช่ Blade
     */
    public function test_unknown_spa_path_falls_through_to_react(): void
    {
        $response = $this->get('/some-frontend-page-'.uniqid());

        $response->assertStatus(200);
    }

    /**
     * หน้า 404 ที่กำหนดเองต้องถูกใช้งานเมื่อเรียก path ใต้ prefix ที่ catch-all ยกเว้น
     * (เช่น /build/...) ซึ่งไม่มี route รองรับ
     */
    public function test_custom_404_page_is_rendered(): void
    {
        $response = $this->get('/build/missing-asset-'.uniqid());

        $response->assertStatus(404);
        $response->assertSee('404', false);
        $response->assertSee('ไม่พบหน้าที่คุณค้นหา', false);
    }

    /**
     * หน้า 500 ที่กำหนดเองต้องถูกใช้งานเมื่อเกิด exception และปิด debug mode
     */
    public function test_custom_500_page_is_rendered_when_debug_disabled(): void
    {
        config(['app.debug' => false]);

        // ใช้ prefix /build ที่ catch-all ยกเว้น เพื่อให้ route นี้ถูก match จริง
        Route::get('/build/__boom', function () {
            throw new \RuntimeException('boom');
        });

        $response = $this->get('/build/__boom');

        $response->assertStatus(500);
        $response->assertSee('500', false);
        $response->assertSee('เกิดข้อผิดพลาดภายในระบบ', false);
    }

    /**
     * ทุกหน้า error ที่กำหนดเองต้อง render เป็น HTML เต็มหน้าได้โดยไม่มีข้อผิดพลาด
     */
    public function test_all_custom_error_views_render(): void
    {
        foreach (['401', '403', '404', '419', '429', '500', '503'] as $code) {
            $html = view("errors.{$code}")->render();

            $this->assertStringContainsString('<!DOCTYPE html>', $html);
            $this->assertStringContainsString($code, $html);
        }
    }
}
