# Release Notes — Optimum 5.7.0

## Adaptive Workspace / Policy‑Driven UI

### أهم تغيير

إعدادات ميزات الشركة لم تعد مجرد Toggles شكلية. الواجهة الآن تتشكل من **Runtime Policy** مصدرها الخادم وتجمع بين الباقة، تخصيصات الشركة، صلاحيات العضو، وحدود الاستخدام.

### إصلاحات

- إصلاح ربط Permission بالـEntitlement من `permissions.entitlement_key` بدل الاعتماد على حقل غير موجود في `entitlements`.
- إخفاء Modules غير المتاحة من Navigation.
- منع الوصول إلى الصفحة عندما تصبح صلاحيتها/ميزتها غير متاحة.
- إزالة Command Search عندما `module.search` متوقف.
- منع Global Search RPC نفسه إذا `search.use` غير فعال.
- منع Role/Permission UI من منح صلاحية لميزة متوقفة للشركة.
- إضافة Action Guards ضد أزرار DOM قديمة أو حالات UI متأخرة.
- ربط Limits بالأعضاء والمشاريع والتخزين في UI مع بقاء DB authority.
- إصلاح Team / Roles / Projects filters والبحث الفعلي داخلها.
- إصلاح CSS `hidden` للكروت المفلترة.
- حماية File Versioning كـFeature مستقلة في UI والخادم.
- تحديث حي للسياسة عند الرجوع لنافذة Client بعد تعديل Platform Console.
- تطوير شاشة Entitlements في Platform Console لشرح مصدر الميزة وتأثير تعطيلها وعدد الصلاحيات المرتبطة بها.

### قاعدة البيانات الحية

تم تطبيق:

- `phase5_7_adaptive_workspace_policy`
- `phase5_7_search_policy_hardening`

### الاختبارات

- Full npm regression suite: PASS.
- Browser workflow including filters + adaptive policy refresh: PASS.
- Contract scan: 209 Actions / 51 Forms / 75 RPCs.
- Live Runtime Policy simulation against Supabase: PASS.
- Client 4173 / Platform 4174 portable HTTP + security headers: PASS.

### ليست Production-ready بالكامل بعد

- Next.js production build لم يُغلق لأن dependencies غير مثبتة في الحزمة الحالية (`next: not found`).
- Supabase Security Advisor ما زال يطلب مراجعة عدد من SECURITY DEFINER RPCs.
- Leaked Password Protection ما زال غير مفعّل.
