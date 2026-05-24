<?php

use App\Http\Controllers\Api\AuditLogController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DepartmentController;
use App\Http\Controllers\Api\EmailTemplateController;
use App\Http\Controllers\Api\EmployeeController;
use App\Http\Controllers\Api\GroupRoleController;
use App\Http\Controllers\Api\LocationController;
use App\Http\Controllers\Api\PositionController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\RolePermissionController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\SettingsController;
use Illuminate\Support\Facades\Route;

Route::post('login', [AuthController::class, 'login'])->name('api.login');
Route::get('settings', [SettingsController::class, 'show'])->name('api.settings.show');

Route::middleware('auth:sanctum')->group(function () {
    Route::post('logout', [AuthController::class, 'logout'])->name('api.logout');
    Route::get('me', [AuthController::class, 'me'])->name('api.me');
    Route::put('preferences', [AuthController::class, 'updatePreferences'])->name('api.preferences');
    Route::put('settings', [SettingsController::class, 'update'])->name('api.settings.update');
    Route::post('settings/logo', [SettingsController::class, 'uploadLogo'])->name('api.settings.logo');
    Route::delete('settings/logo', [SettingsController::class, 'deleteLogo'])->name('api.settings.logo.delete');
    Route::get('settings/mail', [SettingsController::class, 'mailSettings'])->name('api.settings.mail');
    Route::put('settings/mail', [SettingsController::class, 'updateMailSettings'])->name('api.settings.mail.update');
    Route::post('settings/mail/test', [SettingsController::class, 'testMail'])->name('api.settings.mail.test');

    // Email Notifications (templates)
    Route::get('email-templates', [EmailTemplateController::class, 'index'])->name('api.email-templates.index');
    Route::post('email-templates', [EmailTemplateController::class, 'store'])->name('api.email-templates.store');
    Route::put('email-templates/{emailTemplate}', [EmailTemplateController::class, 'update'])->name('api.email-templates.update');
    Route::post('email-templates/{emailTemplate}/test', [EmailTemplateController::class, 'test'])->name('api.email-templates.test');

    // Employee module
    Route::get('employees/summary', [EmployeeController::class, 'summary'])->name('api.employees.summary');
    Route::get('employees/import-template', [EmployeeController::class, 'importTemplate'])->name('api.employees.import-template');
    Route::post('employees/import', [EmployeeController::class, 'import'])->name('api.employees.import');
    Route::post('employees/{employee}/resign', [EmployeeController::class, 'resign'])->name('api.employees.resign');
    Route::post('employees/{employee}/cancel-resign', [EmployeeController::class, 'cancelResign'])->name('api.employees.cancel-resign');
    Route::post('employees/{employee}/reset-password', [EmployeeController::class, 'resetPassword'])->name('api.employees.reset-password');
    Route::post('employees/{employee}/credentials', [EmployeeController::class, 'credentials'])->name('api.employees.credentials');
    Route::apiResource('employees', EmployeeController::class);
    Route::apiResource('positions', PositionController::class)->except(['show']);
    Route::get('departments/{department}/members', [DepartmentController::class, 'members'])->name('api.departments.members');
    Route::apiResource('departments', DepartmentController::class)->except(['show']);
    Route::apiResource('locations', LocationController::class)->except(['show']);

    // Permissions / RBAC + audit
    Route::get('permissions', [RolePermissionController::class, 'index'])->name('api.permissions.index');
    Route::put('permissions/default-role', [RolePermissionController::class, 'setDefaultRole'])->name('api.permissions.default-role');
    Route::get('permissions/{role}/members', [RolePermissionController::class, 'members'])->name('api.permissions.members');
    Route::put('permissions/{role}', [RolePermissionController::class, 'update'])->name('api.permissions.update');
    Route::post('roles', [RoleController::class, 'store'])->name('api.roles.store');
    Route::put('roles/{key}', [RoleController::class, 'update'])->name('api.roles.update');
    Route::delete('roles/{key}', [RoleController::class, 'destroy'])->name('api.roles.destroy');
    Route::apiResource('group-roles', GroupRoleController::class)->only(['index', 'store', 'update', 'destroy']);
    Route::put('group-roles-default', [GroupRoleController::class, 'setDefaultGroup'])->name('api.group-roles.default');
    Route::get('audit-logs', [AuditLogController::class, 'index'])->name('api.audit.index');

    // Notifications
    Route::get('notifications', [NotificationController::class, 'index'])->name('api.notifications.index');
    Route::put('notifications/read-all', [NotificationController::class, 'markAllRead'])->name('api.notifications.read-all');
    Route::put('notifications/{id}/read', [NotificationController::class, 'markRead'])->name('api.notifications.read');
    Route::delete('notifications/{id}', [NotificationController::class, 'destroy'])->name('api.notifications.destroy');
});
