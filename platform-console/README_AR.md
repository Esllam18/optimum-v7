# Optimum Platform Console 6.9.0

لوحة الإدارة الخاصة بمنصة Optimum. إصدار 6.9.0 يعمل مع **Organization OS + Work & Delivery OS + Project & Site Delivery OS** ويظل منفصلًا عن جلسة تطبيق الشركة.

## التشغيل

من مجلد المشروع الكامل:

```text
start-platform-console.bat
```

أو من داخل `platform-console`:

```bash
node server.mjs
```

العنوان الافتراضي: `http://localhost:4174`.

## المسؤوليات

- إدارة الشركات والاشتراكات والـEntitlements والحدود.
- إنشاء الشركات وحسابات الملاك.
- مكتبة قوالب الأدوار وسياسات الوصول.
- مراجعة صحة الشركة ومعلومات المؤسسة.
- إدارة هوية الشركة وإعدادات المنصة المسموح بها.

لا يستطيع الدخول إلا Platform Admin فعّال. Work OS داخل تطبيق الشركة يظل محكومًا بالـEntitlements والصلاحيات والـScopes الخاصة بكل شركة وعضو.
