# Optimum 6.8.0 — Project & Document Control OS

## الهدف

الإصدار 6.8 يحول **المشاريع + المواقع + مساحة الملفات + سلة المحذوفات** من أربع شاشات شبه منفصلة إلى طبقة معلومات تشغيلية واحدة تخدم بقية Optimum: Organization OS، Work OS، CAD، Search، Notifications وActivity.

الهدف العملي: المشروع يصبح مركز التشغيل، والمستند يصبح سجلًا رسميًا حيًا له إصدار وسياق وعلاقات، وكل Insight أو Search Result أو Notification تستطيع الوصول منه إلى نفس العنصر المقصود مباشرة.

## أهم مشاكل الـAudit التي تم إثباتها

- Projects/Sites كانت تُعدّل مباشرة عبر Data API بينما Files تعتمد RPCs؛ تم توحيد الـmutations حول Domain Commands/RPCs.
- تم إثبات Bug حي على حساب Engineer: لديه `files.rename` و`files.move` لكنه لا يملك `files.manage`، وكانت Rename/Move تفشل بسبب Trigger عامة تطلب `files.manage`. تم إصلاح الـguard بحيث كل عملية تستخدم صلاحيتها الحقيقية في UI + RPC + Trigger.
- سياسات Storage القديمة كانت تعتمد بدرجة كبيرة على company id داخل path. أصبحت الآن مرتبطة فعليًا بـUpload Reservation/Document/Version وبـResource Scope.
- إشعارات المجلدات والملفات كانت تذهب لكل أعضاء الشركة النشطين؛ أصبحت Resource-aware ولا تُرسل إلا لمن يملك View access على العنصر.
- Archive للمشروع/الموقع لم يكن Lifecycle متكاملًا؛ أصبح هناك Impact Preview + Archive + Reactivate، والسياق المؤرشف Read-only لبقية الملفات/المهام/CAD/Milestones حتى إعادة التفعيل.
- Files Workspace كانت تحمل آلاف السجلات في المتصفح؛ تم إدخال CDE server-side snapshots/search/document pickers بدل التحميل العام للـversions/documents.
- Search للملفات أصبح يستفيد من `search_vector` وTags وSystem Code.
- Phase 2 Files schema/workflows القديمة كانت Remote history فقط؛ تمت إعادة بناء ملفات migration canonical داخل الحزمة. **لم يتم تنفيذ Fresh DB replay كامل في هذه البيئة لعدم توفر Supabase CLI/Postgres/Docker محليًا، لذلك يبقى replay الفعلي Gate للنشر/staging.**

## Correctness & Security

### Unified Commands

تم إضافة/استخدام:
- `save_project`
- `save_site`
- `project_archive_impact`
- `archive_project` / `reactivate_project`
- `site_archive_impact`
- `archive_site` / `reactivate_site`

تم إلغاء INSERT/UPDATE/DELETE المباشر على `projects` و`sites` للـauthenticated role. القراءة تظل RLS/Data API، أما الـbusiness mutations فتمر من RPCs فقط.

### Granular file permissions

تم تحديث `app_private.enforce_resource_mutation_scope()` لكي يطابق العملية الفعلية:
- create folder → `files.create_folder`
- rename → `files.rename`
- move source/destination → `files.move`
- trash → `files.archive`
- restore → `files.restore`
- advanced metadata/document control → `files.manage`
- version/current-version changes → `files.upload` أو `files.manage`

### Archived context guard

تم إضافة guard على:
- folders
- documents
- tasks
- task_series
- engineering_drawings
- work_milestones

وبالتالي Archive لمشروع/موقع لا يترك مسارات جانبية للكتابة من Modules أخرى.

### Storage authorization

سياسات `company-files` أصبحت تعتمد على:
- Upload reservation حقيقية في `document_versions`
- uploader الصحيح
- upload state الصحيح
- document/folder/project/site الحقيقي
- permission + Resource Scope

تم اختبار Live أن arbitrary object path يُرفض، بينما path المحجوزة من `begin_document_upload` تُقبل.

### Quota concurrency

`begin_document_upload` و`begin_new_version_upload` يستخدمان advisory transaction lock على الشركة قبل حساب storage usage/limit لتقليل race في الحجز المتزامن للمساحة.

## Data & Integration

### Project 360

يعرض المشروع كسياق تشغيل لا كـCard فقط:
- الحالة والتقدم والمدير والعميل والتواريخ
- Blueprint
- Sites
- Files/Storage
- Open/Overdue/Blocked Work
- Drawings
- Milestones
- Project health
- Recent Activity لمن لديه audit access
- روابط مباشرة إلى Files / Work / Drawings / Site 360

### Site 360

الموقع أصبح كيانًا له:
- lifecycle status
- manager
- address + latitude/longitude
- timezone
- start/target dates
- project context
- files/storage/work/drawings KPIs
- Archive/Reactivate وفق الصلاحيات

### Document 360

يعرض:
- metadata + control status
- owner/review due/approval
- Project/Site/Folder exact context
- جميع الإصدارات
- Linked Work
- Linked Drawings/CAD
- Activity عند السماح
- download/open current version
- rename/move/trash وفق الصلاحيات
- document control transitions وفق `files.manage`

### Exact entity navigation

تم إضافة `resolve_entity_context` و`navigateToEntity` لتوحيد التنقل من:
- Search
- Notifications
- Activity
- Files/CAD links

الهدف: الضغط على Document/Folder/Site/Project/Task/Drawing يذهب إلى نفس العنصر وسياقه، لا إلى صفحة عامة.

### Work OS + CAD

- Work OS لديه project focus مباشر.
- CAD linked file يفتح Document 360 مباشرة بدون إعادة تحميل Files Workspace كلها.
- CAD document picker يستخدم server-side `document_picker_query`.

## Product Intelligence

### Workspace Blueprints

تم إنشاء `project_blueprints` وإضافة ثلاثة Blueprints عامة:
- Standard Engineering
- Fiber Delivery
- Construction Delivery

Fiber يولد 8 مجموعات معلومات أساسية، وConstruction يولد 9 مجموعات. Project/Site يأخذان هيكل الـBlueprint المختار تلقائيًا.

### Storage Intelligence

يعرض:
- used/max
- trash bytes
- old-version bytes
- storage by project
- storage by document type
- largest files

### Document Control

حالات المستند:
- Working
- In Review
- Approved
- Rejected
- Superseded

مع review due + approval metadata وروابط Work/CAD.

### Smart Trash

السلة تحافظ على direct-vs-ancestor batch semantics، وتضيف:
- search
- project/site context
- deleted by/date
- size
- original context
- hidden descendant count
- restore وفق scope/permission

Permanent purge/retention automation لم تُضف عمدًا في 6.8 حتى لا نضيف حذفًا نهائيًا قبل سياسة Retention/Legal Hold/backup production واضحة.

## Premium UX

تم إدخال Design Language موحدة لـ:
- Projects Command Center
- Project 360
- Site 360
- CDE Files Workspace
- Document 360
- Storage Intelligence
- Blueprint Picker
- Smart Trash

مع responsive/mobile treatment. Browser test عند 390px أثبت عدم وجود horizontal overflow في Projects/CDE/Document 360.

## Live Supabase proof

اختبارات Live داخل Transactions + Rollback:

### Limited Engineer
- Rename Document: PASS
- Move Document: PASS
- Document 360: PASS
- Project 360: PASS
- Project Archive Impact: DENIED كما يجب

### Owner
- Project 360 / Site 360 / Document 360: PASS
- save_project / save_site: PASS
- Document Control: PASS
- Search / Trash / Storage Intelligence: PASS
- Entity resolver: PASS

### Blueprint / Archive / Storage
- Fiber Blueprint created 8 project folders: PASS
- Site inherited Fiber structure with 8 folders: PASS
- Archive project: PASS
- mutation inside archived project: DENIED
- Reactivate project: PASS
- upload reservation: PASS
- arbitrary Storage object: DENIED
- reserved Storage object: PASS

كل smoke tests أعلاه تم Rollback ولم تترك Test data.

## Performance Advisor

بعد آخر DDL ظهر 3 unindexed FKs جديدة (`documents.approved_by`, `project_blueprints.created_by`, `project_blueprints.folder_template_id`). أضيفت covering indexes، وأعيد Advisor ولم يعد يعرض unindexed FK warnings للـ6.8.

المتبقي INFO من نوع `unused_index` فقط؛ لم يتم حذف indexes عشوائيًا قبل توفر Production workload.

## Security Advisor

لا يزال Supabase يحذر على مستوى النظام من authenticated-callable `SECURITY DEFINER` RPCs. RPCs الجديدة نفسها مقفولة عن `anon` ومسموحة للـauthenticated مع checks داخلية، لكن قبل public production يلزم allowlist/threat review function-by-function، لا revoke جماعي.

كذلك Leaked Password Protection ما زالت Disabled.

## Tests

آخر نتيجة source tree:
- `npm test` PASS
- Contract Audit: **237 Actions / 54 Forms / 101 RPC references**
- Browser Core PASS
- Browser Policy PASS
- Browser Work PASS
- Browser Excellence PASS
- Browser PDC Owner PASS
- Browser PDC Limited Engineer PASS
- Browser PDC Mobile PASS

## Production gates المتبقية

- Next production build غير مثبت في بيئة التدقيق: `next: not found`، و`npm ci` يفشل لأن internal registry يعيد 404 لـ`tslib-2.8.1.tgz`.
- Fresh DB replay الفعلي لم يُنفذ في هذه البيئة رغم إعادة بناء canonical Phase 2 migrations محليًا.
- SECURITY DEFINER allowlist/threat review قبل public production.
- Enable Leaked Password Protection.
- Staging/backup/restore/monitoring + production Auth origins/recovery URLs.
