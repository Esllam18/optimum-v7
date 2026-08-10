# QA Checklist — Phase 6 Work & Delivery OS

## Acceptance — Owner/Manager

- [ ] افتح Work وتأكد أن KPIs والـAttention queue تظهر بدون تحميل كل تاريخ المهام للمتصفح.
- [ ] أنشئ Work Item وحدد Project + Type + Estimate + Skills.
- [ ] افتح Smart Assignment وتأكد أن المرشح يوضح score وأسباب access/availability/skills/capacity.
- [ ] أسند المهمة لعضو متاح ثم افتحها من Search/Calendar/Activity وتأكد أنها تفتح نفس الـDrawer مباشرة.
- [ ] عدل نفس المهمة من Tabين؛ احفظ الأول ثم حاول حفظ الثاني، ويجب أن يطلب Reload بدل overwrite.
- [ ] اجعل مهمة Blocked بدون سبب؛ يجب رفض العملية. أضف سببًا ثم أعد المحاولة.
- [ ] اربط Task B بـTask A كـdependency؛ B لا تبدأ قبل Done/Cancelled لـA.
- [ ] أنشئ Approved Leave لعضو في فترة محددة ثم حاول إسناد مهمة له داخل نفس الفترة؛ يجب رفض الإسناد.
- [ ] افتح Calendar وجرّب Month / Week / Day / Agenda / Capacity.
- [ ] تأكد أن Leave + Holiday + Milestone تظهر مع Tasks في التقويم حسب صلاحيتك.
- [ ] أنشئ Milestone واربط بها Task وتأكد من ظهور completion/risk.
- [ ] أنشئ Template واستخدمه في Work Item.
- [ ] أنشئ Automation، اختبر Rule، ثم نفذ Trigger فعليًا وتأكد من Run/Notification أو الإجراء المتوقع.
- [ ] افتح Activity Feed ثم Audit mode؛ جرب search/date/actor/action والـpagination/deep links.

## Acceptance — Limited Engineer

- [ ] يرى فقط Work Items التي تسمح بها الصلاحية والـScope/assignment.
- [ ] لا يرى Work Admin إذا لم يملك صلاحيات الإدارة.
- [ ] لا يستطيع تغيير Owner/Assignees/Watchers إذا لا يملك `tasks.assign`.
- [ ] لا يرى Capacity لفريق كامل إذا لا يملك `tasks.view_workload`.
- [ ] لا يستطيع فتح Task مخفية بمعرف مباشر.
- [ ] لا يستطيع رؤية Dependency إذا كان أحد طرفيها مخفيًا عنه.

## Runtime / Cross-tab

- [ ] افتح Work في Tabين؛ عدل Task في الأول وتأكد من تحديث الثاني بعد revision refresh.
- [ ] Cron `optimum-work-scheduler` موجود مرة واحدة وActive.
- [ ] Recurring task لا تحتاج فتح Browser كي تتولد.

## Release Gates Automated

- [x] `npm test` full regression.
- [x] Browser core: client/orgos/limited/mobile.
- [x] Browser policy/platform.
- [x] Browser Work: owner + limited engineer.
- [x] Live Supabase transaction smoke: optimistic lock + dependency + leave + blocked reason.
- [x] Live scheduler smoke: no global failure if a company lacks valid Owner.
- [x] Phase6 Data API grants/anon EXECUTE checks.
- [x] Phase6 FK performance advisor cleanup.
- [ ] Production `next build` — غير مثبت في بيئة الفحص: `npm ci` فشل لأن الـregistry الداخلي أعاد 404 لحزمة `tslib@2.8.1`، وبالتالي `next` لم يُثبت و`npm run build` أعاد `next: not found`.
- [ ] Global SECURITY DEFINER allowlist review.
- [ ] Enable leaked-password protection.
