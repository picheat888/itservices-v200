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
use Illuminate\Database\Eloquent\Model;

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

        // IT keeps the access register: grants record who gave them.
        $ctx->actAs($ctx->user('it.lead'));
        foreach ($ctx->resources as $resource) {
            $ctx->audit('Created '.$this->noun($resource), $resource->name);
        }

        foreach (['grp-production' => 'mgr.pd', 'fs-production' => 'mgr.pd', 'grp-qc' => 'mgr.qc', 'fs-qc' => 'mgr.qc'] as $resourceKey => $ownerKey) {
            $resource = $ctx->resources[$resourceKey];
            $this->access->setOwner($resource, $ctx->employee($ownerKey)->id);
            $ctx->audit('Changed '.$this->noun($resource).' owner', $resource->name, ['owner' => $ctx->employee($ownerKey)->name]);
        }

        foreach (self::GRANTS as [$resourceKey, $employeeKey, $level, $daysAgo]) {
            $clock->at($clock->daysAgo($daysAgo, 10));
            $resource = $ctx->resources[$resourceKey];
            $this->access->grant($resource, $ctx->employee($employeeKey)->id, [
                'access_level' => $level,
                'purpose' => 'Daily work',
                'granted_at' => $clock->daysAgo($daysAgo)->toDateString(),
            ]);
            $ctx->audit('Added member to '.$this->noun($resource), $resource->name, ['employee' => $ctx->employee($employeeKey)->name]);
        }
    }

    /** The resource's name as the Access screens write it in the audit log. */
    private function noun(Model $resource): string
    {
        return match (true) {
            $resource instanceof Software => 'software',
            $resource instanceof SocialPlatform => 'social platform',
            $resource instanceof EmailGroup => 'email group',
            default => 'file share',
        };
    }
}
