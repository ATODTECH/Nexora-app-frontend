import * as SecureStore from 'expo-secure-store';

const API_BASE_URL='http://192.168.1.100:5000/api';

type ApiResponse<T=any>={
  success:boolean;
  message:string;
  data?:T;
  errors?:string[];
};

export type User={
  id:string;
  fullName:string;
  email:string;
};

export type AuthData={
  user:User;
  accessToken:string;
  refreshToken?:string;
};

const ACCESS_TOKEN_KEY='nexora_access_token';
const REFRESH_TOKEN_KEY='nexora_refresh_token';
const USER_KEY='nexora_user';

async function request<T=any>(
  endpoint:string,
  options:RequestInit={}
):Promise<ApiResponse<T>>{
  const response=await fetch(`${API_BASE_URL}${endpoint}`,{
    ...options,
    headers:{
      'Content-Type':'application/json',
      ...(options.headers||{})
    }
  });
  const body=await response.json().catch(()=>({
    success:false,
    message:'Invalid server response'
  }));
  if(!response.ok){
    throw new Error(body.message||'Request failed');
  }
  return body;
}

export async function register(
  fullName:string,
  email:string,
  password:string
):Promise<ApiResponse<AuthData>>{
  return request<AuthData>('/auth/register',{
    method:'POST',
    body:JSON.stringify({fullName,email,password})
  });
}

export async function login(
  email:string,
  password:string
):Promise<ApiResponse<AuthData>>{
  return request<AuthData>('/auth/login',{
    method:'POST',
    body:JSON.stringify({email,password})
  });
}

export async function refreshAccessToken(
  refreshToken:string
):Promise<ApiResponse<AuthData>>{
  return request<AuthData>('/auth/refresh',{
    method:'POST',
    body:JSON.stringify({refreshToken})
  });
}

export async function getMe(
  accessToken:string
):Promise<ApiResponse<{user:User}>>{
  return request<{user:User}>('/auth/me',{
    method:'GET',
    headers:{
      Authorization:`Bearer ${accessToken}`
    }
  });
}

export async function saveAuth(data:AuthData){
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY,data.accessToken);
  if(data.refreshToken){
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY,data.refreshToken);
  }
  await SecureStore.setItemAsync(USER_KEY,JSON.stringify(data.user));
}

export async function getAccessToken(){
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function getRefreshToken(){
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function getStoredUser():Promise<User|null>{
  const value=await SecureStore.getItemAsync(USER_KEY);
  if(!value)return null;
  try{
    return JSON.parse(value);
  }catch{
    return null;
  }
}

export async function clearAuth(){
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
}