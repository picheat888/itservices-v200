<?php

namespace Database\Seeders\Demo;

use App\Enums\Access\SoftwareLicenseType;
use App\Models\Access\EmailGroup;
use App\Models\Access\FileShare;
use App\Models\Access\SocialPlatform;
use App\Models\Access\Software;
use App\Models\Employee\Department;
use App\Models\Settings\Brand;
use App\Services\Access\AccessService;

/**
 * Access resources and who holds them. The email groups and file shares are owned by
 * Managers who have demo logins (mgr.demo, qc.demo), because a File Share / Email Group
 * request routes through its owner — an owner without an account could never sign.
 */
final class DemoAccess implements DemoStep
{
    /** [resource key, employee key, access level (file shares only), days ago] */
    private const GRANTS = [
        ['m365', 'staff', null, 180], ['m365', 'sup.pd', null, 180], ['m365', 'it.tech', null, 180],
        ['m365', 'hr.staff', null, 170], ['autocad', 'mn.2', null, 120], ['acrobat', 'acc.2', null, 90],
        ['facebook', 'sale.2', null, 60], ['line', 'sale.3', null, 45],
        ['grp-production', 'staff', null, 150], ['grp-production', 'pd.4', null, 150], ['grp-qc', 'qc.2', null, 140],
        ['fs-production', 'staff', 'Write', 150], ['fs-production', 'pd.leader', 'Read', 150], ['fs-qc', 'qc.2', 'Write', 140],
    ];

    public function __construct(private readonly AccessService $access) {}

    public function run(DemoContext $ctx, DemoClock $clock): void
    {
        $clock->at($clock->daysAgo(190));
        $brand = Brand::pluck('id', 'name');
        $department = Department::pluck('id', 'tag');

        $ctx->resources['m365'] = Software::create(['name' => 'Microsoft 365 Business', 'brand_id' => $brand['Microsoft'] ?? null, 'license_type' => SoftwareLicenseType::Subscription, 'seats' => 60]);
        $ctx->resources['autocad'] = Software::create(['name' => 'AutoCAD LT', 'brand_id' => $brand['Autodesk'] ?? null, 'license_type' => SoftwareLicenseType::Subscription, 'seats' => 5]);
        $ctx->resources['acrobat'] = Software::create(['name' => 'Adobe Acrobat Pro', 'brand_id' => $brand['Adobe'] ?? null, 'license_type' => SoftwareLicenseType::Subscription, 'seats' => 10]);

        $ctx->resources['facebook'] = SocialPlatform::create(['name' => 'Facebook', 'url' => 'https://facebook.com', 'color' => '#1877F2']);
        $ctx->resources['line'] = SocialPlatform::create(['name' => 'LINE Official', 'url' => 'https://line.me', 'color' => '#06C755']);
        $ctx->resources['linkedin'] = SocialPlatform::create(['name' => 'LinkedIn', 'url' => 'https://linkedin.com', 'color' => '#0A66C2']);

        $ctx->resources['grp-production'] = EmailGroup::create(['name' => 'Production Team', 'email' => 'production@example.com', 'department_id' => $department['PD']]);
        $ctx->resources['grp-qc'] = EmailGroup::create(['name' => 'QC Team', 'email' => 'qc@example.com', 'department_id' => $department['QC']]);
        $ctx->resources['fs-production'] = FileShare::create(['name' => 'Production Share', 'path' => '\\\\fs01\\production', 'department_id' => $department['PD'], 'size' => 500, 'size_unit' => 'GB']);
        $ctx->resources['fs-qc'] = FileShare::create(['name' => 'QC Documents', 'path' => '\\\\fs01\\qc', 'department_id' => $department['QC'], 'size' => 200, 'size_unit' => 'GB']);

        $this->access->setOwner($ctx->resources['grp-production'], $ctx->employee('mgr.pd')->id);
        $this->access->setOwner($ctx->resources['fs-production'], $ctx->employee('mgr.pd')->id);
        $this->access->setOwner($ctx->resources['grp-qc'], $ctx->employee('mgr.qc')->id);
        $this->access->setOwner($ctx->resources['fs-qc'], $ctx->employee('mgr.qc')->id);

        foreach (self::GRANTS as [$resourceKey, $employeeKey, $level, $daysAgo]) {
            $this->access->grant($ctx->resources[$resourceKey], $ctx->employee($employeeKey)->id, [
                'access_level' => $level,
                'purpose' => 'Daily work',
                'granted_at' => $clock->daysAgo($daysAgo)->toDateString(),
            ]);
        }
    }
}
