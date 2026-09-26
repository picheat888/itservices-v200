<?php

namespace Database\Seeders\Demo;

use App\Models\Settings\AssetModel;
use App\Models\Settings\Brand;
use App\Models\Settings\Location;
use App\Models\Settings\Vendor;

/**
 * Reference rows the demo needs and the standard seed does not ship: vendors, asset
 * models (brand + name) and locations. MasterDataSeeder already provides brands,
 * categories, warehouses, units and warranty types.
 */
final class DemoReference implements DemoStep
{
    /** key => [name, name_th, contact, phone] */
    private const VENDORS = [
        'dell' => ['Dell Technologies (Thailand)', 'เดลล์ เทคโนโลยี', 'Khun Pakorn', '02-111-2000'],
        'hp' => ['HP Inc. Thailand', 'เอชพี ประเทศไทย', 'Khun Ratchanee', '02-111-3000'],
        'lenovo' => ['Lenovo Thailand', 'เลอโนโว ประเทศไทย', 'Khun Somchai', '02-111-4000'],
        'ricoh' => ['Ricoh Thailand', 'ริโก้ ประเทศไทย', 'Khun Warunee', '02-111-5000'],
        'true' => ['True Business', 'ทรู บิสิเนส', 'Khun Anucha', '02-111-6000'],
        'ais' => ['AIS Business', 'เอไอเอส บิสิเนส', 'Khun Pranee', '02-111-7000'],
        'secure' => ['SecureVision Co., Ltd.', 'ซีเคียววิชั่น', 'Khun Manop', '02-111-8000'],
        'msft' => ['Microsoft Licensing Partner', 'พาร์ทเนอร์ไมโครซอฟท์', 'Khun Jirawat', '02-111-9000'],
    ];

    /** key => [brand, model name] */
    private const MODELS = [
        'latitude' => ['Dell', 'Latitude 5440'],
        'thinkpad' => ['Lenovo', 'ThinkPad T14 Gen 4'],
        'optiplex' => ['Dell', 'OptiPlex 7010'],
        'prodesk' => ['HP', 'ProDesk 400 G9'],
        'poweredge' => ['Dell', 'PowerEdge R650'],
        'mfp' => ['Ricoh', 'IM C3000'],
        'laserjet' => ['HP', 'LaserJet Pro M404dn'],
        'catalyst' => ['Cisco', 'Catalyst 9200L'],
        'unifi' => ['Ubiquiti', 'UniFi U6 Pro'],
        'hikvision' => ['Honeywell', 'HC30W CCTV Dome'],
        'yealink' => ['Yealink', 'T54W IP Phone'],
        'ups' => ['APC', 'Smart-UPS 1500'],
        'iphone' => ['Apple', 'iPhone 15'],
        'monitor' => ['Samsung', 'S24C450 24" Monitor'],
    ];

    private const LOCATIONS = [
        'hq2' => 'สำนักงาน ชั้น 2',
        'plant1' => 'โรงงาน 1 - สายการผลิต',
        'plant2' => 'โรงงาน 2 - บรรจุภัณฑ์',
        'plant4' => 'โรงงาน 4 - คลังสินค้า',
        'qc-lab' => 'ห้องแล็บ QC',
        'warehouse' => 'คลังกลาง',
    ];

    public function run(DemoContext $ctx, DemoClock $clock): void
    {
        $clock->at($clock->daysAgo(200));

        foreach (self::VENDORS as $key => [$name, $nameTh, $contact, $phone]) {
            $ctx->vendors[$key] = Vendor::create([
                'name' => $name,
                'name_th' => $nameTh,
                'contact' => $contact,
                'phone' => $phone,
                'email' => $key.'@vendor.example.com',
            ]);
        }

        $brandId = Brand::pluck('id', 'name');
        foreach (self::MODELS as $key => [$brand, $name]) {
            $ctx->models[$key] = AssetModel::create(['brand_id' => $brandId[$brand] ?? null, 'name' => $name]);
        }

        foreach (self::LOCATIONS as $key => $name) {
            $ctx->locations[$key] = Location::create(['name' => $name]);
        }
    }
}
