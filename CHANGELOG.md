# Changelog

All notable changes to this project are documented in this file.

## [1.0.0] - 2026-09-18

Initial public release.

### Features

- **Diploma administration** — flexible rule engine (checklist- or points-based), zone-based
  (home/EU/DX) minimum scores, wildcard/regex/list callsign matching, band and mode rules
  (including mode/band groups), tiers and categories, a drag-and-drop certificate layout
  editor, and a separate "Challenge" diploma type with per-round random draws.
- **Submission workflow** — radio amateurs upload an ADIF log; the system automatically
  checks it against a diploma's rule set, with optional random QSL-confirmation sampling
  before a submission goes to review.
- **Automatic approval** — a diploma can be configured so that an automatically eligible
  submission is approved immediately, without manager review (available when the diploma
  has no QSL sampling or physical delivery).
- **Manager review** — a dedicated review queue with the full QSO table, QSL images, and an
  approve/reject decision that notifies the applicant by email.
- **PDF certificates** — generated with Puppeteer from the manager-configured blank image and
  field layout, with an atomically assigned serial number.
- **Payments** — Stripe Checkout, PayPal Orders, or manually confirmed bank transfer, for the
  PDF and/or a physical framed copy.
- **Two-factor authentication (MFA)** — email code or TOTP authenticator app, with a
  configurable policy per role (radio amateur / manager).
- **A custom "amateur radio" check at registration** — instead of a generic captcha, a
  question about which amateur band a given frequency falls into.
- **User management** — a searchable, paginated admin view for superadmins, with the ability
  to disable/re-enable accounts and grant/revoke the manager role.
- **A free-form "Contacts" page** — editable by the manager, HTML included.
- **Cloud storage** — a local filesystem driver for development, and an S3-compatible driver
  (e.g. Backblaze B2, Cloudflare R2, MinIO) for production.
- **Multi-language** — Hungarian, English, German, switchable per visitor/account.

### Tech stack

Total.js 4 (Node.js) backend, MongoDB, Redis (sessions/MFA/captcha/password-reset tokens),
a native-JS + Bulma frontend (no build step), Puppeteer for certificate/PDF rendering, and a
Docker Compose setup for local development.

[1.0.0]: https://github.com/dacrhu/Ham-Diploma-Publisher/releases/tag/v1.0.0
