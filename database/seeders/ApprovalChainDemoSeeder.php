<?php

namespace Database\Seeders;

use App\Models\AppSetting;
use App\Models\Employee;
use App\Models\Position;
use Illuminate\Database\Seeder;

/**
 * Demo data for the Org Approval Chain feature. Assigns position levels and a
 * manager reporting tree on top of the records OrgSeeder already created, then
 * sets the VP ceiling. Idempotent and safe on live data: it only updates
 * existing rows matched by code and never deletes or resets anything.
 */
class ApprovalChainDemoSeeder extends Seeder
{
    public function run(): void
    {
        $this->seedPositionLevels();
        $this->seedManagerTree();

        // Operations Director (level 5) is the VP that caps every chain.
        AppSetting::put('approval_ceiling_level', '5');
    }

    /**
     * Sets a level on each demo position (matched by code) to form a 5-tier
     * ladder: Operator(1) < Engineer/Tech(2) < Lead/Senior/Supervisor(3) <
     * Manager(4) < Director/VP(5). Unknown codes are left untouched.
     */
    private function seedPositionLevels(): void
    {
        $levels = [
            'P-001' => 4, // Plant Manager
            'P-002' => 1, // SMT Operator
            'P-003' => 3, // QA Lead
            'P-004' => 2, // QC Technician
            'P-005' => 5, // Operations Director (VP ceiling)
            'P-006' => 3, // Senior Accountant
            'P-007' => 3, // Warehouse Supervisor
            'P-008' => 4, // HR Manager
            'P-009' => 4, // IT Manager
            'P-010' => 2, // Network Engineer
            'P-011' => 4, // Sales Manager
            'P-012' => 3, // Equipment Engineer
        ];

        foreach ($levels as $code => $level) {
            Position::where('code', $code)->update(['level' => $level]);
        }
    }

    /**
     * Wires each employee's manager_id (matched by code). Every department head
     * reports to the Operations Director; front-line staff report to their own
     * department head, giving multi-step chains that stop at the VP ceiling.
     */
    private function seedManagerTree(): void
    {
        // Map: subordinate code => manager code (null = top of the tree / VP).
        $reportsTo = [
            'EMP-1213' => null,       // Decha — Operations Director (top / VP)

            // Department heads report to the Operations Director.
            'EMP-1042' => 'EMP-1213', // Krittin — Plant Manager
            'EMP-1108' => 'EMP-1213', // Suwanna — QA Lead
            'EMP-1305' => 'EMP-1213', // Nattaya — Senior Accountant
            'EMP-1422' => 'EMP-1213', // Manat — Warehouse Supervisor
            'EMP-1509' => 'EMP-1213', // Siriporn — HR Manager
            'EMP-1617' => 'EMP-1213', // Krit — IT Manager
            'EMP-1901' => 'EMP-1213', // Apinya — Sales Manager
            'EMP-2003' => 'EMP-1213', // Worawut — Equipment Engineer

            // Front-line staff report to their department head.
            'EMP-1834' => 'EMP-1042', // Pongsak (SMT Operator) -> Plant Manager
            'EMP-2115' => 'EMP-1108', // Pimchada (QC Technician) -> QA Lead
            'EMP-1718' => 'EMP-1617', // Thanapon (Network Engineer) -> IT Manager

            // Resigned demo employees still get a manager so their chain renders.
            'EMP-2208' => 'EMP-1042', // Prayut (SMT Operator) -> Plant Manager
            'EMP-2301' => 'EMP-1213', // Waraporn (Sales Manager) -> Operations Director
        ];

        $idByCode = Employee::whereIn('code', array_keys($reportsTo))->pluck('id', 'code');

        foreach ($reportsTo as $code => $managerCode) {
            if (! isset($idByCode[$code])) {
                continue;
            }
            Employee::where('code', $code)->update([
                'manager_id' => $managerCode === null ? null : ($idByCode[$managerCode] ?? null),
            ]);
        }
    }
}
