<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Reshape the software registry: add an app-style logo and an (encrypted)
     * product key, and drop the version + department columns that the redesigned
     * form no longer captures.
     */
    public function up(): void
    {
        Schema::table('softwares', function (Blueprint $table) {
            $table->string('logo_path')->nullable()->after('publisher');
            $table->text('product_key')->nullable()->after('seats');
        });

        Schema::table('softwares', function (Blueprint $table) {
            $table->dropConstrainedForeignId('department_id');
            $table->dropColumn('version');
        });
    }

    public function down(): void
    {
        Schema::table('softwares', function (Blueprint $table) {
            $table->string('version')->nullable()->after('publisher');
            $table->foreignId('department_id')->nullable()->after('seats')->constrained()->nullOnDelete();
            $table->dropColumn(['logo_path', 'product_key']);
        });
    }
};
