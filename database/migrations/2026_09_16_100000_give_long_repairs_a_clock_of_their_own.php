<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * สองคอลัมน์ที่ทำให้งานซ่อมยาวมีที่ยืนใน SLA
 *
 * ทั้งคู่มี default ที่เท่ากับพฤติกรรมเดิมเป๊ะ — ทุกเคสที่มีอยู่เป็นงานปกติ และทุกแถวกฎ
 * ที่มีอยู่นับด้วยเวลาทำการ การรัน migration นี้จึงไม่ขยับเดดไลน์ของเคสใดเลย
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tickets', function (Blueprint $table) {
            // NOT NULL default 'standard': "ไม่มีค่า" กับ "เป็นงานปกติ" คือเรื่องเดียวกัน
            // และสองวิธีเขียนเรื่องเดียวกันคือจุดที่มันเริ่มไม่ตรงกัน
            $table->string('work_class', 32)->default('standard')->after('priority');
        });

        Schema::table('sla_targets', function (Blueprint $table) {
            $table->string('clock', 16)->default('business')->after('resolve_hours');
        });
    }

    public function down(): void
    {
        Schema::table('tickets', function (Blueprint $table) {
            $table->dropColumn('work_class');
        });

        Schema::table('sla_targets', function (Blueprint $table) {
            $table->dropColumn('clock');
        });
    }
};
