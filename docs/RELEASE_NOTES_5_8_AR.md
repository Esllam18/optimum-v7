# Release Notes — Optimum 5.8.0

## Organization OS Closure

الإصدار 5.8.0 يقفل طبقة إدارة المؤسسة كأساس موحد قبل بدء مرحلة المهام وسجل النشاط والتقويم.

### الجديد
- Organization OS: Setup Journey + Readiness + Health + Work Settings + Org Structure.
- Member 360 ببيانات الوصول والعمل والأمان والسياق التنظيمي.
- Saved Views حقيقية للفلاتر.
- Bulk member actions + Undo.
- Permission-aware Quick Create.
- Ctrl+K Command Palette مطور.
- Rule-based role insights.
- Cross-session organization revision refresh.
- Organization Health داخل Platform Console من نفس الـRPC.
- Mobile/responsive hardening للـMember 360.

### إصلاحات مهمة
- إصلاح Runtime revision triggers للجداول ذات مفاتيح الشركة غير المباشرة.
- تضييق View as User لمنع `members.view` من كشف وصول عضو آخر.
- إصلاح Bulk Status مع enum `membership_status`.
- إصلاح Bulk permission source من `public.has_company_permission` القديمة إلى `app_private.has_company_permission`.
- جعل `sessionStorage` اختيارية وآمنة.
- الحفاظ على Quick Actions داخل Command Palette أثناء البحث.
- توحيد Design System بين جميع Runtime copies.
- تنظيف Saved Views RLS من auth initplan warning وإزالة Index مكرر.

### إثباتات QA
- Full regression PASS.
- 227 Actions / 54 Forms / 85 RPCs.
- Browser: Client / OrgOS / Limited / Mobile / Policy / Platform PASS.
- Live Supabase rollback smoke: Work Settings / Saved View / Health / Bulk Suspend / Undo PASS.
- DB tenant integrity checks = 0 issues.
- Portable client/platform HTTP 200 مع security headers.

### غير مغلق بعد
- Next.js Production Build لم يُثبت لأن `node_modules` غير موجودة في الحزمة (`next: not found`).
- Supabase Security Advisor ما زال يطلب مراجعة SECURITY DEFINER functions وتفعيل Leaked Password Protection قبل Public Production.
