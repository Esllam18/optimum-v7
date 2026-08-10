# Optimum 6.9.0 — Site Delivery & Claim Intelligence

## Current release

Optimum 6.9 closes the **Project & Document Control + Site Delivery OS**. A Site is no longer just a project child: it can contain one or many **Cabinets**, each with a repeatable delivery workspace, while the Site's final **Claim / Delivery Package** assembles canonical project documents without copying files or creating stale duplicate versions.

Key capabilities:
- Site Delivery 360 with Cabinets, open work, drawings, documents, storage and final-claim readiness.
- Cabinet 360 as a first-class delivery unit linked to Project/Site/Folder context.
- Every Cabinet auto-provisions six working areas: Drawings & As-Built, Quantity Survey, Sketches, Handover & Inspection, Photos, Supporting Documents.
- Virtual Site Claim Package: requirement-to-document references, not copied storage objects.
- Nine default claim requirements, plus custom client-specific requirements.
- Auto Collect recognizes known folders/documents and can build much of the claim from normal work.
- Freeze pins exact `document_versions` before submission, so later file revisions cannot silently change an already-prepared package.
- Cabinet-aware Work/CAD/File context and unified deep links.
- Fiber Delivery Blueprint renamed around the real delivery record: Work Orders & Contracts, Survey & Approvals, Cabinets, Quantity Survey & BOQ, Drawings & As-Built, Sketches & Technical, Handover & Certificates, Photos & Correspondence.
- Resource-scoped Site/Cabinet/Document capabilities are returned by the server and used to shape the UI.
- 6.8 Project 360 / CDE / Document 360 / Storage Intelligence / Smart Trash remain intact; Document Control regression found during 6.9 QA was repaired before release.

Key docs:
- `docs/PHASE_6_9_SITE_DELIVERY_CLAIM_INTELLIGENCE_AR.md`
- `docs/QA_CHECKLIST_PHASE_6_9.md`
- `docs/SYSTEM_AUDIT_PHASE_6_9_AR.md`
- `docs/RELEASE_NOTES_6_9_AR.md`

## Run 6.9.0

Portable client: `start-client-app.bat` → `http://localhost:4173`

Platform Console: `start-platform-console.bat` → `http://localhost:4174`

Release gates:
```bash
npm test
npm run test:browser:core
npm run test:browser:policy
npm run test:browser:work
npm run test:browser:excellence
npm run test:browser:pdc
npm run test:browser:site
```

The portable release is fully exercised in the QA environment. The Next.js production build remains a deployment-environment gate because `next` is not installed and `npm ci` currently receives a 404 for `tslib-2.8.1.tgz` from the internal package registry.

---

## Phase 6 — Work & Delivery Operating System

This release closes the Tasks + Calendar + Activity block as one integrated execution layer on top of the Organization OS. Tasks are no longer treated as an isolated list: the Work OS now uses the same **entitlement → permission → scope → organization context** chain to decide what each person can see, change, assign, schedule, automate, and audit.

### What is included

- Server-side Work query/search/filter/pagination and scoped task detail.
- Work types: task, review, approval, inspection, issue, and follow-up.
- Owner, assignees, role assignments, reviewer, approver, watchers, checklist, comments, attachments, labels, effort, SLA, and source context.
- Optimistic locking (`lock_version`) and atomic Work Item saves.
- Resource-scope enforcement on create/edit/claim/comment/attachment/status/dependency paths.
- Smart Assignment using access, leave, project/site fit, skills, and weekly capacity.
- Dependencies, blocked-reason enforcement, delivery risk, attention queue, workload, and milestones.
- Operational Calendar: Month / Week / Day / Agenda / Capacity with Tasks + Milestones + approved Leave + Holidays.
- Leave request workflow with management privacy and assignment collision protection.
- Task Templates and Work Automation Rules.
- Backend recurrence scheduler through `pg_cron`; recurring work is no longer dependent on a user opening the browser.
- Human Activity Feed + detailed Audit mode with server-side pagination/search and deep links.
- Cross-session Work runtime revision refresh.
- Permission-aware UI: restricted users do not receive management, assignment, capacity, or automation controls they cannot use.

### Release closure hardening

The final 6.6 closure also fixes several issues found only by live Supabase tests: cross-company upsert protection, dependency ID leakage, private Work delegation, leave reassignment, automation failure isolation, stale-edit overwrite protection, direct Data API privileges, and scheduler authority. The scheduler now uses each company's active Owner as its execution authority and skips an invalid company without taking down the complete job.

Key docs:
- `docs/PHASE_6_WORK_DELIVERY_OS_CLOSURE_AR.md`
- `docs/QA_CHECKLIST_PHASE_6.md`
- `docs/SYSTEM_AUDIT_PHASE_6_AR.md`
- `docs/RELEASE_NOTES_6_6_AR.md`

## Run 6.6.0

Portable client:

```text
start-client-app.bat
```

Client: `http://localhost:4173`

Standalone Platform Console:

```text
start-platform-console.bat
```

Platform Console: `http://localhost:4174`

Next.js development / production build requires dependencies:

```bash
npm ci
npm run build
npm run dev
```

The connected Supabase project already contains the Phase 6 migrations shipped in this release. Do not manually re-apply them to that same project.

## Production gates

The Work & Delivery functional block is release-tested, but public production readiness is a separate gate. Before public deployment, review the remaining Supabase Security Advisor warnings for authenticated `SECURITY DEFINER` RPCs, enable leaked-password protection, validate production Auth origins/recovery URLs, complete staging/backup/restore/monitoring checks, and run the production Next.js build in the deployment environment.

---

## Previous foundation — Optimum 5.8 Organization OS

Phase 5.8 remains the organization foundation used by this release: company entitlements, effective permissions, scopes, Member 360, organization structure, lifecycle/work context, readiness/health, Saved Views, bulk actions/Undo, and cross-session organization revision refresh.

## Phase 4.17 — CAD Interaction Fixes

- Fixed node and route placement offsets by converting pointer coordinates through the actual SVG screen transform and full viewBox.
- Library elements now arm placement first, then use the exact point clicked on the drawing instead of a preset location.
- Repeat paste can be stopped with the same toolbar button, the visible Stop button, Escape, or right-click.
- Route data has a permanent transparent selection target, so it can be selected and dragged without accidentally moving or detaching the route underneath.
- Manual route-data positions are locked after dragging, while the editor retains multiline text, size, alignment, spacing, rotation, horizontal/vertical flip, weight, background, and technical-data controls.

## Phase 4.16 — Final Drawing Adjustments

- Restored the classic bottom route-library cards.
- Restored the small, light catalog name beneath each drawing element.
- Upgraded route data into a fully editable, independently movable label with alignment, line spacing, rotation, horizontal/vertical flip, weight, background and technical-data controls.
- Preserved the Phase 4.15 fixed element data and corrected route-to-node DXF geometry.

## Phase 4.15 — CAD Correction

- رجوع بيانات العناصر إلى داخل رمز العنصر، مع إلغاء التحريك/التدوير/القلب المنفصل لبيانات البوكسات.
- بيانات المسارات ما زالت مستقلة وقابلة للسحب والتدوير والقلب، ويُحفظ ذلك في SVG وDXF R12/R2000.
- مكتبة العناصر احتفظت بشكلها السابق، وتعرض 6 عائلات أساسية أولًا مع زر لإظهار بقية العناصر والبحث بينها.
- توحيد أبعاد العنصر مع نقاط اتصال المسار لمنع دخول الخطوط داخل البوكسات عند التصدير.
- مسار توافق لإنشاء Draft جديد عند عدم تطبيق RPC الأحدث، من دون تجاوز صلاحيات Supabase أو استعادة مراجعة تاريخية خاطئة.



Optimum is a bilingual, multi-tenant B2B operations workspace for engineering companies.

This release includes:

- Phase 1: company, team, roles, permissions, projects, and sites.
- Phase 2: Platform Control, files, folders, versions, storage, search, trash, and notifications.
- Phase 3: tasks, assignments, checklists, comments, attachments, recurring work, and calendar.
- Phase 4: digital engineering schematics, live quantity takeoff, revisions, review marks, comparison, DXF/SVG/PNG/PDF/CSV/XLS export, and Files Workspace linking.

## Run the portable build

On Windows, double-click:

```text
start-portable.bat
```

Then open:

```text
http://localhost:4173
```

On macOS/Linux:

```bash
./start-portable.sh
```

## Run with Next.js

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Tests

```bash
npm test
```

## Important

The included Supabase migrations are already applied to the connected Optimum project. Do not run them again on the same project.

The browser contains only the Supabase publishable key. Never place a service-role key in frontend code.

## First Phase 4 test

1. Open **CAD والهندسة**.
2. Create a drawing linked to a project/site.
3. Place nodes and draw routes.
4. Check the live BOQ.
5. Save R0 and export DXF and CSV.
6. Save a DXF/BOQ copy into Files Workspace and open the linked document.
7. Issue R0, create R1, modify it, and compare revisions.

See `docs/QA_CHECKLIST.md` and `docs/REFERENCE_STUDY.md`.

## Included Phase 4 sample outputs

Open `docs/samples/engineering-demo.png` or `engineering-demo.svg` to preview the generated A3 drawing. The same folder includes the AutoCAD-compatible DXF and the generated BOQ CSV.


## Phase 4.1

See `docs/PHASE_4_1_CAD_STUDIO_HARDENING.md` and `docs/QA_CHECKLIST_PHASE_4_1.md`.

## Phase 4.2 CAD Pro

الإصدار الحالي يضيف ثبات مساحة الرسم، السحب والإفلات، شريط عناصر سفلي في Focus Mode، Pan، Smart Auto-Layout، مركز ملاحظات، وحصر احترافي متعدد الجداول والتصديرات. راجع `docs/PHASE_4_2_CAD_PRO_FINAL.md`.


## Phase 4.3 CAD Ultimate

الإصدار الحالي يثبت تجربة الرسم الإنتاجية: مكتبة عناصر مجمعة في اليمين، المسارات في Dock سفلي، Frame مكتبي، DXF R2000 ملون بطبقات وUnicode، AutoSave كل 5 ثوانٍ، Smart Fix، Smart Route Layout، صورة مرجعية، وتصدير Excel منسق متعدد الشيتات.

راجع `docs/PHASE_4_3_CAD_ULTIMATE_FINAL.md` و`docs/CAD_PRODUCTION_GUIDE_AR.md`.



## Phase 4.7 — CAD Visual Master

الإصدار الحالي يعتمد نظامًا بصريًا واحدًا للرسم بدل الجمع بين الشكل القديم والجديد:

- Family Catalog للعناصر في اليسار وخصائص العنصر في اليمين.
- عائلات المسارات والكابلات في Dock سفلي مستقل.
- عنصر هندسي واحد مدمج معه بيانات مختصرة، من غير Data Table مكررة بجانبه.
- A3 sheet مع Title Block هندسي داخل الشيت وLegend تلقائي.
- Multi-select، تحريك المجموعة، المحاذاة، التوزيع والتحجيم.
- Zoom البورد منفصل عن واجهة الويب.
- Mini Map وشريط حالة خارج مساحة الطباعة.
- SVG وPNG وDXF وحصر مرتبط بنفس نموذج البيانات.

تم اختبار إضافة عنصر، إنشاء مسار، تحديد وتحريك مجموعة، وعزل Zoom البورد داخل Chromium من غير أخطاء JavaScript.

راجع:

- `docs/PHASE_4_6_EXACT_STANDARD_REPORT.md`
- `docs/QA_CHECKLIST_PHASE_4_6.md`
- `docs/samples/cad-standard-4.6-interaction-tested.png`
- `docs/samples/cad-standard-4.6-demo.png`

## Phase 4.12 — CAD Final Closure

الإصدار الحالي يقفل مرحلة CAD الأساسية: تعديل وربط From/To للمسارات، ترتيب Graph-based، Variant Picker لـ ODF/LGX/Splitter، شعارات وLegend ديناميكي في الفريم، بيانات عناصر كاملة في SVG/PDF، فتح المراجع والملفات المرتبطة، أسماء فولدرات Files Workspace بالعربية، وطباعة A3 مع DXF R12 محافظ.

راجع:

- `docs/PHASE_4_12_CAD_FINAL_CLOSURE.md`
- `docs/QA_CHECKLIST_PHASE_4_12.md`
- `docs/samples/cad-final-4.12-export-preview.png`
- `docs/samples/cad-final-4.12-demo.dxf`

## Phase 4.13 — CAD Freeze Hotfix

هذه القفلة تمنع الكتابة فوق تعديلات مستخدم آخر، تضيف Local Recovery حقيقي، توحد مساحة البورد على 1600×1000 كاملة، وتعيد بناء DXF بصيغة AutoCAD R2000 مع Layers ورموز هندسية وبيانات قابلة للتحرير.

راجع:

- `docs/PHASE_4_13_CAD_FREEZE_HOTFIX.md`
- `docs/QA_CHECKLIST_PHASE_4_13.md`
- `docs/samples/cad-freeze-4.13-demo.png`
- `docs/samples/cad-freeze-4.13-demo.dxf`
- `docs/samples/cad-freeze-4.13-dxf-import-cropped.png`

## Phase 4.14 — CAD Production Freeze

قَفلة إنتاجية للطباعة والتسليم: احتواء النصوص واتجاه LTR داخل الرسم، محرر نصوص وتحريك/تدوير/قلب، تثبيت البوكس وتقسيم المسار، نسخ متكرر مثل CAD، مكتبة مسارات مجمعة، صور دائمة في الرسم والفريم، حصر A3 مقروء، DXF R12 محافظ، إصدارات Files متتابعة، واستعادة أي مراجعة قديمة إلى Draft جديد دون المساس بالنسخة المعتمدة.

راجع:

- `docs/PHASE_4_14_CAD_PRODUCTION_FREEZE.md`
- `docs/QA_CHECKLIST_PHASE_4_14.md`

## Phase 5.2 additions

- Private company logos and member photos.
- Protected salary and compensation records.
- Company Role Studio with reusable templates and permission modules.
- Global Platform Role Library for Optimum administrators.
- Company-controlled brand colors, application name, sidebar style, radius, density, and theme.
- Premium people directory and organization-management UI.

See `docs/PHASE_5_2_ORGANIZATION_IDENTITY_ROLES.md` and `docs/QA_CHECKLIST_PHASE_5_2.md`.


## Phase 5.3.1 credential hotfix

Temporary credentials are verified against Supabase Auth before provisioning is reported as successful. See `docs/RELEASE_NOTES_5_3_1_AR.md`.

## Phase 5.5 — Organization Core & Access Intelligence

- Entitlements, permissions, and resource scopes are separate layers.
- Access is enforced on projects, sites, folders, documents, tasks, and drawings at the database level.
- Roles support drafts, impact preview, publish, versions, rollback, add-ons, comparison, and View as User.
- Members support lifecycle, organization units, work profile, capacity, scoped access, and offboarding handover.
- Workspace settings use draft/publish/version/rollback instead of unsafe immediate changes.
- Platform Console can override company entitlements or return them to the service plan.

See `docs/PHASE_5_5_ORGANIZATION_CORE_ACCESS_INTELLIGENCE_AR.md` and `docs/QA_CHECKLIST_PHASE_5_5.md`.


## Phase 5.5.2
Workspace loading and scoped BOQ reliability hotfix.
