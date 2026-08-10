# دراسة الفريم والرسومات المرجعية — Phase 4.4

## مصادر الدراسة

تمت مراجعة ملفات Elec 14-1 وElec 14-2 وElec 14-3 وElec 14-4 المرفقة، مع مقارنة صفحات الرسم والفريم والـLegend والجداول.

## الأنماط الثابتة في رسومات المكتب

### اللوحة الرئيسية

- مساحة رسم بيضاء واسعة.
- المسارات الأساسية بألوان محددة، غالبًا أحمر/أخضر/ماجنتا/سماوي حسب النوع والسعة.
- مسارات Orthogonal مع نقاط وصل واضحة.
- Termination Boxes كجداول صغيرة حمراء، وليست أيقونات كبيرة.
- النصوص قريبة من المسار ولكن قابلة للابتعاد عنه لتجنب التداخل.

### بيانات Termination Box

يظهر في النماذج:

- ODF Number.
- Core Range.
- Splitter Number.
- Splitter Port.
- Box Number.
- Distance from Sub Cabinet.
- Fiber Cable Capacity.

### Legend

- رموز سعات Termination Boxes المختلفة.
- أنواع Splitters.
- Fiber Cable Capacities.
- Microduct capacities وطرق تمييزها بالألوان.
- Connector / Open Bundle / End Bundle.
- Telecom Manhole / Handhole / TDM / Sub Cabinet.

### الفريم الرأسي

الفريم الموجود في ملفات الإنتاج يضم:

- North arrow وLegend.
- بيانات Sub Cabinet وعدد المباني والمنافذ.
- ODF / LGX / Splitters.
- المحافظة والقرية والمشروع.
- اسم الرسم ورقم الجزء.
- Contract ID.
- Main Contractor وSub Contractor.
- Revision register مع Drawn / Checked / Date / Type.
- شعارات الجهات.

## قرارات النسخة

- اعتماد لوحة بيانات رأسية بدل Title Block سفلي عام.
- تحويل شكل العناصر على الرسم إلى Mini Technical Table.
- توفير حقول البيانات الواردة في الرسومات المرجعية داخل نموذج العنصر.
- السماح بتحريك Label منفردًا؛ لأن الرسومات الحقيقية تعتمد على توزيع النصوص يدويًا لتفادي الازدحام.
- جعل SVG/PDF هو المرجع الطباعي، وDXF هو الملف القابل للتحرير.
- بناء Network Builder من جدول البوكسات لأن الملفات المرجعية تحتوي جداول متسلسلة لـODF/Splitter/Core Range/Box/Distance.
