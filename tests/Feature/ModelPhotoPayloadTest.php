<?php

// Every payload that names a model also carries that model's photo URL, so each screen can show it.

namespace Tests\Feature;

use App\Http\Resources\Asset\AssetResource;
use App\Http\Resources\Stock\StockItemResource;
use App\Http\Resources\Stock\StockRequestResource;
use App\Http\Resources\Ticket\TicketResource;
use App\Models\Asset\Asset;
use App\Models\Employee\Employee;
use App\Models\Settings\AssetModel;
use App\Models\Settings\Brand;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockRequest;
use App\Models\Ticket\Ticket;
use App\Services\Employee\EmployeeListService;
use App\Services\Ticket\TicketAssetPickerService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ModelPhotoPayloadTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: Asset, 1: string} */
    private function assetWithPhoto(array $attributes = []): array
    {
        $asset = Asset::factory()->create($attributes);
        $asset->model->update(['photo_path' => 'model-photos/m.webp']);

        return [$asset->fresh(), $asset->model->fresh()->photo_url];
    }

    public function test_asset_payload_has_the_model_photo_url(): void
    {
        [$asset, $expected] = $this->assetWithPhoto();

        $this->assertSame($expected, (new AssetResource($asset->load('model')))->resolve()['model_photo_url']);
    }

    public function test_stock_item_and_request_payloads_have_the_model_photo_url(): void
    {
        $brand = Brand::create(['name' => 'HP']);
        $model = AssetModel::create(['name' => 'CF226A', 'brand_id' => $brand->id, 'photo_path' => 'model-photos/t.webp']);
        $item = StockItem::make(['name' => 'Toner'])->setRelation('model', $model)->setRelation('brand', $brand);

        $this->assertSame($model->photo_url, (new StockItemResource($item))->resolve()['model_photo_url']);

        $request = (new StockRequestResource(StockRequest::make(['qty' => 1])->setRelation('item', $item)))->resolve();
        $this->assertSame($model->photo_url, $request['model_photo_url']);
        $this->assertSame('CF226A', $request['model']);
        $this->assertSame('HP', $request['brand']);

        $bare = (new StockRequestResource(StockRequest::make(['qty' => 1])->setRelation('item', StockItem::make(['name' => 'Toner']))))->resolve();
        $this->assertArrayNotHasKey('model_photo_url', $bare);
    }

    public function test_ticket_payload_has_the_related_asset_photo_url(): void
    {
        [$asset, $expected] = $this->assetWithPhoto();
        $ticket = Ticket::factory()->create(['related_asset_id' => $asset->id]);

        $payload = (new TicketResource($ticket->load('relatedAsset.model')))->resolve();

        $this->assertSame($expected, $payload['related_asset_model_photo_url']);
    }

    public function test_take_case_options_carry_photo_tag_type_and_brand(): void
    {
        [$asset, $expected] = $this->assetWithPhoto(['tag' => 'NB-0412']);

        $option = app(TicketAssetPickerService::class)->search($asset->asset_code)->first();

        $this->assertSame($expected, $option['model_photo_url']);
        $this->assertSame('NB-0412', $option['tag']);
        $this->assertSame($asset->category->name, $option['type']);
        $this->assertArrayHasKey('type_th', $option);
        $this->assertSame($asset->brand?->name, $option['brand']);
    }

    public function test_employee_held_assets_carry_the_model_photo_url(): void
    {
        $emp = Employee::create(['first_name' => 'H', 'last_name' => 'P']);
        [, $expected] = $this->assetWithPhoto(['owner_employee_id' => $emp->id, 'status' => 'deployed']);

        $this->assertSame($expected, app(EmployeeListService::class)->assets($emp)->first()['model_photo_url']);
    }
}
