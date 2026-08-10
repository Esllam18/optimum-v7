# System Audit — Phase 6 Work & Delivery OS

## الحكم

الجزء **Tasks + Calendar + Activity** لم يعد مجرد واجهات منفصلة. النسخة 6.6.0 تربطها بقاعدة بيانات وصلاحيات وOrganization OS وRuntime واحد. الاختبارات الحالية تدعم إغلاق **البلوك الوظيفي**، وليس إعلان النظام كله Production-ready.

## Backend / Database

### مثبت

- RLS مفعلة على جداول Work الجديدة.
- Mutations الرئيسية عبر SECURITY DEFINER RPCs مع فحوص permission/scope داخلية.
- Public Work RPCs غير قابلة للتنفيذ بواسطة `anon`.
- Scheduler wrapper للـservice role فقط.
- Internal scheduler/automation/risk/materialization helpers محجوبة عن browser roles.
- Direct Data API writes مغلقة على الجداول الجديدة؛ وبعض الجداول الحساسة مغلقة Direct SELECT أيضًا.
- Optimistic locking موجود.
- Recurrence backend-side عبر pg_cron.
- Leave-aware assignment/recurrence.
- Dependency cycle/visibility/status enforcement.
- Server-side task/activity pagination/filtering.

### Live smoke مثبت

داخل Transactions مع Rollback:

- stale save يرفض overwrite.
- Blocked يحتاج reason.
- unfinished dependency تمنع البدء.
- Cancelled blocker يحرر المهمة التالية.
- Approved leave تمنع assignment المتداخل.
- cross-company mutations ترفض.
- limited calendar privacy ترفض مشاهدة شخص آخر بدون workload permission.
- private delegation ترفض.
- automation payload validation تعمل.
- dependency hidden-side redaction تعمل.

Scheduler تم تشغيله Live وأعاد `companies_failed = 0`; الشركة التي لا تملك Owner صالح تم Skip بدل إسقاط الدورة.

## UI / UX

- Work views تعتمد على RPC queries بدل تحميل آلاف الصفوف ثم filtering في JS.
- Task Drawer يعرض timeline / comments / checklist / attachments / risk / dependencies / participants.
- Smart Assignment مفسر.
- Calendar متعدد المناظير.
- Activity deep links إلى العناصر الدقيقة.
- Limited Engineer browser flow يثبت اختفاء management/assignment/capacity controls غير المسموحة.
- Mobile legacy flow ما زال يمر بعد دمج Work OS.

## Regression

`npm test` مر بالكامل بعد Phase 6 ويشمل CAD، Identity، Organization، Access Engine، Adaptive Policy، Organization OS، وWork OS.

System contract scanner التاريخي يعطي 227 Actions / 54 Forms / 83 RPC references داخل نطاقه القديم؛ Phase 6 module المستورد له اختبار مستقل `tests/work-delivery-os-6.6.mjs` يتحقق صراحةً من RPC contracts الجديدة، لذلك رقم 83 ليس عدد RPCs الكلي في المنتج.

## Supabase Advisors

Performance Advisor بعد الإغلاق: لا توجد Phase 6 unindexed-FK notices؛ المتبقي INFO عن unused indexes لأن البيانات الحالية صغيرة، ولا ينصح بحذفها قبل Production workload metrics.

Security Advisor: ما زالت تحذيرات `authenticated_security_definer_function_executable` عبر النظام، منها RPCs مقصودة كواجهة API ولكنها تحتاج allowlist review منظم قبل public production. كذلك Leaked Password Protection غير مفعّل.

## قرار الانتقال

بعد Acceptance test يدوي على حساب حقيقي، يمكن اعتبار Work/Calendar/Activity block مغلقًا وظيفيًا والانتقال للبلوك التالي، مع إبقاء Production Security/Deployment gates منفصلة قبل النشر العام.
