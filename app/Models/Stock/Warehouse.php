<?php

namespace App\Models\Stock;

use Illuminate\Database\Eloquent\Model;

class Warehouse extends Model
{
    protected $fillable = ['name', 'description'];

    /**
     * Resolve a warehouse name to its master id. The 'Unassigned' sentinel and blank
     * names map to null (stock with no chosen warehouse) — no fake master row is made.
     * A real name that is somehow missing is created (data is otherwise always clean).
     */
    public static function resolveId(?string $name): ?int
    {
        $name = trim((string) $name);
        if ($name === '' || $name === 'Unassigned') {
            return null;
        }

        return static::firstOrCreate(['name' => $name])->id;
    }
}
