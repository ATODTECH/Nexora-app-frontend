import { createClient } from 'supabase';
const corsHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
const json=(body:Record<string,unknown>,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
const sha256Hex=async(input:string)=>{const data=new TextEncoder().encode(input);const hashBuffer=await crypto.subtle.digest('SHA-256',data);return Array.from(new Uint8Array(hashBuffer),b=>b.toString(16).padStart(2,'0')).join('');};
const OTP_TTL_MS=10*60*1000;
const generateOtp=()=>Math.floor(1000+Math.random()*9000).toString();
Deno.serve(async req=>{
if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
if(req.method!=='POST')return json({error:'Method not allowed.'},405);
try{
const {email}=await req.json();
if(typeof email!=='string'||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))return json({error:'Invalid email address.'},400);
const cleanEmail=email.trim().toLowerCase();
const supabaseUrl=Deno.env.get('SUPABASE_URL');
const serviceRoleKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const resendApiKey=Deno.env.get('RESEND_API_KEY');
if(!supabaseUrl)throw new Error('SUPABASE_URL is not configured.');
if(!serviceRoleKey)throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
if(!resendApiKey)throw new Error('RESEND_API_KEY is not configured.');
const supabase=createClient(supabaseUrl,serviceRoleKey);
const {data:userList,error:userError}=await supabase.auth.admin.listUsers();
if(userError)throw new Error(userError.message);
const userExists=userList.users.some(u=>u.email?.toLowerCase()===cleanEmail);
if(!userExists)return json({success:true,message:'If an account exists for this email, a code has been sent.'});
const otp=generateOtp();
const otpHash=await sha256Hex(otp);
const expiresAt=new Date(Date.now()+OTP_TTL_MS).toISOString();
const {error:upsertError}=await supabase.from('password_reset_otps').upsert({email:cleanEmail,otp_hash:otpHash,expires_at:expiresAt,attempts:0,used:false,reset_token_hash:null,reset_token_expires_at:null},{onConflict:'email'});
if(upsertError)throw new Error(upsertError.message);
const emailRes=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${resendApiKey}`,'Content-Type':'application/json'},body:JSON.stringify({from:'Nexora <onboarding@resend.dev>',to:[cleanEmail],subject:'Your Nexora password reset code',html:`<div style="font-family:Arial,sans-serif;padding:20px"><h2>Nexora Password Reset</h2><p>Your verification code is:</p><h1 style="letter-spacing:8px">${otp}</h1><p>This code expires in 10 minutes.</p><p>If you did not request this password reset, you can safely ignore this email.</p></div>`})});
if(!emailRes.ok){const errText=await emailRes.text();throw new Error(`Failed to send email: ${errText}`);}
return json({success:true,message:'If an account exists for this email, a code has been sent.'});
}catch(error:unknown){
console.error(error);
return json({error:error instanceof Error?error.message:'Unable to process request.'},500);
}
});