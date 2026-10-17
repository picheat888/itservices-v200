<?php

namespace App\Models\Stock;

use App\Models\Concerns\RecordsActors;
use Illuminate\Database\Eloquent\Model;

class Warehouse extends Model
{
    use RecordsActors;

    protected $fillable = ['name', 'description'];

    /**
     * Resolve a warehouse name to its master id. The 'Unassigned' sentinel and blank
     * names map to null (stock with no chosen warehouse) — no fake master row is made.
     * A real name that is somehow missing is created (data is otherwise always clean).
     */
    /** The id of an existing warehouse by name; null for anything else (a vendor, a person, 'Unassigned'). */
    public static function idOf(?string $name): ?int
    {
        $name = trim((string) $name);

        return $name === '' ? null : static::query()->where('name', $name)->value('id');
    }

    public static function resolveId(?string $name): ?int
    {
        $name = trim((string) $name);
        if ($name === '' || $name === 'Unassigned') {
            return null;
        }

        return static::firstOrCreate(['name' => $name])->id;
    }
}
