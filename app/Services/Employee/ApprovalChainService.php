<?php

namespace App\Services\Employee;

use App\Models\Employee\Employee;
use Illuminate\Support\Collection;

class ApprovalChainService
{
    /**
     * The employee's approval chain: climb the manager_id reporting tree from the
     * employee up to the root, collecting each manager in order (direct manager
     * first). Stops at the top of the tree or on a detected cycle. Position level
     * is irrelevant — whoever the actual manager is, is the next link.
     *
     * @return Collection<int, Employee>
     */
    public function chainFor(Employee $employee): Collection
    {
        $chain = collect();
        $seen = [$employee->id];
        $current = $employee;

        while (true) {
            $manager = $current->manager()->with(['position', 'department'])->first();
            if ($manager === null || in_array($manager->id, $seen, true)) {
                break;
            }

            $chain->push($manager);
            $seen[] = $manager->id;
            $current = $manager;
        }

        return $chain;
    }
}
