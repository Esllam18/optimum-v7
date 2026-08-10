begin;

-- CAD Ultimate 4.3: richer node/route catalog, stable route colors and editable drawing identity.
with updates(code,color,aci,layer_name,lineweight,palette_family) as (
  values
  ('DUCT-1W-7/3.5','#E11D48',1,'MD_01W_7_3_5',35,'microduct'),
  ('DUCT-2W-7/3.5','#2563EB',5,'MD_02W_7_3_5',35,'microduct'),
  ('DUCT-4W-7/3.5','#16A34A',3,'MD_04W_7_3_5',40,'microduct'),
  ('DUCT-7W-7/3.5','#7C3AED',6,'MD_07W_7_3_5',40,'microduct'),
  ('DUCT-12W-7/3.5','#EA580C',30,'MD_12W_7_3_5',45,'microduct'),
  ('DUCT-24W-7/3.5','#0F766E',4,'MD_24W_7_3_5',50,'microduct'),
  ('FO-4C','#DB2777',201,'FO_004C',30,'fiber'),('FO-8C','#D97706',40,'FO_008C',30,'fiber'),
  ('FO-12C','#65A30D',92,'FO_012C',30,'fiber'),('FO-24C','#0891B2',4,'FO_024C',35,'fiber'),
  ('FO-36C','#1D4ED8',5,'FO_036C',35,'fiber'),('FO-48C','#7C3AED',6,'FO_048C',40,'fiber'),
  ('FO-72C','#BE123C',1,'FO_072C',40,'fiber'),('FO-96C','#047857',3,'FO_096C',45,'fiber'),
  ('FO-144C','#334155',8,'FO_144C',50,'fiber'),('FO-288C','#111827',7,'FO_288C',55,'fiber')
)
update public.engineering_catalog_items c
set default_properties=coalesce(c.default_properties,'{}'::jsonb)||jsonb_build_object(
 'color',u.color,'dxf_aci',u.aci,'dxf_layer',u.layer_name,'lineweight',u.lineweight,'palette_family',u.palette_family)
from updates u where c.company_id is null and c.code=u.code;

insert into public.engineering_catalog_items(company_id,code,category,symbol_key,name_ar,name_en,unit,default_properties,sort_order,is_active) values
(null,'CAB-MAIN-42U','node','main_cabinet','كابينة رئيسية 42U','42U Main Cabinet','ea','{"capacityU":42,"palette_family":"cabinet","network_level":"main","color":"#0F766E"}',90,true),
(null,'CAB-MAIN-47U','node','main_cabinet','كابينة رئيسية 47U','47U Main Cabinet','ea','{"capacityU":47,"palette_family":"cabinet","network_level":"main","color":"#0F766E"}',91,true),
(null,'FDT-24','node','fdt','نقطة توزيع FDT سعة 24','FDT 24','ea','{"ports":24,"palette_family":"distribution","network_level":"distribution","color":"#7C3AED"}',100,true),
(null,'FDT-48','node','fdt','نقطة توزيع FDT سعة 48','FDT 48','ea','{"ports":48,"palette_family":"distribution","network_level":"distribution","color":"#7C3AED"}',101,true),
(null,'FDT-96','node','fdt','نقطة توزيع FDT سعة 96','FDT 96','ea','{"ports":96,"palette_family":"distribution","network_level":"distribution","color":"#7C3AED"}',102,true),
(null,'FAT-8','node','fat','بوكس توزيع FAT سعة 8','FAT 8','ea','{"ports":8,"palette_family":"distribution","network_level":"terminal","color":"#DB2777"}',103,true),
(null,'FAT-16','node','fat','بوكس توزيع FAT سعة 16','FAT 16','ea','{"ports":16,"palette_family":"distribution","network_level":"terminal","color":"#DB2777"}',104,true),
(null,'ODB-4','node','odb','بوكس ODB سعة 4','ODB 4','ea','{"ports":4,"palette_family":"termination","network_level":"terminal","color":"#DC2626"}',106,true),
(null,'ODB-8','node','odb','بوكس ODB سعة 8','ODB 8','ea','{"ports":8,"palette_family":"termination","network_level":"terminal","color":"#DC2626"}',107,true),
(null,'HH-60X60','node','handhole','هاند هول 60×60','Handhole 60x60','ea','{"lengthM":0.6,"widthM":0.6,"palette_family":"civil","color":"#92400E"}',121,true),
(null,'CHAMBER-120X120','node','chamber','غرفة تفتيش 120×120','Inspection Chamber 120x120','ea','{"lengthM":1.2,"widthM":1.2,"palette_family":"civil","color":"#78350F"}',123,true),
(null,'POLE-9M','node','pole','عمود 9 متر','9 m Pole','ea','{"heightM":9,"palette_family":"aerial","color":"#475569"}',124,true),
(null,'JOINT-48C','node','joint','وصلة فايبر 48 كور','48-core Fiber Closure','ea','{"cores":48,"palette_family":"closure","color":"#EA580C"}',131,true),
(null,'JOINT-96C','node','joint','وصلة فايبر 96 كور','96-core Fiber Closure','ea','{"cores":96,"palette_family":"closure","color":"#EA580C"}',132,true),
(null,'DUCT-1W-12/8','route','microduct','ميكرو دكت 1 مسار 12/8','1-way Microduct 12/8','m','{"ways":1,"diameter":"12/8","color":"#F43F5E","dxf_aci":1,"dxf_layer":"MD_01W_12_8","lineweight":35,"palette_family":"microduct"}',220,true),
(null,'DUCT-4W-12/8','route','microduct','ميكرو دكت 4 مسار 12/8','4-way Microduct 12/8','m','{"ways":4,"diameter":"12/8","color":"#10B981","dxf_aci":3,"dxf_layer":"MD_04W_12_8","lineweight":40,"palette_family":"microduct"}',221,true),
(null,'HDPE-40','route','hdpe_duct','ماسورة HDPE قطر 40 مم','HDPE Duct 40 mm','m','{"diameter":"40 mm","color":"#A16207","dxf_aci":32,"dxf_layer":"HDPE_040","lineweight":45,"palette_family":"civil_duct"}',230,true),
(null,'PVC-32','route','conduit','ماسورة PVC قطر 32 مم','PVC Conduit 32 mm','m','{"diameter":"32 mm","color":"#64748B","dxf_aci":8,"dxf_layer":"PVC_032","lineweight":35,"palette_family":"conduit"}',233,true),
(null,'TRENCH-ROAD','route','trench','حفر وعبور طريق','Road crossing trench','m','{"color":"#DC2626","dxf_aci":1,"dxf_layer":"TRENCH_ROAD","lineweight":30,"linetype":"DASHED","palette_family":"trench"}',237,true),
(null,'FO-DROP-2C','route','fiber_cable','كابل دروب 2 كور','2-core Drop Fiber','m','{"cores":2,"construction":"drop","color":"#F59E0B","dxf_aci":2,"dxf_layer":"FO_DROP_002C","lineweight":25,"palette_family":"fiber"}',250,true),
(null,'FO-ADSS-24C','route','fiber_cable','كابل ADSS 24 كور','24-core ADSS Fiber','m','{"cores":24,"construction":"adss","color":"#0EA5E9","dxf_aci":4,"dxf_layer":"FO_ADSS_024C","lineweight":40,"palette_family":"fiber"}',252,true),
(null,'FO-ARM-48C','route','fiber_cable','كابل مدرع 48 كور','48-core Armored Fiber','m','{"cores":48,"construction":"armored","color":"#4338CA","dxf_aci":5,"dxf_layer":"FO_ARM_048C","lineweight":45,"palette_family":"fiber"}',256,true)
on conflict do nothing;


-- Remaining standard variants included in the production catalog manifest.
insert into public.engineering_catalog_items(company_id,code,category,symbol_key,name_ar,name_en,unit,default_properties,sort_order,is_active) values
(null,'SUBCAB-12U','node','sub_cabinet','كابينة فرعية 12U','12U Sub Cabinet','ea','{"capacityU":12,"palette_family":"cabinet","network_level":"secondary","color":"#2563EB"}',92,true),
(null,'SUBCAB-27U','node','sub_cabinet','كابينة فرعية 27U','27U Sub Cabinet','ea','{"capacityU":27,"palette_family":"cabinet","network_level":"secondary","color":"#2563EB"}',93,true),
(null,'FAT-24','node','fat','بوكس توزيع FAT سعة 24','FAT 24','ea','{"ports":24,"palette_family":"distribution","network_level":"terminal","color":"#DB2777"}',105,true),
(null,'ODB-16','node','odb','بوكس ODB سعة 16','ODB 16','ea','{"ports":16,"palette_family":"termination","network_level":"terminal","color":"#DC2626"}',108,true),
(null,'ODB-24','node','odb','بوكس ODB سعة 24','ODB 24','ea','{"ports":24,"palette_family":"termination","network_level":"terminal","color":"#DC2626"}',109,true),
(null,'HH-30X30','node','handhole','هاند هول 30×30','Handhole 30x30','ea','{"lengthM":0.3,"widthM":0.3,"palette_family":"civil","color":"#92400E"}',120,true),
(null,'CHAMBER-60X60','node','chamber','غرفة تفتيش 60×60','Inspection Chamber 60x60','ea','{"lengthM":0.6,"widthM":0.6,"palette_family":"civil","color":"#78350F"}',122,true),
(null,'POLE-12M','node','pole','عمود 12 متر','12 m Pole','ea','{"heightM":12,"palette_family":"aerial","color":"#475569"}',125,true),
(null,'JOINT-24C','node','joint','وصلة فايبر 24 كور','24-core Fiber Closure','ea','{"cores":24,"palette_family":"closure","color":"#EA580C"}',130,true),
(null,'JOINT-144C','node','joint','وصلة فايبر 144 كور','144-core Fiber Closure','ea','{"cores":144,"palette_family":"closure","color":"#EA580C"}',133,true),
(null,'PATCH-24','accessory','patch_panel','باتش بانل 24 منفذ','24-port Patch Panel','ea','{"ports":24,"palette_family":"rack_accessory","color":"#4F46E5"}',140,true),
(null,'PATCH-48','accessory','patch_panel','باتش بانل 48 منفذ','48-port Patch Panel','ea','{"ports":48,"palette_family":"rack_accessory","color":"#4F46E5"}',141,true),
(null,'SPLICE-TRAY-24','accessory','splice_tray','صينية لحام 24 كور','24-core Splice Tray','ea','{"cores":24,"palette_family":"rack_accessory","color":"#4F46E5"}',142,true),
(null,'DUCT-7W-12/8','route','microduct','ميكرو دكت 7 مسار 12/8','7-way Microduct 12/8','m','{"ways":7,"diameter":"12/8","color":"#8B5CF6","dxf_aci":6,"dxf_layer":"MD_07W_12_8","lineweight":40,"palette_family":"microduct"}',222,true),
(null,'DUCT-12W-12/8','route','microduct','ميكرو دكت 12 مسار 12/8','12-way Microduct 12/8','m','{"ways":12,"diameter":"12/8","color":"#F97316","dxf_aci":30,"dxf_layer":"MD_12W_12_8","lineweight":45,"palette_family":"microduct"}',223,true),
(null,'HDPE-50','route','hdpe_duct','ماسورة HDPE قطر 50 مم','HDPE Duct 50 mm','m','{"diameter":"50 mm","color":"#854D0E","dxf_aci":34,"dxf_layer":"HDPE_050","lineweight":45,"palette_family":"civil_duct"}',231,true),
(null,'HDPE-63','route','hdpe_duct','ماسورة HDPE قطر 63 مم','HDPE Duct 63 mm','m','{"diameter":"63 mm","color":"#713F12","dxf_aci":36,"dxf_layer":"HDPE_063","lineweight":50,"palette_family":"civil_duct"}',232,true),
(null,'PVC-50','route','conduit','ماسورة PVC قطر 50 مم','PVC Conduit 50 mm','m','{"diameter":"50 mm","color":"#475569","dxf_aci":8,"dxf_layer":"PVC_050","lineweight":40,"palette_family":"conduit"}',234,true),
(null,'TRENCH-SOIL','route','trench','حفر مسار تربة','Soil Trench Route','m','{"color":"#92400E","dxf_aci":32,"dxf_layer":"TRENCH_SOIL","lineweight":25,"linetype":"DASHED","palette_family":"trench"}',235,true),
(null,'TRENCH-SIDEWALK','route','trench','حفر مسار رصيف','Sidewalk Trench Route','m','{"color":"#B45309","dxf_aci":30,"dxf_layer":"TRENCH_SIDEWALK","lineweight":25,"linetype":"DASHED","palette_family":"trench"}',236,true),
(null,'FO-INDOOR-4C','route','fiber_cable','كابل داخلي 4 كور','4-core Indoor Fiber','m','{"cores":4,"construction":"indoor","color":"#EC4899","dxf_aci":201,"dxf_layer":"FO_INDOOR_004C","lineweight":25,"palette_family":"fiber"}',251,true),
(null,'FO-ADSS-48C','route','fiber_cable','كابل ADSS 48 كور','48-core ADSS Fiber','m','{"cores":48,"construction":"adss","color":"#4F46E5","dxf_aci":5,"dxf_layer":"FO_ADSS_048C","lineweight":45,"palette_family":"fiber"}',253,true),
(null,'FO-ADSS-96C','route','fiber_cable','كابل ADSS 96 كور','96-core ADSS Fiber','m','{"cores":96,"construction":"adss","color":"#7C3AED","dxf_aci":6,"dxf_layer":"FO_ADSS_096C","lineweight":50,"palette_family":"fiber"}',254,true),
(null,'FO-ARM-24C','route','fiber_cable','كابل مدرع 24 كور','24-core Armored Fiber','m','{"cores":24,"construction":"armored","color":"#0284C7","dxf_aci":4,"dxf_layer":"FO_ARM_024C","lineweight":40,"palette_family":"fiber"}',255,true),
(null,'FO-ARM-96C','route','fiber_cable','كابل مدرع 96 كور','96-core Armored Fiber','m','{"cores":96,"construction":"armored","color":"#6D28D9","dxf_aci":6,"dxf_layer":"FO_ARM_096C","lineweight":50,"palette_family":"fiber"}',257,true),
(null,'CIVIL-UG-ROUTE','labor','labor','أعمال تنفيذ مسار أرضي','Underground route installation works','m','{"palette_family":"labor"}',400,true),
(null,'INSTALL-AERIAL','labor','labor','أعمال تنفيذ مسار هوائي','Aerial route installation works','m','{"palette_family":"labor"}',401,true),
(null,'INSTALL-INDOOR','labor','labor','أعمال تنفيذ مسار داخلي','Indoor route installation works','m','{"palette_family":"labor"}',402,true)
on conflict do nothing;

create or replace function public.update_engineering_drawing_identity(p_drawing_id uuid,p_drawing_no text,p_title text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.engineering_drawings%rowtype;
begin
 select * into d from public.engineering_drawings where id=p_drawing_id and archived_at is null for update;
 if not found then raise exception 'Drawing not found'; end if;
 if auth.uid() is null or not app_private.has_company_permission(d.company_id,'drawings.edit') then raise exception 'Permission denied'; end if;
 if char_length(trim(coalesce(p_drawing_no,'')))<2 or char_length(trim(coalesce(p_title,'')))<2 then raise exception 'Drawing number and title are required'; end if;
 update public.engineering_drawings set drawing_no=trim(p_drawing_no),title=trim(p_title),updated_by=auth.uid() where id=p_drawing_id;
 insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata)
 values(d.company_id,auth.uid(),'engineering.identity.updated','engineering_drawing',d.id,jsonb_build_object('drawing_no',trim(p_drawing_no),'title',trim(p_title)));
end;$$;
revoke all on function public.update_engineering_drawing_identity(uuid,text,text) from public,anon;
grant execute on function public.update_engineering_drawing_identity(uuid,text,text) to authenticated;
commit;
