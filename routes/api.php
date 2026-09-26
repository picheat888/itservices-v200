<?php

use App\Http\Controllers\Api\Access\AccessController;
use App\Http\Controllers\Api\Access\EmailGroupController;
use App\Http\Controllers\Api\Access\FileShareController;
use App\Http\Controllers\Api\Access\MyAccessController;
use App\Http\Controllers\Api\Access\SocialPlatformController;
use App\Http\Controllers\Api\Access\SoftwareController;
use App\Http\Controllers\Api\Asset\AssetController;
use App\Http\Controllers\Api\Auth\AuthController;
use App\Http\Controllers\Api\Contract\ContractAttachmentController;
use App\Http\Controllers\Api\Contract\ContractController;
use App\Http\Controllers\Api\Dashboard\DashboardController;
use App\Http\Controllers\Api\Email\EmailLogController;
use App\Http\Controllers\Api\Email\EmailTemplateController;
use App\Http\Controllers\Api\Employee\DepartmentController;
use App\Http\Controllers\Api\Employee\EmployeeController;
use App\Http\Controllers\Api\Employee\PositionController;
use App\Http\Controllers\Api\Employee\SectionController;
use App\Http\Controllers\Api\Notification\NotificationController;
use App\Http\Controllers\Api\Notification\NotificationTemplateController;
use App\Http\Controllers\Api\Permission\AuditLogController;
use App\Http\Controllers\Api\Permission\GroupRoleController;
use App\Http\Controllers\Api\Permission\RoleController;
use App\Http\Controllers\Api\Permission\RolePermissionController;
use App\Http\Controllers\Api\Report\ReportController;
use App\Http\Controllers\Api\Report\TabularReportController;
use App\Http\Controllers\Api\Report\TicketOverviewReportController;
use App\Http\Controllers\Api\Request\RequestController;
use App\Http\Controllers\Api\Request\RequestOptionsController;
use App\Http\Controllers\Api\Settings\AssetModelController;
use App\Http\Controllers\Api\Settings\BrandController;
use App\Http\Controllers\Api\Settings\CategoryController;
use App\Http\Controllers\Api\Settings\LocationController;
use App\Http\Controllers\Api\Settings\RequestOptionController;
use App\Http\Controllers\Api\Settings\SettingsController;
use App\Http\Controllers\Api\Settings\UnitController;
use App\Http\Controllers\Api\Settings\VendorController;
use App\Http\Controllers\Api\Settings\WarrantyTypeController;
use App\Http\Controllers\Api\Sidebar\SidebarBadgeController;
use App\Http\Controllers\Api\Stock\StockCountController;
use App\Http\Controllers\Api\Stock\StockItemController;
use App\Http\Controllers\Api\Stock\StockMovementController;
use App\Http\Controllers\Api\Stock\StockRequestController;
use App\Http\Controllers\Api\Stock\WarehouseController;
use App\Http\Controllers\Api\Ticket\TicketAttachmentController;
use App\Http\Controllers\Api\Ticket\TicketController;
use App\Http\Controllers\Api\Workflow\WorkflowController;
use App\Http\Middleware\BlockResignedEmployees;
use App\Http\Middleware\CheckPasswordExpiry;
use App\Http\Middleware\CheckSessionTimeout;
use Illuminate\Support\Facades\Route;

Route::post('login', [AuthController::class, 'login'])->name('api.login');
Route::get('settings', [SettingsController::class, 'show'])->name('api.settings.show');

/**
 * CheckPasswordExpiry answers 403 password_expired while an account still owes a
 * password change, so the forced change is enforced by the API and not only by the
 * dialog the SPA shows. Four routes opt out, or the lock would have no exit:
 * `me` is how the SPA learns it must ask, `password` is the way out, `logout` must
 * always work, and the heartbeat keeps the session alive while the form is open.
 */
Route::middleware(['auth:sanctum', CheckSessionTimeout::class, BlockResignedEmployees::class, CheckPasswordExpiry::class])->group(function () {
    // BlockResignedEmployees stands down here so somebody whose resignation landed
    // mid-session can still clear their own cookie rather than being 401'd out of the
    // only route that tidies up after them.
    Route::post('logout', [AuthController::class, 'logout'])
        ->withoutMiddleware([CheckPasswordExpiry::class, BlockResignedEmployees::class])->name('api.logout');
    Route::get('me', [AuthController::class, 'me'])
        ->withoutMiddleware(CheckPasswordExpiry::class)->name('api.me');
    // Lightweight heartbeat used by the session-timeout modal to refresh _sec_last_activity on the server.
    Route::get('session/ping', fn () => response()->json(['ok' => true]))
        ->withoutMiddleware(CheckPasswordExpiry::class)->name('api.session.ping');
    Route::put('preferences', [AuthController::class, 'updatePreferences'])->name('api.preferences');
    // Every sidebar badge count in one request (per-count permission handled in the service).
    Route::get('sidebar-badges', [SidebarBadgeController::class, 'index'])->name('api.sidebar-badges');
    // The front page in one request — same arrangement: the service gates block by block.
    Route::get('dashboard/summary', [DashboardController::class, 'summary'])->name('api.dashboard.summary');
    // Report Center — each report authorizes itself through ReportCatalogue.
    Route::get('reports', [ReportController::class, 'index'])->name('api.reports.index');
    Route::get('reports/tickets/overview', [TicketOverviewReportController::class, 'summary'])->name('api.reports.tickets.overview');
    Route::get('reports/tickets/overview/rows', [TicketOverviewReportController::class, 'rows'])->name('api.reports.tickets.overview.rows');
    Route::get('reports/tickets/overview/export', [TicketOverviewReportController::class, 'export'])->name('api.reports.tickets.overview.export');
    Route::get('reports/r/{key}', [TabularReportController::class, 'definition'])->where('key', '[a-z_]+\.[a-z_]+')->name('api.reports.tabular');
    Route::get('reports/r/{key}/rows', [TabularReportController::class, 'rows'])->where('key', '[a-z_]+\.[a-z_]+')->name('api.reports.tabular.rows');
    Route::get('reports/r/{key}/export', [TabularReportController::class, 'export'])->where('key', '[a-z_]+\.[a-z_]+')->name('api.reports.tabular.export');
    Route::post('profile', [AuthController::class, 'updateProfile'])->name('api.profile.update');
    Route::put('password', [AuthController::class, 'changePassword'])
        ->withoutMiddleware(CheckPasswordExpiry::class)->name('api.password.change');
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
    Route::put('email-templates/{emailTemplate}', [EmailTemplateController::class, 'update'])->name('api.email-templates.update');
    Route::post('email-templates/{emailTemplate}/test', [EmailTemplateController::class, 'test'])->name('api.email-templates.test');
    Route::get('email-templates/{emailTemplate}/preview', [EmailTemplateController::class, 'preview'])->name('api.email-templates.preview');
    Route::post('email-templates/render-preview', [EmailTemplateController::class, 'renderPreview'])->name('api.email-templates.render-preview');
    Route::post('email-templates/reset-all', [EmailTemplateController::class, 'resetAll'])->name('api.email-templates.reset-all');
    // In-app bells: the catalogue + wording is admin config; `notification-messages` is the wording
    // alone, which every signed-in user needs to render their own tray.
    Route::get('notification-templates', [NotificationTemplateController::class, 'index'])->name('api.notification-templates.index');
    Route::put('notification-templates/{key}', [NotificationTemplateController::class, 'update'])->name('api.notification-templates.update');
    Route::post('notification-templates/{key}/reset', [NotificationTemplateController::class, 'reset'])->name('api.notification-templates.reset');
    Route::post('notification-templates/{key}/test', [NotificationTemplateController::class, 'test'])->name('api.notification-templates.test');
    Route::get('notification-messages', [NotificationTemplateController::class, 'messages'])->name('api.notification-messages');
    Route::get('email-logs', [EmailLogController::class, 'index'])->name('api.email-logs.index');
    Route::get('email-logs/{emailLog}', [EmailLogController::class, 'show'])->name('api.email-logs.show');
    Route::post('email-templates/{emailTemplate}/reset', [EmailTemplateController::class, 'reset'])->name('api.email-templates.reset');

    // Employee module
    Route::get('employees/summary', [EmployeeController::class, 'summary'])->name('api.employees.summary');
    Route::get('employees/import-template', [EmployeeController::class, 'importTemplate'])->name('api.employees.import-template');
    // The spellings the template's department / section / position columns accept —
    // downloaded beside it, so the list is open while the sheet is being typed.
    Route::get('employees/import-reference', [EmployeeController::class, 'importReference'])->name('api.employees.import-reference');
    Route::post('employees/import/preview', [EmployeeController::class, 'importPreview'])->name('api.employees.import.preview');
    Route::post('employees/import', [EmployeeController::class, 'import'])->name('api.employees.import');
    // Asked from Step 3 of the Add Employee form, before the employee exists — can the
    // day-one service requests actually be routed for somebody reporting to this manager?
    Route::get('employees/onboarding-precheck', [EmployeeController::class, 'onboardingPrecheck'])->name('api.employees.onboarding-precheck');
    // What each day-one service asks for (device type, mailbox address), read from the
    // Request module's schemas so Step 3 collects it instead of filing a blank request.
    Route::get('employees/onboarding-services', [EmployeeController::class, 'onboardingServices'])->name('api.employees.onboarding-services');
    Route::post('employees/{employee}/resign', [EmployeeController::class, 'resign'])->name('api.employees.resign');
    Route::post('employees/{employee}/cancel-resign', [EmployeeController::class, 'cancelResign'])->name('api.employees.cancel-resign');
    Route::put('employees/{employee}/credentials', [EmployeeController::class, 'updateCredentials'])->name('api.employees.credentials.update');
    Route::post('employees/{employee}/credentials', [EmployeeController::class, 'credentials'])->name('api.employees.credentials');
    Route::get('employees/{employee}/approval-chain', [EmployeeController::class, 'approvalChain'])->name('api.employees.approval-chain');
    Route::get('employees/{employee}/assets', [EmployeeController::class, 'assets'])->name('api.employees.assets');
    Route::get('employees/{employee}/access', [EmployeeController::class, 'access'])->name('api.employees.access');
    Route::get('employees/{employee}/tickets', [EmployeeController::class, 'tickets'])->name('api.employees.tickets');
    Route::get('employees/{employee}/requests', [EmployeeController::class, 'requests'])->name('api.employees.requests');
    Route::get('employees/org-chart', [EmployeeController::class, 'orgChart'])->name('api.employees.org-chart');
    // destroy is for a mis-entry only — a duplicate or test row nothing refers to yet. An
    // employee who leaves is resigned, never deleted: the record keeps their name so every
    // ticket, request and asset they touched still reads correctly, and deleting one would
    // cascade their ticket history away at the DB level. The controller refuses anything
    // that has activity.
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
    // Request data — its own Settings section, with its own gate.
    Route::middleware('permission:settings.requestdata')->group(function () {
        Route::get('request-options', [RequestOptionController::class, 'index'])->name('api.request-options.index');
        Route::post('request-options/reorder', [RequestOptionController::class, 'reorder'])->name('api.request-options.reorder');
        Route::apiResource('request-options', RequestOptionController::class)->except(['show', 'index']);
    });

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
    Route::post('contracts/{contract}/cancel', [ContractController::class, 'cancel'])->name('api.contracts.cancel');
    Route::post('contracts/{contract}/expire', [ContractController::class, 'expire'])->name('api.contracts.expire');
    Route::post('contracts/{contract}/reactivate', [ContractController::class, 'reactivate'])->name('api.contracts.reactivate');
    Route::post('contracts/{contract}/attachments', [ContractAttachmentController::class, 'store'])->name('api.contracts.attachments.store');
    Route::delete('contracts/{contract}/attachments/{attachment}', [ContractAttachmentController::class, 'destroy'])->name('api.contracts.attachments.destroy');
    Route::apiResource('contracts', ContractController::class);

    // Ticket module
    Route::get('tickets/summary', [TicketController::class, 'summary'])->name('api.tickets.summary');
    Route::get('tickets/staff', [TicketController::class, 'staff'])->name('api.tickets.staff');
    Route::get('tickets/badge', [TicketController::class, 'badge'])->name('api.tickets.badge');
    Route::get('tickets/{ticket}/requester-assets', [TicketController::class, 'requesterAssets'])->name('api.tickets.requester-assets');
    Route::post('tickets/{ticket}/take', [TicketController::class, 'take'])->name('api.tickets.take');
    Route::post('tickets/{ticket}/assign', [TicketController::class, 'assign'])->name('api.tickets.assign');
    Route::post('tickets/{ticket}/forward', [TicketController::class, 'forward'])->name('api.tickets.forward');
    Route::post('tickets/{ticket}/updates', [TicketController::class, 'storeUpdate'])->name('api.tickets.updates.store');
    Route::post('tickets/{ticket}/resolve', [TicketController::class, 'resolve'])->name('api.tickets.resolve');
    Route::post('tickets/{ticket}/attachments', [TicketAttachmentController::class, 'store'])->name('api.tickets.attachments.store');
    Route::delete('tickets/{ticket}/attachments/{attachment}', [TicketAttachmentController::class, 'destroy'])->name('api.tickets.attachments.destroy');
    // Tickets can never be deleted — closed/canceled cases stay as history (no destroy route).
    Route::apiResource('tickets', TicketController::class)->except(['destroy']);

    // Assets Management module
    Route::get('assets/summary', [AssetController::class, 'summary'])->name('api.assets.summary');
    Route::get('assets/linkable', [AssetController::class, 'linkable'])->name('api.assets.linkable');
    Route::get('assets/contract-options', [AssetController::class, 'contractOptions'])->name('api.assets.contract-options');
    Route::get('assets/transfers', [AssetController::class, 'transfers'])->name('api.assets.transfers');
    Route::get('assets/mine', [AssetController::class, 'mine'])->name('api.assets.mine');
    // The other half of the self-service page. Outside the Access Directory group on purpose:
    // its own key (access.my), not the registry master. See MyAccessController.
    Route::get('access/mine', [MyAccessController::class, 'index'])->name('api.access.mine');
    Route::get('assets/recipient-readiness', [AssetController::class, 'recipientReadiness'])->name('api.assets.recipient-readiness');
    Route::post('assets/bulk', [AssetController::class, 'bulk'])->name('api.assets.bulk');
    Route::post('assets/bulk-transfer', [AssetController::class, 'bulkTransfer'])->name('api.assets.bulk-transfer');
    Route::post('assets/bulk-location', [AssetController::class, 'bulkLocation'])->name('api.assets.bulk-location');
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
    // Note: the two stock PDF endpoints live in routes/web.php under /pdf — they
    // return documents (not JSON) and open in a browser tab, so they belong on
    // the web/session stack, not the JSON API.
    Route::apiResource('stock-items', StockItemController::class);
    Route::get('stock-movements', [StockMovementController::class, 'index'])->name('api.stock-movements.index');
    Route::get('stock-movements/{movement}/serials', [StockMovementController::class, 'serials'])->name('api.stock-movements.serials');
    Route::post('stock-movements', [StockMovementController::class, 'store'])->name('api.stock-movements.store');
    Route::get('stock-requests', [StockRequestController::class, 'index'])->name('api.stock-requests.index');
    Route::post('stock-requests', [StockRequestController::class, 'store'])->name('api.stock-requests.store');
    Route::post('stock-requests/{stockRequest}/approve', [StockRequestController::class, 'approve'])->name('api.stock-requests.approve');
    Route::post('stock-requests/{stockRequest}/reject', [StockRequestController::class, 'reject'])->name('api.stock-requests.reject');
    Route::post('stock-requests/{stockRequest}/fulfill', [StockRequestController::class, 'fulfill'])->name('api.stock-requests.fulfill');

    // Request module (IT service requests) — options + transitions before the
    // resource so `{serviceRequest}` cannot swallow them.
    Route::get('service-requests/options', [RequestOptionsController::class, 'index'])->name('api.service-requests.options');
    Route::post('service-requests/{serviceRequest}/approve', [RequestController::class, 'approve'])->name('api.service-requests.approve');
    Route::post('service-requests/{serviceRequest}/reject', [RequestController::class, 'reject'])->name('api.service-requests.reject');
    Route::post('service-requests/{serviceRequest}/complete', [RequestController::class, 'complete'])->name('api.service-requests.complete');
    Route::post('service-requests/{serviceRequest}/cancel', [RequestController::class, 'cancel'])->name('api.service-requests.cancel');
    Route::apiResource('service-requests', RequestController::class)
        ->only(['index', 'store', 'show'])
        ->parameters(['service-requests' => 'serviceRequest']);

    // Workflow module (approval chain definitions) — admin only. Reading the chains needs
    // the module master; rewriting one needs `manage` on top, the same split every other
    // module makes between opening a screen and changing what is on it.
    Route::middleware('permission:workflows.module')->group(function () {
        Route::get('workflows', [WorkflowController::class, 'index'])->name('api.workflows.index');
        Route::get('workflows/employee-options', [WorkflowController::class, 'employeeOptions'])->name('api.workflows.employee-options');
        Route::get('workflows/position-options', [WorkflowController::class, 'positionOptions'])->name('api.workflows.position-options');
        Route::post('workflows/preview', [WorkflowController::class, 'preview'])->name('api.workflows.preview');
    });
    Route::middleware('permission:workflows.manage')->group(function () {
        Route::put('workflows/{workflow}', [WorkflowController::class, 'update'])->name('api.workflows.update');
    });
    Route::post('stock-counts/{stockCount}/commit', [StockCountController::class, 'commit'])->name('api.stock-counts.commit');
    Route::apiResource('stock-counts', StockCountController::class)->except(['edit', 'create']);

    // Permissions / RBAC + audit
    Route::get('permissions', [RolePermissionController::class, 'index'])->name('api.permissions.index');
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

    // Access Directory — the module master (access.module) gates every read; the
    // Overview tab has its own key; each registry's add/edit/delete is granular.
    // A registry's *edit* key also covers owner + member management for it.
    Route::middleware('permission:access.module')->group(function () {
        // Reads — each registry's tab (list + members) is gated by its view key.
        Route::middleware('permission:access.email_view')->group(function () {
            Route::get('email-groups', [EmailGroupController::class, 'index']);
            Route::get('email-groups/{emailGroup}/members', [EmailGroupController::class, 'members']);
        });
        Route::middleware('permission:access.file_view')->group(function () {
            Route::get('file-shares', [FileShareController::class, 'index']);
            Route::get('file-shares/{fileShare}/members', [FileShareController::class, 'members']);
        });
        Route::middleware('permission:access.social_view')->group(function () {
            Route::get('social-platforms', [SocialPlatformController::class, 'index']);
            Route::get('social-platforms/{socialPlatform}/members', [SocialPlatformController::class, 'members']);
        });
        Route::middleware('permission:access.software_view')->group(function () {
            Route::get('software', [SoftwareController::class, 'index']);
            Route::get('software/{software}/members', [SoftwareController::class, 'members']);
        });
        Route::get('access/dashboard', [AccessController::class, 'dashboard'])->middleware('permission:access.overview');

        // Email Groups
        Route::post('email-groups', [EmailGroupController::class, 'store'])->middleware('permission:access.email_add');
        Route::middleware('permission:access.email_edit')->group(function () {
            Route::match(['put', 'patch'], 'email-groups/{emailGroup}', [EmailGroupController::class, 'update']);
            Route::put('email-groups/{emailGroup}/owner', [EmailGroupController::class, 'setOwner']);
            Route::post('email-groups/{emailGroup}/members', [EmailGroupController::class, 'addMember']);
            Route::post('email-groups/{emailGroup}/members/{membership}/revoke', [EmailGroupController::class, 'revokeMember']);
        });
        Route::delete('email-groups/{emailGroup}', [EmailGroupController::class, 'destroy'])->middleware('permission:access.email_delete');

        // File Shares
        Route::post('file-shares', [FileShareController::class, 'store'])->middleware('permission:access.file_add');
        Route::middleware('permission:access.file_edit')->group(function () {
            Route::match(['put', 'patch'], 'file-shares/{fileShare}', [FileShareController::class, 'update']);
            Route::put('file-shares/{fileShare}/owner', [FileShareController::class, 'setOwner']);
            Route::post('file-shares/{fileShare}/members', [FileShareController::class, 'addMember']);
            Route::post('file-shares/{fileShare}/members/{membership}/revoke', [FileShareController::class, 'revokeMember']);
        });
        Route::delete('file-shares/{fileShare}', [FileShareController::class, 'destroy'])->middleware('permission:access.file_delete');

        // Social / Internet
        Route::post('social-platforms', [SocialPlatformController::class, 'store'])->middleware('permission:access.social_add');
        Route::middleware('permission:access.social_edit')->group(function () {
            Route::match(['put', 'patch'], 'social-platforms/{socialPlatform}', [SocialPlatformController::class, 'update']);
            Route::post('social-platforms/{socialPlatform}/members', [SocialPlatformController::class, 'addMember']);
            Route::post('social-platforms/{socialPlatform}/members/{membership}/revoke', [SocialPlatformController::class, 'revokeMember']);
        });
        Route::delete('social-platforms/{socialPlatform}', [SocialPlatformController::class, 'destroy'])->middleware('permission:access.social_delete');

        // Software
        Route::post('software', [SoftwareController::class, 'store'])->middleware('permission:access.software_add');
        Route::middleware('permission:access.software_edit')->group(function () {
            Route::match(['put', 'patch'], 'software/{software}', [SoftwareController::class, 'update']);
            Route::post('software/{software}/members', [SoftwareController::class, 'addMember']);
            Route::post('software/{software}/members/{membership}/revoke', [SoftwareController::class, 'revokeMember']);
        });
        Route::delete('software/{software}', [SoftwareController::class, 'destroy'])->middleware('permission:access.software_delete');
    });
});
