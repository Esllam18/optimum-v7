# Release Notes — Optimum 6.6.0

## Work & Delivery OS Closure

أكبر تغيير في الإصدار هو تحويل المهام والتقويم وسجل النشاط من ثلاث شاشات إلى طبقة تشغيل مترابطة.

### جديد

- Work Item 2.0 وأنواع العمل المختلفة.
- Smart Assignment مع score وأسباب الاختيار.
- Owner/Reviewer/Approver/Watchers.
- Estimated/Actual effort، Skills، Labels، SLA، Milestones.
- Dependencies وDelivery Risk.
- Operational Calendar متعدد المناظير.
- Leave workflow وربطه بالإسناد.
- Templates.
- Automation Rules + Runs.
- Activity Feed + Audit mode + deep links.
- Work runtime revision لتحديث الجلسات.
- Backend recurrence scheduler كل 15 دقيقة.

### إصلاحات حرجة

- Scope enforcement على مسارات Work.
- Atomic Work save وعدم فقد participants أثناء تعديل جزئي.
- Optimistic concurrency.
- Dependency privacy.
- Leave-aware recurring assignments.
- Private Work delegation restrictions.
- Blocked reason enforcement.
- Automation failure isolation.
- Data API least privilege.
- Scheduler لم يعد يعتمد على Platform Admin؛ يستخدم Owner لكل شركة ويعزل فشل الشركات.
- Phase 6 foreign-key indexes.

### اختبارات الإصدار

- Full static/regression suite PASS.
- Browser core/policy/platform/work owner/limited PASS.
- Live Supabase transactional smoke PASS.
- Live cron scheduler smoke PASS.
- Data API grants/anonymous execution audit PASS ضمن Phase 6.

### غير مغلق بعد

- Global Supabase SECURITY DEFINER allowlist audit.
- Leaked Password Protection.
- Production deployment/staging/backup/restore/monitoring gates.
- Next.js production build غير مثبت في بيئة الفحص الحالية: `npm ci` فشل بسبب 404 من الـregistry الداخلي لحزمة `tslib@2.8.1`، ولذلك `npm run build` أعاد `next: not found`.
