# ملاحظات إصدار Optimum 5.3.2

## Session Isolation & System Audit

### الإصلاح الرئيسي

تم فصل جلسة تطبيق الشركات عن جلسة Platform Console. تسجيل الخروج من تطبيق لم يعد يلغي جلسة التطبيق الآخر، كما يتم فحص الجلسة قبل عمليات إنشاء الشركة أو العضو وإظهار رسالة واضحة عند انتهاء الصلاحية.

### تحسينات الاعتمادية

- مفاتيح Local Storage منفصلة للتطبيقين.
- `scope=local` عند تسجيل الخروج.
- إظهار أخطاء Refresh بعد العمليات بدل تجاهلها.
- إزالة اعتماد الواجهة على وظيفة `identity-provisioning-verified` المكررة.
- إضافة migration استعادة لكل وظائف Files/Notifications/Platform المستخدمة وغير الموثقة سابقًا.
- تطبيق RPC استعادة Revision تاريخي على قاعدة البيانات الحية.
- إضافة بحث Auth مباشر خاص بالـService Role داخل مصدر Edge Function.
- إضافة Allowed Origins بدل CORS المفتوح داخل مصدر Edge Function بالحزمة.

### نتيجة الفحص

- 178 UI action تمت مطابقتها مع Handlers.
- 44 Form تمت مطابقتها مع Submit paths.
- 62 RPC موجودة في الحزمة وقاعدة Supabase الحية.
- صفر RPC من العقد النشط متاحة لـanon.
- كل اختبارات الإصدارات السابقة واختبارات 5.3.2 نجحت.

### ليس إصدار نشر نهائيًا بعد

ما زال يلزم Staging، Production Build، مزود بريد، E2E حي، مراجعة SECURITY DEFINER، وتفعيل Leaked Password Protection.

راجع:

- `docs/SYSTEM_AUDIT_5_3_2_AR.md`
- `docs/QA_CHECKLIST_PHASE_5_3_2.md`
- `docs/SYSTEM_AUDIT_5_3_2.json`
