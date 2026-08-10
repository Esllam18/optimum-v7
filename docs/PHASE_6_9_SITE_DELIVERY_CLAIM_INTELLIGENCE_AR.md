# Optimum 6.9.0 — Site Delivery & Claim Intelligence

## الهدف
إغلاق بلوك Projects + Sites + Files + Trash على نموذج التشغيل الفعلي للمواقع: الموقع يتكون من كابينة أو أكثر، وكل كابينة لها رسومات وحصر واسكتشات وتسليمات، وفي نهاية الموقع يتكون مستخلص/حزمة تسليم من مستندات متعددة.

## القرار المعماري الأهم
المستخلص **ليس فولدر نسخ**. المستند يبقى Canonical في مكانه، ويُضاف للمستخلص كمرجع إلى `document_id`. عند Freeze فقط يتم تثبيت `selected_version_id` على الإصدار الحالي الجاهز. النتيجة: لا Storage duplication ولا نسخة قديمة صامتة داخل فولدر منفصل.

## Cabinet Domain
أضيف `site_cabinets` ككيان حقيقي تابع للموقع والمشروع، وله lifecycle: planned → active → installed → testing → handover → completed → archived.

إنشاء الكابينة يولّد تلقائيًا Root folder وستة أقسام ثابتة:
1. C01 — Drawings & As-Built
2. C02 — Quantity Survey
3. C03 — Sketches
4. C04 — Handover & Inspection
5. C05 — Photos
6. C06 — Supporting Documents

أي Task أو Drawing أو Document تحت شجرة الكابينة يرث نفس السياق عبر Folder hierarchy. أرشفة الكابينة تجعل التغييرات داخل شجرتها غير مسموحة حتى إعادة التنشيط.

## Site Claim Package
الجداول: `site_claim_packages`, `site_claim_requirements`, `site_claim_items`.

المتطلبات الافتراضية للمستخلص النهائي:
- Work Order — إلزامي
- Contract / Agreement — إلزامي
- Quantity Survey / Takeoff — إلزامي
- Sketches — إلزامي
- Handover Certificates / Minutes — إلزامي
- As-Built Drawings — إلزامي
- Approvals — اختياري
- Evidence Photos — اختياري
- Supporting Documents — اختياري

يمكن إضافة Requirements مخصصة لأي جهة تعاقد.

## Auto Collect
`site_claim_suggestions` و`auto_collect_site_claim` يحللان مكان المستند داخل Site/Cabinet workspace والاسم/النوع/tags. الربط الأساسي: C01→As-Built، C02→Quantity Survey، C03→Sketches، C04→Handover، C05→Photos، C06→Supporting.

Auto Collect لا ينسخ الملف؛ يضيف Reference فقط، ويترك المراجعة للمستخدم قبل Freeze.

## Progress Model
`site_claim_package_360` يحسب:
- Required completeness
- Cabinet coverage
- Overall readiness = 70% requirements + 30% cabinet coverage

الهدف من الوزن 70/30 هو جعل المستخلص يعكس اكتمال الأوراق المطلوبة مع عدم تجاهل تغطية جميع الكابينات.

## Freeze / Submit
Freeze يرفض إذا Requirement إلزامي ناقص أو Document بلا Ready current version. عند النجاح يثبت `selected_version_id=current_version_id` لكل Claim Item ويحول Package إلى Ready. بعد ذلك لا تؤثر الإصدارات الجديدة للملف على النسخة المجمدة.

## Fiber Blueprint
أعيدت تسمية الهيكل ليقارب الشغل الحقيقي:
01 Work Orders & Contracts
02 Survey & Approvals
03 Cabinets
04 Quantity Survey & BOQ
05 Drawings & As-Built
06 Sketches & Technical
07 Handover & Certificates
08 Photos & Correspondence

التغيير غير هدّام: تم تعديل أسماء System folders المرتبطة بالـtemplate node فقط مع تجنب sibling name conflicts، دون نقل أو حذف ملفات.

## UX
- Site Delivery 360: Site health + Cabinets + Claim readiness.
- Cabinet 360: readiness + folders + documents/drawings/open work/claim items.
- Claim 360: Overall / Required / Cabinet coverage، requirements، items، Auto Collect، Freeze، Reopen، Submit.
- Document 360: Cabinet context + Claim links + Add to Claim + Document Control lifecycle + versions + Work/CAD links.
- Upload dialog: يمكن اختيار Claim requirement أثناء الرفع.
- Limited users يحصلون على read-only UI متوافق مع server capabilities.

## Live proofs
- Cabinet creation أنشأ 6 folders.
- Default Site Claim يحتوي 9 requirements.
- Freeze incomplete رفض.
- Archived Cabinet منع create_folder تحته.
- Engineer شاهد Site/Claim لكنه مُنع من Cabinet/Claim management.
- Claim reference test: 6 references، صفر Documents إضافية وصفر Versions إضافية بسبب الربط، وFreeze ثبت نفس version في الستة.
- Auto Collect: مستند تحت C01 اقترح `as_built_drawings`، أضاف Reference واحدة وربطها بالكابينة، مع صفر duplicates.
- Server capability matrix: Owner true للإدارة؛ Engineer false لإدارة Site/Cabinet/Claim.

## QA outcome
Full static regression PASS. Contract audit: **251 Actions / 57 Forms / 113 RPC references**. Browser gates Core / Policy / Work / Excellence / PDC / Site Delivery كلها PASS مستقلة.

## Production gates المتبقية
- Next build غير مثبت في بيئة التدقيق: `next: not found`; `npm ci` يفشل لأن الـinternal registry يعيد 404 لـ `tslib-2.8.1.tgz`.
- Supabase Security Advisor ما زال يحذر من client-callable SECURITY DEFINER RPCs على مستوى النظام؛ تحتاج allowlist/threat review function-by-function، وليس revoke جماعي.
- Leaked Password Protection في Supabase Auth ما زالت Disabled.
- Fresh DB full replay يحتاج Staging/CI ببيئة Postgres/Supabase كاملة لإثبات السلسلة من الصفر.
