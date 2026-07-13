<?php

use App\Http\Controllers\Api\Access\AccessController;
use App\Http\Controllers\Api\Access\EmailGroupController;
use App\Http\Controllers\Api\Access\FileShareController;
use App\Http\Controllers\Api\Access\SocialPlatformController;
use App\Http\Controllers\Api\Access\SoftwareController;
use App\Http\Controllers\Api\Asset\AssetController;
use App\Http\Controllers\Api\Auth\AuthController;
use App\Http\Controllers\Api\Contract\ContractAttachmentController;
use App\Http\Controllers\Api\Contract\ContractController;
use App\Http\Controllers\Api\Email\EmailTemplateController;
use App\Http\Controllers\Api\Employee\DepartmentController;
use App\Http\Controllers\Api\Employee\EmployeeController;
use App\Http\Controllers\Api\Employee\PositionController;
use App\Http\Controllers\Api\Employee\SectionController;
use App\Http\Controllers\Api\Notification\NotificationController;
use App\Http\Controllers\Api\Permission\AuditLogController;
use App\Http\Controllers\Api\Permission\GroupRoleController;
use App\Http\Controllers\Api\Permission\RoleController;
use App\Http\Controllers\Api\Permission\RolePermissionController;
use App\Http\Controllers\Api\Settings\AssetModelController;
use App\Http\Controllers\Api\Settings\BrandController;
use App\Http\Controllers\Api\Settings\CategoryController;
use App\Http\Controllers\Api\Settings\LocationController;
use App\Http\Controllers\Api\Settings\SettingsController;
use App\Http\Controllers\Api\Settings\UnitController;
use App\Http\Controllers\Api\Settings\VendorController;
use App\Http\Controllers\Api\Settings\WarrantyTypeController;
use App\Http\Controllers\Api\Stock\StockCountController;
use App\Http\Controllers\Api\Stock\StockItemController;
use App\Http\Controllers\Api\Stock\StockMovementController;
use App\Http\Controllers\Api\Stock\StockRequestController;
use App\Http\Controllers\Api\Stock\WarehouseController;
use App\Http\Controllers\Api\Ticket\TicketAttachmentController;
use App\Http\Controllers\Api\Ticket\TicketController;
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
    Route::put('settings/company', [SettingsController::class, 'updateCompany'])
        ->middleware('permission:settings.company')->name('api.settings.company');
    Route::put('settings/branding', [SettingsController::class, 'updateBranding'])
        ->middleware('permission:settings.system')->name('api.settings.branding');
    Route::put('settings/display', [SettingsController::class, 'updateDisplay'])
        ->middleware('permission:settings.system')->name('api.settings.display');
    Route::put('settings/assets', [SettingsController::class, 'updateAssets'])
        ->middleware('permission:settings.assets')->name('api.settings.assets');
    Route::put('settings/sla', [SettingsController::class, 'updateSla'])
        ->middleware('permission:settings.sla')->name('api.settings.sla');
    Route::post('settings/logo', [SettingsController::class, 'uploadLogo'])
        ->middleware('permission:settings.system')->name('api.settings.logo');
    Route::delete('settings/logo', [SettingsController::class, 'deleteLogo'])
        ->middleware('permission:settings.system')->name('api.settings.logo.delete');
    Route::get('settings/security', [SettingsController::class, 'security'])->name('api.settings.security');
    Route::put('settings/security', [SettingsController::class, 'updateSecurity'])
        ->middleware('permission:settings.security')->name('api.settings.security.update');
    Route::get('settings/mail', [SettingsController::class, 'mailSettings'])
        ->middleware('permission:settings.email')->name('api.settings.mail');
    Route::put('settings/mail', [SettingsController::class, 'updateMailSettings'])
        ->middleware('permission:settings.email')->name('api.settings.mail.update');
    Route::post('settings/mail/test', [SettingsController::class, 'testMail'])
        ->middleware('permission:settings.email')->name('api.settings.mail.test');

    // Email Notifications (templates)
    Route::get('email-templates', [EmailTemplateController::class, 'index'])->name('api.email-templates.index');
    Route::post('email-templates', [EmailTemplateController::class, 'store'])->name('api.email-templates.store');
    Route::put('email-templates/{emailTemplate}', [EmailTemplateController::class, 'update'])->name('api.email-templates.update');
    Route::post('email-templates/{emailTemplate}/test', [EmailTemplateController::class, 'test'])->name('api.email-templates.test');
    Route::get('email-templates/{emailTemplate}/preview', [EmailTemplateController::class, 'preview'])->name('api.email-templates.preview');
    Route::post('email-templates/render-preview', [EmailTemplateController::class, 'renderPreview'])->name('api.email-templates.render-preview');
    Route::post('email-templates/reset-all', [EmailTemplateController::class, 'resetAll'])->name('api.email-templates.reset-all');
    Route::post('email-templates/{emailTemplate}/reset', [EmailTemplateController::class, 'reset'])->name('api.email-templates.reset');

    // Employee module
    Route::get('employees/summary', [EmployeeController::class, 'summary'])->name('api.employees.summary');
    Route::get('employees/import-template', [EmployeeController::class, 'importTemplate'])->name('api.employees.import-template');
    Route::post('employees/import', [EmployeeController::class, 'import'])->name('api.employees.import');
    Route::post('employees/{employee}/resign', [EmployeeController::class, 'resign'])->name('api.employees.resign');
    Route::post('employees/{employee}/cancel-resign', [EmployeeController::class, 'cancelResign'])->name('api.employees.cancel-resign');
    Route::post('employees/{employee}/reset-password', [EmployeeController::class, 'resetPassword'])->name('api.employees.reset-password');
    Route::post('employees/{employee}/credentials', [EmployeeController::class, 'credentials'])->name('api.employees.credentials');
    Route::get('employees/{employee}/approval-chain', [EmployeeController::class, 'approvalChain'])->name('api.employees.approval-chain');
    Route::get('employees/{employee}/assets', [EmployeeController::class, 'assets'])->name('api.employees.assets');
    Route::get('employees/org-chart', [EmployeeController::class, 'orgChart'])->name('api.employees.org-chart');
    Route::apiResource('employees', EmployeeController::class);
    Route::get('positions/{position}/members', [PositionController::class, 'members'])->name('api.positions.members');
    Route::apiResource('positions', PositionController::class)->except(['show']);
    Route::get('departments/{department}/members', [DepartmentController::class, 'members'])->name('api.departments.members');
    Route::apiResource('departments', DepartmentController::class)->except(['show']);
    Route::get('sections/{section}/members', [SectionController::class, 'members'])->name('api.sections.members');
    Route::apiResource('sections', SectionController::class)->only(['index', 'store', 'update', 'destroy']);
    // Master Data — reads open (consumed by Asset/Contract/Stock forms); writes gated by settings.masterdata.
    Route::get('brands', [BrandController::class, 'index'])->name('api.brands.index');
    Route::get('asset-models', [AssetModelController::class, 'index'])->name('api.asset-models.index');
    Route::get('categories', [CategoryController::class, 'index'])->name('api.categories.index');
    Route::get('vendors', [VendorController::class, 'index'])->name('api.vendors.index');
    Route::get('warehouses', [WarehouseController::class, 'index'])->name('api.warehouses.index');
    Route::get('units', [UnitController::class, 'index'])->name('api.units.index');
    Route::get('warranty-types', [WarrantyTypeController::class, 'index'])->name('api.warranty-types.index');
    Route::get('locations', [LocationController::class, 'index'])->name('api.locations.index');

    Route::middleware('permission:settings.masterdata')->group(function () {
        Route::apiResource('brands', BrandController::class)->except(['show', 'index']);
        Route::apiResource('asset-models', AssetModelController::class)->except(['show', 'index']);
        Route::apiResource('categories', CategoryController::class)->except(['show', 'index']);
        Route::apiResource('vendors', VendorController::class)->except(['show', 'index']);
        Route::apiResource('warehouses', WarehouseController::class)->except(['show', 'index']);
        Route::apiResource('units', UnitController::class)->except(['show', 'index']);
        Route::apiResource('warranty-types', WarrantyTypeController::class)->except(['show', 'index']);
        Route::apiResource('locations', LocationController::class)->except(['show', 'index']);
    });

    // Contract & Rental module
    Route::get('contracts/summary', [ContractController::class, 'summary'])->name('api.contracts.summary');
    Route::get('contracts/import-template', [ContractController::class, 'importTemplate'])->name('api.contracts.import-template');
    Route::post('contracts/import', [ContractController::class, 'import'])->name('api.contracts.import');
    Route::post('contracts/{contract}/cancel', [ContractController::class, 'cancel'])->name('api.contracts.cancel');
    Route::post('contracts/{contract}/expire', [ContractController::class, 'expire'])->name('api.contracts.expire');
    Route::post('contracts/{contract}/reactivate', [ContractController::class, 'reactivate'])->name('api.contracts.reactivate');
    Route::post('contracts/{contract}/attachments', [ContractAttachmentController::class, 'store'])->name('api.contracts.attachments.store');
    Route::delete('contracts/{contract}/attachments/{attachment}', [ContractAttachmentController::class, 'destroy'])->name('api.contracts.attachments.destroy');
    Route::apiResource('contracts', ContractController::class);

    // Ticket module
    Route::get('tickets/summary', [TicketController::class, 'summary'])->name('api.tickets.summary');
    Route::get('tickets/staff', [TicketController::class, 'staff'])->name('api.tickets.staff');
    Route::post('tickets/{ticket}/take', [TicketController::class, 'take'])->name('api.tickets.take');
    Route::post('tickets/{ticket}/assign', [TicketController::class, 'assign'])->name('api.tickets.assign');
    Route::post('tickets/{ticket}/resolve', [TicketController::class, 'resolve'])->name('api.tickets.resolve');
    Route::post('tickets/{ticket}/attachments', [TicketAttachmentController::class, 'store'])->name('api.tickets.attachments.store');
    Route::delete('tickets/{ticket}/attachments/{attachment}', [TicketAttachmentController::class, 'destroy'])->name('api.tickets.attachments.destroy');
    Route::apiResource('tickets', TicketController::class)->except(['update']);

    // Assets Management module
    Route::get('assets/summary', [AssetController::class, 'summary'])->name('api.assets.summary');
    Route::get('assets/linkable', [AssetController::class, 'linkable'])->name('api.assets.linkable');
    Route::get('assets/contract-options', [AssetController::class, 'contractOptions'])->name('api.assets.contract-options');
    Route::get('assets/transfers', [AssetController::class, 'transfers'])->name('api.assets.transfers');
    Route::get('assets/mine', [AssetController::class, 'mine'])->name('api.assets.mine');
    Route::post('assets/bulk', [AssetController::class, 'bulk'])->name('api.assets.bulk');
    Route::post('assets/bulk-transfer', [AssetController::class, 'bulkTransfer'])->name('api.assets.bulk-transfer');
    Route::post('assets/bulk-recall', [AssetController::class, 'bulkRecall'])->name('api.assets.bulk-recall');
    Route::post('assets/bulk-receive', [AssetController::class, 'bulkReceive'])->name('api.assets.bulk-receive');
    Route::post('assets/{asset}/transfer', [AssetController::class, 'transfer'])->name('api.assets.transfer');
    Route::post('assets/{asset}/accept', [AssetController::class, 'accept'])->name('api.assets.accept');
    Route::post('assets/{asset}/request-return', [AssetController::class, 'requestReturn'])->name('api.assets.request-return');
    Route::post('assets/{asset}/receive', [AssetController::class, 'markReceived'])->name('api.assets.receive');
    Route::post('assets/{asset}/recall', [AssetController::class, 'recall'])->name('api.assets.recall');
    Route::post('assets/{asset}/cancel-writeoff', [AssetController::class, 'cancelWriteoff'])->name('api.assets.cancel-writeoff');
    Route::get('assets/{asset}/contract', [AssetController::class, 'contract'])->name('api.assets.contract');
    Route::apiResource('assets', AssetController::class);

    // Stock / Inventory module
    Route::get('stock-items/summary', [StockItemController::class, 'summary'])->name('api.stock-items.summary');
    Route::get('stock-items/serials', [StockItemController::class, 'serials'])->name('api.stock-items.serials');
    Route::get('stock-items/{stockItem}/history', [StockItemController::class, 'history'])->name('api.stock-items.history');
    Route::get('stock-items/{stockItem}/history/pdf', [StockItemController::class, 'historyPdf'])->name('api.stock-items.history-pdf');
    Route::apiResource('stock-items', StockItemController::class);
    Route::get('stock-movements', [StockMovementController::class, 'index'])->name('api.stock-movements.index');
    Route::get('stock-movements/{movement}/serials', [StockMovementController::class, 'serials'])->name('api.stock-movements.serials');
    Route::get('stock-movements/{movement}/labels/pdf', [StockMovementController::class, 'labelsPdf'])->name('api.stock-movements.labels-pdf');
    Route::post('stock-movements', [StockMovementController::class, 'store'])->name('api.stock-movements.store');
    Route::get('stock-requests', [StockRequestController::class, 'index'])->name('api.stock-requests.index');
    Route::post('stock-requests', [StockRequestController::class, 'store'])->name('api.stock-requests.store');
    Route::post('stock-requests/{stockRequest}/approve', [StockRequestController::class, 'approve'])->name('api.stock-requests.approve');
    Route::post('stock-requests/{stockRequest}/reject', [StockRequestController::class, 'reject'])->name('api.stock-requests.reject');
    Route::post('stock-requests/{stockRequest}/fulfill', [StockRequestController::class, 'fulfill'])->name('api.stock-requests.fulfill');
    Route::post('stock-counts/{stockCount}/commit', [StockCountController::class, 'commit'])->name('api.stock-counts.commit');
    Route::apiResource('stock-counts', StockCountController::class)->except(['edit', 'create']);

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

    // Access Control — reads gated by access.view, writes by access.manage
    Route::middleware('permission:access.view')->group(function () {
        Route::get('email-groups', [EmailGroupController::class, 'index']);
        Route::get('file-shares', [FileShareController::class, 'index']);
        Route::get('social-platforms', [SocialPlatformController::class, 'index']);
        Route::get('email-groups/{emailGroup}/members', [EmailGroupController::class, 'members']);
        Route::get('file-shares/{fileShare}/members', [FileShareController::class, 'members']);
        Route::get('social-platforms/{socialPlatform}/members', [SocialPlatformController::class, 'members']);
        Route::get('software', [SoftwareController::class, 'index']);
        Route::get('software/{software}/members', [SoftwareController::class, 'members']);
        Route::get('employees/{employee}/access', [AccessController::class, 'employee']);
    });
    Route::middleware('permission:access.manage')->group(function () {
        Route::apiResource('email-groups', EmailGroupController::class)->except(['index', 'show']);
        Route::apiResource('file-shares', FileShareController::class)->except(['index', 'show']);
        Route::apiResource('social-platforms', SocialPlatformController::class)->except(['index', 'show']);
        Route::post('email-groups/{emailGroup}/members', [EmailGroupController::class, 'addMember']);
        Route::post('email-groups/{emailGroup}/members/{membership}/revoke', [EmailGroupController::class, 'revokeMember']);
        Route::post('file-shares/{fileShare}/members', [FileShareController::class, 'addMember']);
        Route::post('file-shares/{fileShare}/members/{membership}/revoke', [FileShareController::class, 'revokeMember']);
        Route::post('social-platforms/{socialPlatform}/members', [SocialPlatformController::class, 'addMember']);
        Route::post('social-platforms/{socialPlatform}/members/{membership}/revoke', [SocialPlatformController::class, 'revokeMember']);
        Route::apiResource('software', SoftwareController::class)->except(['index', 'show']);
        Route::post('software/{software}/members', [SoftwareController::class, 'addMember']);
        Route::post('software/{software}/members/{membership}/revoke', [SoftwareController::class, 'revokeMember']);
    });
});
