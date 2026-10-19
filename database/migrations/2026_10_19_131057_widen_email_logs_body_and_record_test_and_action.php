<?php

// email_logs: room for long digest bodies, a flag for test sends, and the button the mail carried.

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('email_logs', function (Blueprint $table) {
            $table->mediumText('body_html')->nullable()->change();
            $table->boolean('is_test')->default(false)->after('status');
            // null = not recorded (older rows); [] = no button; {url, label} = the button sent
            $table->json('action')->nullable()->after('body_html');
        });
    }

    public function down(): void
    {
        Schema::table('email_logs', function (Blueprint $table) {
            $table->dropColumn(['is_test', 'action']);
            $table->text('body_html')->nullable()->change();
        });
    }
};
