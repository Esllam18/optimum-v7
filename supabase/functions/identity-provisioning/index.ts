import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

type AnyMap = Record<string, any>;
const URL = Deno.env.get("SUPABASE_URL")!;
function envKey(kind: "anon" | "service") {
  const legacy = Deno.env.get(kind === "anon" ? "SUPABASE_ANON_KEY" : "SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const bundle = Deno.env.get(kind === "anon" ? "SUPABASE_PUBLISHABLE_KEYS" : "SUPABASE_SECRET_KEYS");
  if (bundle) {
    try { const parsed = JSON.parse(bundle); return parsed.default || Object.values(parsed).find(Boolean); } catch { /* noop */ }
  }
  throw new Error(kind === "anon" ? "Publishable key is not configured" : "Service role key is not configured");
}
const ANON = envKey("anon");
const SERVICE = envKey("service");
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const configuredOrigins=(Deno.env.get("OPTIMUM_ALLOWED_ORIGINS")||"").split(",").map(x=>x.trim()).filter(Boolean);
const localOrigin=/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
function corsFor(req:Request){
  const origin=req.headers.get("Origin");
  if(origin && !configuredOrigins.includes(origin) && !localOrigin.test(origin)) throw new HttpError(403,"Origin is not allowed");
  return {
    ...(origin?{"Access-Control-Allow-Origin":origin,"Vary":"Origin"}:{}),
    "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods":"POST, OPTIONS"
  };
}
const reply = (body: unknown, status = 200, cors:Record<string,string>={}) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
const clean = (v: unknown, n = 500) => { const x = String(v ?? "").trim(); return x ? x.slice(0, n) : null; };
const mail = (v: unknown) => { const x = String(v ?? "").trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)) throw new HttpError(400, "Invalid email address"); return x; };
const date = (v: unknown) => v ? new Date(String(v)).toISOString() : null;
const boundedHours = (v: unknown) => Math.max(1, Math.min(168, Number(v || 48)));
function randomPassword() {
  // Temporary credentials use an unambiguous ASCII format that stays readable in RTL interfaces.
  const upper="ABCDEFGHJKLMNPQRSTUVWXYZ", lower="abcdefghijkmnopqrstuvwxyz", digits="23456789", alpha=upper+lower+digits;
  const bytes=crypto.getRandomValues(new Uint32Array(32));
  const pick=(set:string,index:number)=>set[bytes[index]%set.length];
  const left=[pick(lower,0),pick(digits,1),...Array.from({length:6},(_,i)=>pick(alpha,i+2))].join("");
  const right=[pick(upper,8),pick(lower,9),pick(digits,10),...Array.from({length:5},(_,i)=>pick(alpha,i+11))].join("");
  return `O${left}@${right}`;
}
async function verifyTemporaryPassword(email:string,password:string) {
  const probe=createClient(URL,ANON,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await probe.auth.signInWithPassword({email,password});
  if(error||!data.session)return false;
  await probe.auth.signOut({ scope: "local" }).catch(()=>{});
  return true;
}
function strongPassword(v: string) { return v.length >= 10 && /[a-z]/.test(v) && /[A-Z]/.test(v) && /\d/.test(v) && /[^A-Za-z0-9]/.test(v); }
async function caller(req: Request) { const auth=req.headers.get("Authorization")||""; if(!auth.startsWith("Bearer "))throw new HttpError(401,"Authentication required"); const token=auth.slice(7); const {data,error}=await admin.auth.getUser(token); if(error||!data.user)throw new HttpError(401,"Invalid or expired session"); const client=createClient(URL,ANON,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:auth}}}); return {user:data.user,client}; }
async function platform(userId: string) { const {data,error}=await admin.from("platform_admins").select("user_id").eq("user_id",userId).eq("is_active",true).maybeSingle(); if(error)throw error; return Boolean(data); }
async function requirePlatform(userId: string) { if(!(await platform(userId)))throw new HttpError(403,"Platform administrator permission required"); }
async function findUser(email: string) {
  const {data:lookup,error:lookupError}=await admin.rpc("service_find_auth_user_by_email",{p_email:email});
  if(lookupError)throw lookupError;
  if(!lookup?.id)return null;
  const {data,error}=await admin.auth.admin.getUserById(String(lookup.id));
  if(error)throw error;
  return data.user||null;
}
async function authAccount(input:{email:string;name:string;hours:number;source:string}) {
  const existing=await findUser(input.email);
  if(existing)return {user:existing,created:false,password:null,expires:null,verified:true};
  let password=randomPassword();
  const expires=new Date(Date.now()+input.hours*3600_000).toISOString();
  const {data,error}=await admin.auth.admin.createUser({email:input.email,password,email_confirm:true,user_metadata:{full_name:input.name,provisioned_source:input.source}});
  if(error||!data.user)throw error||new Error("Could not create user");
  let verified=await verifyTemporaryPassword(input.email,password);
  if(!verified){
    password=randomPassword();
    const {error:resetError}=await admin.auth.admin.updateUserById(data.user.id,{password});
    if(resetError)throw resetError;
    verified=await verifyTemporaryPassword(input.email,password);
  }
  if(!verified)throw new HttpError(500,"Temporary credential verification failed");
  return {user:data.user,created:true,password,expires,verified:true};
}
async function acceptInvitation(token:string,user:User,actorId:string,source:string,member:AnyMap,state:{created:boolean;expires:string|null}) { const {data,error}=await admin.rpc("service_accept_invitation_for_user",{p_token:token,p_user_id:user.id,p_full_name:member.full_name,p_phone:clean(member.phone,50),p_whatsapp:clean(member.whatsapp,50),p_timezone:clean(member.timezone,80)||"Africa/Cairo",p_employee_code:clean(member.employee_code,80),p_job_title:clean(member.job_title,160),p_department:clean(member.department,160),p_manager_user_id:member.manager_user_id||null,p_access_starts_at:date(member.access_starts_at),p_access_ends_at:date(member.access_ends_at),p_notes:clean(member.notes,2000),p_provisioned_by:actorId,p_must_change_password:state.created,p_password_expires_at:state.created?state.expires:null,p_source:source}); if(error)throw error; return data; }
async function sendCredentials(input:{email:string;name:string;company:string;password:string|null}) { const key=Deno.env.get("RESEND_API_KEY"),from=Deno.env.get("OPTIMUM_MAIL_FROM")||Deno.env.get("OPTIMUM_FROM_EMAIL"),login=Deno.env.get("OPTIMUM_APP_URL")||Deno.env.get("OPTIMUM_CLIENT_LOGIN_URL")||"http://localhost:4173"; if(!key||!from)return {status:"not_configured"}; const html=`<div style="font-family:Arial;max-width:620px;margin:auto"><h1>Optimum</h1><p>مرحبًا ${input.name}</p><p>تم تجهيز حسابك في ${input.company}.</p><p><b>البريد:</b> ${input.email}</p>${input.password?`<p><b>كلمة المرور المؤقتة:</b> <code>${input.password}</code></p><p>يجب تغييرها فور أول دخول.</p>`:"<p>استخدم كلمة مرور حسابك الحالية.</p>"}<p><a href="${login}">فتح Optimum</a></p></div>`; const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({from,to:[input.email],subject:`بيانات الدخول إلى ${input.company}`,html})}); return response.ok?{status:"sent"}:{status:"failed",detail:(await response.text()).slice(0,600)}; }
function aliases(value:string){return ({create_company:"company",provision_company:"company",create_member:"member",provision_member:"member",complete_first_login:"first_login",reset_temporary_password:"reset",update_company:"update_company"} as Record<string,string>)[value]||value;}


function errorText(error:any,fallback:string){
  if(error instanceof Error&&error.message)return error.message;
  if(error&&typeof error==='object'){const message=error.message||error.error_description||error.details||error.hint||error.code;if(message)return String(message);}
  const text=String(error??'').trim();return text&&text!=='[object Object]'?text:fallback;
}
function normalizeAuthUpdateError(text:string,fallback:string){
  let payload:any=null;try{payload=JSON.parse(text);}catch{}
  const code=String(payload?.error_code||payload?.code||'');
  const message=String(payload?.msg||payload?.message||payload?.error_description||payload?.error||text||fallback);
  if(code==='same_password'||/New password should be different|same_password/i.test(message))return {code:'same_password',message:'New password must be different from the temporary or current password'};
  return {code:code||null,message:message||fallback};
}
Deno.serve(async(req:Request)=>{
  let cors:Record<string,string>={};
  try{
    cors=corsFor(req);
    if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
    if(req.method!=="POST")return reply({ok:false,error:"Method not allowed"},405,cors);
    const {user,client}=await caller(req); const body=await req.json() as AnyMap; const requested=String(body.action||""); const action=aliases(requested);
    if(action==="first_login"){
      const password=String(body.password||""); if(!strongPassword(password))throw new HttpError(400,"Password does not meet the security requirements");
      const {data:security,error:securityError}=await admin.from("account_security").select("must_change_password,temporary_password_expires_at,provisioning_source").eq("user_id",user.id).maybeSingle(); if(securityError)throw securityError; if(security?.must_change_password&&security.temporary_password_expires_at&&new Date(security.temporary_password_expires_at)<new Date())throw new HttpError(410,"Temporary password expired");
      const authHeader=req.headers.get("Authorization")||"";
      const passwordResponse=await fetch(`${URL}/auth/v1/user`,{method:"PUT",headers:{apikey:ANON,Authorization:authHeader,"Content-Type":"application/json"},body:JSON.stringify({password})});
      if(!passwordResponse.ok){const raw=await passwordResponse.text();const parsed=normalizeAuthUpdateError(raw,"Could not update password");throw new HttpError(passwordResponse.status,parsed.message);}
      const {data,error}=await admin.rpc("service_complete_first_login_for_user",{p_user_id:user.id,p_full_name:clean(body.full_name,160)||user.email?.split("@")[0],p_phone:clean(body.phone,50),p_whatsapp:clean(body.whatsapp,50),p_timezone:clean(body.timezone,80)||"Africa/Cairo",p_accept_terms:Boolean(body.accept_terms),p_source:security?.provisioning_source||"company"}); if(error)throw error; return reply({ok:true,...data},200,cors);
    }
    if(action==="company"){
      await requirePlatform(user.id); const company=body.company||{},owner=body.owner||{},sub=body.subscription||{}; const name=clean(company.name,120),slug=String(company.slug||"").trim().toLowerCase(),ownerEmail=mail(owner.email),ownerName=clean(owner.full_name,160)||ownerEmail; if(!name||!slug)throw new HttpError(400,"Company name and slug are required");
      let companyId:string|null=null,createdUser:string|null=null; try{
        const {data:created,error}=await client.rpc("platform_create_company",{p_name:name,p_slug:slug,p_owner_email:ownerEmail,p_plan_code:sub.plan_code||"starter",p_status:sub.status||"trial",p_trial_days:Math.max(0,Math.min(365,Number(sub.trial_days??14)))}); if(error)throw error; companyId=created.company_id;
        const account=await authAccount({email:ownerEmail,name:ownerName,hours:boundedHours(body.password_expiry_hours??owner.password_hours),source:"platform"}); if(account.created)createdUser=account.user.id;
        const accepted=await acceptInvitation(created.invitation_token,account.user,user.id,"platform",{...owner,full_name:ownerName,job_title:owner.job_title||"Company Owner",department:owner.department||"Management",timezone:owner.timezone||company.timezone},account);
        const companyPatch={legal_name:clean(company.legal_name,180),short_code:clean(company.short_code,40),official_email:company.official_email?mail(company.official_email):null,phone:clean(company.phone,50),whatsapp:clean(company.whatsapp,50),country_code:clean(company.country_code,8),city:clean(company.city,100),address:clean(company.address,500),website:clean(company.website,240),industry:clean(company.industry,160),registration_number:clean(company.registration_number,100),tax_number:clean(company.tax_number,100),primary_contact_name:clean(company.primary_contact_name,160)||ownerName,primary_contact_email:company.primary_contact_email?mail(company.primary_contact_email):ownerEmail,primary_contact_phone:clean(company.primary_contact_phone,50)||clean(owner.phone,50),billing_contact_name:clean(company.billing_contact_name,160),billing_contact_email:company.billing_contact_email?mail(company.billing_contact_email):null,billing_contact_phone:clean(company.billing_contact_phone,50),technical_contact_name:clean(company.technical_contact_name,160),technical_contact_email:company.technical_contact_email?mail(company.technical_contact_email):null,technical_contact_phone:clean(company.technical_contact_phone,50),internal_notes:clean(company.internal_notes,5000),timezone:clean(company.timezone,80)||"Africa/Cairo",default_locale:company.default_locale==="en"?"en":"ar",onboarding_status:"pending_owner",updated_at:new Date().toISOString()};
        const {error:companyError}=await admin.from("companies").update(companyPatch).eq("id",companyId); if(companyError)throw companyError;
        const subPatch={billing_cycle:sub.billing_cycle||"monthly",agreed_price:sub.agreed_price===""||sub.agreed_price==null?null:Number(sub.agreed_price),currency:clean(sub.currency,8)||"EGP",payment_status:sub.payment_status||"pending",last_payment_at:date(sub.last_payment_at),next_payment_at:date(sub.next_payment_at),current_period_ends_at:date(sub.current_period_ends_at),max_members_override:sub.max_members?Number(sub.max_members):null,max_projects_override:sub.max_projects?Number(sub.max_projects):null,max_storage_bytes_override:sub.max_storage_gb?Math.round(Number(sub.max_storage_gb)*1073741824):null,notes:clean(sub.notes,5000),updated_at:new Date().toISOString()};
        const {error:subError}=await admin.from("company_subscriptions").update(subPatch).eq("company_id",companyId); if(subError)throw subError;
        const delivery=await sendCredentials({email:ownerEmail,name:ownerName,company:name,password:account.password}); return reply({ok:true,company_id:companyId,membership_id:accepted.membership_id,user_id:account.user.id,email:ownerEmail,temporary_password:account.password,temporary_password_expires_at:account.expires,existing_account:!account.created,credential_verified:account.verified,email_delivery:delivery.status},200,cors);
      }catch(error){if(companyId)await admin.from("companies").delete().eq("id",companyId);if(createdUser)await admin.auth.admin.deleteUser(createdUser);throw error;}
    }
    if(action==="member"){
      const companyId=String(body.company_id||""),member=body.member||{},roleId=String(body.role_id||member.role_id||""),memberEmail=mail(member.email||body.email),fullName=clean(member.full_name||body.full_name,160); if(!companyId||!roleId||!fullName)throw new HttpError(400,"Company, role, name, and email are required");
      const overrides=body.permission_overrides??member.permission_overrides??{};
      const entries=(Array.isArray(overrides)?overrides.map((x:AnyMap)=>[String(x.permission_key||x.key||""),Boolean(x.allowed)]):Object.entries(overrides).map(([key,value])=>[String(key),Boolean(value)])) as [string,boolean][];
      const normalizedOverrides=Object.fromEntries(entries.filter(([key])=>key));
      const {error:validationError}=await admin.rpc("service_validate_member_provisioning",{
        p_actor_id:user.id,
        p_company_id:companyId,
        p_role_id:roleId,
        p_manager_user_id:member.manager_user_id||null,
        p_access_starts_at:date(member.access_starts_at),
        p_access_ends_at:date(member.access_ends_at),
        p_permission_overrides:normalizedOverrides
      });
      if(validationError)throw validationError;
      const account=await authAccount({email:memberEmail,name:fullName,hours:boundedHours(body.password_expiry_hours??member.password_hours??body.password_hours),source:"company"}); try{
        const {data:token,error}=await client.rpc("create_company_invitation",{p_company_id:companyId,p_email:memberEmail,p_role_id:roleId,p_expires_in_hours:336}); if(error)throw error;
        const accepted=await acceptInvitation(token,account.user,user.id,"company",{...member,full_name:fullName},account);
        for(const [permissionKey,allowed] of entries.filter(([key])=>key)){
          const {error:overrideError}=await client.rpc("set_member_permission_override",{p_membership_id:accepted.membership_id,p_permission_key:permissionKey,p_allowed:allowed});
          if(overrideError)throw overrideError;
        }
        const compensation=body.compensation||member.compensation; if(compensation&&Object.keys(compensation).length){const {error:compError}=await client.rpc("save_member_hr_profile",{p_membership_id:accepted.membership_id,p_profile:{full_name:fullName,phone:member.phone||null,whatsapp:member.whatsapp||null,employee_code:member.employee_code||null,job_title:member.job_title||null,department:member.department||null,manager_user_id:member.manager_user_id||null,access_starts_at:member.access_starts_at||null,access_ends_at:member.access_ends_at||null,notes:member.notes||null},p_compensation:compensation});if(compError)throw compError;}
        const {data:company}=await admin.from("companies").select("name").eq("id",companyId).single(); const delivery=await sendCredentials({email:memberEmail,name:fullName,company:company?.name||"Optimum",password:account.password}); return reply({ok:true,company_id:companyId,membership_id:accepted.membership_id,user_id:account.user.id,email:memberEmail,temporary_password:account.password,temporary_password_expires_at:account.expires,existing_account:!account.created,credential_verified:account.verified,email_delivery:delivery.status},200,cors);
      }catch(error){if(account.created)await admin.auth.admin.deleteUser(account.user.id);throw error;}
    }
    if(action==="reset"){
      const membershipId=String(body.membership_id||""); const {data:allowed,error:allowedError}=await client.rpc("can_manage_company_member",{p_membership_id:membershipId});if(allowedError)throw allowedError;if(!allowed)throw new HttpError(403,"Member management permission required"); const {data:membership,error}=await admin.from("company_memberships").select("user_id,invited_email,company_id").eq("id",membershipId).single();if(error)throw error;const password=randomPassword(),expires=new Date(Date.now()+boundedHours(body.password_hours)*3600_000).toISOString();const {error:updateError}=await admin.auth.admin.updateUserById(membership.user_id,{password});if(updateError)throw updateError;const verified=await verifyTemporaryPassword(membership.invited_email,password);if(!verified)throw new HttpError(500,"Temporary credential verification failed");const {error:securityError}=await admin.from("account_security").upsert({user_id:membership.user_id,must_change_password:true,temporary_password_expires_at:expires,provisioning_source:"recovery",created_by:user.id,updated_at:new Date().toISOString()},{onConflict:"user_id"});if(securityError)throw securityError;const {data:p}=await admin.from("profiles").select("full_name").eq("id",membership.user_id).single();const {data:c}=await admin.from("companies").select("name").eq("id",membership.company_id).single();const delivery=await sendCredentials({email:membership.invited_email,name:p?.full_name||membership.invited_email,company:c?.name||"Optimum",password});return reply({ok:true,membership_id:membershipId,email:membership.invited_email,temporary_password:password,temporary_password_expires_at:expires,existing_account:false,credential_verified:verified,email_delivery:delivery.status},200,cors);
    }
    if(action==="update_company"){
      await requirePlatform(user.id); const id=String(body.company_id||"");if(!id)throw new HttpError(400,"Company id is required");const company=body.company||{},sub=body.subscription||{},patch:AnyMap={updated_at:new Date().toISOString()};for(const key of ["name","legal_name","short_code","official_email","phone","whatsapp","country_code","city","address","website","industry","registration_number","tax_number","primary_contact_name","primary_contact_email","primary_contact_phone","billing_contact_name","billing_contact_email","billing_contact_phone","technical_contact_name","technical_contact_email","technical_contact_phone","internal_notes","timezone","onboarding_status"])if(key in company)patch[key]=clean(company[key],key==="internal_notes"?5000:500);if("default_locale" in company)patch.default_locale=company.default_locale==="en"?"en":"ar";const {error}=await admin.from("companies").update(patch).eq("id",id);if(error)throw error;const sp:AnyMap={updated_at:new Date().toISOString()};for(const key of ["plan_id","status","trial_ends_at","current_period_ends_at","billing_cycle","agreed_price","currency","payment_status","last_payment_at","next_payment_at","notes"])if(key in sub)sp[key]=sub[key]||null;if("max_members" in sub)sp.max_members_override=sub.max_members?Number(sub.max_members):null;if("max_projects" in sub)sp.max_projects_override=sub.max_projects?Number(sub.max_projects):null;if("max_storage_gb" in sub)sp.max_storage_bytes_override=sub.max_storage_gb?Math.round(Number(sub.max_storage_gb)*1073741824):null;const {error:subError}=await admin.from("company_subscriptions").update(sp).eq("company_id",id);if(subError)throw subError;await admin.from("platform_audit_events").insert({actor_id:user.id,company_id:id,action:"platform.company_updated",metadata:{company_fields:Object.keys(patch),subscription_fields:Object.keys(sp)}});return reply({ok:true,company_id:id},200,cors);
    }
    throw new HttpError(400,`Unknown action: ${requested||"(empty)"}`);
  }catch(error){console.error("identity-provisioning",error);return reply({ok:false,error:errorText(error,"Provisioning failed")},error instanceof HttpError?error.status:400,cors);}
});
