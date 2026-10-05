<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Write-off reasons (Settings → Assets): the list the write-off dialog picks "why" from, so the
 * write-off report can count by reason instead of reading free text. assets.writeoff_reason_id
 * links a written-off asset to its reason by id (a rename carries through; a reason in use cannot
 * be deleted — restrictOnDelete, and a 409 in WriteoffReasonController). The free-text note stays
 * in assets.last_reason for the details.
 *
 * Starts with a standard list. The assets already written off whose note reads "Beyond economical
 * repair…" get "ชำรุด ซ่อมไม่คุ้ม"; any other stays without a reason.
 */
return new class extends Migration
{
    /** @var list<array{name: string, description: string}> */
    private const STANDARD = [
        ['name' => 'ชำรุด ซ่อมไม่คุ้ม', 'description' => 'เสียหายจนค่าซ่อมไม่คุ้มกับมูลค่า'],
        ['name' => 'หมดอายุการใช้งาน / ล้าสมัย', 'description' => 'ใช้งานครบอายุ หรือสเปกไม่รองรับงานแล้ว'],
        ['name' => 'สูญหาย / ถูกโจรกรรม', 'description' => null],
        ['name' => 'ขายซาก', 'description' => null],
        ['name' => 'บริจาค', 'description' => null],
        ['name' => 'คืนผู้ให้เช่า', 'description' => 'สิ้นสุดหรือยกเลิกสัญญาเช่า'],
        ['name' => 'อื่น ๆ', 'description' => 'ระบุรายละเอียดในหมายเหตุ'],
    ];

    public function up(): void
    {
        Schema::create('writeoff_reasons', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120)->unique();
            $table->string('description', 255)->nullable();
            $table->timestamps();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
        });

        Schema::table('assets', function (Blueprint $table) {
            $table->foreignId('writeoff_reason_id')->nullable()->after('last_reason')->constrained('writeoff_reasons')->restrictOnDelete();
        });

        $now = now();
        DB::table('writeoff_reasons')->insert(array_map(
            fn (array $reason) => [...$reason, 'created_at' => $now, 'updated_at' => $now],
            self::STANDARD,
        ));

        $beyondRepair = DB::table('writeoff_reasons')->where('name', 'ชำรุด ซ่อมไม่คุ้ม')->value('id');
        DB::table('assets')
            ->where('status', 'writeoff')
            ->where('last_reason', 'like', 'Beyond economical repair%')
            ->update(['writeoff_reason_id' => $beyondRepair]);
    }

    public function down(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            $table->dropConstrainedForeignId('writeoff_reason_id');
        });

        Schema::dropIfExists('writeoff_reasons');
    }
};
