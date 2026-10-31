<?php

// Who may read, edit, resign, delete or set the login of an employee, and in which state.
// Answers are gate Responses carrying the codes the SPA translates (super_account, own_account, already_resigned, ...).

namespace App\Services\Employee;

use App\Enums\Employee\EmployeeStatus;
use App\Models\Employee\Employee;
use App\Models\User;
use App\Support\SuperAdmins;
use Illuminate\Auth\Access\Response;

class EmployeeActionGuard
{
    public function canView(?User $user): Response
    {
        return $this->permitted($user, 'employees.view');
    }

    public function canViewOverview(?User $user): Response
    {
        return $this->permitted($user, 'employees.view_dashboard');
    }

    public function canViewOrgChart(?User $user): Response
    {
        return $this->permitted($user, 'employees.view_org');
    }

    public function canImport(?User $user): Response
    {
        return $this->permitted($user, 'employees.import');
    }

    /** The Add Employee form and the day-one service lookups it makes. */
    public function canAdd(?User $user): Response
    {
        return $this->permitted($user, 'employees.add');
    }

    /** The Employee module's detail view, or your own profile. */
    public function canShow(?User $user, Employee $employee): Response
    {
        return $user?->hasPermission('employees.view') || $this->isOwnRecord($user, $employee) ? Response::allow() : $this->forbidden();
    }

    /** Administrator employees are edited by an Administrator only. */
    public function canEdit(?User $user, Employee $employee): Response
    {
        return match (true) {
            ! $user?->hasPermission('employees.edit') => $this->forbidden(),
            $this->isAdministratorOutOfReach($user, $employee) => $this->forbidden('Only an Administrator can edit an Administrator account.'),
            default => Response::allow(),
        };
    }

    /** A first login for someone who has none (employees.set_credentials). */
    public function canCreateLogin(?User $user, Employee $employee): Response
    {
        return match (true) {
            ! $user?->hasPermission('employees.set_credentials') => $this->forbidden(),
            $employee->user()->exists() => $this->refused('Employee already has a login account.'),
            // An Administrator-group member's new login would be super
            $this->isAdministratorOutOfReach($user, $employee) => $this->forbidden('super_account'),
            default => Response::allow(),
        };
    }

    /** Renaming or resetting an existing login; the rights for each part come from canChangeLogin. */
    public function canManageLogin(?User $user, Employee $employee): Response
    {
        return match (true) {
            ! $employee->user => $this->refused('no_account'),
            $this->isAdministratorOutOfReach($user, $employee) => $this->forbidden('super_account'),
            default => Response::allow(),
        };
    }

    /** Both rights are checked before the first write. */
    public function canChangeLogin(?User $user, bool $renaming, bool $resetting): Response
    {
        return match (true) {
            ! $renaming && ! $resetting => $this->refused('Nothing to update.'),
            $renaming && ! $user?->hasPermission('employees.set_credentials') => $this->forbidden(),
            $resetting && ! $user?->hasPermission('employees.reset_password') => $this->forbidden(),
            default => Response::allow(),
        };
    }

    public function canResign(?User $user, Employee $employee): Response
    {
        return match (true) {
            ! $user?->hasPermission('employees.resign') => $this->forbidden(),
            $this->isOwnLinkedRecord($user, $employee) => Response::deny('own_account', 'own_account_resign'),
            $this->isAdministratorOutOfReach($user, $employee) => $this->forbidden('super_account'),
            $employee->status === EmployeeStatus::Resigned => $this->refused('already_resigned'),
            $employee->isSuperAdmin() && ! SuperAdmins::keeperRemainsBesides($employee) => Response::denyWithStatus(422, 'last_super_admin', 'last_super_admin'),
            default => Response::allow(),
        };
    }

    public function canCancelResign(?User $user, Employee $employee): Response
    {
        return match (true) {
            ! $user?->hasPermission('employees.cancel_resign') => $this->forbidden(),
            $this->isAdministratorOutOfReach($user, $employee) => $this->forbidden('super_account'),
            $employee->status !== EmployeeStatus::Resigned => $this->refused('Employee is not resigned.'),
            default => Response::allow(),
        };
    }

    /** Rights only; what still refers to the employee is EmployeeService::deletionBlockers. */
    public function canDelete(?User $user, Employee $employee): Response
    {
        return match (true) {
            ! $user?->hasPermission('employees.delete') => $this->forbidden(),
            $this->isOwnLinkedRecord($user, $employee) => Response::deny('own_account', 'own_account_delete'),
            $this->isAdministratorOutOfReach($user, $employee) => $this->forbidden('super_account'),
            default => Response::allow(),
        };
    }

    private function isOwnRecord(?User $user, Employee $employee): bool
    {
        return $user?->employee_id !== null && (int) $user->employee_id === (int) $employee->id;
    }

    /** Any of the employees the signed-in user's accounts are linked to. */
    private function isOwnLinkedRecord(?User $user, Employee $employee): bool
    {
        return $user !== null && in_array($employee->id, $user->linkedEmployeeIds(), true);
    }

    private function isAdministratorOutOfReach(?User $user, Employee $employee): bool
    {
        return $employee->isSuperAdmin() && ! $user?->isSuper();
    }

    private function permitted(?User $user, string $permission): Response
    {
        return $user?->hasPermission($permission) ? Response::allow() : $this->forbidden();
    }

    private function forbidden(string $message = ''): Response
    {
        return Response::deny($message);
    }

    private function refused(string $message): Response
    {
        return Response::denyWithStatus(422, $message);
    }
}
