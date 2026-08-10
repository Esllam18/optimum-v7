# QA Checklist — Optimum 5.5.3

## Company / Settings
- [ ] تعديل اسم/بيانات الشركة ثم التأكد أن التغيير يظهر في كل أجزاء النظام بعد Save & Publish.
- [ ] تعديل Branding والتأكد من المعاينة ثم التطبيق الفعلي.
- [ ] فتح History وعمل Rollback إلى إصدار سابق.
- [ ] محاكاة فشل Dataset والتأكد أن Warning يظهر ولا يسمح بحفظ خطير.

## Roles & Permissions
- [ ] إنشاء Role جديد عبر Draft → Impact → Publish.
- [ ] التأكد أن Impact يعرض affected/gained/lost الفعلية.
- [ ] تجربة High-risk gain مع Second Approval ON.
- [ ] التأكد أن النشر Pending لا يغير وصول الأعضاء قبل الموافقة.
- [ ] Clone من Template يمر من Draft ولا ينشر مباشرة.
- [ ] Scope project/site/folder/drawing يعرض Target الصحيح.

## Team / Access 360
- [ ] تغيير Role من Access 360 والتأكد أنه تغير بعد Reload.
- [ ] تعديل HR + Role + Overrides واختبار rollback عند فشل أي جزء.
- [ ] تجربة عضو به Add-on/Scope أعلى من صلاحيات المدير والتأكد أن Access 360 يتقفل بوضوح.
- [ ] التحقق من Alternate Manager / Primary Site / Units لنفس الشركة فقط.
- [ ] التحقق من datetime-local في المنطقة الزمنية المحلية.

## Offboarding
- [ ] لا يظهر `left` كاختيار عادي للمغادرة الجديدة.
- [ ] إعداد Offboarding plan ونقل المهام والعهدة.
- [ ] تجربة Second Approval وإثبات أن Execute لا يظهر قبل الموافقة.
- [ ] محاولة Offboard آخر Owner يجب أن تفشل.

## Platform Console
- [ ] فتح Permissions / Templates / Entitlements بنجاح.
- [ ] عند فشل أي Dataset يظهر Warning ولا تظهر القائمة كأنها فارغة طبيعيًا.
- [ ] إنشاء شركة ومالك واختبار First Login.
- [ ] فشل account_security يجب ألا يتجاوز forced-password flow.

## Automated
- [x] `npm test`
- [x] `npm run test:browser`
- [x] Visual organization render
- [x] Portable client HTTP 200 + security headers
- [x] Platform Console HTTP 200 + security headers
- [ ] `npm ci && npm run build` في بيئة بها dependencies
- [ ] Full destructive E2E on Supabase Staging
