<?php

namespace Database\Seeders;

use App\Enums\Request\RequestType;
use App\Models\Settings\RequestOption;
use App\Support\RequestSchemas;
use Illuminate\Database\Seeder;

/**
 * The choice lists a fresh install starts with, for every `managed` field in
 * RequestSchemas (Settings → Master data → Request data edits them afterwards).
 *
 * The lists live here rather than beside the field definitions because that is all
 * they are: a starting point. RequestSchemas swaps a managed field's choices in from
 * request_options on every read, so a copy kept there was never read by anything but
 * this seeder, and read as though the form still offered it.
 *
 * Matches on (request_type, field_key, label_en) only, so a re-run never overwrites a
 * Thai label or an order an admin has since set, and never removes a choice they added.
 *
 * A managed field with no list here seeds nothing, and the field is required — so the
 * request type could not be submitted at all. ProductionSeedTest fails on exactly that.
 */
class RequestOptionSeeder extends Seeder
{
    public function run(): void
    {
        RequestSchemas::flushManagedCache();

        foreach ($this->lists() as $type => $fields) {
            foreach ($fields as $fieldKey => $options) {
                foreach (array_values($options) as $index => $option) {
                    RequestOption::firstOrCreate(
                        [
                            'request_type' => $type,
                            'field_key' => $fieldKey,
                            'label_en' => $option['label_en'],
                        ],
                        [
                            'label_th' => $option['label_th'] ?? null,
                            // Tens, so an admin can drop a choice between two without
                            // renumbering the rest.
                            'sort_order' => ($index + 1) * 10,
                            'active' => true,
                        ],
                    );
                }
            }
        }

        RequestSchemas::flushManagedCache();
    }

    /**
     * Seed choices, keyed by request type then field key, in display order.
     *
     * @return array<string, array<string, list<array{label_en: string, label_th: string}>>>
     */
    private function lists(): array
    {
        return [
            RequestType::Computer->value => [
                'device_id' => [
                    ['label_en' => 'Laptop', 'label_th' => 'โน้ตบุ๊ก'],
                    ['label_en' => 'Desktop PC', 'label_th' => 'คอมพิวเตอร์ตั้งโต๊ะ'],
                ],
            ],
            RequestType::Hardware->value => [
                'device_id' => [
                    ['label_en' => 'Monitor', 'label_th' => 'จอภาพ'],
                    ['label_en' => 'Printer', 'label_th' => 'เครื่องพิมพ์'],
                    ['label_en' => 'Accessory', 'label_th' => 'อุปกรณ์เสริม'],
                ],
            ],
            RequestType::Mobile->value => [
                'device_id' => [
                    ['label_en' => 'Smartphone', 'label_th' => 'สมาร์ตโฟน'],
                    ['label_en' => 'Tablet', 'label_th' => 'แท็บเล็ต'],
                    ['label_en' => 'Pocket Wi-Fi', 'label_th' => 'พ็อกเก็ตไวไฟ'],
                ],
            ],
            RequestType::Telephone->value => [
                'device_type_id' => [
                    ['label_en' => 'Analog phone', 'label_th' => 'โทรศัพท์อนาล็อก'],
                    ['label_en' => 'IP phone', 'label_th' => 'โทรศัพท์ IP'],
                ],
            ],
        ];
    }
}
