# Optimum 6.7.0 — Work Experience Excellence

## الهدف

الإصدار 6.7 لا يعيد بناء Work OS من الصفر؛ بل يبني فوق 6.6 التي تم فحصها أولًا ونجحت في الاختبارات قبل بدء التعديل. الهدف هو تحويل Tasks + Calendar + Activity من أدوات تشغيل منفصلة إلى **Work Command Center** يومي واضح، سريع، قابل للتصرف، ومربوط فعليًا بالصلاحيات والـScope وOrganization OS.

## ما تمت إضافته

### Work Cockpit
- الصفحة الافتراضية لقسم Work أصبحت مركز العمل اليومي بدل قائمة مهام خام.
- إشارات مباشرة: المفتوح، اليوم، المتأخر، المحجوب، المراجعات، الاعتمادات، والقادم.
- Focus Queue مرتبة حسب ما يحتاج تدخلك فعليًا.
- Manager Pulse يظهر المخاطر، الأعمال بدون مسؤول، والأعضاء مرتفعي الحمل لمن يملك صلاحية workload/manage فقط.

### Work Item 360
- Drawer احترافي بخمس مناطق: Overview، People، Dependencies، Context & Files، Activity.
- يظهر Risk level + score + أسباب الخطر، المسؤول، المراجع، المعتمد، المواعيد، الجهد، الـSLA، الـChecklist، المرفقات، والـTimeline.
- لا توجد صلاحيات إدارية مخفية شكليًا فقط؛ الـcapabilities تأتي من Backend وتبقى الـRPCs هي سلطة التنفيذ.

### Smart Assignment 2.0
- 3 استراتيجيات عرض: Balanced، Most Skilled، Least Loaded.
- كل مرشح يعرض score وتفسيره: access، availability، project/site fit، skills، utilization، planned hours.
- الترشيح Advisory فقط؛ لا يوجد إسناد صامت أو قرار AI غير قابل للتفسير.

### Capacity Planner
- Matrix يومية تصل إلى 42 يومًا حسب الطلب.
- تعرض العمل المخطط، السعة، الإجازات، العطلات، أيام العمل، ونسبة الاستخدام.
- محمية بـ tasks.view_workload أو tasks.manage.

### Dependency & Risk Center
- Graph للمهام المرئية فقط حسب Scope.
- يظهر blocker/downstream count وimpact score.
- Risk Center قابل للتصرف ويفتح نفس Work Item مباشرة.

### Workflow Templates
- Workflow متعدد الخطوات بدل Task Template منفردة فقط.
- كل خطوة تدعم type، priority، offset، duration، estimate، skills، labels، checklist، dependencies.
- Instantiate ينشئ Work Items حقيقية ثم يربط dependencies في Backend.

### Visual Automation Builder
- WHEN → IF → THEN بدل تحرير JSON خام.
- Triggers: created، status changed، overdue، due soon.
- Conditions: status، priority، task type، project، risk level، blockers.
- Actions: notify owner/manager/reviewer/approver/watchers أو set priority.
- Dry Run يبقى متاحًا قبل التفعيل.

### Operational Calendar UX
- Task events قابلة للسحب وإعادة الجدولة.
- Drop لا يكتب في الجدول مباشرة؛ يجلب detail حديث ثم يحفظ عبر save_work_item مع expected_lock_version.
- Backend يعيد فحص permission/scope/leave/concurrency قبل قبول التغيير.

### Saved Work Views
- الفلاتر الحالية يمكن حفظها وإعادة تطبيقها عبر Saved Views الحالية بدل تخزين محلي منفصل.

## Bugs اكتشفتها اختبارات Live أثناء 6.7

1. `task.due_soon` أضيف للـRPC والـscheduler، لكن CHECK constraint القديمة في `work_automation_rules` لم تكن تسمح به. تم تحديث الـconstraint واختبار Automation dry-run Live بنجاح داخل Transaction ثم Rollback.
2. جدول `work_workflow_templates` حصل على SELECT grant للـanon من إعدادات/default privileges رغم أن RLS نفسها authenticated-only. تم إغلاق الـanon grant صراحة، والإبقاء على authenticated SELECT فقط مع منع الكتابة المباشرة وإجبار writes على RPCs.

## Live verification

على Supabase الحية تم التحقق من:
- Work Cockpit للـOwner والـEngineer المسموح له view.
- Capacity للـOwner ورفضها للـEngineer المحدود.
- Dependency graph.
- Workflow template creation + instantiate لمسارين مترابطين داخل Transaction ثم Rollback.
- Automation due-soon + risk/blocker conditions + watcher action في Dry Run داخل Transaction ثم Rollback.
- Direct workflow INSERT للـauthenticated مرفوض.
- anon SELECT على workflow templates مرفوض بعد hardening.
- Scheduler smoke: companies_failed = 0، companies_skipped = 1.

الشركة التي ما زالت تُتخطى من الـscheduler هي «جامعة النهضة (New Bani Suef, Beni Suef Governorate)» لأنها لا تملك Owner نشطًا صالحًا حاليًا. يجب إصلاح الـOwner قبل الاعتماد على recurrence/overdue/due-soon automation فيها.

## Release gates التي نجحت

- `npm test`: PASS.
- Contract audit: 227 actions / 54 forms / 83 RPC references.
- Browser Core: PASS.
- Browser Policy: PASS.
- Browser Work: PASS.
- Browser Excellence + 390px Mobile: PASS.
- Portable runtime 4173: HTTP 200 + no-store + CSP + DENY + nosniff.
- Platform Console 4174: HTTP 200 + نفس security headers.

## ما لم يتم اعتباره Production-ready

- Next production build غير مثبت في بيئة التدقيق لأن `npm ci` فشل من الـinternal registry عند `tslib@2.8.1`، وبالتالي `next` غير متاح هنا. هذا Environment/Dependency gate وليس PASS.
- Supabase Security Advisor ما زال يعطي تحذيرات `authenticated_security_definer_function_executable` على RPCs كثيرة في النظام، بما فيها بعض Work RPCs المقصودة للعميل. يلزم allowlist review function-by-function قبل النشر العام، وليس revoke جماعيًا.
- Leaked Password Protection ما زالت Disabled.

## النتيجة

6.7 يجعل Work هو نقطة الدخول اليومية: المستخدم يعرف ماذا يحتاج انتباهه، والمدير يرى الاختناقات والمخاطر، وكل Insight يقوده مباشرة لنفس Work Item أو الإجراء، بينما تبقى قاعدة القرار في Backend وليس في إخفاء عناصر UI فقط.
