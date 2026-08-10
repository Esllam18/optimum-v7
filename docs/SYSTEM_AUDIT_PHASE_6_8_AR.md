# System Audit — Phase 6.8 Project & Document Control OS

## النتيجة
البلوك الحالي أصبح معماريًا موحدًا أكثر: Project/Site mutations عبر Commands، Files/CDE عبر scoped RPCs، Storage مربوط بالـreservation/resource، وNavigation موحدة عبر entity resolver.

## أهم الأخطاء التي تم العثور عليها وإصلاحها
1. **Rename/Move permission mismatch**: UI/RPC كانت تعتمد `files.rename/files.move` بينما trigger تطلب `files.manage`. تم إثباته Live ثم إصلاحه وإعادة اختباره على نفس Engineer.
2. **Storage path authorization**: تم استبدال company-path-only check بDocument/Version reservation + Resource Scope.
3. **Notification scope leak**: file/folder notifications أصبحت resource-aware.
4. **Archived-context mutation paths**: Project/Site archive أصبح يجمّد linked Work/Files/CAD/Milestones.
5. **Direct Project/Site Data API writes**: تم إلغاؤها للـauthenticated role.
6. **Global Files loading**: تم إدخال server-side workspace/search/pickers بدل تحميل عشرات الآلاف من السجلات في browser.
7. **Fresh migration gap**: تم إعادة بناء Phase 2 Files schema/workflow migrations محليًا؛ replay الفعلي ما زال يحتاج Staging environment.
8. **New FK indexes**: Performance Advisor كشف 3 FKs بدون indexes وتم إصلاحها.

## Integrity قبل التعديل
Live integrity checks أعادت صفر مشاكل في project/site/folder/document/version/trash/storage relationships، لذلك لم تكن هناك حاجة إلى data repair destructive.

## Architecture after 6.8
Company → Project → Site → Folder → Document → Version

ويرتبط بها:
- Resource Scope / Permissions
- Work Items / Recurrence
- CAD Drawings / Revisions
- Milestones
- Activity / Audit
- Notifications
- Search
- Storage quota

## نقاط لم يتم ادعاء اكتمالها
- Permanent Trash purge / retention / legal hold: مؤجل عمدًا إلى Production governance phase.
- Antivirus/quarantine: غير موجود حاليًا.
- Fresh DB replay: لم يُنفذ فعليًا في هذه البيئة.
- Next production build: لم يثبت بسبب registry dependency failure.
- SECURITY DEFINER review: ما زال Gate على مستوى النظام.
