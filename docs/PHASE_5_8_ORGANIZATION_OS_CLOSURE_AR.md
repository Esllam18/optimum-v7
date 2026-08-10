# Phase 5.8 — Organization OS Closure

## الهدف

هذه المرحلة تقفل جزء **الشركة + الفريق + الأدوار والصلاحيات + الهيكل التنظيمي + إعدادات العمل + ذكاء المؤسسة** كوحدة واحدة مترابطة قبل بدء المراجعة الشاملة للمهام وسجل النشاط والتقويم.

القاعدة المعمارية لم تتغير: الواجهة لا تقرر الوصول وحدها. قرار الاستخدام النهائي يبنى من:

**الباقة/Entitlements → الصلاحيات الفعلية → نطاق الوصول → حدود الباقة والاستهلاك → الواجهة والإجراء النهائي.**

## ما أضيف وربط فعليًا

### 1. Organization OS
- صفحة إدارية واحدة للـOwner/Company Manager تعرض رحلة إعداد المؤسسة.
- Workspace Readiness Score محسوب من بيانات فعلية.
- Organization Health Center مع Issues وFix Now routes.
- Work Settings: المنطقة الزمنية، أيام العمل، بداية/نهاية اليوم، الساعات الأسبوعية، العطلات، Defaults للإشعارات.
- Organization Structure / Org Chart مبني على `organization_units` وعضويات الوحدات والمديرين.
- نفس Health Engine يستخدم داخل Platform Console عند فتح الشركة.

### 2. Member 360
- بيانات العضو الوظيفية وحالته وLifecycle.
- الدور والصلاحيات الفعلية والصلاحيات المحجوبة بسبب الباقة.
- Add-ons وScope Rules والوحدات التنظيمية.
- المدير المباشر والبديل والموقع الأساسي.
- Employment Type / Work Mode / Experience / Skills / Weekly Capacity.
- Default Projects وWork/Notification Preferences.
- Security Snapshot: آخر دخول، تأكيد البريد، إجبار تغيير كلمة المرور، نهاية الوصول.
- Compensation فقط لمن يملك الصلاحية المناسبة.
- Quick Actions حسب الصلاحيات الفعلية.

### 3. Access Studio integration
- View as User مربوط بالـBackend وليس UI فقط.
- المستخدم العادي يستطيع معاينة وصوله هو فقط.
- معاينة وصول عضو آخر تحتاج Owner أو `members.manage` أو `roles.manage` أو Platform Admin.
- Role Insights Rule-based تكشف الأدوار الفارغة، الصلاحيات التابعة الناقصة، التشابه العالي، وResource permissions بدون Scope مناسب.
- Draft / Impact / Publish / Versioning / Rollback الموجودة من Access Engine بقيت جزءًا من نفس تجربة الإدارة.

### 4. Saved Views + Filters
- Saved Views حقيقية في Supabase للمستخدم والشركة والصفحة.
- Default View لكل View Key.
- Team وRoles يستخدمان الفلاتر المحفوظة بدل LocalStorage-only.
- RLS تمنع قراءة أو تعديل View لمستخدم آخر.
- تم تنظيف RLS لتستخدم `(select auth.uid())` وإزالة Index مكرر كشفه Supabase Performance Advisor.

### 5. Bulk Actions + Undo
- تحديد عدة أعضاء.
- تغيير Role / Suspend / Activate حسب المسموح.
- حد أقصى 200 عضو في العملية.
- منع تعيين Owner بالـBulk.
- Audit للعملية.
- Undo يعيد الدور والحالة السابقة.
- إصلاح Live لعدم تطابق `text` مع enum `membership_status`، وإصلاح اعتماد Legacy RPC على `public.has_company_permission` غير الموجودة، وتحويله إلى `app_private.has_company_permission`.

### 6. Command Palette + Quick Create
- Ctrl+K يجمع Quick Actions والبحث في الأعضاء ونتائج البحث العامة.
- Quick Actions لا تختفي عند بدء الكتابة.
- زر Quick Create موحد في Topbar.
- لا يظهر من Quick Create إلا ما تسمح به الباقة والصلاحيات: عضو، دور، وحدة تنظيمية، مشروع.

### 7. Cross-session refresh
- `organization_runtime_versions` هي Revision موحدة للتغييرات التنظيمية.
- Triggers ترفع Revision عند تغييرات مؤثرة في الشركة، العضويات، الأدوار، Scopes، Add-ons، Settings وغيرها.
- الواجهة تراقب Revision وتعيد تحميل السياسة والبيانات وتخرج المستخدم من Route لم يعد مسموحًا به.
- BroadcastChannel/Storage signal يساعد التبويبات على نفس الجهاز.
- تم إصلاح Trigger mapping للجداول التي لا تحتوي `company_id` مباشرة ولجدول `companies` الذي مفتاح الشركة فيه `id`.

## أخطاء حقيقية كشفها الاختبار وتم إصلاحها

1. Runtime revision trigger كان يفترض وجود `company_id` في كل جدول.
2. `member_access_snapshot` كان يسمح لـ`members.view` بمعاينة وصول أعضاء آخرين.
3. Bulk Status كان ينادي `set_member_status(uuid,text)` بدل enum الصحيح.
4. Bulk RPCs القديمة كانت تستخدم `public.has_company_permission` غير الموجودة في الـDB الحالية.
5. `sessionStorage` المباشر كان قادرًا على إسقاط صفحة المؤسسة في سياقات متصفح مقيدة.
6. Command Palette كانت تمسح Quick Actions أثناء البحث.
7. Member 360 wide drawer احتاج اختبار موبايل فعلي بعد انتهاء Animation.
8. Design System drift بين `assets`, `public`, `app/globals.css`, وPlatform Console تم كشفه وإعادة توحيده byte-for-byte.
9. Saved Views كان عليها RLS initplan warning وIndex افتراضي مكرر؛ تم تنظيفهما في 5.8.

## ما يعتبر مغلقًا بعد 5.8

من منظور تطوير المنتج نستطيع الاعتماد على هذا الجزء كأساس للمرحلة التالية:
- Company / Entitlements / Limits
- Roles / Permissions / Scope / Add-ons
- People / Member 360 / Lifecycle context
- Organization Structure
- Work Context required by future Calendar/Tasks
- Workspace Readiness / Health
- Saved Views / Filters / Bulk / Undo
- Permission-driven Command/Quick Create
- Cross-session organization refresh

## ما لا تدعي 5.8 إغلاقه

- المراجعة الشاملة الجديدة لـTasks.
- إعادة بناء/إغلاق Activity Log UX.
- Calendar وAvailability/Leave scheduling.
- Next.js Production Build؛ الحزمة الحالية لا تحتوي `node_modules` و`next build` يرجع `next: not found`.
- Production Security Hardening الكامل؛ Supabase ما زال يحذر من SECURITY DEFINER functions القابلة للاستدعاء بواسطة authenticated ومن Leaked Password Protection المعطل. هذه تحتاج Audit مقصود، وليس تغييرًا جماعيًا قد يكسر حدود الأمان.

## المرحلة التالية

بعد قبول 5.8 يدويًا، ننتقل ككتلة واحدة إلى:

**Tasks + Activity Log + Calendar**

ونبنيها فوق Organization OS بدل إعادة اختراع الأعضاء والصلاحيات وساعات العمل والهيكل التنظيمي داخل كل Module.
