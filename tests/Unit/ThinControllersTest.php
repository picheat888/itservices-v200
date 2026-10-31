<?php

// The controllers emptied into services stay thin: no transactions, paging, file storage, mail fan-out or hand-built validators.

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class ThinControllersTest extends TestCase
{
    private const FORBIDDEN = ['DB::transaction', '->paginate(', 'Storage::', 'Notification::send', 'Validator::make'];

    /** Controller => forbidden fragments it may still hold, each with why. */
    private const ALLOWED = [
        // The count session list was not part of the round 5 move; only its after-commit alerts left
        'Stock/StockCountController' => ['->paginate('],
    ];

    /** @return array<string, array{string}> */
    public static function controllers(): array
    {
        $names = [
            'Request/RequestController', 'Settings/SettingsController',
            'Email/EmailTemplateController', 'Notification/NotificationTemplateController', 'Email/EmailLogController',
            'Asset/AssetController',
            'Stock/StockItemController', 'Stock/StockMovementController', 'Stock/StockRequestController', 'Stock/StockCountController',
            'Employee/EmployeeController',
            'Contract/ContractController', 'Notification/NotificationController', 'Settings/RequestOptionController',
            'Access/SoftwareController', 'Workflow/WorkflowController',
            'Settings/BrandController', 'Settings/VendorController', 'Settings/CategoryController', 'Settings/AssetModelController',
            'Settings/LocationController', 'Settings/UnitController', 'Settings/WarrantyTypeController',
            'Settings/WriteoffReasonController', 'Stock/WarehouseController',
        ];

        return array_combine($names, array_map(fn (string $name) => [$name], $names));
    }

    #[DataProvider('controllers')]
    public function test_the_controller_hands_its_logic_to_services(string $name): void
    {
        $path = dirname(__DIR__, 2)."/app/Http/Controllers/Api/{$name}.php";
        $this->assertFileExists($path);
        $source = (string) file_get_contents($path);

        foreach (array_diff(self::FORBIDDEN, self::ALLOWED[$name] ?? []) as $fragment) {
            $this->assertStringNotContainsString($fragment, $source, "{$name} holds {$fragment}");
        }
    }

    public function test_master_data_deletes_answer_in_use_through_the_shared_refusal(): void
    {
        foreach (['Settings/BrandController', 'Settings/VendorController', 'Settings/CategoryController', 'Settings/AssetModelController',
            'Settings/LocationController', 'Settings/UnitController', 'Settings/WarrantyTypeController',
            'Settings/WriteoffReasonController', 'Stock/WarehouseController', 'Settings/RequestOptionController'] as $name) {
            $source = (string) file_get_contents(dirname(__DIR__, 2)."/app/Http/Controllers/Api/{$name}.php");
            $this->assertStringContainsString('InUse::refusal(', $source, $name);
            $this->assertStringNotContainsString("'in_use'", $source, $name);
        }
    }
}
