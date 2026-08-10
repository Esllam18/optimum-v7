# Phase 6 — Work & Delivery Operating System

## الهدف

هذه المرحلة تعيد بناء **Tasks + Calendar + Activity** كمنظومة تنفيذ واحدة فوق Organization OS، بدل ثلاث شاشات منفصلة. المبدأ الحاكم هو:

**Entitlement → Effective Permission → Resource Scope → Organization Context → Work Action**

أي ميزة أو زر في الواجهة لا يكفي وحده؛ نفس القرار يجب أن يكون مفروضًا داخل قاعدة البيانات والـRPCs.

## 1. Work Core

- الاستعلام عن المهام أصبح Server-side عبر `work_task_query` مع البحث والفلترة والترتيب والـpagination.
- تفاصيل المهمة عبر `work_task_detail` وتعيد الـcapabilities الفعلية للمستخدم الحالي.
- الحفظ المتقدم عبر `save_work_item(jsonb)` في Transaction واحدة.
- `lock_version` يمنع جلسة قديمة من الكتابة فوق تعديل أحدث.
- تغيير الـScope يحتاج صلاحية على الـScope القديم والجديد حسب العملية.
- إسناد شخص لا يكفي أن يكون Active؛ يجب أن يكون متاحًا، غير On Leave/Offboarding/Left/Suspended، ويملك `tasks.view` على المورد نفسه.
- Private Work لا يسمح بتفويض Owner/Assignees/Watchers/Reviewer/Approver إلى أشخاص آخرين.
- Open Work لا يسمح بإسناد مسبق متعارض.

## 2. Work Item 2.0

الـTask تدعم الآن:

- الأنواع: Task / Review / Approval / Inspection / Issue / Follow-up.
- Owner، Assignees، Role assignments، Reviewer، Approver، Watchers.
- Project / Site / Folder / Document / Milestone context.
- Estimated وActual effort.
- Required Skills وLabels.
- SLA due date.
- Checklist / Comments / Attachments / Timeline.
- Source type/id للربط بمصادر أخرى في Optimum.

## 3. Smart Assignment

`work_assignment_candidates` يرتب المرشحين بناءً على:

- الوصول الفعلي للمشروع/الموقع.
- حالة العضو ودورة حياته.
- الإجازات المعتمدة في فترة المهمة.
- المشاريع الافتراضية والموقع الأساسي.
- المهارات المطلوبة.
- الطاقة الأسبوعية وحجم العمل المخطط.

النتيجة Rule-based ومفسرة وليست AI غامضًا.

## 4. Dependencies & Delivery Risk

- `task_dependencies` تمنع الدورات الدائرية.
- المهمة لا تبدأ/تكتمل إذا كان لها blocker غير منتهٍ.
- Cancelled blocker يعتبر محررًا للـdependency مثل Done.
- Dependency rows لا تُكشف للمستخدم إلا إذا كان يستطيع رؤية الطرفين؛ لمنع تسريب معرف مهمة مخفية.
- Risk snapshot يقيم Overdue / Blocked / Dependency blocked / No owner / downstream impact.
- Delivery snapshot يجمع Attention queue + workload + milestones + KPIs.

## 5. Operational Calendar

التقويم لم يعد مجرد Due Dates للمهام. `work_calendar_feed` يجمع:

- Tasks.
- Milestones.
- Approved Leave.
- Company Holidays.

والواجهة تدعم Month / Week / Day / Agenda / Capacity. مشاهدة تقويم شخص آخر أو Capacity تتطلب `tasks.view_workload` أو `tasks.manage`.

## 6. Leave & Availability

- `member_leave_periods` لا تُقرأ مباشرة من Data API للمستخدمين؛ الوصول يتم عبر RPCs محددة.
- الموظف يرى طلباته، والإدارة ترى Queue الشركة عند امتلاك الصلاحية.
- Approved Leave تمنع الإسناد المتعارض زمنيًا.
- عند إعادة اعتماد/تعديل الإجازة لا تُسمح حالة منطقية تكسر Work assignment بدون تحقق.

## 7. Recurring Work

التكرار لم يعد يعتمد على فتح المتصفح.

- يوجد `pg_cron` job باسم `optimum-work-scheduler` كل 15 دقيقة.
- كل شركة تستخدم Owner نشط كسلطة تنفيذ للـscope guards.
- الشركة التي لا يوجد لها Owner صالح تُتخطى ولا تسقط الدورة كلها.
- الـscheduler يستخدم `FOR UPDATE SKIP LOCKED` ويمنع duplicate occurrences.
- assignee غير المتاح أو الموجود في إجازة لا يُنسخ إلى occurrence جديدة.

## 8. Templates & Automations

- Task Templates تحفظ Type/Priority/Effort/Skills/Labels/Checklist/default payload.
- Work Automation Rules تدعم حاليًا triggers: created / status_changed / overdue.
- الشروط الحالية: status / priority / task_type / project_id.
- الإجراءات المدعومة: notify_owner / notify_manager / set_priority.
- Action/Condition payloads يتم التحقق منها في الـBackend.
- فشل Automation لا يُسقط الـTask event الأصلي؛ يسجل failure بصورة معزولة.

## 9. Notifications

الإشعارات أصبحت Stakeholder-based بدل broadcast لكل أعضاء الشركة. المستلمون المحتملون: Owner، creator، assignees، role assignees، reviewer، approver، watchers، مع احترام preferences الأساسية وعدم إرسال الإشعار للفاعل نفسه.

## 10. Activity + Audit

`work_activity_feed` يعمل Server-side ويقدم نمطين:

- Activity Feed بشري للاستخدام اليومي.
- Audit mode للتحقيق الإداري.

يدعم Search / Actor / Action / Date / Pagination، والواجهة تربط الأحداث بالكيان الدقيق مثل Task/Member/Role/Project/File/Folder عندما يمكن ذلك.

## 11. Realtime / Runtime revision

`work_runtime_versions` هو مؤشر تغير خفيف. الواجهة تراقب revision وتعيد تحميل Work data عند تغيرها بين الجلسات/التبويبات دون الاعتماد على Cache قديمة.

## 12. Least Privilege

- جداول حساسة مثل Leaves وRuntime revision ليست Data API surfaces مباشرة.
- Dependencies وWatchers يتم إرجاعها من RPC scoped وليس SELECT مباشر للـauthenticated.
- جداول الإدارة مثل Templates/Milestones/Automations تسمح SELECT فقط حيث يلزم؛ mutations عبر RPCs.
- جميع Phase 6 public RPCs المقصودة للمتصفح ممنوعة عن `anon`.
- Scheduler public wrapper للـservice role فقط.
- internal executor helpers غير قابلة للتنفيذ من browser roles.

## 13. ما تم اكتشافه أثناء الاختبار وليس أثناء التصميم

الاختبارات الحية كشفت وتم إصلاح:

- Cross-company upsert في بعض Work admin objects.
- إمكانية تسريب dependency لطرف مخفي.
- حفظ جزئي قد يفقد participants عند تعديل حقول غير متعلقة بهم.
- stale session overwrite قبل optimistic lock.
- إسناد متكرر لموظف داخل إجازة.
- private work delegation edge cases.
- blocked task بدون سبب.
- Scheduler يعتمد على Platform Admin غير موجود؛ تم استبداله بسلطة Owner لكل شركة.
- Foreign Keys جديدة بدون indexes تغطيها.

## حدود المرحلة

هذه المرحلة لا تدعي إغلاق Production Hardening الكامل للنظام كله. Supabase Security Advisor ما زال يحذر من عدد كبير من authenticated `SECURITY DEFINER` functions التاريخية، وLeaked Password Protection غير مفعّل. هذه بوابة أمن عامة تحتاج مراجعة function-by-function ولا يصح إيقافها جماعيًا لأن كثيرًا منها هو API مقصود ومحمّي داخليًا.
