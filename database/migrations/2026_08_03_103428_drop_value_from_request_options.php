<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Drops the `value` slug: a request now stores the option's own id, the same way
 * every other table-backed request field stores a foreign key (file_share_id,
 * location_id, software_id…). The slug was a second identity for a row that
 * already had one, and it linked requests to their chosen option by string
 * instead of by key.
 *
 * Uniqueness moves onto the English label, which is what actually has to be
 * distinct within a list — two choices both reading "Monitor" were only ever
 * tellable apart by a slug nobody saw.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('request_options', function (Blueprint $table) {
            $table->dropUnique('request_options_request_type_field_key_value_unique');
            $table->dropColumn('value');
        });

        Schema::table('request_options', function (Blueprint $table) {
            $table->unique(['request_type', 'field_key', 'label_en']);
        });
    }

    public function down(): void
    {
        Schema::table('request_options', function (Blueprint $table) {
            $table->dropUnique('request_options_request_type_field_key_label_en_unique');
            $table->string('value', 60)->default('')->after('field_key');
        });

        // Give every row a usable slug again before the old index goes back on.
        foreach (DB::table('request_options')->get() as $option) {
            DB::table('request_options')->where('id', $option->id)->update([
                'value' => Str::slug($option->label_en, '_') ?: 'option_'.$option->id,
            ]);
        }

        Schema::table('request_options', function (Blueprint $table) {
            $table->unique(['request_type', 'field_key', 'value']);
        });
    }
};
