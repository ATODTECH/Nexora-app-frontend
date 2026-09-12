import { createClient } from 'supabase';
const corsHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
const json=(body:Record<string,unknown>,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
const sha256Hex=async(input:string)=>{const data=new TextEncoder().encode(input);const hashBuffer=await crypto.subtle.digest('SHA-256',data);return Array.from(new Uint8Array(hashBuffer),b=>b.toString(16).padStart(2,'0')).join('');};
Deno.serve(async req=>{
if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
if(req.method!=='POST')return json({error:'Method not allowed.'},405);
try{
const {email,resetToken,newPassword}=await req.json();
if(typeof email!=='string'||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))return json({error:'Invalid email address.'},400);
if(typeof resetToken!=='string'||resetToken.trim().length===0)return json({error:'Missing or invalid reset token.'},400);
if(typeof newPassword!=='string'||newPassword.length<6)return json({error:'Password must be at least 6 characters.'},400);
const cleanEmail=email.trim().toLowerCase();
const supabaseUrl=Deno.env.get('SUPABASE_URL');
const serviceRoleKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if(!supabaseUrl)throw new Error('SUPABASE_URL is not configured.');
if(!serviceRoleKey)throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
const supabase=createClient(supabaseUrl,serviceRoleKey);
const {data:row,error:fetchError}=await supabase.from('password_reset_otps').select('reset_token_hash,reset_token_expires_at,used').eq('email',cleanEmail).maybeSingle();
if(fetchError)throw new Error(fetchError.message);
if(!row||!row.used||!row.reset_token_hash)return json({error:'Please verify your code again before resetting your password.'},400);
const providedTokenHash=await sha256Hex(resetToken.trim());
if(row.reset_token_hash!==providedTokenHash)return json({error:'Invalid or expired reset session. Please verify your code again.'},400);
if(!row.reset_token_expires_at||new Date(row.reset_token_expires_at).getTime()<Date.now())return json({error:'Your reset session has expired. Please verify your code again.'},400);
const {data:userList,error:userError}=await supabase.auth.admin.listUsers();
if(userError)throw new Error(userError.message);
const user=userList.users.find(u=>u.email?.toLowerCase()===cleanEmail);
if(!user)return json({error:'Unable to find an account for this email.'},400);
const {error:updateUserError}=await supabase.auth.admin.updateUserById(user.id,{password:newPassword});
if(updateUserError)throw new Error(updateUserError.message);
const {error:clearError}=await supabase.from('password_reset_otps').delete().eq('email',cleanEmail);
if(clearError)console.error('Failed to clear password_reset_otps row:',clearError.message);
return json({success:true,message:'Password reset successfully.'});
}catch(error:unknown){
console.error(error);
return json({error:error instanceof Error?error.message:'Unable to process request.'},500);
}
});