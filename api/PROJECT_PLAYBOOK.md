# AcceX Project Playbook

This file is the working guide for humans and AI agents.
Use it to understand project direction, current status, and coding conventions before making changes.

## 1. Product Vision

Role flow:
- SUPERADMIN -> ADMIN -> SME -> PRODUCTION_USER / VALIDATION_USER

High-level business flow:
1. Superadmin/admin receives work (zip/files) for a client.
2. SME assigns work to production + validation users.
3. Production completes assigned work.
4. Validation verifies work (pass or redo with reason).
5. Completed work is packaged and sent back for delivery.
6. Client feedback can reopen selected items for rework.

## 2. Current Build Status

### Completed
- `core.auth`
- Login + token refresh endpoints.
- Role-based create-user flow.
- Role-based change-password flow.
- Automatic role profile creation in `UserManager` for:
  - superadmin
  - admin
  - SME
  - production user
  - validation user

- `core.client` (initial version)
- Client model with core contact details.
- Client cost rules model (document type + pricing mode + unit cost).
- Permissions implemented:
  - superadmin: full client CRUD + full details
  - admin: list client names only
  - others: no client access

- Platform hardening (Phase A)
- Environment-aware settings split implemented:
  - `api/settings_base.py`
  - `api/settings_dev.py`
  - `api/settings_prod.py`
  - `api/settings.py` selector via `DJANGO_ENV`
- Environment template added: `.env.example`
- Centralized role-permission helpers added in `core/permissions.py`
- Auth/client role checks refactored to use shared permission helpers

- `core.work` (Phase B/C baseline)
- Zip batch upload for admin/superadmin.
- Recursive archive extraction for nested zip files.
- Local storage extraction pipeline (current phase target).
- File tree persistence with directory + file hierarchy.
- File table metadata captured per batch:
  - name
  - relative path
  - file type
  - count type
  - count
  - size
- Counting implemented:
  - pdf -> pages
  - docx -> pages (page-break based estimation)
  - excel -> rows
  - other -> lines

### In Progress / Pending
- Domain apps for work execution lifecycle (upload, extract, assign, validate, delivery).
- Invoice generation and monthly mail (25th).
- Analytics and dashboards.
- Robust async pipeline for extraction + counting.
- End-to-end notifications (assignment, redo, completion, invoice, delivery).

## 3. Roadmap TODOs

Use this section as the living task tracker.

### Phase A: Platform Foundation
- [x] Auth + roles + user profile creation
- [x] Client basic domain + cost rules + access control
- [x] Environment hardening (production settings split, secrets handling)
- [x] Centralized permissions helpers (to avoid duplicating role checks)

### Phase B: Work Intake
- [x] App: `core.work` (or similar) for job/task/batch entities
- [x] Upload endpoint for zip/files by superadmin/admin
- [x] Persist raw upload metadata
- [x] Recursive archive extraction (zip-inside-zip, nested folders)
- [ ] Store extracted files in S3 with full path mapping
- [x] Maintain file tree table (parent/child relationships)
- [ ] Harden with async background processing for very large archives

### Phase C: File Intelligence
- [x] File-type detection (pdf/docx/xlsx/others)
- [x] Count extraction per file:
  - pdf -> page count
  - word -> page count
  - excel -> row count
- [ ] Store file metrics + size + checksum + mime type
- [x] Basic failure capture on batch processing errors
- [ ] Retry/failure handling for corrupt files

### Phase D: Assignment Engine
- [ ] SME assignment UI/API support
- [ ] Idle/capacity model for production + validation users
- [ ] Auto-assignment algorithm for balanced workload
- [ ] Support file splitting for large-count files (e.g., 100+ page PDF)
- [ ] Preserve ownership mapping for redo loop (validator -> same production user)

### Phase E: Execution + Validation
- [ ] Production download/upload completion flow
- [ ] Validation pass/fail with mandatory redo reason
- [ ] Requeue redo to original production user
- [ ] Status machine for each work item:
  - uploaded
  - assigned
  - in_production
  - in_validation
  - redo
  - done
  - delivered

### Phase F: Delivery + Feedback
- [ ] Partial and full completion packaging into zip
- [ ] Delivery endpoints for admin/superadmin
- [ ] Client feedback upload + mapping to existing work items
- [ ] Rework cycle support and audit trail

### Phase G: Billing + Analytics
- [ ] Cost calculation using client-specific rules
- [ ] Invoice generation on 25th monthly
- [ ] Invoice email pipeline
- [ ] Analytics API for superadmin/admin (with role limits)

## 4. Coding Structure Rules (Must Follow)

When adding a new domain app, mirror this structure:

- `core/<app>/apps.py` with both:
  - `name = 'core.<app>'`
  - `label = 'core_<app>'`
- `core/<app>/models.py`
- `core/<app>/admin.py`
- `core/<app>/serializers/`
  - split into feature files
  - `__init__.py` exports used serializers
- `core/<app>/viewsets/`
  - split into feature files
  - `__init__.py` exports used viewsets
- `core/<app>/migrations/`
- `core/routers/v1/<app>_routers.py`
- include router in `core/routers/v1/routers.py`
- add app to `INSTALLED_APPS` in `api/settings.py`

## 5. Coding Style Rules (Must Follow)

- Keep business validation in serializers.
- Keep viewsets thin (orchestration + permission gate only).
- Use `IsAuthenticated` and explicit role checks per action.
- Return clear DRF errors (`PermissionDenied`, `NotFound`, serializer validation errors).
- Use UUID `public_id` externally; avoid exposing DB integer IDs.
- Use transactions (`@transaction.atomic`) where multi-write integrity matters.
- Add/maintain `__init__.py` exports in `serializers` and `viewsets` folders.
- Avoid import-time heavy logic in app `__init__.py` (prevents app registry issues).
- Prefer explicit, readable code over overly generic abstractions at this stage.

## 6. Security + Production Readiness Checklist

For every new endpoint:
- [ ] Role access matrix documented and enforced.
- [ ] Input validation complete.
- [ ] Object-level permission check complete.
- [ ] Error messages safe and actionable.
- [ ] Queryset optimized (select_related/prefetch_related/only where useful).
- [ ] Migration created.
- [ ] `python3 manage.py check` passes.
- [ ] Relevant tests added/updated.

## 7. API Conventions

- Base prefix: `/api/v1/`
- Auth endpoints under `auth/...`
- Domain endpoints under domain name (e.g., `client/...`, `work/...`)
- Keep naming explicit (example: `auth/user/create-user`, `auth/password/change-password`)

## 8. Suggested Next Implementation Order

1. Build `core.work` models for batch/file/task lifecycle.
2. Implement upload + recursive extraction pipeline (sync first, async-ready design).
3. Implement file metrics extraction.
4. Implement assignment engine with balanced distribution strategy.
5. Implement execution/validation/redo transitions.
6. Implement delivery + client feedback rework loop.
7. Add billing + invoice scheduler.

## 9. Update Protocol For Future AI Agents

When you (AI/human) complete work:
1. Update "Completed" section with concrete features.
2. Move relevant TODO items from `[ ]` to `[x]`.
3. Add newly discovered tasks to the correct phase.
4. Keep this file factual (no aspirational claims).
5. Run checks/migrations and note major outcomes in PR/commit message.

If you change architecture direction, update this file in the same change set.
