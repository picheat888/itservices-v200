# Phase 4 — Email Notifications Module (#9) — Design

Date: 2026-05-24
Source design: Inaba IT Service Desk handoff bundle, module **08 Email Notifications** (`window.NotificationsPage`) + Settings → Email.
Scope chosen by user: **B** (template-library page + real send engine) with SMTP config under **Settings → Email**.

## Goal

Build the Email Notifications module faithfully to the design: a template library page at
`/email-templates`, backed by the database, plus the real sending engine (SMTP config in DB,
queued Mailable with runtime `Config::set` override per CLAUDE.md, a working "Send test email",
and a minimal send log so the stat cards are real). Wire the one real event that exists today
(new employee → credentials needed) through the engine.

Out of scope (deferred): triggers from unbuilt modules (tickets/requests/contracts/assets) — their
templates are seeded and manageable but only fire once those modules exist. The in-app bell
redesign (module #8) is a separate module, not this phase.

## Data model

### `mail_settings` (single row, id=1)
SMTP credentials, edited in Settings → Email. Password stored encrypted.
- `host`, `port` (int), `username`, `password` (encrypted cast, nullable), `encryption` (`tls|ssl|null`),
  `from_address`, `from_name`, timestamps.
- `.env` remains the fallback when the row is empty/unconfigured.

### `email_templates`
- `id` (auto), `key` (unique, = trigger e.g. `ticket.created`), `name`, `subject`, `body_html`
  (contains `{{variables}}`), `enabled` (bool), `last_sent_at` (nullable), timestamps.
- Seed the 12 design templates (ET-01..ET-12) + 1 real event template `employee.account_needed`.

### `email_logs` (observability for stat cards)
- `id`, `template_key` (nullable), `to_email`, `subject`, `status` (`sent|failed`), `error` (nullable), `created_at`.

## Backend

- **Models**: `MailSetting`, `EmailTemplate`, `EmailLog`.
- **MailConfigService**: `apply()` overrides `mail.mailers.smtp.*` + `mail.from.*` from `mail_settings`
  before any send; `isConfigured()` helper. Called inside the Mailable/send path.
- **TemplatedMail** (Mailable, `ShouldQueue`): renders a template's subject/body with a variables map,
  applies MailConfigService, and on send writes an `email_logs` row + bumps `last_sent_at`.
- **EmailNotificationService**: `sendTemplate(key, toEmail, vars)` — loads enabled template, dispatches
  TemplatedMail (queued). `sendTest(toEmail)` — sends a static test email through the SMTP config.
- **EmailTemplateController** (`system.configure_notifications`): `index` (templates + stats: total,
  enabled, sent_today, delivery_rate), `update` (subject/body/enabled), `store` (new), `test` (fire one
  template to current user with sample vars).
- **SettingsController**: add `mailSettings` (GET, password masked), `updateMailSettings` (PUT),
  `testMail` (POST → MailConfigService + send test to current user, log result).
- **Wire new-employee event**: `EmployeeService::notifyCredentialSetters` also calls
  `EmailNotificationService::sendTemplate('employee.account_needed', ...)` for each recipient with an email
  (queued; in-app database notification stays synchronous as before).
- **Routes** (`auth:sanctum`): `GET/POST email-templates`, `PUT email-templates/{id}`,
  `POST email-templates/{id}/test`, `POST email-templates/test`; `GET/PUT settings/mail`,
  `POST settings/mail/test`.

## Frontend

- **`pages/email-templates/index.tsx`** (route `/email-templates`, nav item already present):
  page head (title/sub + "Send test email" + "New template"); 4 StatCards (Templates, Enabled,
  Sent today, Delivery rate); card with search + table `ID | Template | Trigger (mono badge) |
  Last sent | Enabled (toggle) | Actions (preview/edit)`; preview Drawer (rendered email +
  Available variables badges); edit Drawer (subject/body/enabled); create dialog.
- **Settings → Email tab** made functional: SMTP form (host, port, username, password, encryption,
  from address, from name) + Save + "Send test email".
- **services**: `emailTemplateApi`, extend settings API with mail settings + test.
- **hooks**: `use-email-templates` (list/update/create/test), mail-settings query/mutations.
- **i18n**: reuse design `email_*` keys; add `set_email_*` SMTP field labels.

## Testing / verification

- Migrations run clean; seeder inserts 13 templates.
- `php artisan tinker` transactional checks: template list + stats; `EmailNotificationService::sendTemplate`
  writes an `email_logs` row and bumps `last_sent_at` (queue can run `--once`); MailConfigService overrides
  config from `mail_settings`.
- Typecheck (`tsc --noEmit`) clean.
- With `MAIL_MAILER=log` (dev), "Send test email" writes to the Laravel log and an `email_logs` row.

## Notes / honoring CLAUDE.md

- Email always dispatched via Queue (database driver), never in the request cycle.
- Mail config read from `mail_settings` and applied via `Config::set` before send; `.env` is fallback only.
- Controllers thin → Service → API Resource / standard `{data, message}` envelope; snake_case columns.
