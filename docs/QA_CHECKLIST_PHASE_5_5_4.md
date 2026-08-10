# QA Checklist — Optimum 5.5.4

## A. Member Provisioning
- [x] لا يوجد `jsonb_object_length` في validator الحالي.
- [x] validator الحي يقبل `{}` ويعيد `override_count = 0`.
- [x] validator الحي يقبل override صالح ويعيد `override_count = 1`.
- [x] Edge Function يتحقق من الدور/المدير/المدة/overrides قبل إنشاء Auth account.
- [x] أخطاء API تُعرض برسالة مفيدة بدل `[object Object]` أو `Provisioning failed` العام.
- [ ] إعادة تجربة Create Member من حساب Owner الحقيقي على 5.5.4 والتأكد من ظهور Credentials modal.

## B. First Login
- [x] كلمة مرور ضعيفة تُرفض.
- [x] `same_password` تتحول لرسالة مفهومة.
- [x] الواجهة تشرح أن كلمة المرور الجديدة يجب أن تختلف عن المؤقتة/الحالية.
- [ ] تجربة مستخدم حقيقي بكلمة مرور جديدة مختلفة ثم التأكد من دخول Workspace.

## C. Roles → Members
- [x] الضغط على أعضاء الدور لا يغير route تلقائيًا إلى Team.
- [x] يفتح Role Members modal داخل Role Studio.
- [x] يعرض أعضاء الدور وحالاتهم وبياناتهم الأساسية.
- [x] الدور العادي يمكن أن يفتح Create Member بالدور محددًا مسبقًا.
- [x] Owner لا يعرض CTA مضللًا لتعيين Owner مباشرة.
- [x] يوجد انتقال اختياري إلى Team مفلترًا بالدور.

## D. Localization & UX
- [x] Team hero labels عربية في locale العربي.
- [x] Access Engine / Member 360 / Draft→Impact→Publish مترجمة.
- [x] Permission modules تعرض تسميات عربية بدل مفاتيح modules الخام.
- [x] المناطق الزمنية تظهر كتسميات مفهومة مثل القاهرة/الرياض/دبي/عدن/برلين.
- [x] datetime-local محاط بتلميحات عربية؛ placeholder التاريخ نفسه قد يظل تابعًا للمتصفح/نظام التشغيل.
- [x] Platform Console labels الرئيسية مترجمة في locale العربي.
- [x] ملفات CSS/JS المشتركة متزامنة بين Portable/Public/Platform Console.

## E. Regression & Contracts
- [x] `npm test` كامل ناجح.
- [x] 209 Actions.
- [x] 51 Forms.
- [x] 74 RPCs.
- [x] `python tests/browser-workflows-5.3.py` ناجح.
- [x] 5.5.4 regression test ناجح.
- [x] Next.js pages تستخدم cache key `5.5.4`.

## F. Live Supabase
- [x] migration `phase5_5_4_member_provisioning_runtime_fix` مطبقة.
- [x] `identity-provisioning` Version 3 ACTIVE.
- [x] `identity-provisioning-v55` Version 3 ACTIVE.
- [x] لا توجد cross-company role memberships.
- [x] لا توجد cross-company organization-unit memberships.
- [x] لا توجد cross-company member add-ons.
- [x] لا توجد membership scopes مربوطة بشركة مختلفة.
- [x] لا توجد duplicate active offboarding plans.
- [ ] مراجعة SECURITY DEFINER warnings قبل Public Production.
- [ ] تفعيل Leaked Password Protection قبل Public Production.

## G. Runtime / Release
- [x] Portable app HTTP 200 على 4173.
- [x] Platform Console HTTP 200 على 4174.
- [x] CSP + no-store + nosniff + DENY frame headers موجودة.
- [ ] Next.js Production Build: غير مثبت لأن dependencies غير مثبتة في بيئة الحزمة (`next: not found`).
- [ ] بعد استلام ZIP: Ctrl+F5 ثم اختبار Create Member + First Login + Role Members على بيانات حقيقية.
