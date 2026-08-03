<?php

namespace Database\Seeders;

use App\Models\Settings\RequestOption;
use App\Support\RequestSchemas;
use Illuminate\Database\Seeder;

/**
 * Establishes the editable request-form choice lists from the built-in seed
 * lists in RequestSchemas. Matches on (request_type, field_key, label_en) only,
 * so a re-run never overwrites a Thai label or an order an admin has since set.
 */
class RequestOptionSeeder extends Seeder
{
    public function run(): void
    {
        RequestSchemas::flushManagedCache();

        foreach (RequestSchemas::all() as $type => $fields) {
            foreach ($fields as $field) {
                if (! ($field['managed'] ?? false)) {
                    continue;
                }
                foreach (array_values($field['options'] ?? []) as $index => $option) {
                    RequestOption::firstOrCreate(
                        [
                            'request_type' => $type,
                            'field_key' => $field['key'],
                            'label_en' => $option['label_en'],
                        ],
                        [
                            'label_th' => $option['label_th'] ?? null,
                            'sort_order' => ($index + 1) * 10,
                            'active' => true,
                        ],
                    );
                }
            }
        }

        RequestSchemas::flushManagedCache();
    }
}
