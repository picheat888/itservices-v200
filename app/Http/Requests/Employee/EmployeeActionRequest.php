<?php

// Base for the actions on one employee (resign, set or change their login).

namespace App\Http\Requests\Employee;

use App\Models\Employee\Employee;
use App\Services\Employee\EmployeeActionGuard;
use Illuminate\Foundation\Http\FormRequest;

abstract class EmployeeActionRequest extends FormRequest
{
    public function employee(): Employee
    {
        return $this->route('employee');
    }

    protected function guard(): EmployeeActionGuard
    {
        return $this->container->make(EmployeeActionGuard::class);
    }
}
