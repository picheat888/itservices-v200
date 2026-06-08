<?php

namespace App\Services;

use App\Models\AppSetting;
use App\Models\Employee;
use App\Models\Position;
use Illuminate\Support\Collection;

class ApprovalChainService
{
    /**
     * Resolve an employee's approval chain by climbing the manager reporting
     * tree. Each manager is collected in order (direct manager first). The walk
     * stops once it includes the first manager whose position level reaches the
     * configured VP ceiling, or at the tree root, or on a detected cycle.
     *
     * @return Collection<int, Employee>
     */
    public function chainFor(Employee $employee): Collection
    {
        $ceiling = $this->ceilingLevel();
        $chain = collect();
        $seen = [$employee->id];
        $current = $employee;

        while (true) {
            $manager = $current->manager()->with('position')->first();
            if ($manager === null || in_array($manager->id, $seen, true)) {
                break;
            }

            $chain->push($manager);
            $seen[] = $manager->id;

            if (($manager->position?->level ?? 0) >= $ceiling) {
                break;
            }

            $current = $manager;
        }

        return $chain;
    }

    /**
     * The level treated as VP — the configured value, or the highest position
     * level present when unset (so the top tier caps the chain by default).
     */
    public function ceilingLevel(): int
    {
        $configured = AppSetting::get('approval_ceiling_level');
        if ($configured !== null && $configured !== '') {
            return (int) $configured;
        }

        return (int) (Position::max('level') ?? 1);
    }
}
