'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '../lib/api';
import { can } from '../lib/workspace';
import { formatDate, normalizeArray, statusTone } from '../lib/format';
import Icon from '../components/Icon';
import { Badge, Button, EmptyState, ErrorState, PageHeader, Panel, Skeleton, Stat } from '../components/Primitives';

const views = ['cockpit','capacity','dependencies','setup'];
const viewLabel = (locale, view) => ({
  ar:{ cockpit:'غرفة التنفيذ', capacity:'الطاقة والأحمال', dependencies:'الاعتماديات والمخاطر', setup:'القوالب والأتمتة' },
  en:{ cockpit:'Execution cockpit', capacity:'Capacity & workload', dependencies:'Dependencies & risk', setup:'Templates & automation' }
})[locale][view];
const dateInput = (value) => {
  const date = value ? new Date(`${value}T00:00:00`) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0,10) : date.toISOString().slice(0,10);
};
const shiftDate = (value, days) => {
  const date = new Date(`${dateInput(value)}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0,10);
};

export default function WorkIntelligencePage({ workspace, locale }) {
  const params = useSearchParams();
  const router = useRouter();
  const current = views.includes(params.get('view')) ? params.get('view') : 'cockpit';
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [reload, setReload] = useState(0);
  const [capacityFrom, setCapacityFrom] = useState(() => dateInput(params.get('from')));
  const canWorkload = can(workspace,'tasks.view_workload') || can(workspace,'tasks.manage');
  const canSetup = can(workspace,'tasks.manage') || can(workspace,'tasks.manage_templates') || can(workspace,'tasks.manage_automations') || can(workspace,'tasks.manage_milestones');

  useEffect(() => {
    const c = new AbortController(); setData(null); setError(null);
    const company = workspace.company.id;
    let request;
    if (current === 'cockpit') request = api.rpc('work_cockpit_snapshot',{p_company_id:company},{cacheTtlMs:10_000,signal:c.signal,dedupe:true});
    else if (current === 'capacity') request = canWorkload ? api.rpc('work_capacity_plan',{p_company_id:company,p_from:capacityFrom,p_days:14},{cacheTtlMs:15_000,signal:c.signal,dedupe:true}) : Promise.resolve({denied:true});
    else if (current === 'dependencies') request = api.rpc('work_dependency_graph',{p_company_id:company,p_project_id:null,p_include_done:false,p_limit:180},{cacheTtlMs:12_000,signal:c.signal,dedupe:true});
    else request = Promise.all([
      api.select('work_milestones',{filters:{company_id:`eq.${company}`},order:'due_at.asc',cacheTtlMs:15_000,signal:c.signal}).catch(()=>[]),
      api.select('task_templates',{filters:{company_id:`eq.${company}`},order:'created_at.desc',cacheTtlMs:15_000,signal:c.signal}).catch(()=>[]),
      api.select('work_workflow_templates',{filters:{company_id:`eq.${company}`},order:'created_at.desc',cacheTtlMs:15_000,signal:c.signal}).catch(()=>[]),
      api.select('work_automation_rules',{filters:{company_id:`eq.${company}`},order:'created_at.desc',cacheTtlMs:15_000,signal:c.signal}).catch(()=>[]),
      api.rpc('work_leave_requests',{p_company_id:company,p_limit:100,p_offset:0},{cacheTtlMs:15_000,signal:c.signal,dedupe:true}).catch(()=>({items:[]}))
    ]).then(([milestones,templates,workflows,automations,leave])=>({milestones,templates,workflows,automations,leave:leave?.items||[]}));
    request.then(setData).catch(err=>{if(err?.name!=='AbortError')setError(err)});
    return ()=>c.abort();
  },[workspace.company.id,current,reload,canWorkload,capacityFrom]);

  const go = (view) => router.push(`/v7/work-intelligence?view=${view}${view==='capacity'?`&from=${capacityFrom}`:''}`);
  const moveCapacity = (days) => {
    const next = shiftDate(capacityFrom, days);
    setCapacityFrom(next);
    router.replace(`/v7/work-intelligence?view=capacity&from=${next}`);
  };
  if (error) return <ErrorState title={locale==='ar'?'تعذر تحميل إدارة العمل':'Work intelligence could not be loaded'} description={error.message} retryLabel={locale==='ar'?'إعادة المحاولة':'Retry'} onRetry={()=>setReload(x=>x+1)} />;
  return <>
    <PageHeader eyebrow="WORK OS" title={locale==='ar'?'إدارة العمل المتقدمة':'Advanced work operations'} description={locale==='ar'?'غرفة التنفيذ، الطاقة، الاعتماديات، المعالم، القوالب، الأتمتة والإجازات — نفس طبقة Work OS القديمة داخل تجربة V7.' : 'Execution cockpit, capacity, dependencies, milestones, templates, automation and leave — the original Work OS depth inside V7.'} actions={<Button icon="check" onClick={()=>router.push('/v7/work')}>{locale==='ar'?'قائمة العمل':'Work queue'}</Button>}>
      <div className="v7-work-intel-tabs">{views.map(view=><button key={view} className={current===view?'is-active':''} onClick={()=>go(view)}>{viewLabel(locale,view)}</button>)}</div>
    </PageHeader>
    {!data ? <Skeleton lines={12} /> : current==='cockpit' ? <Cockpit data={data} locale={locale} router={router} /> : current==='capacity' ? <Capacity data={data} locale={locale} from={capacityFrom} onMove={moveCapacity} onToday={()=>{const next=dateInput('');setCapacityFrom(next);router.replace(`/v7/work-intelligence?view=capacity&from=${next}`)}} /> : current==='dependencies' ? <Dependencies data={data} locale={locale} router={router} /> : <Setup data={data} locale={locale} canSetup={canSetup} />}
  </>;
}

function Cockpit({data,locale,router}){
  const personal=data.personal||{},manager=data.manager||{};
  return <><section className="v7-work-intel-stats"><Stat icon="check" label={locale==='ar'?'مفتوح لدي':'My open work'} value={personal.open??0}/><Stat icon="clock" label={locale==='ar'?'مستحق اليوم':'Due today'} value={personal.due_today??0}/><Stat icon="alert" label={locale==='ar'?'متأخر':'Overdue'} value={personal.overdue??0}/><Stat icon="shield" label={locale==='ar'?'مراجعات واعتمادات':'Reviews & approvals'} value={Number(personal.reviews||0)+Number(personal.approvals||0)}/></section><div className="v7-two-column"><Panel title={locale==='ar'?'تركيزي الآن':'My focus now'}>{normalizeArray(data.focus).length?<div className="v7-intel-list">{normalizeArray(data.focus).map(x=><button key={x.id} onClick={()=>router.push(`/v7/work?task=${x.id}`)}><span className={`v7-priority-dot is-${x.priority||'medium'}`}/><div><strong>#{x.task_number} · {x.title}</strong><small>{x.project_name||x.owner_name||'—'} · {formatDate(x.due_at,locale)}</small></div><Badge tone={statusTone(x.status)}>{x.status}</Badge><Icon name="chevron" size={14}/></button>)}</div>:<EmptyState icon="check" title={locale==='ar'?'لا توجد عناصر حرجة الآن':'No critical focus items'}/>}</Panel><Panel title={locale==='ar'?'انتباه المدير':'Manager attention'}>{manager.enabled?normalizeArray(manager.attention).length?<div className="v7-intel-list">{normalizeArray(manager.attention).map(x=><button key={x.id} onClick={()=>router.push(`/v7/work?task=${x.id}`)}><Icon name="alert" size={15}/><div><strong>{x.title}</strong><small>{x.owner_name||'—'} · {x.risk?.level||'low'} {locale==='ar'?'مخاطر':'risk'}</small></div><strong>{x.risk?.score??0}</strong></button>)}</div>:<EmptyState icon="check" title={locale==='ar'?'لا توجد عناصر عالية المخاطر':'No high-risk items'}/>:<EmptyState icon="shield" title={locale==='ar'?'صلاحية الأحمال غير متاحة لهذا الدور':'Workload permission is not available for this role'}/>}</Panel></div>{manager.enabled&&normalizeArray(manager.overloaded).length?<Panel title={locale==='ar'?'أعضاء فوق حد القدرة':'Overloaded members'}><div className="v7-overload-grid">{normalizeArray(manager.overloaded).map(x=><article key={x.user_id}><div><strong>{x.name}</strong><small>{x.planned_minutes} min / {x.capacity_hours}h</small></div><b>{x.utilization}%</b></article>)}</div></Panel>:null}</>;
}
function Capacity({data,locale,from,onMove,onToday}){
  if(data.denied)return <EmptyState icon="shield" title={locale==='ar'?'تحتاج صلاحية عرض أحمال الفريق':'Workload permission required'}/>;
  const members=normalizeArray(data.members),cells=normalizeArray(data.cells);
  const summaries=members.map(m=>{const rows=cells.filter(c=>c.user_id===m.user_id);const cap=rows.reduce((s,c)=>s+Number(c.capacity_minutes||0),0),planned=rows.reduce((s,c)=>s+Number(c.planned_minutes||0),0),u=cap?Math.round(planned/cap*100):0;return {m,cap,planned,u};});
  const overloaded=summaries.filter(x=>x.u>100).length,available=summaries.filter(x=>x.cap>0&&x.u<70).length;
  return <><section className="v7-work-intel-stats"><Stat icon="users" label={locale==='ar'?'أعضاء بالخطة':'Members planned'} value={members.length}/><Stat icon="alert" label={locale==='ar'?'فوق القدرة':'Over capacity'} value={overloaded}/><Stat icon="check" label={locale==='ar'?'سعة متاحة':'Capacity available'} value={available}/><Stat icon="calendar" label={locale==='ar'?'بداية النافذة':'Window starts'} value={formatDate(`${from}T00:00:00`,locale)}/></section><Panel title={locale==='ar'?'خطة القدرة · 14 يوم':'Capacity plan · 14 days'} action={<div className="v7-panel-actions"><Button onClick={()=>onMove(-14)} icon="arrow">{locale==='ar'?'14 يوم سابق':'Previous 14d'}</Button><Button onClick={onToday} icon="calendar">{locale==='ar'?'اليوم':'Today'}</Button><Button onClick={()=>onMove(14)} icon="chevron">{locale==='ar'?'14 يوم تالي':'Next 14d'}</Button></div>}><div className="v7-capacity-table"><header><span>{locale==='ar'?'العضو':'Member'}</span><span>{locale==='ar'?'السعة':'Capacity'}</span><span>{locale==='ar'?'المخطط':'Planned'}</span><span>{locale==='ar'?'الاستخدام':'Utilization'}</span></header>{summaries.map(({m,cap,planned,u})=><article key={m.user_id}><div><strong>{m.name}</strong><small>{m.job_title||m.department||'—'}</small></div><span>{Math.round(cap/60)}h</span><span>{Math.round(planned/60)}h</span><span className={u>100?'is-danger':u>85?'is-warning':''}><b>{u}%</b><i><em style={{width:`${Math.min(100,u)}%`}}/></i></span></article>)}</div></Panel></>;
}
function Dependencies({data,locale,router}){const nodes=normalizeArray(data.nodes),edges=normalizeArray(data.edges);return <><section className="v7-work-intel-stats"><Stat icon="layers" label={locale==='ar'?'عناصر في الرسم':'Graph nodes'} value={nodes.length}/><Stat icon="link" label={locale==='ar'?'اعتماديات':'Dependencies'} value={edges.length}/><Stat icon="alert" label={locale==='ar'?'عالية المخاطر':'High risk'} value={nodes.filter(x=>['high','critical'].includes(x.risk?.level)).length}/><Stat icon="trend" label={locale==='ar'?'تأثير مرتفع':'High impact'} value={nodes.filter(x=>Number(x.impact_score||0)>=60).length}/></section><Panel title={locale==='ar'?'خريطة الاعتماديات والمخاطر':'Dependency & risk map'}>{nodes.length?<div className="v7-dependency-list">{nodes.sort((a,b)=>Number(b.impact_score||0)-Number(a.impact_score||0)).map(x=><button key={x.id} onClick={()=>router.push(`/v7/work?task=${x.id}`)}><div><strong>#{x.task_number} · {x.title}</strong><small>{locale==='ar'?'معطِّلات':'Blockers'}: {x.blocker_count||0} · {locale==='ar'?'لاحق':'Downstream'}: {x.downstream_count||0}</small></div><span><Badge tone={x.risk?.level==='critical'||x.risk?.level==='high'?'danger':x.risk?.level==='medium'?'warning':'neutral'}>{x.risk?.level||'low'}</Badge><strong>{x.impact_score??0}</strong></span></button>)}</div>:<EmptyState icon="link" title={locale==='ar'?'لا توجد اعتماديات نشطة':'No active dependencies'}/>}</Panel></>}
function Setup({data,locale,canSetup}){const groups=[['milestones','trend',locale==='ar'?'معالم التسليم':'Milestones'],['templates','check',locale==='ar'?'قوالب المهام':'Task templates'],['workflows','layers',locale==='ar'?'قوالب سير العمل':'Workflow templates'],['automations','settings',locale==='ar'?'الأتمتة':'Automation rules'],['leave','clock',locale==='ar'?'الإجازات':'Leave requests']];return <><section className="v7-work-intel-stats">{groups.slice(0,4).map(([key,icon,label])=><Stat key={key} icon={icon} label={label} value={normalizeArray(data[key]).length}/>)}</section><div className="v7-setup-grid">{groups.map(([key,icon,label])=><Panel key={key} title={label} description={canSetup&&key!=='leave'?(locale==='ar'?'قابل للإدارة حسب صلاحيتك':'Manageable according to your permission'):''}>{normalizeArray(data[key]).length?<div className="v7-setup-list">{normalizeArray(data[key]).slice(0,12).map((x,i)=><article key={x.id||i}><Icon name={icon} size={15}/><div><strong>{x.title||x.name||x.full_name||x.leave_type||'—'}</strong><small>{x.status||x.trigger_type||x.task_type||formatDate(x.due_at||x.start_at,locale)||'—'}</small></div>{x.is_active!=null?<Badge tone={x.is_active?'success':'neutral'}>{x.is_active?(locale==='ar'?'فعال':'Active'):(locale==='ar'?'متوقف':'Inactive')}</Badge>:null}</article>)}</div>:<EmptyState icon={icon} title={locale==='ar'?'لا توجد بيانات بعد':'No data yet'}/>}</Panel>)}</div></>}
