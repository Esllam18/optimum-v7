# Optimum 5.5.4 — Organization Runtime Reliability & UX

## لماذا صدر هذا الإصدار؟
الإصدار 5.5.3 اجتاز اختبارات آلية، لكن التجربة الفعلية كشفت ثلاث مشكلات مهمة لم تكن التغطية السابقة تكشفها بصورة كافية: فشل إنشاء عضو، ظهور خطأ خام في أول دخول عند إعادة استخدام نفس كلمة المرور، وانتقال زر أعضاء الدور إلى صفحة الفريق العامة بدل تجربة مخصصة للدور. لذلك 5.5.4 هو Hotfix استقرار وتشغيل للجزء الحالي، وليس Phase 5.6.

## الإصلاحات الرئيسية
- إصلاح `service_validate_member_provisioning` الحي في Supabase وإزالة الاعتماد على `jsonb_object_length(jsonb)` غير المدعوم في البيئة الحالية.
- إضافة اختبار حي للـvalidator مع permission overrides فارغة وغير فارغة.
- ترقية `identity-provisioning` و`identity-provisioning-v55` إلى Version 3 في Supabase.
- التحقق من صلاحيات إنشاء العضو قبل إنشاء حساب Auth لتقليل حالات الإنشاء الجزئي.
- الحفاظ على رسالة الخطأ الحقيقية بدل اختزال كل الأخطاء إلى `Provisioning failed`.
- تحويل `same_password` إلى رسالة مفهومة، مع تنبيه داخل شاشة أول دخول أن كلمة المرور الجديدة يجب أن تختلف عن المؤقتة/الحالية.
- إضافة نافذة Members داخل Role Studio بدل التحويل التلقائي إلى Team.
- إضافة انتقال اختياري صريح إلى Team مفلترًا بالدور.
- السماح بفتح إنشاء عضو من نافذة الدور مع اختيار الدور تلقائيًا عندما يكون الدور قابلًا للتعيين.
- عدم عرض زر تعيين أعضاء مباشرة لدور Owner.
- تحسين توطين Team / Roles / Access Engine / Settings / Platform Console، بما في ذلك المناطق الزمنية وتسميات الوحدات والصلاحيات.
- تحديث cache-busting في Portable وNext.js إلى 5.5.4 لمنع تشغيل JavaScript قديم من Cache المتصفح.

## التحقق
- `npm test`: ناجح من CAD 4.11 حتى 5.5.4.
- Contract scan: 209 Actions / 51 Forms / 74 RPCs.
- Browser workflow: ناجح، ويتحقق من Role Members modal واختيار الدور تلقائيًا وإنشاء العضو في الـpayload ومسارات Roles/Settings/Platform Console.
- Local runtime: التطبيق على 4173 وPlatform Console على 4174 يرجعان HTTP 200 مع Security Headers.
- Database invariants: لا توجد علاقات Role/Unit/Add-on/Scope عابرة للشركات، ولا duplicate active offboarding plans.
- Supabase live validator: تم اختباره بنجاح على الشركة الفعلية مع 0 و1 permission override.

## ما لم يُعتبر ناجحًا بعد
- لم يتم تنفيذ إنشاء عضو حقيقي end-to-end بعد الإصلاح باستخدام جلسة المستخدم الفعلية داخل المتصفح؛ اختبار المتصفح لهذا المسار Mocked، بينما الـDB validator والـEdge Functions محدثة Live. إعادة محاولة المستخدم لإنشاء عضو على 5.5.4 هي آخر إثبات للمسار الكامل.
- `next build` لم يشتغل في حزمة الاختبار لأن `node_modules` غير موجودة (`next: not found`). النسخة Portable تعمل؛ Production Build يظل بوابة نشر منفصلة.
- Supabase ما زال يحذر من عدد من SECURITY DEFINER functions القابلة للاستدعاء بواسطة authenticated، ويجب مراجعتها قبل Public Production.
- Leaked Password Protection ما زالت غير مفعلة.
- مؤشرات Performance المصنفة Unused Index لم تُحذف؛ يلزم قياس استخدام حقيقي قبل حذفها.

## حالة Phase 5.6
Phase 5.6 ليست منجزة ولا تعتمد عليها حزمة 5.5.4. توجد آثار migrations قديمة تحمل اسم 5.6 في قاعدة البيانات من محاولة سابقة، ولم يتم حذفها عشوائيًا لتجنب Schema rollback غير آمن.
