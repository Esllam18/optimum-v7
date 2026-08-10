import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const url=Deno.env.get("SUPABASE_URL")!;
function envKey(kind:"anon"|"service"){
  const legacy=Deno.env.get(kind==="anon"?"SUPABASE_ANON_KEY":"SUPABASE_SERVICE_ROLE_KEY");
  if(legacy)return legacy;
  const bundle=Deno.env.get(kind==="anon"?"SUPABASE_PUBLISHABLE_KEYS":"SUPABASE_SECRET_KEYS");
  if(bundle){const parsed=JSON.parse(bundle);return parsed.default||Object.values(parsed).find(Boolean) as string;}
  throw new Error("Supabase key is not configured");
}
const anon=envKey("anon"),service=envKey("service");
const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
const configuredOrigins=(Deno.env.get("OPTIMUM_ALLOWED_ORIGINS")||"").split(",").map(x=>x.trim()).filter(Boolean);
const localOrigin=/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
class HttpError extends Error{constructor(public status:number,message:string){super(message);}}
function cors(req:Request){
  const origin=req.headers.get("Origin");
  if(origin&&!configuredOrigins.includes(origin)&&!localOrigin.test(origin))throw new HttpError(403,"Origin is not allowed");
  return {...(origin?{"Access-Control-Allow-Origin":origin,"Vary":"Origin"}:{}),"Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
}
const reply=(body:unknown,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(body),{status,headers:{...headers,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const clean=(value:unknown,max=500)=>{const text=String(value??"").trim();return text?text.slice(0,max):null;};
const strong=(value:string)=>value.length>=10&&/[a-z]/.test(value)&&/[A-Z]/.test(value)&&/\d/.test(value)&&/[^A-Za-z0-9]/.test(value);
function password(){
  const upper="ABCDEFGHJKLMNPQRSTUVWXYZ",lower="abcdefghijkmnopqrstuvwxyz",digits="23456789",all=upper+lower+digits;
  const bytes=crypto.getRandomValues(new Uint32Array(32)),pick=(set:string,i:number)=>set[bytes[i]%set.length];
  return `O${pick(lower,0)}${pick(digits,1)}${Array.from({length:6},(_,i)=>pick(all,i+2)).join("")}@${pick(upper,8)}${pick(lower,9)}${pick(digits,10)}${Array.from({length:5},(_,i)=>pick(all,i+11)).join("")}`;
}
async function verified(email:string,secret:string){
  const probe=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await probe.auth.signInWithPassword({email,password:secret});
  if(error||!data.session)return false;
  await probe.auth.signOut({scope:"local"}).catch(()=>{});
  return true;
}

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
async function completeFirstLogin(req:Request,authorization:string,body:any,headers:Record<string,string>){
  const token=authorization.slice(7);
  const {data:userData,error:userError}=await admin.auth.getUser(token);
  if(userError||!userData.user)throw new HttpError(401,"Invalid or expired session");
  const secret=String(body.password||"");
  if(!strong(secret))throw new HttpError(400,"Password does not meet the security requirements");
  const {data:security,error:securityError}=await admin.from("account_security").select("must_change_password,temporary_password_expires_at,provisioning_source").eq("user_id",userData.user.id).maybeSingle();
  if(securityError)throw securityError;
  if(security?.must_change_password&&security.temporary_password_expires_at&&new Date(security.temporary_password_expires_at)<new Date())throw new HttpError(410,"Temporary password expired");
  const updateResponse=await fetch(`${url}/auth/v1/user`,{method:"PUT",headers:{apikey:anon,Authorization:authorization,"Content-Type":"application/json"},body:JSON.stringify({password:secret})});
  if(!updateResponse.ok){const raw=await updateResponse.text();const parsed=normalizeAuthUpdateError(raw,"Could not update password");throw new HttpError(updateResponse.status,parsed.message);}
  const {data,error}=await admin.rpc("service_complete_first_login_for_user",{p_user_id:userData.user.id,p_full_name:clean(body.full_name,160)||userData.user.email?.split("@")[0],p_phone:clean(body.phone,50),p_whatsapp:clean(body.whatsapp,50),p_timezone:clean(body.timezone,80)||"Africa/Cairo",p_accept_terms:Boolean(body.accept_terms),p_source:security?.provisioning_source||"company"});
  if(error)throw error;
  const sessionProbe=await fetch(`${url}/auth/v1/user`,{headers:{apikey:anon,Authorization:authorization}});
  return reply({ok:true,...data,password_updated:true,session_preserved:sessionProbe.ok,access_engine_version:"5.5.4"},200,headers);
}
Deno.serve(async(req)=>{
  let headers:Record<string,string>={};
  try{
    headers=cors(req);
    if(req.method==="OPTIONS")return new Response("ok",{headers});
    if(req.method!=="POST")return reply({ok:false,error:"Method not allowed"},405,headers);
    const authorization=req.headers.get("Authorization")||"";
    if(!authorization.startsWith("Bearer "))return reply({ok:false,error:"Authentication required"},401,headers);
    const body=await req.json().catch(()=>({}));
    const action=String(body?.action||"");
    if(action==="complete_first_login"||action==="first_login")return await completeFirstLogin(req,authorization,body,headers);
    const upstream=await fetch(`${url}/functions/v1/identity-provisioning`,{method:"POST",headers:{Authorization:authorization,apikey:anon,"Content-Type":"application/json"},body:JSON.stringify(body)});
    const payload=await upstream.json().catch(()=>({ok:false,error:"Invalid provisioning response"}));
    if(!upstream.ok||payload?.ok===false)return reply(payload,upstream.status,headers);
    if(!payload?.temporary_password||!payload?.email)return reply({...payload,credential_verified:true,access_engine_version:"5.5.4"},upstream.status,headers);
    let userId=payload.user_id||payload.owner_user_id||null;
    if(!userId&&payload.membership_id){const {data,error}=await admin.from("company_memberships").select("user_id").eq("id",payload.membership_id).single();if(error)throw error;userId=data.user_id;}
    if(!userId)throw new Error("Created account id is missing");
    let secret=String(payload.temporary_password),ok=await verified(String(payload.email),secret);
    if(!ok){secret=password();const {error}=await admin.auth.admin.updateUserById(userId,{password:secret});if(error)throw error;ok=await verified(String(payload.email),secret);if(!ok)throw new Error("Temporary credential verification failed");const expires=payload.temporary_password_expires_at||new Date(Date.now()+48*3600_000).toISOString();await admin.from("account_security").update({must_change_password:true,temporary_password_expires_at:expires,updated_at:new Date().toISOString()}).eq("user_id",userId);payload.temporary_password=secret;payload.temporary_password_expires_at=expires;}
    return reply({...payload,credential_verified:ok,access_engine_version:"5.5.4"},upstream.status,headers);
  }catch(error){console.error("identity-provisioning-v55",error);return reply({ok:false,error:errorText(error,"Provisioning verification failed")},error instanceof HttpError?error.status:500,headers);}
});
