<?php

use App\Http\Controllers\Api\AssetModelController;
use App\Http\Controllers\Api\AuditLogController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BrandController;
use App\Http\Controllers\Api\CategoryController;
use App\Http\Controllers\Api\ContractController;
use App\Http\Controllers\Api\DepartmentController;
use App\Http\Controllers\Api\EmailTemplateController;
use App\Http\Controllers\Api\EmployeeController;
use App\Http\Controllers\Api\GroupRoleController;
use App\Http\Controllers\Api\LocationController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\PositionController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\RolePermissionController;
use App\Http\Controllers\Api\SettingsController;
use App\Http\Controllers\Api\StockItemController;
use App\Http\Controllers\Api\StockMovementController;
use App\Http\Controllers\Api\StockRequestController;
use App\Http\Controllers\Api\StockStatusController;
use App\Http\Controllers\Api\UnitController;
use App\Http\Controllers\Api\VendorController;
use App\Http\Controllers\Api\WarehouseController;
use App\Http\Controllers\Api\WarrantyTypeController;
use App\Http\Middleware\CheckSessionTimeout;
use Illuminate\Support\Facades\Route;

Route::post('login', [AuthController::class, 'login'])->name('api.login');
Route::get('settings', [SettingsController::class, 'show'])->name('api.settings.show');

Route::middleware(['auth:sanctum', CheckSessionTimeout::class])->group(function () {
    Route::post('logout', [AuthController::class, 'logout'])->name('api.logout');
    Route::get('me', [AuthController::class, 'me'])->name('api.me');
    // Lightweight heartbeat used by the session-timeout modal to refresh _sec_last_activity on the server.
    Route::get('session/ping', fn () => response()->json(['ok' => true]))->name('api.session.ping');
    Route::put('preferences', [AuthController::class, 'updatePreferences'])->name('api.preferences');
    Route::post('profile', [AuthController::class, 'updateProfile'])->name('api.profile.update');
    Route::put('password', [AuthController::class, 'changePassword'])->name('api.password.change');
    Route::put('settings', [SettingsController::class, 'update'])->name('api.settings.update');
    Route::post('settings/logo', [SettingsController::class, 'uploadLogo'])->name('api.settings.logo');
    Route::delete('settings/logo', [SettingsController::class, 'deleteLogo'])->name('api.settings.logo.delete');
    Route::get('settings/security', [SettingsController::class, 'security'])->name('api.settings.security');
    Route::put('settings/security', [SettingsController::class, 'updateSecurity'])->name('api.settings.security.update');
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

    // Master Data module
    Route::apiResource('brands', BrandController::class)->except(['show']);
    Route::apiResource('asset-models', AssetModelController::class)->except(['show']);
    Route::apiResource('categories', CategoryController::class)->except(['show']);
    Route::apiResource('vendors', VendorController::class)->except(['show']);
    Route::apiResource('warehouses', WarehouseController::class)->except(['show']);
    Route::apiResource('units', UnitController::class)->except(['show']);
    Route::apiResource('stock-statuses', StockStatusController::class)->except(['show']);
    Route::apiResource('warranty-types', WarrantyTypeController::class)->except(['show']);

    // Contract & Rental module
    Route::get('contracts/summary', [ContractController::class, 'summary'])->name('api.contracts.summary');
    Route::get('contracts/import-template', [ContractController::class, 'importTemplate'])->name('api.contracts.import-template');
    Route::post('contracts/import', [ContractController::class, 'import'])->name('api.contracts.import');
    Route::post('contracts/{contract}/renew', [ContractController::class, 'renew'])->name('api.contracts.renew');
    Route::post('contracts/{contract}/cancel', [ContractController::class, 'cancel'])->name('api.contracts.cancel');
    Route::apiResource('contracts', ContractController::class);

    // Stock / Inventory module
    Route::get('stock-items/summary', [StockItemController::class, 'summary'])->name('api.stock-items.summary');
    Route::apiResource('stock-items', StockItemController::class);
    Route::get('stock-movements', [StockMovementController::class, 'index'])->name('api.stock-movements.index');
    Route::post('stock-movements', [StockMovementController::class, 'store'])->name('api.stock-movements.store');
    Route::get('stock-requests', [StockRequestController::class, 'index'])->name('api.stock-requests.index');
    Route::post('stock-requests', [StockRequestController::class, 'store'])->name('api.stock-requests.store');
    Route::post('stock-requests/{stockRequest}/approve', [StockRequestController::class, 'approve'])->name('api.stock-requests.approve');
    Route::post('stock-requests/{stockRequest}/reject', [StockRequestController::class, 'reject'])->name('api.stock-requests.reject');
    Route::post('stock-requests/{stockRequest}/fulfill', [StockRequestController::class, 'fulfill'])->name('api.stock-requests.fulfill');

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
