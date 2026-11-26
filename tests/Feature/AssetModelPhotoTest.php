<?php

// Model photos: stored on upload, replaced and removed together with their files, and opened by any signed-in user.

namespace Tests\Feature;

use App\Models\Settings\AssetModel;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class AssetModelPhotoTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
    }

    private function admin(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    private function photo(): UploadedFile
    {
        return UploadedFile::fake()->image('p.png', 800, 800);
    }

    public function test_a_new_model_keeps_its_photo_and_hides_the_path(): void
    {
        $this->actingAs($this->admin())
            ->post('/api/asset-models', ['name' => 'Latitude 5440', 'photo' => $this->photo()], ['Accept' => 'application/json'])
            ->assertCreated()
            ->assertJsonPath('data.photo_url', fn ($u) => is_string($u) && str_contains($u, '/files/asset-models/'))
            ->assertJsonMissingPath('data.photo_path');

        Storage::disk('local')->assertExists(AssetModel::firstWhere('name', 'Latitude 5440')->photo_path);
    }

    public function test_a_new_photo_replaces_the_old_file_and_url(): void
    {
        Storage::disk('local')->put('model-photos/old.webp', 'x');
        $model = AssetModel::create(['name' => 'P2422H', 'photo_path' => 'model-photos/old.webp']);
        $before = $model->photo_url;

        $after = $this->actingAs($this->admin())
            ->post("/api/asset-models/{$model->id}", ['_method' => 'PUT', 'name' => 'P2422H', 'photo' => $this->photo()], ['Accept' => 'application/json'])
            ->assertOk()
            ->json('data.photo_url');

        Storage::disk('local')->assertMissing('model-photos/old.webp');
        $this->assertNotSame($before, $after);
    }

    public function test_remove_photo_deletes_the_file(): void
    {
        Storage::disk('local')->put('model-photos/old.webp', 'x');
        $model = AssetModel::create(['name' => 'MK270', 'photo_path' => 'model-photos/old.webp']);

        $this->actingAs($this->admin())
            ->putJson("/api/asset-models/{$model->id}", ['name' => 'MK270', 'remove_photo' => true])
            ->assertOk()
            ->assertJsonPath('data.photo_url', null);

        Storage::disk('local')->assertMissing('model-photos/old.webp');
        $this->assertNull($model->fresh()->photo_path);
    }

    public function test_an_edit_without_photo_fields_keeps_the_photo(): void
    {
        Storage::disk('local')->put('model-photos/keep.webp', 'x');
        $model = AssetModel::create(['name' => 'E14', 'photo_path' => 'model-photos/keep.webp']);

        $this->actingAs($this->admin())->putJson("/api/asset-models/{$model->id}", ['name' => 'E14 Gen 5'])->assertOk();

        $this->assertSame('model-photos/keep.webp', $model->fresh()->photo_path);
        Storage::disk('local')->assertExists('model-photos/keep.webp');
    }

    public function test_deleting_a_model_deletes_its_photo(): void
    {
        Storage::disk('local')->put('model-photos/gone.webp', 'x');
        $model = AssetModel::create(['name' => 'B100', 'photo_path' => 'model-photos/gone.webp']);

        $this->actingAs($this->admin())->deleteJson("/api/asset-models/{$model->id}")->assertOk();

        Storage::disk('local')->assertMissing('model-photos/gone.webp');
    }

    public function test_only_images_up_to_2mb_are_accepted(): void
    {
        $this->actingAs($this->admin());

        $this->post('/api/asset-models', ['name' => 'A', 'photo' => UploadedFile::fake()->create('a.pdf', 10, 'application/pdf')], ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('photo');
        $this->post('/api/asset-models', ['name' => 'B', 'photo' => UploadedFile::fake()->image('b.png')->size(2049)], ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('photo');
    }

    public function test_any_signed_in_user_can_open_a_photo_but_a_guest_cannot(): void
    {
        Storage::disk('local')->put('model-photos/a.webp', 'x');
        $model = AssetModel::create(['name' => 'A', 'photo_path' => 'model-photos/a.webp']);
        $url = route('files.model-photo', $model);

        $this->assertContains($this->getJson($url)->status(), [401, 403]);
        $this->actingAs(User::factory()->create(['role' => 'user']))->get($url)->assertOk();
    }

    public function test_a_photo_missing_on_disk_answers_404(): void
    {
        $model = AssetModel::create(['name' => 'A', 'photo_path' => 'model-photos/lost.webp']);

        $this->actingAs(User::factory()->create(['role' => 'user']))
            ->get(route('files.model-photo', $model))
            ->assertNotFound();
    }
}
