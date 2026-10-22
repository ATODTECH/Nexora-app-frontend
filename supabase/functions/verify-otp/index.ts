import { createClient } from 'supabase';
const corsHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
const json=(body:Record<string,unknown>,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
const MAX_ATTEMPTS=5;
const RESET_TOKEN_TTL_MS=5*60*1000;
const sha256Hex=async(input:string)=>{const data=new TextEncoder().encode(input);const hashBuffer=await crypto.subtle.digest('SHA-256',data);return Array.from(new Uint8Array(hashBuffer),b=>b.toString(16).padStart(2,'0')).join('');};
const generateResetToken=()=>{const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');};
Deno.serve(async req=>{
if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
if(req.method!=='POST')return json({error:'Method not allowed.'},405);
try{
const {email,otp}=await req.json();
if(typeof email!=='string'||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))return json({error:'Invalid email address.'},400);
if(typeof otp!=='string'||!/^\d{4}$/.test(otp.trim()))return json({error:'Invalid verification code.'},400);
const cleanEmail=email.trim().toLowerCase();
const cleanOtp=otp.trim();
const supabaseUrl=Deno.env.get('SUPABASE_URL');
const serviceRoleKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if(!supabaseUrl)throw new Error('SUPABASE_URL is not configured.');
if(!serviceRoleKey)throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
const supabase=createClient(supabaseUrl,serviceRoleKey);
const {data:row,error:fetchError}=await supabase.from('password_reset_otps').select('otp_hash,expires_at,attempts,used').eq('email',cleanEmail).maybeSingle();
if(fetchError)throw new Error(fetchError.message);
if(!row)return json({error:'No verification code found for this email. Please request a new one.'},400);
if(row.used)return json({error:'This code has already been used. Please request a new one.'},400);
if(!row.expires_at||new Date(row.expires_at).getTime()<Date.now())return json({error:'This code has expired. Please request a new one.'},400);
if(row.attempts>=MAX_ATTEMPTS)return json({error:'Too many incorrect attempts. Please request a new code.'},400);
if(!row.otp_hash)return json({error:'Invalid verification session. Please request a new code.'},400);
const enteredOtpHash=await sha256Hex(cleanOtp);
if(row.otp_hash!==enteredOtpHash){
const {error:incrementError}=await supabase.from('password_reset_otps').update({attempts:row.attempts+1}).eq('email',cleanEmail);
if(incrementError)throw new Error(incrementError.message);
const remaining=MAX_ATTEMPTS-(row.attempts+1);
return json({error:remaining>0?`Incorrect code. ${remaining} attempt${remaining===1?'':'s'} remaining.`:'Incorrect code. Please request a new one.'},400);
}
const resetToken=generateResetToken();
const resetTokenHash=await sha256Hex(resetToken);
const resetTokenExpiresAt=new Date(Date.now()+RESET_TOKEN_TTL_MS).toISOString();
const {error:updateError}=await supabase.from('password_reset_otps').update({used:true,reset_token_hash:resetTokenHash,reset_token_expires_at:resetTokenExpiresAt}).eq('email',cleanEmail);
if(updateError)throw new Error(updateError.message);
return json({success:true,resetToken});
}catch(error:unknown){
console.error(error);
return json({error:error instanceof Error?error.message:'Unable to process request.'},500);
}
});