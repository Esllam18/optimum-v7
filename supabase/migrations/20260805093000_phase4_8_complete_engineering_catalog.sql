insert into public.engineering_catalog_items
(company_id, code, category, symbol_key, name_ar, name_en, unit, default_properties, sort_order, is_active)
values
(null,'BRANCH-POINT','node','branch_point','نقطة تفرع','Branch Point','ea','{"palette_family":"distribution","network_level":"distribution"}'::jsonb,260,true),
(null,'WALL-OUTLET','node','wall_outlet','مخرج حائطي','Wall Outlet','ea','{"palette_family":"termination","cores":2,"ports":1,"network_level":"terminal"}'::jsonb,261,true),
(null,'SPLITTER-BOX','node','splitter_box','بوكس سبلتر','Splitter Box','ea','{"palette_family":"termination","network_level":"distribution"}'::jsonb,262,true),
(null,'TDM-SUBCAB','node','tdm_sub_cabinet','كابينة فرعية TDM','TDM Sub Cabinet','ea','{"palette_family":"cabinet","u_size":22,"network_level":"secondary"}'::jsonb,263,true),
(null,'FO-2C','route','fiber_cable','كابل فايبر 2 كور','2-core Fiber Cable','m','{"palette_family":"fiber","cores":2,"aci":1,"true_color":"#E11D48"}'::jsonb,420,true),
(null,'FO-60C','route','fiber_cable','كابل فايبر 60 كور','60-core Fiber Cable','m','{"palette_family":"fiber","cores":60,"aci":5,"true_color":"#2563EB"}'::jsonb,421,true),
(null,'DUCT-2W-12/8','route','microduct','ميكرو دكت 2 مسار 12/8','2-way Microduct 12/8','m','{"palette_family":"microduct","ways":2,"diameter":"12/8","aci":30,"true_color":"#F97316"}'::jsonb,422,true),
(null,'DUCT-24W-12/8','route','microduct','ميكرو دكت 24 مسار 12/8','24-way Microduct 12/8','m','{"palette_family":"microduct","ways":24,"diameter":"12/8","aci":3,"true_color":"#10B981"}'::jsonb,423,true),
(null,'EOLE-1X4','route','suspension_wire','كابل EOLE ‏1×4','EOLE Cable 1x4','m','{"palette_family":"support","construction":"aerial","true_color":"#7C3AED"}'::jsonb,424,true),
(null,'WIRE-2X1','route','suspension_wire','واير 2×1','Support Wire 2x1','m','{"palette_family":"support","construction":"aerial","true_color":"#64748B"}'::jsonb,425,true),
(null,'PRELOADED-24C','route','fiber_cable','كابل محمل مسبقًا 24 كور','Preloaded 24-core Cable','m','{"palette_family":"fiber","cores":24,"construction":"aerial","true_color":"#DB2777"}'::jsonb,426,true)
on conflict do nothing;
