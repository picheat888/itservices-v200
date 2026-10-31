<?php

// The controllers emptied into services stay thin: no transactions, paging, file storage, mail or bells, hand-built validators or page-size math.

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class ThinControllersTest extends TestCase
{
    private const FORBIDDEN = [
        'DB::transaction', 'DB::beginTransaction', 'DB::connection(',
        '->paginate(', '->simplePaginate(', '->cursorPaginate(',
        'Storage::', 'Notification::send', 'Mail::', '->notify(',
        'Validator::make', 'min(100, (int)',
    ];

    /** Controller => forbidden fragments it may still hold, each with why. */
    private const ALLOWED = [
        // The count session list was not part of the round 5 move; only its after-commit alerts left
        'Stock/StockCountController' => ['->paginate('],
    ];

    private const MASTER_DATA = [
        'Settings/BrandController', 'Settings/VendorController', 'Settings/CategoryController', 'Settings/AssetModelController',
        'Settings/LocationController', 'Settings/UnitController', 'Settings/WarrantyTypeController',
        'Settings/WriteoffReasonController', 'Stock/WarehouseController', 'Settings/RequestOptionController',
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

    /** The controller's PHP without comments, so a fragment named in a comment is not a hit. */
    private function code(string $name): string
    {
        $path = dirname(__DIR__, 2)."/app/Http/Controllers/Api/{$name}.php";
        $this->assertFileExists($path);

        $code = '';
        foreach (token_get_all((string) file_get_contents($path)) as $token) {
            if (is_array($token) && in_array($token[0], [T_COMMENT, T_DOC_COMMENT], true)) {
                continue;
            }
            $code .= is_array($token) ? $token[1] : $token;
        }

        return $code;
    }

    #[DataProvider('controllers')]
    public function test_the_controller_hands_its_logic_to_services(string $name): void
    {
        $code = $this->code($name);

        foreach (array_diff(self::FORBIDDEN, self::ALLOWED[$name] ?? []) as $fragment) {
            $this->assertStringNotContainsString($fragment, $code, "{$name} holds {$fragment}");
        }
    }

    public function test_master_data_deletes_answer_in_use_through_the_shared_refusal(): void
    {
        foreach (self::MASTER_DATA as $name) {
            $code = $this->code($name);
            $this->assertStringContainsString('InUse::refusal(', $code, $name);
            $this->assertDoesNotMatchRegularExpression('/[\'"]in_use[\'"]/', $code, $name);
        }
    }
}
