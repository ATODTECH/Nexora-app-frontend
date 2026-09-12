import {create} from 'zustand';
import {
  clearAuth,
  getAccessToken,
  getRefreshToken,
  getStoredUser,
  login as apiLogin,
  register as apiRegister,
  refreshAccessToken,
  saveAuth,
  User
} from '../services/api';

type AuthState={
  user:User|null;
  accessToken:string|null;
  refreshToken:string|null;
  loading:boolean;
  initialized:boolean;
  error:string|null;
  initialize:()=>Promise<void>;
  login:(email:string,password:string)=>Promise<boolean>;
  register:(fullName:string,email:string,password:string)=>Promise<boolean>;
  logout:()=>Promise<void>;
  clearError:()=>void;
};

export const useAuthStore=create<AuthState>((set,get)=>({
  user:null,
  accessToken:null,
  refreshToken:null,
  loading:false,
  initialized:false,
  error:null,

  initialize:async()=>{
    try{
      const accessToken=await getAccessToken();
      const refreshToken=await getRefreshToken();
      const user=await getStoredUser();

      if(accessToken&&user){
        set({
          accessToken,
          refreshToken,
          user,
          initialized:true
        });
        return;
      }

      if(refreshToken){
        const response=await refreshAccessToken(refreshToken);

        if(response.success&&response.data){
          await saveAuth(response.data);

          set({
            user:response.data.user,
            accessToken:response.data.accessToken,
            refreshToken:response.data.refreshToken||refreshToken,
            initialized:true
          });
          return;
        }
      }

      await clearAuth();
      set({
        user:null,
        accessToken:null,
        refreshToken:null,
        initialized:true
      });
    }catch{
      await clearAuth();
      set({
        user:null,
        accessToken:null,
        refreshToken:null,
        initialized:true
      });
    }
  },

  login:async(email,password)=>{
    set({loading:true,error:null});

    try{
      const response=await apiLogin(email,password);

      if(!response.success||!response.data){
        set({
          loading:false,
          error:response.message
        });
        return false;
      }

      await saveAuth(response.data);

      set({
        user:response.data.user,
        accessToken:response.data.accessToken,
        refreshToken:response.data.refreshToken||null,
        loading:false,
        error:null
      });

      return true;
    }catch(error:any){
      set({
        loading:false,
        error:error?.message||'Login failed'
      });
      return false;
    }
  },

  register:async(fullName,email,password)=>{
    set({loading:true,error:null});

    try{
      const response=await apiRegister(fullName,email,password);

      if(!response.success||!response.data){
        set({
          loading:false,
          error:response.message
        });
        return false;
      }

      await saveAuth(response.data);

      set({
        user:response.data.user,
        accessToken:response.data.accessToken,
        refreshToken:response.data.refreshToken||null,
        loading:false,
        error:null
      });

      return true;
    }catch(error:any){
      set({
        loading:false,
        error:error?.message||'Registration failed'
      });
      return false;
    }
  },

  logout:async()=>{
    await clearAuth();

    set({
      user:null,
      accessToken:null,
      refreshToken:null,
      error:null
    });
  },

  clearError:()=>{
    set({error:null});
  }
}));