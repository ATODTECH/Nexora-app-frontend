import React,{useEffect,useRef,useState}from'react';
import{Animated,Image,PanResponder,Platform,Pressable,ScrollView,StyleSheet,Text,TextInput,View,useWindowDimensions}from'react-native';
import { Image as ExpoImage } from 'expo-image';
import{StatusBar}from'expo-status-bar';
import LaunchSVG from'../assets/launch/launch.svg';
import Onboarding1SVG from'../assets/onboarding/onboarding-1.svg';
import Onboarding2SVG from'../assets/onboarding/onboarding-2.svg';
import Onboarding3SVG from'../assets/onboarding/onboarding-3.svg';
import Onboarding4SVG from'../assets/onboarding/onboarding-4.svg';
import SignUpSVG from'../assets/signup/sign-up.svg';
import InputDetails1SVG from'../assets/signup/Input details-1.svg';
import InputDetails2SVG from'../assets/signup/Input details-2.svg';
import WrongEmailSVG from'../assets/signup/Wrong email address.svg';
import TermsAgreedSVG from'../assets/signup/Terms and Policy Agreed.svg';
import LoadPageSVG from'../assets/signup/Load Page.svg';
import TermOfUseSVG from'../assets/signup/Term of use.svg';
import PrivacyPolicySVG from'../assets/signup/privacy and policy.svg';
import LogInSVG from'../assets/login/log-in.svg';
import LoginInputEmailSVG from'../assets/login/input-email.svg';
import LoginInputDetailsSVG from'../assets/login/input-details.svg';
import LoginKeepLoggedIn1SVG from'../assets/login/keep-logged-in-1.svg';
import LoginKeepLoggedIn2SVG from'../assets/login/keep-logged-in-2.svg';
import{supabase}from'../lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

const FIGMA_WIDTH=393,FIGMA_HEIGHT=852;
const BUTTON_X=16.5,BUTTON_Y=762.5,BUTTON_WIDTH=360,BUTTON_HEIGHT=45,BUTTON_R=20.5,BUTTON_COLOR='#1E56A0',BUTTON_BORDER='#5381BB';
const SKIP_X=300,SKIP_Y=50,SKIP_WIDTH=55,SKIP_HEIGHT=38;
const INPUT_X=16.25,INPUT_WIDTH=360.5,INPUT_HEIGHT=45.5,MASK_INSET=3;
const SIGNUP_FULLNAME_Y=323.25,SIGNUP_EMAIL_Y=387.25,SIGNUP_PASSWORD_Y=451.25,SIGNUP_CONFIRM_PASSWORD_Y=515.25;
const EYE_WIDTH=36,EYE_HEIGHT=36,SIGNUP_PASSWORD_EYE_X=330,SIGNUP_PASSWORD_EYE_Y=456,SIGNUP_CONFIRM_EYE_X=330,SIGNUP_CONFIRM_EYE_Y=520;
const SIGNUP_CHECK_X=28.5,SIGNUP_CHECK_Y=584,SIGNUP_CHECK_WIDTH=12,SIGNUP_CHECK_HEIGHT=12;
const SIGNUP_TERMS_X=94,SIGNUP_TERMS_Y=582,SIGNUP_TERMS_WIDTH=92,SIGNUP_TERMS_HEIGHT=22;
const SIGNUP_PRIVACY_X=220,SIGNUP_PRIVACY_Y=582,SIGNUP_PRIVACY_WIDTH=92,SIGNUP_PRIVACY_HEIGHT=22;
const SIGNUP_BUTTON_X=16.5,SIGNUP_BUTTON_Y=619.5,SIGNUP_BUTTON_WIDTH=360,SIGNUP_BUTTON_HEIGHT=45;
const SIGNUP_GOOGLE_X=137,SIGNUP_GOOGLE_Y=724,SIGNUP_GOOGLE_WIDTH=52,SIGNUP_GOOGLE_HEIGHT=52;
const SIGNUP_APPLE_X=204,SIGNUP_APPLE_Y=724,SIGNUP_APPLE_WIDTH=52,SIGNUP_APPLE_HEIGHT=52;
const SIGNUP_LOGIN_X=248,SIGNUP_LOGIN_Y=790,SIGNUP_LOGIN_WIDTH=60,SIGNUP_LOGIN_HEIGHT=20;
const LOGIN_EMAIL_Y=305.25,LOGIN_PASSWORD_Y=372.25,LOGIN_PASSWORD_EYE_X=334,LOGIN_PASSWORD_EYE_Y=378;
const LOGIN_CHECK_X=20,LOGIN_CHECK_Y=434,LOGIN_CHECK_WIDTH=15,LOGIN_CHECK_HEIGHT=15;
const LOGIN_FORGOT_X=274,LOGIN_FORGOT_Y=434,LOGIN_FORGOT_WIDTH=100,LOGIN_FORGOT_HEIGHT=15;
const LOGIN_BUTTON_X=17.5,LOGIN_BUTTON_Y=468.5,LOGIN_BUTTON_WIDTH=360,LOGIN_BUTTON_HEIGHT=45;
const LOGIN_GOOGLE_X=137,LOGIN_GOOGLE_Y=583,LOGIN_GOOGLE_WIDTH=52,LOGIN_GOOGLE_HEIGHT=52;
const LOGIN_APPLE_X=204,LOGIN_APPLE_Y=583,LOGIN_APPLE_WIDTH=52,LOGIN_APPLE_HEIGHT=52;
const LOGIN_SIGNUP_X=242,LOGIN_SIGNUP_Y=662,LOGIN_SIGNUP_WIDTH=60,LOGIN_SIGNUP_HEIGHT=20;
const EMAIL_REGEX=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AUTH_TIMEOUT_MS=15000;
const SUPABASE_URL=process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY=process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_FUNCTIONS_URL=`${SUPABASE_URL}/functions/v1`;
// generated-password suggestion link (sits in the gap between the password
// field and the confirm-password field) and the suggestion card that
// temporarily overlays that area while the user is deciding
const GENERATE_LINK_X=INPUT_X,GENERATE_LINK_Y=SIGNUP_PASSWORD_Y+INPUT_HEIGHT+1,GENERATE_LINK_WIDTH=220,GENERATE_LINK_HEIGHT=14;

// ---- Knowledge Base mock data ----------------------------------------
// Placeholder data standing in for a real backend. Swap KNOWLEDGE_DATA's
// item arrays for a fetch() once the Knowledge Base API exists — the
// screens below are already data-driven and don't need structural changes.
const KNOWLEDGE_DATA:Record<KnowledgeCategory,{title:string;icon:string;items:KnowledgeItem[]}>={
  products:{title:'Products',icon:'cube-outline',items:[
    {id:'p1',name:'Oraimo Headphone',subtitle:'Accessories · $59.00',status:'Verified',icon:'headset-outline',iconBg:'#EAF1FB',iconColor:'#1E56A0',
      overview:'High quality wireless headphone with noise cancellation, 30 hours battery life and fast charging.',
      fields:[{label:'Category',value:'Electronics'},{label:'Specification',value:'AXS 104 Pro'},{label:'Brand',value:'Oraimo'},{label:'Price',value:'$45.00'},{label:'Status',value:'Verified'}],
      features:['Active Noise Cancellation','30-hours battery Life','Fast Charging','Bluetooth 7.1']},
    {id:'p2',name:'BST Smartwatch',subtitle:'Wearables · $49.00',status:'Verified',icon:'watch-outline',iconBg:'#EAF1FB',iconColor:'#1E56A0',
      overview:'Fitness-tracking smartwatch with heart-rate monitor and 10-day battery.',
      fields:[{label:'Category',value:'Wearables'},{label:'Brand',value:'BST'},{label:'Price',value:'$49.00'},{label:'Status',value:'Verified'}],
      features:['Heart-rate monitor','10-day battery','Water resistant']},
    {id:'p3',name:'TXR Bluetooth Speaker',subtitle:'Electronics · $52.00',status:'Need review',icon:'volume-high-outline',iconBg:'#FDEFE0',iconColor:'#E5A63A',
      overview:'Portable Bluetooth speaker with deep bass and 12-hour playtime.',
      fields:[{label:'Category',value:'Electronics'},{label:'Brand',value:'TXR'},{label:'Price',value:'$52.00'},{label:'Status',value:'Need review'}]},
  ]},
  services:{title:'Services',icon:'briefcase-outline',items:[
    {id:'s1',name:'Phone Screen Replacement',subtitle:'Mobile Phones · $45.00',status:'Verified',icon:'construct-outline',iconBg:'#EAF1FB',iconColor:'#1E56A0',
      overview:'Replacement of cracked or damaged phone screen with original quality parts.',
      fields:[{label:'Category',value:'Mobile Phones'},{label:'Price',value:'$45.00'},{label:'Duration',value:'1 - 2 hours'},{label:'Availability',value:'Mon - Sat, 9:00AM–6:00PM'},{label:'Location',value:'All branches'},{label:'Status',value:'Verified'}]},
    {id:'s2',name:'Delivery Service',subtitle:'Wearables',status:'Verified',icon:'bicycle-outline',iconBg:'#EAF1FB',iconColor:'#1E56A0',
      overview:'Same-day delivery for orders placed before 2pm.',
      fields:[{label:'Category',value:'Wearables'},{label:'Duration',value:'Same day'},{label:'Status',value:'Verified'}]},
  ]},
  operations:{title:'Operations',icon:'settings-outline',items:[
    {id:'o1',name:'Order Processing',subtitle:'Orders are processed within 24h',status:'Verified',icon:'time-outline',iconBg:'#EAF1FB',iconColor:'#1E56A0',
      overview:'Orders are reviewed, packed and handed to courier within 24 hours of confirmation.',
      fields:[{label:'Status',value:'Verified'}]},
    {id:'o2',name:'Delivery Policy',subtitle:'Orders ship Monday to Saturday',status:'Verified',icon:'bicycle-outline',iconBg:'#EAF1FB',iconColor:'#1E56A0',
      overview:'Standard shipping runs Monday through Saturday, excluding public holidays.',
      fields:[{label:'Status',value:'Verified'}]},
    {id:'o3',name:'Refund Policy',subtitle:'Refund within 7 days',status:'Need review',icon:'time-outline',iconBg:'#FDEFE0',iconColor:'#E5A63A',
      overview:'Refunds are processed within 7 business days of an approved return.',
      fields:[{label:'Status',value:'Need review'}]},
  ]},
  policies:{title:'Policies',icon:'document-text-outline',items:[
    {id:'pol1',name:'Customer Returns',subtitle:'30 days return policy',status:'Verified',icon:'cube-outline',iconBg:'#EAF1FB',iconColor:'#1E56A0',
      overview:'Replacement Warranty Policy covering returns within the stated window.',
      fields:[{label:'Category',value:'Rules and Policies'},{label:'Policy Type',value:'Warranty'},{label:'Applies To',value:'Phone Screen Repair'},{label:'Duration',value:'30 Days'},{label:'Status',value:'Verified'}],
      features:['Refund requests must be made within 7 days of purchase','Items must be unused and in original condition','Refunds will be processed within 5 business days']},
    {id:'pol2',name:'Delivery Policy',subtitle:'Lagos: 1 - 2 business days',status:'Verified',icon:'bicycle-outline',iconBg:'#EAF1FB',iconColor:'#1E56A0',
      overview:'Standard delivery windows by region.',fields:[{label:'Status',value:'Verified'}]},
    {id:'pol3',name:'Refund Policy',subtitle:'Refund within 7 days',status:'Need review',icon:'cash-outline',iconBg:'#FDEFE0',iconColor:'#E5A63A',
      overview:'Refunds honored within 7 days of purchase with proof of payment.',fields:[{label:'Status',value:'Need review'}]},
  ]},
  faqs:{title:'FAQs',icon:'help-circle-outline',items:[
    {id:'f1',name:'How long does delivery take?',subtitle:'Answer available',status:'Verified',icon:'help-circle-outline',iconBg:'#EAF1FB',iconColor:'#1E56A0',
      overview:'Standard delivery takes 1-3 business days depending on location.',
      fields:[{label:'Answer',value:'Delivery typically takes 1-3 business days depending on your location.'},{label:'Keywords',value:'delivery, shipping, time'},{label:'Applies to',value:'All Products'},{label:'Status',value:'Verified'}]},
    {id:'f2',name:'What\u2019s your return policy?',subtitle:'Answer available',status:'Verified',icon:'help-circle-outline',iconBg:'#EAF1FB',iconColor:'#1E56A0',
      overview:'Items can be returned within 30 days of purchase.',
      fields:[{label:'Answer',value:'Items can be returned within 30 days of purchase, unused and in original packaging.'},{label:'Status',value:'Verified'}]},
    {id:'f3',name:'Do you offer bulk discount?',subtitle:'Answer available',status:'Draft',icon:'help-circle-outline',iconBg:'#EEF1F4',iconColor:'#5C6B7A',
      overview:'Bulk discounts are available for orders over 50 units.',
      fields:[{label:'Answer',value:'Yes — orders over 50 units qualify for a 10% discount.'},{label:'Status',value:'Draft'}]},
  ]},
};

const BRAIN_GALLERY_FILENAMES = [
  { label: 'Home 1', file: 'Home-1.png' },
  { label: 'Home 2', file: 'Home-2.png' },
  { label: 'Brain Interface 1', file: 'Brain General Interface-1.png' },
  { label: 'Brain Interface 2', file: 'Brain General Interface-2.png' },
  { label: 'Brain Interface 3', file: 'Brain General Interface-3.png' },
  { label: 'Brain Interface 4', file: 'Brain General Interface-4.png' },
  { label: 'Brain Interface 5', file: 'Brain General Interface-5.png' },
  { label: 'Brain Interface 6', file: 'Brain General Interface-6.png' },
  { label: 'AI Brain Train', file: 'AI Brain Train 2.png' },
  { label: 'Product List 1', file: 'Product list-1.png' },
  { label: 'Product List 2', file: 'Product list-2.png' },
  { label: 'Product List 3', file: 'Product list-3.png' },
  { label: 'Product List 4', file: 'Product list-4.png' },
  { label: 'Product List 5', file: 'Product list-5.png' },
  { label: 'Product List 6', file: 'Product list-6.png' },
  { label: 'Product Details 1', file: 'Product details-1.png' },
  { label: 'Product Details 2', file: 'Product details-2.png' },
  { label: 'Product Details 3', file: 'Product details-3.png' },
  { label: 'Product Details 4', file: 'Product details-4.png' },
  { label: 'Product Details 5', file: 'Product details-5.png' },
  { label: 'Product Details 6', file: 'Product details-6.png' },
  { label: 'Service List', file: 'Service list.png' },
  { label: 'Operations List', file: 'Operations list.png' },
  { label: 'Policies List', file: 'Policies list.png' },
  { label: 'FAQs List', file: 'FAQs list.png' },
  { label: 'Add Knowledge 1', file: 'Add Knowledge-1.png' },
  { label: 'Add Knowledge 2', file: 'Add Knowledge-2.png' },
  { label: 'Add Image 1', file: 'Add image-1.png' },
  { label: 'Add Image 2', file: 'Add image-2.png' },
  { label: 'Frame 369', file: 'Frame 369.png' },
];

// Built once at module load — pulls the public URL for each file straight
// from the bucket instead of bundling ~1.5MB of reference PNGs into the
// app binary. expo-image below still gets full disk/memory caching, so
// repeat views of the gallery don't re-download anything.
const BRAIN_GALLERY_SCREENS = BRAIN_GALLERY_FILENAMES.map(({ label, file }) => ({
  label,
  url: supabase.storage.from('brain-gallery').getPublicUrl(file).data.publicUrl,
}));

type Screen='launch'|'onboarding'|'signup'|'login'|'forgotPassword'|'main'|'knowledgeHealth'|'knowledgeList'|'itemDetail'|'itemEdit'|'addKnowledge'|'brainGallery';
type KnowledgeCategory='products'|'services'|'operations'|'policies'|'faqs';
type KnowledgeField={label:string;value:string};
type KnowledgeItem={id:string;name:string;subtitle:string;status:'Verified'|'Need review'|'Draft';icon:string;iconBg:string;iconColor:string;overview:string;fields:KnowledgeField[];features?:string[]};

export default function HomeScreen(){
  const{width:hookWidth,height:hookHeight}=useWindowDimensions();
  const[measured,setMeasured]=useState<{width:number;height:number}|null>(null);
  const width=measured?.width??hookWidth;
  const height=measured?.height??hookHeight;
  const onRootLayout=(e:any)=>{
    const{width:w,height:h}=e.nativeEvent.layout;
    if(w>0&&h>0&&(w!==measured?.width||h!==measured?.height)){
      setMeasured({width:w,height:h});
    }
  };
  const[screen,setScreen]=useState<Screen>('launch');
  const[onboardingIndex,setOnboardingIndex]=useState(0),[signupIndex,setSignupIndex]=useState(0),[loginIndex,setLoginIndex]=useState(0);
  const[fullName,setFullName]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirmPassword,setConfirmPassword]=useState('');
  const[termsAccepted,setTermsAccepted]=useState(false),[showPassword,setShowPassword]=useState(false),[showConfirmPassword,setShowConfirmPassword]=useState(false);
  const[suggestedPassword,setSuggestedPassword]=useState(''),[showPasswordSuggestion,setShowPasswordSuggestion]=useState(false);
  const[loginEmail,setLoginEmail]=useState(''),[loginPassword,setLoginPassword]=useState(''),[showLoginPassword,setShowLoginPassword]=useState(false),[rememberMe,setRememberMe]=useState(false);
  const[loginError,setLoginError]=useState(false),[authError,setAuthError]=useState(''),[infoMessage,setInfoMessage]=useState(''),[loading,setLoading]=useState(false);
  const[resetEmail,setResetEmail]=useState('');
  const[resetOtp,setResetOtp]=useState('');
  const[resetToken,setResetToken]=useState('');
  const[resetPassword,setResetPassword]=useState('');
  const[resetConfirmPassword,setResetConfirmPassword]=useState('');
  const[showResetPassword,setShowResetPassword]=useState(false);
  const[showResetConfirmPassword,setShowResetConfirmPassword]=useState(false);
  const[resetError,setResetError]=useState('');
  const[resetStep,setResetStep]=useState<'email'|'otp'|'password'|'success'>('email');
  const[resetOtpDigits,setResetOtpDigits]=useState(['','','','']);
  const[resetOtpTimer,setResetOtpTimer]=useState(60);
  type MainTab = 'home' | 'brain' | 'profile';
  type ChatMessage = { id: string; role: 'user' | 'ai'; text: string; imageUri?: string };

  const [mainTab, setMainTab] = useState<MainTab>('home');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const chatScrollRef = useRef<ScrollView>(null);

  const [commandExpanded, setCommandExpanded] = useState(false);
  const [brainGalleryIndex, setBrainGalleryIndex] = useState(0);
  const [activeCategory, setActiveCategory] = useState<KnowledgeCategory>('products');
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [listStatusFilter, setListStatusFilter] = useState<'All' | 'Verified' | 'Drafts' | 'Need review'>('All');
  const [editDraft, setEditDraft] = useState<KnowledgeField[]>([]);
  const [addKnowledgeStep, setAddKnowledgeStep] = useState<'choose' | 'upload' | 'processing' | 'summary' | 'review' | 'addImage'>('choose');
  const [reviewChecks, setReviewChecks] = useState<Record<string, boolean>>({});

  const popularQuestions = [
    'How are my sales doing?',
    'Which products are top sellers?',
    'Show unpaid invoices?',
    'Schedule a meeting with Sarah',
  ];
  const navigatingRef=useRef(false),onboardingIndexRef=useRef(0),signupIndexRef=useRef(0),loginIndexRef=useRef(0);
  const otpRefs=useRef<Array<TextInput|null>>([null,null,null,null]);
  const launchOpacity=useRef(new Animated.Value(1)).current,buttonScale=useRef(new Animated.Value(1)).current,buttonOpacity=useRef(new Animated.Value(1)).current;
  // Ground-truth check: every screen's SVG viewBox is 393×852, matching
  // FIGMA_WIDTH/FIGMA_HEIGHT exactly — so width-based scaling was always
  // correct. The Math.min height-clamp added last turn was the actual
  // regression: on shorter windows (e.g. an emulator's title bar eating
  // vertical space), height became the limiting ratio and shrank the
  // frame below what bottom-anchored elements needed, clipping them.
  const scale=width/FIGMA_WIDTH,scaledHeight=FIGMA_HEIGHT*scale;
  // NOTE: only checks that fields are filled in + terms accepted. Format
  // validation (email regex) and password-match validation now happen
  // inside handleSignUp itself, where they can actually run and surface
  // the right screen/error — a disabled button can never be pressed, so
  // that validation was previously unreachable dead code.
  const signupEnabled=fullName.trim().length>0&&email.trim().length>0&&password.length>0&&confirmPassword.length>0&&termsAccepted;
  const loginEnabled=loginEmail.trim().length>0&&loginPassword.length>0;
  const resetEmailValid=EMAIL_REGEX.test(resetEmail.trim());
  const resetOtpValid=resetOtp.length===4;
  const resetPasswordValid=resetPassword.length>=8&&resetConfirmPassword.length>=8;

  useEffect(()=>{onboardingIndexRef.current=onboardingIndex},[onboardingIndex]);
  useEffect(()=>{signupIndexRef.current=signupIndex},[signupIndex]);
  useEffect(()=>{loginIndexRef.current=loginIndex},[loginIndex]);

  // belt-and-suspenders: whichever screen you land on, any leftover
  // error from a previous attempt is wiped the instant the screen changes
    useEffect(()=>{
      setAuthError('');
      setLoginError(false);
      setShowPasswordSuggestion(false);
    },[screen]);

    useEffect(()=>{
      if(screen!=='forgotPassword'||resetStep!=='otp'||resetOtpTimer<=0)return;
      const id=setTimeout(()=>setResetOtpTimer(t=>t-1),1000);
      return()=>clearTimeout(id);
    },[screen,resetStep,resetOtpTimer]);

  useEffect(()=>{
    let mounted=true;
    supabase.auth.getSession().then(({data:{session}})=>{if(mounted&&session)setScreen('main')});
    const{data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{if(mounted&&session)setScreen('main')});
    return()=>{mounted=false;subscription.unsubscribe()};
  },[]);

  useEffect(()=>{
    if(screen!=='launch')return;
    const timer=setTimeout(()=>{
      Animated.timing(launchOpacity,{toValue:0,duration:300,useNativeDriver:true}).start(()=>{
        setScreen('onboarding');
        launchOpacity.setValue(0);
        Animated.timing(launchOpacity,{toValue:1,duration:300,useNativeDriver:true}).start();
      });
    },3500);
    return()=>clearTimeout(timer);
  },[screen,launchOpacity]);

  const next=()=>{
    if(navigatingRef.current)return;
    navigatingRef.current=true;
    setTimeout(()=>{
      if(onboardingIndexRef.current<3)setOnboardingIndex(v=>v+1);
      else setScreen('signup');
      navigatingRef.current=false;
    },120);
  };

  const previous=()=>{
    if(navigatingRef.current)return;
    if(onboardingIndexRef.current>0)setOnboardingIndex(v=>v-1);
  };

  const skip=()=>{
    if(navigatingRef.current)return;
    navigatingRef.current=true;
    setScreen('signup');
    setTimeout(()=>{navigatingRef.current=false},150);
  };

  const backToOnboarding=()=>{
    if(navigatingRef.current)return;
    navigatingRef.current=true;
    setOnboardingIndex(3);
    setScreen('onboarding');
    setTimeout(()=>{navigatingRef.current=false},150);
  };

  const backToSignup=()=>{
    if(navigatingRef.current)return;
    navigatingRef.current=true;
    setSignupIndex(0);
    setScreen('signup');
    setTimeout(()=>{navigatingRef.current=false},150);
  };

  const goToSignup=()=>{
    setInfoMessage('');
    setSignupIndex(0);
    setScreen('signup');
  };

  const goToLogin=()=>{
    setInfoMessage('');
    setLoginIndex(0);
    setScreen('login');
  };

  const withTimeout=<T,>(promise:Promise<T>,message:string):Promise<T>=>{
    const timeout=new Promise<never>((_,reject)=>{
      setTimeout(()=>reject(new Error(message)),AUTH_TIMEOUT_MS);
    });
    return Promise.race([promise,timeout]);
  };

  // builds a strong random password: guarantees at least one of each
  // character class, fills the rest from the combined pool, then
  // shuffles so the guaranteed characters aren't always in the same spot
  const generatePassword=()=>{
    const upper='ABCDEFGHJKLMNPQRSTUVWXYZ',lower='abcdefghijkmnpqrstuvwxyz',digits='23456789',symbols='!@#$%^&*';
    const all=upper+lower+digits+symbols;
    const pick=(set:string)=>set[Math.floor(Math.random()*set.length)];
    let pwd=pick(upper)+pick(lower)+pick(digits)+pick(symbols);
    for(let i=0;i<8;i++)pwd+=pick(all);
    return pwd.split('').sort(()=>Math.random()-.5).join('');
  };

  const handleGeneratePassword=()=>{
    setSuggestedPassword(generatePassword());
    setShowPasswordSuggestion(true);
    setAuthError('');
  };

  const acceptSuggestedPassword=()=>{
    setPassword(suggestedPassword);
    setConfirmPassword(suggestedPassword);
    setShowPasswordSuggestion(false);
    setAuthError('');
  };

  const dismissSuggestedPassword=()=>{
    setShowPasswordSuggestion(false);
  };

  const handleSignUp=async()=>{
    if(navigatingRef.current||!signupEnabled||loading)return;
    navigatingRef.current=true;
    setAuthError('');
    setInfoMessage('');
    const cleanEmail=email.trim().toLowerCase(),cleanName=fullName.trim();

    // FIX: this check now actually runs, since signupEnabled no longer
    // blocks the button on email format — bad email routes to the
    // "wrong email" screen, same as before it broke.
    if(!EMAIL_REGEX.test(cleanEmail)){
      setSignupIndex(3);
      navigatingRef.current=false;
      return;
    }

    // FIX: passwords not matching used to silently do nothing because
    // the button was disabled before handleSignUp could ever run this
    // check. Now it surfaces an inline error under the confirm-password
    // field, same overlay the network/auth errors already use.
    if(password!==confirmPassword){
      setAuthError('Passwords do not match');
      navigatingRef.current=false;
      return;
    }

    setLoading(true);

    try{
      const{data,error}=await withTimeout(
        supabase.auth.signUp({email:cleanEmail,password,options:{data:{full_name:cleanName}}}),
        'Request timed out. Check your internet connection.'
      );
      if(error)throw error;

      setSignupIndex(5);

      if(!data.session){
        setTimeout(()=>{
          setLoginEmail(cleanEmail);
          setLoginPassword('');
          setLoginIndex(0);
          // friendly info message, not an auth error — kept separate
          // from authError so it isn't styled red or wiped by the
          // screen-change error reset above
          setInfoMessage('Account created — check your inbox to confirm your email before logging in.');
          setSignupIndex(0);
          setScreen('login');
          setLoading(false);
          navigatingRef.current=false;
        },1800);
        return;
      }

      setTimeout(()=>{
        setScreen('main');
        setLoading(false);
        navigatingRef.current=false;
      },1800);
    }catch(error:any){
      setAuthError(error?.message||'Unable to create your account.');
      setLoading(false);
      setSignupIndex(3);
      navigatingRef.current=false;
    }
  };

  const handleLogin=async()=>{
  if(navigatingRef.current||!loginEnabled||loading)return;
  navigatingRef.current=true;
  setAuthError('');
  setInfoMessage('');
  setLoginError(false);
  setLoading(true);
  const cleanEmail=loginEmail.trim().toLowerCase();
  try{
  if (__DEV__) {
    console.log('[NEXORA LOGIN] URL:',process.env.EXPO_PUBLIC_SUPABASE_URL);
    console.log('[NEXORA LOGIN] Email:',cleanEmail);
    console.log('[NEXORA LOGIN] Password length:',loginPassword.length);
  }
  const{data,error}=await withTimeout(supabase.auth.signInWithPassword({email:cleanEmail,password:loginPassword}),'Request timed out. Check your internet connection.');
  if (__DEV__) {
    console.log('[NEXORA LOGIN] Session:',!!data?.session);
    console.log('[NEXORA LOGIN] User:',data?.user?.email||'none');
    console.log('[NEXORA LOGIN] Error:',error?.message||'none');
  }
  if(error)throw error;
  setLoginIndex(4);
  setTimeout(()=>{
  setScreen('main');
  setLoading(false);
  navigatingRef.current=false;
  },1800);
  }catch(error:any){
  console.log('[NEXORA LOGIN ERROR]',error?.message,error);
  setLoginError(true);
  setAuthError(error?.message||'Invalid email or password');
  setLoading(false);
  navigatingRef.current=false;
  }
  };

  const handleLogout=async()=>{
    await supabase.auth.signOut();
    setInfoMessage('');
    setScreen('login');
    setLoginIndex(0);
    setLoginEmail('');
    setLoginPassword('');
  };
  const sendChatMessage = async (textOverride?: string, imageUrl?: string) => {
    const text = (textOverride ?? chatInput).trim();
    if (!text && !imageUrl) return;
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setShowAttachMenu(false);
    setAiThinking(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await withTimeout(
        fetch(`${SUPABASE_FUNCTIONS_URL}/ai-chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${session?.access_token ?? SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ message: text || 'Describe this image.', imageUrl }),
        }),
        'The AI took too long to respond. Please try again.'
      );
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'The AI could not process that request.');
      }
      setChatMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        text: result.reply || "I didn't get a usable reply — please try again.",
      }]);
    } catch (error: any) {
      if (__DEV__) console.log('[NEXORA CHAT ERROR]', error?.message, error);
      setChatMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        text: error?.message || "I'm having trouble connecting right now — please try again shortly.",
      }]);
    } finally {
      setAiThinking(false);
    }
  };

  useEffect(() => {
    if (chatMessages.length > 0) {
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }, [chatMessages, aiThinking]);
  const uploadImageAsync = async (uri: string): Promise<{ url: string | null; error?: string }> => {
    try {
      const fileName = `chat/${Date.now()}.jpg`;
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token ?? SUPABASE_ANON_KEY;

      // FIX: FileSystem.uploadAsync streams the file straight from disk to
      // the network on the native side — the JS thread never holds the raw
      // bytes as a string. The old base64-read + decode() path pulled the
      // whole image into a giant JS string, then a second full copy as an
      // ArrayBuffer, entirely on the JS thread — exactly the kind of
      // synchronous, memory-heavy work whose crash risk depends on GC
      // timing and device load, which is why it wasn't 100% reproducible.
      const uploadResult = await FileSystem.uploadAsync(
        `${SUPABASE_URL}/storage/v1/object/chat-uploads/${fileName}`,
        uri,
        {
          httpMethod: 'POST',
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: {
            'Content-Type': 'image/jpeg',
            'Authorization': `Bearer ${accessToken}`,
            'apikey': SUPABASE_ANON_KEY,
          },
        }
      );

      if (uploadResult.status < 200 || uploadResult.status >= 300) {
        throw new Error(`Upload failed (HTTP ${uploadResult.status}): ${uploadResult.body?.slice(0, 200)}`);
      }

      // Bucket is public, so a plain public URL works and avoids the
      // extra signing step (and its 600s expiry) entirely.
      const { data } = supabase.storage.from('chat-uploads').getPublicUrl(fileName);
      if (!data?.publicUrl) throw new Error('Could not generate a public URL for the uploaded image.');

      return { url: data.publicUrl };
    } catch (error: any) {
      if (__DEV__) console.log('[NEXORA UPLOAD ERROR]', error?.message);
      return { url: null, error: error?.message || 'Image upload failed.' };
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'text/csv',
          'text/plain',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return null;
      return result.assets[0];
    } catch (error: any) {
      if (__DEV__) console.log('[NEXORA DOCUMENT PICKER ERROR]', error?.message, error);
      return null;
    }
  };
  const handleAttachOption = async (option: string) => {
    setShowAttachMenu(false);
    if (option === 'Train Your AI') { setScreen('knowledgeHealth'); return; }

    if (option === 'Add Files') {
      const file = await pickDocument();
      if (!file) return;
      setChatMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text: `📎 ${file.name}` }]);
      setAiThinking(true);
      setTimeout(() => {
        setChatMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'ai',
          text: `Got "${file.name}" — file analysis isn't wired up to the AI yet, but the file is captured and ready for when that's connected.`,
        }]);
        setAiThinking(false);
      }, 900);
      return;
    }

    try {
      if (option === 'Camera' || option === 'Photo Library') {
        if (Platform.OS === 'web') {
          setChatMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: 'ai',
            text: `${option} isn\u2019t available on web — try this on your phone.`,
          }]);
          return;
        }

        const permission = option === 'Camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (permission.status !== 'granted') {
          setChatMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: 'ai',
            text: `${option} access was denied. You can enable it from your phone\u2019s Settings to attach photos.`,
          }]);
          return;
        }

        const result = option === 'Camera'
          ? await ImagePicker.launchCameraAsync({ quality: 0.2, exif: false, allowsEditing: false, mediaTypes: ['images'] })
          : await ImagePicker.launchImageLibraryAsync({ quality: 0.2, exif: false, allowsEditing: false, mediaTypes: ['images'] });

        if (result.canceled || !result.assets?.[0]?.uri) return;

        // Resize before anything downstream touches this file. The picker's
        // quality:0.2 setting only affects JPEG compression, not pixel
        // dimensions — a modern phone camera still hands back a
        // multi-thousand-pixel-wide bitmap regardless. Re-enabled now that
        // the actual crash cause (a corrupted expo-image install, not
        // ImageManipulator) has been fixed and confirmed clean by
        // `expo-doctor`. If reload/crash issues ever reappear specifically
        // on this step, that's the signal to revisit this — but there's no
        // remaining reason to suspect it right now.
        let localUri = result.assets[0].uri;
        try {
          const resized = await ImageManipulator.manipulateAsync(
            localUri,
            [{ resize: { width: 1024 } }],
            { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
          );
          localUri = resized.uri;
        } catch (resizeError: any) {
          if (__DEV__) console.log('[NEXORA RESIZE ERROR]', resizeError?.message, resizeError);
          // fall through and upload the original if resizing itself fails —
          // better to send a large image than fail the whole attach
        }

        setChatMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text: '', imageUri: localUri }]);
        setAiThinking(true);

        const { url: remoteUrl, error: uploadErrMsg } = await uploadImageAsync(localUri);

        if (!remoteUrl) {
          setChatMessages(prev => [...prev, {
            id: (Date.now() + 1).toString(),
            role: 'ai',
            text: `Got your photo, but the upload failed (${uploadErrMsg || 'unknown error'}) — it's still visible here, but wasn't saved to your account.`,
          }]);
          setAiThinking(false);
          return;
        }

        setAiThinking(false);
        await sendChatMessage('What do you see in this image?', remoteUrl);

        // Clean up the resized copy now that it's uploaded — it's still
        // referenced in chatMessages via imageUri for the bubble preview,
        // but expo-image already cached that preview in step "3" above via
        // cachePolicy="memory-disk", so deleting the source file here
        // doesn't affect what's shown on screen. Best-effort: failing to
        // delete a temp file isn't worth surfacing to the user.
        FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => {});
        return;
      }

      setChatMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'ai',
        text: `${option} isn't connected yet — this is coming soon.`,
      }]);
    } catch (error: any) {
      if (__DEV__) console.log('[NEXORA ATTACH ERROR]', error?.message, error);
      setAiThinking(false);
      setChatMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'ai',
        text: 'Something went wrong attaching that — please try again.',
      }]);
    }
  };

  const openKnowledgeList = (cat: KnowledgeCategory) => {
    setActiveCategory(cat);
    setListStatusFilter('All');
    setScreen('knowledgeList');
  };

  const openItemDetail = (cat: KnowledgeCategory, id: string) => {
    setActiveCategory(cat);
    setActiveItemId(id);
    setScreen('itemDetail');
  };

  const openItemEdit = () => {
    const item = KNOWLEDGE_DATA[activeCategory].items.find(i => i.id === activeItemId);
    setEditDraft(item ? item.fields.map(f => ({ ...f })) : []);
    setScreen('itemEdit');
  };

  const openAddKnowledge = () => {
    setAddKnowledgeStep('choose');
    setScreen('addKnowledge');
  };

  const runKnowledgeProcessing = () => {
    setAddKnowledgeStep('processing');
    setTimeout(() => setAddKnowledgeStep('summary'), 1800);
  };

  const handleCommandCenterPress = (label: string) => {
    if (label === 'Train AI') { setScreen('knowledgeHealth'); return; }
    if (label === 'Policies') { openKnowledgeList('policies'); return; }
    if (label === 'FAQs') { openKnowledgeList('faqs'); return; }
    setMainTab('brain');
    sendChatMessage(`Help me with: ${label}`);
  };
  const handleForgotPassword=()=>{setAuthError('');setResetError('');setInfoMessage('');setResetEmail(loginEmail.trim().toLowerCase());setResetOtp('');setResetOtpDigits(['','','','']);setResetOtpTimer(60);setResetToken('');setResetPassword('');setResetConfirmPassword('');setResetStep('email');setScreen('forgotPassword');};

  // masks an email for display, e.g. "jo***@gmail.com"
  const maskEmail=(value:string)=>{
    const[local,domain]=value.split('@');
    if(!local||!domain)return value;
    const visible=local.slice(0,2);
    return `${visible}${'*'.repeat(Math.max(local.length-2,3))}@${domain}`;
  };

  // digit typed into one of the 4 OTP boxes: stores it, keeps the
  // combined `resetOtp` string in sync (handleVerifyResetOtp already
  // reads from that), and auto-advances focus to the next box
  const handleOtpDigitChange=(index:number,value:string)=>{
    const digit=value.replace(/\D/g,'').slice(-1);
    const next=[...resetOtpDigits];
    next[index]=digit;
    setResetOtpDigits(next);
    setResetError('');
    setResetOtp(next.join(''));
    if(digit&&index<3)otpRefs.current[index+1]?.focus();
  };

  // backspace on an empty box jumps focus back to the previous box
  const handleOtpKeyPress=(index:number,e:any)=>{
    if(e.nativeEvent.key==='Backspace'&&!resetOtpDigits[index]&&index>0){
      otpRefs.current[index-1]?.focus();
    }
  };

  const handleResendOtp=()=>{
    if(resetOtpTimer>0||loading)return;
    setResetOtpDigits(['','','','']);
    setResetOtp('');
    handleSendResetOtp();
  };

  const handleSendResetOtp=async()=>{const cleanEmail=resetEmail.trim().toLowerCase();if(!cleanEmail||!EMAIL_REGEX.test(cleanEmail)){setResetError('Please enter a valid email address.');return}setResetError('');setInfoMessage('');setLoading(true);try{const response=await withTimeout(fetch(`${SUPABASE_FUNCTIONS_URL}/request-password-reset`,{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_ANON_KEY},body:JSON.stringify({email:cleanEmail})}),'Request timed out. Check your internet connection.');const result=await response.json();if(!response.ok||!result.success)throw new Error(result.message||'Unable to send verification code.');setResetEmail(cleanEmail);setResetOtpDigits(['','','','']);setResetOtp('');setResetOtpTimer(60);setResetStep('otp');setInfoMessage('A 4-digit verification code has been sent to your email.');}catch(error:any){setResetError(error?.message||'Unable to send verification code.');}finally{setLoading(false)}};

  const handleVerifyResetOtp=async()=>{const cleanEmail=resetEmail.trim().toLowerCase();const cleanOtp=resetOtp.trim();if(!/^\d{4}$/.test(cleanOtp)){setResetError('Enter the 4-digit verification code.');return}setResetError('');setInfoMessage('');setLoading(true);try{const response=await withTimeout(fetch(`${SUPABASE_FUNCTIONS_URL}/verify-otp`,{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_ANON_KEY},body:JSON.stringify({email:cleanEmail,otp:cleanOtp})}),'Request timed out. Check your internet connection.');const result=await response.json();if(!response.ok||!result.success)throw new Error(result.message||'Invalid or expired verification code.');if(!result.resetToken)throw new Error('Verification succeeded but no reset token was returned.');setResetToken(result.resetToken);setResetStep('password');setInfoMessage('Code verified. Create your new password.');}catch(error:any){setResetError(error?.message||'Invalid or expired verification code.');}finally{setLoading(false)}};

  const handleUpdateResetPassword=async()=>{
    if(!resetToken){setResetError('Your verification session has expired. Please request a new code.');return}
    if(!resetPassword||resetPassword.length<8){setResetError('Password must be at least 8 characters.');return}
    if(resetPassword!==resetConfirmPassword){setResetError('Passwords do not match.');return}
    setResetError('');setInfoMessage('');setLoading(true);
    try{
      if(__DEV__)console.log('[NEXORA RESET] URL:',`${SUPABASE_FUNCTIONS_URL}/reset-password`,'| Email:',resetEmail.trim().toLowerCase(),'| Token exists:',!!resetToken,'| Token length:',resetToken.length,'| Password length:',resetPassword.length);
      const response=await withTimeout(fetch(`${SUPABASE_FUNCTIONS_URL}/reset-password`,{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_ANON_KEY},body:JSON.stringify({email:resetEmail.trim().toLowerCase(),resetToken,newPassword:resetPassword})}),'Request timed out. Check your internet connection.');
      const responseText=await response.text();
      if(__DEV__)console.log('[NEXORA RESET] HTTP status:',response.status,'| Raw response:',responseText);
      let result:any={};try{result=JSON.parse(responseText)}catch{result={message:responseText}}
      if(__DEV__)console.log('[NEXORA RESET] Parsed response:',result);
      if(!response.ok||!result.success)throw new Error(result.message||result.error||`Password reset failed (HTTP ${response.status}).`);
      setResetToken('');setResetOtp('');setResetOtpDigits(['','','','']);setResetPassword('');setResetConfirmPassword('');setResetError('');setInfoMessage('');setLoginEmail(resetEmail.trim().toLowerCase());setLoginPassword('');setResetStep('success')
    }catch(error:any){
      if(__DEV__)console.log('[NEXORA RESET ERROR]',error?.message,error);
      setResetError(error?.message||'Unable to reset password. Please try again.')
    }finally{setLoading(false)}
  };

  const handleButtonPressIn=()=>{
    Animated.parallel([
      Animated.spring(buttonScale,{toValue:.96,friction:6,tension:180,useNativeDriver:true}),
      Animated.timing(buttonOpacity,{toValue:.82,duration:80,useNativeDriver:true})
    ]).start();
  };

  const handleButtonPressOut=()=>{
    Animated.parallel([
      Animated.spring(buttonScale,{toValue:1,friction:5,tension:180,useNativeDriver:true}),
      Animated.timing(buttonOpacity,{toValue:1,duration:100,useNativeDriver:true})
    ]).start();
  };

  const panResponder=useRef(PanResponder.create({
    onMoveShouldSetPanResponder:(_,g)=>Math.abs(g.dx)>12&&Math.abs(g.dx)>Math.abs(g.dy),
    onPanResponderRelease:(_,g)=>{
      if(navigatingRef.current)return;
      const t=55;
      if(g.dx<-t){
        if(onboardingIndexRef.current<3){
          navigatingRef.current=true;
          setTimeout(()=>{setOnboardingIndex(v=>v+1);navigatingRef.current=false},120);
        }else{
          navigatingRef.current=true;
          setScreen('signup');
          setTimeout(()=>{navigatingRef.current=false},150);
        }
      }else if(g.dx>t&&onboardingIndexRef.current>0){
        setOnboardingIndex(v=>v-1);
      }
    }
  })).current;

  const signupPanResponder=useRef(PanResponder.create({
    onMoveShouldSetPanResponder:(_,g)=>Math.abs(g.dx)>25&&Math.abs(g.dx)>Math.abs(g.dy),
    onPanResponderRelease:(_,g)=>{
      if(navigatingRef.current)return;
      const t=70;
      if(g.dx<-t){
        if(signupIndexRef.current<7){
          navigatingRef.current=true;
          setTimeout(()=>{setSignupIndex(v=>v+1);navigatingRef.current=false},120);
        }
      }else if(g.dx>t){
        if(signupIndexRef.current>0)setSignupIndex(v=>v-1);
        else backToOnboarding();
      }
    }
  })).current;

  const loginPanResponder=useRef(PanResponder.create({
    onMoveShouldSetPanResponder:(_,g)=>Math.abs(g.dx)>25&&Math.abs(g.dx)>Math.abs(g.dy),
    onPanResponderRelease:(_,g)=>{
      if(navigatingRef.current)return;
      const t=70;
      if(g.dx<-t){
        if(loginIndexRef.current<4){
          navigatingRef.current=true;
          setTimeout(()=>{setLoginIndex(v=>v+1);navigatingRef.current=false},120);
        }
      }else if(g.dx>t){
        if(loginIndexRef.current>0)setLoginIndex(v=>v-1);
        else backToSignup();
      }
    }
  })).current;

  const SVG_VIEWBOX=`0 0 ${FIGMA_WIDTH} ${FIGMA_HEIGHT}`;

  const renderOnboardingSVG=()=>{
    switch(onboardingIndex){
      case 0:return<Onboarding1SVG width={width} height={scaledHeight} viewBox={SVG_VIEWBOX} preserveAspectRatio="xMidYMid meet"/>;
      case 1:return<Onboarding2SVG width={width} height={scaledHeight} viewBox={SVG_VIEWBOX} preserveAspectRatio="xMidYMid meet"/>;
      case 2:return<Onboarding3SVG width={width} height={scaledHeight} viewBox={SVG_VIEWBOX} preserveAspectRatio="xMidYMid meet"/>;
      case 3:return<Onboarding4SVG width={width} height={scaledHeight} viewBox={SVG_VIEWBOX} preserveAspectRatio="xMidYMid meet"/>;
      default:return<Onboarding1SVG width={width} height={scaledHeight} viewBox={SVG_VIEWBOX} preserveAspectRatio="xMidYMid meet"/>;
    }
  };

  const renderSignupSVG=()=>{
    switch(signupIndex){
      case 0:return<SignUpSVG width={width} height={scaledHeight} viewBox={SVG_VIEWBOX} preserveAspectRatio="xMidYMid meet"/>;
      case 1:return<InputDetails1SVG width={width} height={scaledHeight} viewBox={SVG_VIEWBOX} preserveAspectRatio="xMidYMid meet"/>;
      case 2:return<InputDetails2SVG width={width} height={scaledHeight} viewBox={SVG_VIEWBOX} preserveAspectRatio="xMidYMid meet"/>;
      case 3:return<WrongEmailSVG width={width} height={scaledHeight} viewBox={SVG_VIEWBOX} preserveAspectRatio="xMidYMid meet"/>;
      case 4:return<TermsAgreedSVG width={width} height={scaledHeight} viewBox={SVG_VIEWBOX} preserveAspectRatio="xMidYMid meet"/>;
      case 5:return<LoadPageSVG width={width} height={scaledHeight} viewBox={SVG_VIEWBOX} preserveAspectRatio="xMidYMid meet"/>;
      case 6:return<TermOfUseSVG width={width} height={scaledHeight} viewBox={SVG_VIEWBOX} preserveAspectRatio="xMidYMid meet"/>;
      case 7:return<PrivacyPolicySVG width={width} height={scaledHeight} viewBox={SVG_VIEWBOX} preserveAspectRatio="xMidYMid meet"/>;
      default:return<SignUpSVG width={width} height={scaledHeight} viewBox={SVG_VIEWBOX} preserveAspectRatio="xMidYMid meet"/>;
    }
  };

  const renderLoginSVG=()=>{
    switch(loginIndex){
      case 0:return<LogInSVG width={width} height={scaledHeight} viewBox={SVG_VIEWBOX} preserveAspectRatio="xMidYMid meet"/>;
      case 1:return<LoginInputEmailSVG width={width} height={scaledHeight} viewBox={SVG_VIEWBOX} preserveAspectRatio="xMidYMid meet"/>;
      case 2:return<LoginInputDetailsSVG width={width} height={scaledHeight} viewBox={SVG_VIEWBOX} preserveAspectRatio="xMidYMid meet"/>;
      case 3:return<LoginKeepLoggedIn1SVG width={width} height={scaledHeight} viewBox={SVG_VIEWBOX} preserveAspectRatio="xMidYMid meet"/>;
      case 4:return<LoginKeepLoggedIn2SVG width={width} height={scaledHeight} viewBox={SVG_VIEWBOX} preserveAspectRatio="xMidYMid meet"/>;
      default:return<LogInSVG width={width} height={scaledHeight} viewBox={SVG_VIEWBOX} preserveAspectRatio="xMidYMid meet"/>;
    }
  };

  if(screen==='launch'){
    return(
      <View style={styles.fullScreen} onLayout={onRootLayout}>
        <StatusBar hidden/>
        <Animated.View style={[styles.svgFrame,{width,height:Math.max(height,scaledHeight),opacity:launchOpacity}]}>
          <LaunchSVG width={width} height={scaledHeight} viewBox={SVG_VIEWBOX} preserveAspectRatio="xMidYMid meet"/>
        </Animated.View>
      </View>
    );
  }

  if (screen === 'main') {
    const renderTopBar = () => (
      <View style={styles.topBar}>
        <Ionicons name="menu-outline" size={26} color="#0B1220" />
        <View style={styles.topBarTitleWrap}>
          <Text style={styles.topBarTitle}>Nexora AI</Text>
          <Text style={styles.topBarSubtitle}>AI Business Manager</Text>
        </View>
        <View style={styles.topBarRight}>
          <View style={styles.bellWrap}>
            <Ionicons name="notifications-outline" size={22} color="#0B1220" />
            <View style={styles.bellDot} />
          </View>
          <Ionicons name="person-circle" size={32} color="#5C6B7A" />
        </View>
      </View>
    );

    const renderBottomNav = () => (
      <View style={styles.bottomNav}>
        <Pressable onPress={() => setMainTab('home')} style={[styles.navItem, mainTab === 'home' && styles.navItemActive]}>
          <Ionicons name="home-outline" size={20} color={mainTab === 'home' ? '#0B1220' : '#8A97A6'} />
        </Pressable>
        <Pressable style={styles.navItem}>
          <Ionicons name="create-outline" size={20} color="#8A97A6" />
        </Pressable>
        <Pressable onPress={() => setMainTab('brain')} style={[styles.navItem, styles.navBrainItem, mainTab === 'brain' && styles.navBrainItemActive]}>
          <Ionicons name="sparkles" size={18} color="#0B1220" />
          <Text style={styles.navBrainText}>Brain</Text>
        </Pressable>
        <Pressable style={styles.navItem}>
          <Ionicons name="storefront-outline" size={20} color="#8A97A6" />
        </Pressable>
        <Pressable onPress={() => setMainTab('profile')} style={[styles.navItem, mainTab === 'profile' && styles.navItemActive]}>
          <Ionicons name="person-outline" size={20} color={mainTab === 'profile' ? '#0B1220' : '#8A97A6'} />
        </Pressable>
      </View>
    );

    if (mainTab === 'profile') {
      return (
        <View style={styles.mainScreen}>
          <StatusBar style="dark" />
          {renderTopBar()}
          <View style={styles.mainContent}>
            <Text style={styles.welcomeText}>Welcome{fullName ? `, ${fullName}` : ''}</Text>
            <Pressable onPress={handleLogout} style={styles.logoutButton}>
              <Text style={styles.logoutText}>Log out</Text>
            </Pressable>
            <Pressable
              onPress={() => { setBrainGalleryIndex(0); setScreen('brainGallery'); }}
              style={[styles.resetButton, styles.resetButtonEnabled, { marginTop: 16, width: '80%' }]}>
              <Text style={styles.resetButtonText}>View All Screens (30)</Text>
            </Pressable>
          </View>
          {renderBottomNav()}
        </View>
      );
    }

    if (mainTab === 'brain') {
      return (
        <View style={styles.mainScreen}>
          <StatusBar style="dark" />
          {renderTopBar()}

          <ScrollView ref={chatScrollRef} style={styles.chatScroll} contentContainerStyle={styles.chatScrollContent}>
            {chatMessages.length === 0 ? (
              <>
                <View style={styles.brainHero}>
                  <Ionicons name="hardware-chip-outline" size={72} color="#1E56A0" />
                  <Text style={styles.brainHeroTitle}>Hi, {fullName || 'there'}</Text>
                  <Text style={styles.brainHeroSubtitle}>What would you like to do today?</Text>
                </View>
                <Text style={styles.popularLabel}>Popular Questions</Text>
                {popularQuestions.map(q => (
                  <Pressable key={q} onPress={() => sendChatMessage(q)} style={styles.popularItem}>
                    <Ionicons name="search-outline" size={16} color="#5C6B7A" />
                    <Text style={styles.popularItemText}>{q}</Text>
                    <Ionicons name="chevron-forward" size={16} color="#8A97A6" />
                  </Pressable>
                ))}
              </>
            ) : (
              chatMessages.map(m => (
                <View key={m.id} style={[styles.bubbleRow, m.role === 'user' ? styles.bubbleRowUser : styles.bubbleRowAi]}>
                  <View style={[styles.bubble, m.role === 'user' ? styles.bubbleUser : styles.bubbleAi]}>
                    {m.imageUri && (
                      <ExpoImage
                        source={{ uri: m.imageUri }}
                        style={styles.bubbleImage}
                        contentFit="cover"
                        // FIX: expo-image decodes at (roughly) the rendered
                        // size using native downsampling, rather than
                        // decoding the full-resolution camera bitmap into
                        // memory before scaling it down. That full-res
                        // decode inside RN's core <Image> is what was
                        // triggering a native OOM crash — happening before
                        // any JS code (including the resize step) even ran,
                        // which is why removing resize didn't help and the
                        // preview itself stopped appearing.
                        cachePolicy="memory-disk"
                      />
                    )}

                    {!!m.text && (
                      <Text style={[styles.bubbleText, m.role === 'user' && styles.bubbleTextUser, m.imageUri ? { marginTop: 8 } : null]}>
                        {m.text}
                      </Text>
                    )}
                  </View>
                </View>
              ))
            )}
            {aiThinking && (
              <View style={[styles.bubbleRow, styles.bubbleRowAi]}>
                <View style={[styles.bubble, styles.bubbleAi]}>
                  <Text style={styles.bubbleText}>Thinking…</Text>
                </View>
              </View>
            )}
          </ScrollView>

          {showAttachMenu && (
            <View style={styles.attachMenu}>
              {[
                { icon: 'camera-outline', label: 'Camera' },
                { icon: 'image-outline', label: 'Photo Library' },
                { icon: 'document-attach-outline', label: 'Add Files' },
                { icon: 'extension-puzzle-outline', label: 'Connect Apps' },
                { icon: 'hardware-chip-outline', label: 'Train Your AI' },
              ].map(opt => (
                <Pressable key={opt.label} onPress={() => handleAttachOption(opt.label)} style={styles.attachOption}>
                  <Ionicons name={opt.icon as any} size={18} color="#0B1220" />
                  <Text style={styles.attachOptionText}>{opt.label}</Text>
                </Pressable>
              ))}
            </View>
          )}

          <View style={styles.chatInputBar}>
            <Pressable onPress={() => setShowAttachMenu(v => !v)} hitSlop={8}>
              <Ionicons name="add" size={22} color="#0B1220" />
            </Pressable>

            {isRecording ? (
              <>
                <View style={styles.waveformRow}>
                  {[6, 14, 9, 18, 7, 15, 10].map((h, i) => (
                    <View key={i} style={[styles.waveformBar, { height: h }]} />
                  ))}
                </View>
                <Pressable onPress={() => setIsRecording(false)} hitSlop={8} style={styles.stopButton}>
                  <Ionicons name="stop" size={14} color="#FFF" />
                </Pressable>
              </>
            ) : (
              <>
                <TextInput
                  value={chatInput}
                  onChangeText={setChatInput}
                  placeholder="Ask Nexora about your business…"
                  placeholderTextColor="#8A97A6"
                  style={styles.chatTextInput}
                />
                <Pressable onPress={() => setIsRecording(true)} hitSlop={8}>
                  <Ionicons name="mic-outline" size={20} color="#5C6B7A" />
                </Pressable>
              </>
            )}

            <Pressable
              disabled={!chatInput.trim()}
              onPress={() => sendChatMessage()}
              style={[styles.chatSendButton, { backgroundColor: chatInput.trim() ? '#1E56A0' : '#94A3BB' }]}>
              <Ionicons name="arrow-up" size={16} color="#FFF" />
            </Pressable>
          </View>

          {renderBottomNav()}
        </View>
      );
    }

    // mainTab === 'home'
    return (
      <View style={styles.mainScreen}>
        <StatusBar style="dark" />
        {renderTopBar()}

        <ScrollView style={styles.homeScroll} contentContainerStyle={styles.homeScrollContent}>
          <Pressable onPress={() => setMainTab('brain')} style={styles.homeSearchBar}>
            <Ionicons name="search-outline" size={16} color="#8A97A6" />
            <Text style={styles.homeSearchPlaceholder}>Ask Nexora about your business…</Text>
          </Pressable>

          <View style={styles.insightCard}>
            <View style={styles.insightTagRow}>
              <Ionicons name="sparkles-outline" size={14} color="#1E9E6D" />
              <Text style={styles.insightTag}>NEXORA RECOMMENDS</Text>
            </View>
            <Text style={styles.insightTitle}>Your sales dropped 8% this week</Text>
            <Text style={styles.insightDescription}>Consider promoting your top 3 products to boost sales</Text>
            <View style={styles.insightBottomRow}>
              <Pressable onPress={() => setMainTab('brain')}>
                <Text style={styles.insightLink}>View recommendations ›</Text>
              </Pressable>
              <View style={styles.miniChart}>
                {[10, 18, 8, 22, 14].map((h, i) => (
                  <View key={i} style={[styles.miniChartBar, { height: h }]} />
                ))}
              </View>
            </View>
          </View>

          <Text style={styles.sectionLabel}>AI Command Center</Text>
          <View style={styles.commandGrid}>
            {(commandExpanded ? [
              { icon: 'school-outline', label: 'Train AI' },
              { icon: 'apps-outline', label: 'Connect Apps' },
              { icon: 'create-outline', label: 'Create Post' },
              { icon: 'people-outline', label: 'AI Employees' },
              { icon: 'document-text-outline', label: 'Policies' },
              { icon: 'mail-outline', label: 'Inbox' },
              { icon: 'calendar-outline', label: 'Schedule' },
              { icon: 'help-circle-outline', label: 'FAQs' },
            ] : [
              { icon: 'school-outline', label: 'Train AI' },
              { icon: 'apps-outline', label: 'Connect Apps' },
              { icon: 'create-outline', label: 'Create Post' },
            ]).map(item => (
              <Pressable key={item.label} onPress={() => handleCommandCenterPress(item.label)} style={styles.commandItem}>
                <View style={styles.commandIconCircle}>
                  <Ionicons name={item.icon as any} size={20} color="#1E56A0" />
                </View>
                <Text style={styles.commandLabel}>{item.label}</Text>
              </Pressable>
            ))}
            {!commandExpanded && (
              <Pressable onPress={() => setCommandExpanded(true)} style={styles.commandItem}>
                <View style={styles.commandIconCircle}>
                  <Ionicons name="ellipsis-horizontal" size={20} color="#1E56A0" />
                </View>
                <Text style={styles.commandLabel}>More</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>Need Your Attention</Text>
            <Text style={styles.sectionViewAll}>View all</Text>
          </View>

          <View style={styles.attentionItem}>
            <Ionicons name="alert-circle-outline" size={20} color="#E5A63A" />
            <View style={styles.attentionTextWrap}>
              <Text style={styles.attentionTitle}>Images required for 5 items</Text>
              <Text style={styles.attentionSubtitle}>Add images to improve products discovery</Text>
            </View>
            <Pressable
              onPress={() => { setMainTab('brain'); sendChatMessage('Which 5 items need images?'); }}
              style={styles.attentionButton}>
              <Text style={styles.attentionButtonText}>Fix now</Text>
            </Pressable>
          </View>

          <View style={styles.attentionItem}>
            <Ionicons name="cube-outline" size={20} color="#D32F2F" />
            <View style={styles.attentionTextWrap}>
              <Text style={styles.attentionTitle}>8 Orders hasn't shipped</Text>
              <Text style={styles.attentionSubtitle}>Some orders are pending shipment</Text>
            </View>
            <Pressable
              onPress={() => { setMainTab('brain'); sendChatMessage('Show me the 8 orders that haven\'t shipped'); }}
              style={styles.attentionButton}>
              <Text style={styles.attentionButtonText}>Review orders</Text>
            </Pressable>
          </View>

          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>Business Overview</Text>
            <View style={styles.monthChip}>
              <Text style={styles.monthChipText}>This month</Text>
              <Ionicons name="chevron-down" size={14} color="#5C6B7A" />
            </View>
          </View>
        </ScrollView>

        {renderBottomNav()}
      </View>
    );
  }

  if (screen === 'knowledgeHealth') {
    const cat = KNOWLEDGE_DATA;
    return (
      <View style={styles.mainScreen}>
        <StatusBar style="dark" />
        <View style={styles.knowledgeHeader}>
          <Pressable onPress={() => setScreen('main')} hitSlop={8}><Ionicons name="chevron-back" size={24} color="#0B1220" /></Pressable>
          <Text style={styles.knowledgeHeaderTitle}>Knowledge Health</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView style={styles.homeScroll} contentContainerStyle={styles.homeScrollContent}>
          <View style={styles.gaugeCard}>
            <Text style={styles.sectionLabel}>Knowledge Health</Text>
            <View style={styles.gaugeCircle}>
              <Text style={styles.gaugePercent}>80%</Text>
              <Text style={styles.gaugeLabel}>Healthy</Text>
            </View>
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Ionicons name="document-text-outline" size={16} color="#1E56A0" />
                <Text style={styles.statValue}>1,223</Text>
                <Text style={styles.statLabel}>Documents</Text>
              </View>
              <View style={styles.statBox}>
                <Ionicons name="server-outline" size={16} color="#7C3AED" />
                <Text style={styles.statValue}>13.34 GB</Text>
                <Text style={styles.statLabel}>Storage</Text>
              </View>
            </View>
          </View>

          <Text style={styles.sectionLabel}>Knowledge Categories</Text>
          <View style={styles.commandGrid}>
            {(Object.keys(cat) as KnowledgeCategory[]).map(key => (
              <Pressable key={key} onPress={() => openKnowledgeList(key)} style={styles.commandItem}>
                <View style={styles.commandIconCircle}>
                  <Ionicons name={cat[key].icon as any} size={20} color="#1E56A0" />
                </View>
                <Text style={styles.commandLabel}>{cat[key].title}</Text>
                <Text style={styles.commandCount}>{cat[key].items.length}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>Need Your Attention</Text>
            <Text style={styles.sectionViewAll}>View all</Text>
          </View>
          <View style={styles.attentionItem}>
            <Ionicons name="alert-circle-outline" size={20} color="#E5A63A" />
            <View style={styles.attentionTextWrap}>
              <Text style={styles.attentionTitle}>Images required for 5 items</Text>
              <Text style={styles.attentionSubtitle}>Add images to improve products discovery</Text>
            </View>
            <Pressable onPress={openAddKnowledge} style={styles.attentionButton}>
              <Text style={styles.attentionButtonText}>Fix now</Text>
            </Pressable>
          </View>
        </ScrollView>
        <View style={styles.bottomNav}>
          <Pressable onPress={() => { setMainTab('home'); setScreen('main'); }} style={styles.navItem}><Ionicons name="home-outline" size={20} color="#8A97A6" /></Pressable>
          <Pressable style={styles.navItem}><Ionicons name="create-outline" size={20} color="#8A97A6" /></Pressable>
          <Pressable onPress={() => { setMainTab('brain'); setScreen('main'); }} style={[styles.navItem, styles.navBrainItem]}><Ionicons name="sparkles" size={18} color="#0B1220" /><Text style={styles.navBrainText}>Brain</Text></Pressable>
          <Pressable style={styles.navItem}><Ionicons name="storefront-outline" size={20} color="#8A97A6" /></Pressable>
          <Pressable onPress={() => { setMainTab('profile'); setScreen('main'); }} style={styles.navItem}><Ionicons name="person-outline" size={20} color="#8A97A6" /></Pressable>
        </View>
      </View>
    );
  }

  if (screen === 'knowledgeList') {
    const data = KNOWLEDGE_DATA[activeCategory];
    const verified = data.items.filter(i => i.status === 'Verified').length;
    const filtered = data.items.filter(i =>
      listStatusFilter === 'All' ? true :
      listStatusFilter === 'Drafts' ? i.status === 'Draft' :
      i.status === listStatusFilter
    );
    return (
      <View style={styles.mainScreen}>
        <StatusBar style="dark" />
        <View style={styles.knowledgeHeader}>
          <Pressable onPress={() => setScreen('knowledgeHealth')} hitSlop={8}><Ionicons name="chevron-back" size={24} color="#0B1220" /></Pressable>
          <Text style={styles.knowledgeHeaderTitle}>{data.title}</Text>
          <Pressable onPress={openAddKnowledge}><Text style={styles.knowledgeHeaderAction}>+ Add</Text></Pressable>
        </View>
        <ScrollView style={styles.homeScroll} contentContainerStyle={styles.homeScrollContent}>
          <Text style={styles.listCountTitle}>{data.items.length} {data.title}</Text>
          <Text style={styles.listCountSubtitle}>{verified} verified  ·  {data.items.length - verified} drafts</Text>
          <View style={styles.searchBarPlain}>
            <Ionicons name="search-outline" size={16} color="#8A97A6" />
            <Text style={styles.homeSearchPlaceholder}>Search {data.title}...</Text>
          </View>
          <View style={styles.filterRow}>
            {(['All', 'Verified', 'Drafts', 'Need review'] as const).map(f => (
              <Pressable key={f} onPress={() => setListStatusFilter(f)} style={[styles.filterChip, listStatusFilter === f && styles.filterChipActive]}>
                <Text style={[styles.filterChipText, listStatusFilter === f && styles.filterChipTextActive]}>{f}</Text>
              </Pressable>
            ))}
          </View>
          {filtered.map(item => (
            <Pressable key={item.id} onPress={() => openItemDetail(activeCategory, item.id)} style={styles.knowledgeRow}>
              <View style={[styles.knowledgeRowIcon, { backgroundColor: item.iconBg }]}>
                <Ionicons name={item.icon as any} size={20} color={item.iconColor} />
              </View>
              <View style={styles.attentionTextWrap}>
                <Text style={styles.attentionTitle}>{item.name}</Text>
                <Text style={styles.attentionSubtitle}>{item.subtitle}</Text>
              </View>
              <View style={[styles.statusPill, item.status !== 'Verified' && styles.statusPillWarn]}>
                <Text style={[styles.statusPillText, item.status !== 'Verified' && styles.statusPillTextWarn]}>{item.status}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
        <View style={styles.bottomNav}>
          <Pressable onPress={() => { setMainTab('home'); setScreen('main'); }} style={styles.navItem}><Ionicons name="home-outline" size={20} color="#8A97A6" /></Pressable>
          <Pressable style={styles.navItem}><Ionicons name="create-outline" size={20} color="#8A97A6" /></Pressable>
          <Pressable onPress={() => { setMainTab('brain'); setScreen('main'); }} style={[styles.navItem, styles.navBrainItem]}><Ionicons name="sparkles" size={18} color="#0B1220" /><Text style={styles.navBrainText}>Brain</Text></Pressable>
          <Pressable style={styles.navItem}><Ionicons name="storefront-outline" size={20} color="#8A97A6" /></Pressable>
          <Pressable onPress={() => { setMainTab('profile'); setScreen('main'); }} style={styles.navItem}><Ionicons name="person-outline" size={20} color="#8A97A6" /></Pressable>
        </View>
      </View>
    );
  }

  if (screen === 'itemDetail') {
    const item = KNOWLEDGE_DATA[activeCategory].items.find(i => i.id === activeItemId);
    if (!item) { setScreen('knowledgeList'); return null; }
    return (
      <View style={styles.mainScreen}>
        <StatusBar style="dark" />
        <View style={styles.knowledgeHeader}>
          <Pressable onPress={() => setScreen('knowledgeList')} hitSlop={8}><Ionicons name="chevron-back" size={24} color="#0B1220" /></Pressable>
          <Text style={styles.knowledgeHeaderTitle}>{item.name}</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView style={styles.homeScroll} contentContainerStyle={styles.homeScrollContent}>
          <View style={styles.detailCard}>
            <Text style={styles.sectionLabel}>Overview</Text>
            <Text style={styles.attentionSubtitle}>{item.overview}</Text>
          </View>
          <View style={styles.detailCard}>
            {item.fields.map(f => (
              <View key={f.label} style={styles.detailFieldRow}>
                <Text style={styles.detailFieldLabel}>{f.label}</Text>
                <Text style={[styles.detailFieldValue, f.value === 'Need review' && { color: '#E5A63A' }, f.value === 'Verified' && { color: '#1E9E6D' }]}>{f.value}</Text>
              </View>
            ))}
          </View>
          {item.features && (
            <View style={styles.detailCard}>
              <Text style={styles.sectionLabel}>Key Features</Text>
              {item.features.map(f => (
                <View key={f} style={styles.featureRow}>
                  <Ionicons name="checkmark-circle" size={16} color="#1E56A0" />
                  <Text style={styles.attentionSubtitle}>{f}</Text>
                </View>
              ))}
            </View>
          )}
          <View style={styles.detailCard}>
            <Text style={styles.sectionLabel}>Source</Text>
            <View style={styles.sourceRow}>
              <Ionicons name="document-text" size={20} color="#D32F2F" />
              <Text style={styles.attentionTitle}>Product catalogue.pdf</Text>
            </View>
          </View>
          <Pressable onPress={openItemEdit} style={styles.editLink}>
            <Ionicons name="create-outline" size={16} color="#1E56A0" />
            <Text style={styles.insightLink}>Edit</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  if (screen === 'itemEdit') {
    return (
      <View style={styles.mainScreen}>
        <StatusBar style="dark" />
        <View style={styles.knowledgeHeader}>
          <Pressable onPress={() => setScreen('itemDetail')} hitSlop={8}><Ionicons name="chevron-back" size={24} color="#0B1220" /></Pressable>
          <Text style={styles.knowledgeHeaderTitle}>Edit {KNOWLEDGE_DATA[activeCategory].title.replace(/s$/, '')}</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView style={styles.homeScroll} contentContainerStyle={styles.homeScrollContent}>
          {editDraft.map((f, idx) => (
            <View key={f.label} style={{ marginBottom: 14 }}>
              <Text style={styles.detailFieldLabel}>{f.label}</Text>
              <TextInput
                value={f.value}
                onChangeText={v => setEditDraft(prev => prev.map((p, i) => i === idx ? { ...p, value: v } : p))}
                style={styles.editInput}
              />
            </View>
          ))}
          <Pressable onPress={() => setScreen('itemDetail')} style={[styles.resetButton, styles.resetButtonEnabled, { marginTop: 8 }]}>
            <Text style={styles.resetButtonText}>Save Changes</Text>
          </Pressable>
          <Pressable onPress={() => setScreen('itemDetail')} style={[styles.resetButton, { marginTop: 10, borderWidth: 1, borderColor: '#5381BB' }]}>
            <Text style={[styles.resetButtonText, { color: '#1E56A0' }]}>Save As Draft</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  if (screen === 'addKnowledge') {
    return (
      <View style={styles.mainScreen}>
        <StatusBar style="dark" />
        <View style={styles.knowledgeHeader}>
          <Pressable onPress={() => setScreen('main')} hitSlop={8}><Ionicons name="chevron-back" size={24} color="#0B1220" /></Pressable>
          <Text style={styles.knowledgeHeaderTitle}>Add Knowledge</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView style={styles.homeScroll} contentContainerStyle={styles.homeScrollContent}>

          {addKnowledgeStep === 'choose' && (
            <>
              <Text style={[styles.attentionSubtitle, { marginBottom: 16 }]}>Choose how you want to add knowledge to your business brain.</Text>
              <Pressable onPress={() => setAddKnowledgeStep('upload')} style={styles.choiceCard}>
                <Ionicons name="cloud-upload-outline" size={22} color="#1E56A0" />
                <View style={styles.attentionTextWrap}>
                  <Text style={styles.attentionTitle}>Upload Files</Text>
                  <Text style={styles.attentionSubtitle}>Upload PDF, CSV, TXT or DOCX files</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#8A97A6" />
              </Pressable>
              <Pressable onPress={() => { setScreen('main'); setMainTab('brain'); sendChatMessage('I want to describe my business or idea'); }} style={styles.choiceCard}>
                <Ionicons name="chatbubble-ellipses-outline" size={22} color="#1E56A0" />
                <View style={styles.attentionTextWrap}>
                  <Text style={styles.attentionTitle}>Tell Nexora</Text>
                  <Text style={styles.attentionSubtitle}>Describe your business or idea</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#8A97A6" />
              </Pressable>
            </>
          )}

          {addKnowledgeStep === 'upload' && (
            <Pressable onPress={runKnowledgeProcessing} style={styles.dropZone}>
              <Ionicons name="cloud-upload-outline" size={36} color="#1E56A0" />
              <Text style={styles.attentionTitle}>Drag and drop files here or tap to browse</Text>
              <Text style={styles.attentionSubtitle}>Supported files: PDF, CSV, TXT or DOCX (Max file size 20MB)</Text>
            </Pressable>
          )}

          {addKnowledgeStep === 'processing' && (
            <View style={{ alignItems: 'center', paddingTop: 24 }}>
              <Ionicons name="sparkles" size={48} color="#1E56A0" />
              <Text style={[styles.attentionTitle, { marginTop: 12, marginBottom: 16 }]}>NEXORA is analyzing your file...</Text>
              {['Reading documents', 'Extracting Information', 'Understanding content', 'Organizing knowledge'].map(step => (
                <View key={step} style={styles.featureRow}>
                  <Ionicons name="checkmark-circle" size={16} color="#1E9E6D" />
                  <Text style={styles.attentionSubtitle}>{step}</Text>
                </View>
              ))}
            </View>
          )}

          {addKnowledgeStep === 'summary' && (
            <>
              <View style={styles.detailCard}>
                <View style={styles.sourceRow}>
                  <Ionicons name="document-text" size={20} color="#D32F2F" />
                  <Text style={styles.attentionTitle}>Product catalogue.pdf</Text>
                </View>
                <Text style={styles.attentionSubtitle}>NEXORA has extracted and organized information from your file</Text>
              </View>
              <Text style={[styles.sectionLabel, { marginTop: 12 }]}>124 Items found in this file</Text>
              {[['Pricing Items', 72], ['Discount Rules', 20], ['FAQs', 12], ['Policies/Rules', 10], ['Brands', 2]].map(([label, count]) => (
                <View key={label as string} style={styles.knowledgeRow}>
                  <Text style={styles.attentionTitle}>{label}</Text>
                  <Text style={styles.attentionSubtitle}>{count}</Text>
                </View>
              ))}
              <Pressable onPress={() => { setReviewChecks({}); setAddKnowledgeStep('review'); }} style={[styles.resetButton, styles.resetButtonEnabled, { marginTop: 16 }]}>
                <Text style={styles.resetButtonText}>Continue</Text>
              </Pressable>
            </>
          )}

          {addKnowledgeStep === 'review' && (
            <>
              <View style={[styles.choiceCard, { backgroundColor: '#FDEDED' }]}>
                <Ionicons name="image-outline" size={22} color="#D32F2F" />
                <View style={styles.attentionTextWrap}>
                  <Text style={styles.attentionTitle}>No image found for 5 of your 16 Pricing Items</Text>
                  <Text style={styles.attentionSubtitle}>Add images to make your knowledge base more visual</Text>
                </View>
              </View>
              <Pressable onPress={() => setAddKnowledgeStep('addImage')} style={[styles.resetButton, styles.resetButtonEnabled, { marginTop: 10, marginBottom: 16 }]}>
                <Text style={styles.resetButtonText}>Add Image</Text>
              </Pressable>
              {KNOWLEDGE_DATA.products.items.map(item => (
                <Pressable key={item.id} onPress={() => setReviewChecks(prev => ({ ...prev, [item.id]: !prev[item.id] }))} style={styles.knowledgeRow}>
                  <Ionicons name={reviewChecks[item.id] ? 'checkbox' : 'square-outline'} size={20} color="#1E56A0" />
                  <View style={styles.attentionTextWrap}>
                    <Text style={styles.attentionTitle}>{item.name}</Text>
                    <Text style={styles.attentionSubtitle}>{item.overview}</Text>
                  </View>
                </Pressable>
              ))}
              <Pressable onPress={() => openKnowledgeList('products')} style={[styles.resetButton, styles.resetButtonEnabled, { marginTop: 16 }]}>
                <Text style={styles.resetButtonText}>Add & Review</Text>
              </Pressable>
            </>
          )}

          {addKnowledgeStep === 'addImage' && (
            <>
              <View style={{ alignItems: 'center', marginBottom: 16 }}>
                <Ionicons name="image-outline" size={40} color="#1E56A0" />
                <Text style={styles.attentionTitle}>No Image found for 5 of your 16 Pricing Items</Text>
              </View>
              <Pressable onPress={() => setAddKnowledgeStep('review')} style={styles.choiceCard}>
                <Ionicons name="sparkles-outline" size={22} color="#1E56A0" />
                <View style={styles.attentionTextWrap}>
                  <Text style={styles.attentionTitle}>Find image online</Text>
                  <Text style={styles.attentionSubtitle}>Image search isn't connected yet — coming soon</Text>
                </View>
              </Pressable>
              <Pressable onPress={() => setAddKnowledgeStep('review')} style={styles.choiceCard}>
                <Ionicons name="add-circle-outline" size={22} color="#1E56A0" />
                <View style={styles.attentionTextWrap}>
                  <Text style={styles.attentionTitle}>Upload your own image</Text>
                  <Text style={styles.attentionSubtitle}>Upload from your device</Text>
                </View>
              </Pressable>
              <Pressable onPress={() => setAddKnowledgeStep('review')} style={styles.choiceCard}>
                <Ionicons name="time-outline" size={22} color="#1E56A0" />
                <View style={styles.attentionTextWrap}>
                  <Text style={styles.attentionTitle}>Skip for now</Text>
                  <Text style={styles.attentionSubtitle}>You can add images later</Text>
                </View>
              </Pressable>
            </>
          )}
        </ScrollView>
      </View>
    );
  }

  if (screen === 'brainGallery') {
    const current = BRAIN_GALLERY_SCREENS[brainGalleryIndex];
    return (
      <View style={styles.mainScreen}>
        <StatusBar style="dark" />
        <View style={styles.knowledgeHeader}>
          <Pressable onPress={() => { setMainTab('profile'); setScreen('main'); }} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color="#0B1220" />
          </Pressable>
          <Text style={styles.knowledgeHeaderTitle}>{current.label}</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView style={styles.homeScroll} contentContainerStyle={{ alignItems: 'center', paddingVertical: 16 }}>
          <View style={[styles.svgFrame, { width, height: scaledHeight }]}>
            <ExpoImage
              source={{ uri: current.url }}
              style={{ width, height: scaledHeight }}
              contentFit="contain"
              cachePolicy="memory-disk"
            />
          </View>
        </ScrollView>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#EEF1F4' }}>
          <Pressable
            disabled={brainGalleryIndex === 0}
            onPress={() => setBrainGalleryIndex(i => Math.max(0, i - 1))}
            style={[styles.resetButton, { paddingHorizontal: 20 }, brainGalleryIndex === 0 ? styles.resetButtonDisabled : styles.resetButtonEnabled]}>
            <Text style={styles.resetButtonText}>Prev</Text>
          </Pressable>
          <Text style={styles.listCountSubtitle}>{brainGalleryIndex + 1} / {BRAIN_GALLERY_SCREENS.length}</Text>
          <Pressable
            disabled={brainGalleryIndex === BRAIN_GALLERY_SCREENS.length - 1}
            onPress={() => setBrainGalleryIndex(i => Math.min(BRAIN_GALLERY_SCREENS.length - 1, i + 1))}
            style={[styles.resetButton, { paddingHorizontal: 20 }, brainGalleryIndex === BRAIN_GALLERY_SCREENS.length - 1 ? styles.resetButtonDisabled : styles.resetButtonEnabled]}>
            <Text style={styles.resetButtonText}>Next</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if(screen==='forgotPassword'){
    return(
      <View style={[styles.fullScreen,{backgroundColor:'#FFF'}]} onLayout={onRootLayout}>
        <StatusBar style={resetStep==='success'?'light':'dark'}/>

        <View style={styles.resetHeaderBar}>
          <Text style={styles.resetHeaderLogo}>NEXORA.AI</Text>
        </View>

        <View style={styles.resetCard}>

          {resetStep==='email'&&(
            <>
              <Text style={styles.resetTitle}>Forgot Password</Text>
              <Text style={styles.resetDescription}>
                Enter your registered email address to receive a verification code.
              </Text>

              <TextInput
                value={resetEmail}
                onChangeText={v=>{setResetEmail(v);setResetError('');setInfoMessage('')}}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Email address"
                placeholderTextColor="#8A97A6"
                style={styles.resetInput}
              />

              <Pressable
                disabled={loading||!resetEmailValid}
                onPress={handleSendResetOtp}
                style={[styles.resetButton,resetEmailValid&&!loading?styles.resetButtonEnabled:styles.resetButtonDisabled]}>
                <Text style={styles.resetButtonText}>
                  {loading?'Sending...':'Send Code'}
                </Text>
              </Pressable>
            </>
          )}

          {resetStep==='otp'&&(
            <>
              <Text style={styles.resetTitle}>Enter 4 Digits Code</Text>
              <Text style={styles.resetDescription}>
                Enter the 4 digits code sent to your registered email {maskEmail(resetEmail)}
              </Text>

              <View style={styles.otpRow}>
                {resetOtpDigits.map((digit,index)=>(
                  <TextInput
                    key={index}
                    ref={ref=>{otpRefs.current[index]=ref}}
                    value={digit}
                    onChangeText={v=>handleOtpDigitChange(index,v)}
                    onKeyPress={e=>handleOtpKeyPress(index,e)}
                    keyboardType="number-pad"
                    maxLength={1}
                    selectTextOnFocus
                    style={[
                      styles.otpBox,
                      digit?styles.otpBoxFilled:null,
                      resetError&&resetOtp.length===4?styles.otpBoxError:null
                    ]}
                  />
                ))}
              </View>

              <View style={styles.resendRow}>
                {resetOtpTimer>0?(
                  <Text style={[styles.resendText,(resetError||resetOtpTimer<=9)?styles.resendTextError:null]}>
                    Resend Code in <Text style={[styles.resendCount,resetOtpTimer<=9?styles.resendTextError:null]}>{resetOtpTimer}s</Text>
                  </Text>
                ):(
                  <Text style={styles.resendText}>
                    Didn't receive code?{' '}
                    <Text style={styles.resendLink} onPress={handleResendOtp}>Resend</Text>
                  </Text>
                )}
              </View>

              <Pressable
                disabled={loading||!resetOtpValid}
                onPress={handleVerifyResetOtp}
                style={[styles.resetButton,resetOtpValid&&!loading?styles.resetButtonEnabled:styles.resetButtonDisabled]}>
                <Text style={styles.resetButtonText}>
                  {loading?'Verifying...':'Continue'}
                </Text>
              </Pressable>
            </>
          )}

          {resetStep==='password'&&(
            <>
              <Text style={styles.resetTitle}>Reset Your Password</Text>
              <Text style={styles.resetDescription}>
                Enter New Password. Include uppercase letters, numbers, and symbols for a stronger password.
              </Text>

              <View style={styles.resetPasswordFieldWrapper}>
                <TextInput
                  value={resetPassword}
                  onChangeText={v=>{setResetPassword(v);setResetError('')}}
                  secureTextEntry={!showResetPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="Enter New Password"
                  placeholderTextColor="#8A97A6"
                  style={[styles.resetInput,styles.resetInputWithIcon]}
                />
                <Pressable onPress={()=>setShowResetPassword(v=>!v)} hitSlop={8} style={styles.resetEyeButton}>
                  <Text style={styles.resetEyeIcon}>{showResetPassword?'🙈':'👁️'}</Text>
                </Pressable>
              </View>

              <View style={styles.resetPasswordFieldWrapper}>
                <TextInput
                  value={resetConfirmPassword}
                  onChangeText={v=>{setResetConfirmPassword(v);setResetError('')}}
                  secureTextEntry={!showResetConfirmPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="Confirm New Password"
                  placeholderTextColor="#8A97A6"
                  style={[
                    styles.resetInput,
                    styles.resetInputWithIcon,
                    resetError==='Passwords do not match.'?styles.resetInputError:null
                  ]}
                />
                <Pressable onPress={()=>setShowResetConfirmPassword(v=>!v)} hitSlop={8} style={styles.resetEyeButton}>
                  <Text style={styles.resetEyeIcon}>{showResetConfirmPassword?'🙈':'👁️'}</Text>
                </Pressable>
              </View>

              {resetError&&<Text style={styles.resetError}>{resetError}</Text>}

              <Pressable
                disabled={loading||!resetPasswordValid}
                onPress={handleUpdateResetPassword}
                style={[styles.resetButton,resetPasswordValid&&!loading?styles.resetButtonEnabled:styles.resetButtonDisabled,{marginTop:resetError?14:0}]}>
                <Text style={styles.resetButtonText}>
                  {loading?'Updating...':'Continue'}
                </Text>
              </Pressable>
            </>
          )}

          {resetStep==='success'&&(
            <>
              <View style={styles.successIconWrap}>
                <View style={styles.successIconCircle}>
                  <Text style={styles.successIconCheck}>✓</Text>
                </View>
              </View>

              <Text style={styles.successTitle}>Password Reset Successfully</Text>

              <Pressable onPress={goToLogin} style={[styles.resetButton,styles.resetButtonEnabled,{marginTop:28}]}>
                <Text style={styles.resetButtonText}>Log In</Text>
              </Pressable>
            </>
          )}

          {resetStep!=='success'&&resetStep!=='password'&&resetError&&(
            <Text style={styles.resetError}>{resetError}</Text>
          )}
          {resetStep!=='success'&&!resetError&&infoMessage&&(
            <Text style={styles.resetInfo}>{infoMessage}</Text>
          )}

          {resetStep!=='success'&&(
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={resetStep === 'email' ? 'Return to login' : 'Go back one step'}
              onPress={() => {
                if (resetStep === 'otp') { setResetStep('email'); setResetError(''); }
                else if (resetStep === 'password') { setResetStep('otp'); setResetError(''); }
                else { goToLogin(); }
              }}
              style={styles.resetBackButton}>
              <Text style={styles.resetBackText}>
                {resetStep === 'email' ? 'Back to Login' : 'Back'}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  if(screen==='login'){
  if(loginIndex===0){
      return(
        <View style={[styles.fullScreen,{backgroundColor:'#FFF'}]} onLayout={onRootLayout} {...loginPanResponder.panHandlers}>
          <StatusBar hidden/>
          <ScrollView contentContainerStyle={{flexGrow:1}} showsVerticalScrollIndicator={false}>
          <View style={[styles.svgFrame,{width,height:scaledHeight}]}>
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <LogInSVG width={width} height={scaledHeight} viewBox={SVG_VIEWBOX} preserveAspectRatio="xMidYMid meet"/>
            </View>
            <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
              {loginEmail.length>0&&(
                <View pointerEvents="none" style={{
                  position:'absolute',
                  left:(INPUT_X+MASK_INSET)*scale,
                  top:(LOGIN_EMAIL_Y+MASK_INSET)*scale,
                  width:(INPUT_WIDTH-2*MASK_INSET)*scale,
                  height:(INPUT_HEIGHT-2*MASK_INSET)*scale,
                  backgroundColor:'#FFF',
                  borderRadius:((INPUT_HEIGHT-2*MASK_INSET)*scale)/2,
                  zIndex:90
                }}/>
              )}

              <TextInput
                value={loginEmail}
                onChangeText={v=>{setLoginEmail(v);setLoginError(false);setAuthError('');setInfoMessage('')}}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                placeholder=""
                placeholderTextColor="transparent"
                selectionColor="#1E56A0"
                underlineColorAndroid="transparent"
                style={[styles.signupInput,{left:INPUT_X*scale,top:LOGIN_EMAIL_Y*scale,width:INPUT_WIDTH*scale,height:INPUT_HEIGHT*scale,fontSize:14*scale}]}
              />

              {loginPassword.length>0&&(
                <View pointerEvents="none" style={{
                  position:'absolute',
                  left:(INPUT_X+MASK_INSET)*scale,
                  top:(LOGIN_PASSWORD_Y+MASK_INSET)*scale,
                  width:(INPUT_WIDTH-2*MASK_INSET)*scale,
                  height:(INPUT_HEIGHT-2*MASK_INSET)*scale,
                  backgroundColor:'#FFF',
                  borderRadius:((INPUT_HEIGHT-2*MASK_INSET)*scale)/2,
                  zIndex:90
                }}/>
              )}

              <TextInput
                key={showLoginPassword?'login-pw-shown':'login-pw-hidden'}
                value={loginPassword}
                onChangeText={v=>{setLoginPassword(v);setLoginError(false);setAuthError('');setInfoMessage('')}}
                secureTextEntry={!showLoginPassword}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="default"
                returnKeyType="done"
                placeholder=""
                placeholderTextColor="transparent"
                selectionColor="#1E56A0"
                underlineColorAndroid="transparent"
                style={[styles.signupInput,{left:INPUT_X*scale,top:LOGIN_PASSWORD_Y*scale,width:INPUT_WIDTH*scale,height:INPUT_HEIGHT*scale,fontSize:14*scale}]}
              />

              <Pressable onPress={()=>setShowLoginPassword(v=>!v)} hitSlop={6} style={[styles.signupControl,{left:LOGIN_PASSWORD_EYE_X*scale,top:LOGIN_PASSWORD_EYE_Y*scale,width:EYE_WIDTH*scale,height:EYE_HEIGHT*scale}]}>
                <Text style={[styles.eyeIcon,{fontSize:16*scale}]}>{showLoginPassword?'🙈':'👁️'}</Text>
              </Pressable>

              <Pressable onPress={()=>setRememberMe(v=>!v)} hitSlop={8} style={[styles.signupControl,{left:LOGIN_CHECK_X*scale,top:LOGIN_CHECK_Y*scale,width:LOGIN_CHECK_WIDTH*scale,height:LOGIN_CHECK_HEIGHT*scale}]}>
                {rememberMe&&<View style={[styles.checkMark,{width:15*scale,height:15*scale,borderRadius:4*scale}]}><Text style={[styles.checkText,{fontSize:11*scale}]}>✓</Text></View>}
              </Pressable>

              <Pressable onPress={handleForgotPassword} hitSlop={4} style={[styles.signupControl,{left:LOGIN_FORGOT_X*scale,top:LOGIN_FORGOT_Y*scale,width:LOGIN_FORGOT_WIDTH*scale,height:LOGIN_FORGOT_HEIGHT*scale}]}/>

              <Animated.View style={[styles.nativeButtonWrapper,{zIndex:130,left:LOGIN_BUTTON_X*scale,top:LOGIN_BUTTON_Y*scale,width:LOGIN_BUTTON_WIDTH*scale,height:LOGIN_BUTTON_HEIGHT*scale,transform:[{scale:buttonScale}],opacity:buttonOpacity}]}>
                <Pressable
                  disabled={!loginEnabled||loading}
                  onPress={handleLogin}
                  onPressIn={handleButtonPressIn}
                  onPressOut={handleButtonPressOut}
                  style={[styles.nativeButton,{backgroundColor:loginEnabled&&!loading?BUTTON_COLOR:'#94A3BB',borderColor:loginEnabled&&!loading?BUTTON_BORDER:'#94A3BB'}]}>
                  <Text style={[styles.nativeButtonText,{fontSize:14*scale}]}>Log In</Text>
                </Pressable>
              </Animated.View>

              {loading&&(
                <View pointerEvents="none" style={[styles.loadingOverlay,{left:INPUT_X*scale,width:INPUT_WIDTH*scale,top:(LOGIN_BUTTON_Y+LOGIN_BUTTON_HEIGHT+6)*scale}]}>
                  <Text style={[styles.loadingText,{fontSize:12*scale}]}>Signing in…</Text>
                </View>
              )}

              <Pressable
                onPress={() => setAuthError('Google sign-in is coming soon — please use email for now.')}
                hitSlop={6}
                style={[styles.signupControl,{left:LOGIN_GOOGLE_X*scale,top:LOGIN_GOOGLE_Y*scale,width:LOGIN_GOOGLE_WIDTH*scale,height:LOGIN_GOOGLE_HEIGHT*scale}]}/>
              <Pressable
                onPress={() => setAuthError('Apple sign-in is coming soon — please use email for now.')}
                hitSlop={6}
                style={[styles.signupControl,{left:LOGIN_APPLE_X*scale,top:LOGIN_APPLE_Y*scale,width:LOGIN_APPLE_WIDTH*scale,height:LOGIN_APPLE_HEIGHT*scale}]}/>
              <Pressable onPress={goToSignup} hitSlop={6} style={[styles.signupControl,{left:LOGIN_SIGNUP_X*scale,top:LOGIN_SIGNUP_Y*scale,width:LOGIN_SIGNUP_WIDTH*scale,height:LOGIN_SIGNUP_HEIGHT*scale}]}/>

              {authError&&(
                <View pointerEvents="none" style={[styles.loginErrorOverlay,{left:INPUT_X*scale,width:INPUT_WIDTH*scale,top:(LOGIN_PASSWORD_Y+INPUT_HEIGHT+8)*scale}]}>
                  <Text style={[styles.loginErrorText,{fontSize:12*scale}]}>{authError}</Text>
                </View>
              )}

              {!authError&&infoMessage&&(
                <View pointerEvents="none" style={[styles.infoOverlay,{left:INPUT_X*scale,width:INPUT_WIDTH*scale,top:(LOGIN_PASSWORD_Y+INPUT_HEIGHT+8)*scale}]}>
                  <Text style={[styles.infoText,{fontSize:12*scale}]}>{infoMessage}</Text>
                </View>
              )}
            </View>
          </View>
          </ScrollView>
        </View>
      );
    }

    return(
      <View style={[styles.fullScreen,{backgroundColor:'#FFF'}]} onLayout={onRootLayout} {...loginPanResponder.panHandlers}>
        <StatusBar hidden/>
        <View style={[styles.svgFrame,{width,height:scaledHeight}]}>{renderLoginSVG()}</View>
      </View>
    );
  }

  if(screen==='signup'){
    if(signupIndex===6||signupIndex===7){
      return(
        <View style={[styles.fullScreen,{backgroundColor:'#FFF'}]} onLayout={onRootLayout} {...signupPanResponder.panHandlers}>
          <StatusBar style="dark"/>
          <View style={[styles.svgFrame,{width,height:scaledHeight}]}>
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>{renderSignupSVG()}</View>
          </View>
        </View>
      );
    }
    if(signupIndex===0){
      return(
        <View style={[styles.fullScreen,{backgroundColor:'#FFF'}]} onLayout={onRootLayout} {...signupPanResponder.panHandlers}>
          <StatusBar hidden/>
          <ScrollView contentContainerStyle={{flexGrow:1}} showsVerticalScrollIndicator={false}>
          <View style={[styles.svgFrame,{width,height:scaledHeight}]}>
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <SignUpSVG width={width} height={scaledHeight} viewBox={SVG_VIEWBOX} preserveAspectRatio="xMidYMid meet"/>
            </View>

            <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
              {fullName.length>0&&(
                <View pointerEvents="none" style={{
                  position:'absolute',
                  left:(INPUT_X+MASK_INSET)*scale,
                  top:(SIGNUP_FULLNAME_Y+MASK_INSET)*scale,
                  width:(INPUT_WIDTH-2*MASK_INSET)*scale,
                  height:(INPUT_HEIGHT-2*MASK_INSET)*scale,
                  backgroundColor:'#FFF',
                  borderRadius:((INPUT_HEIGHT-2*MASK_INSET)*scale)/2,
                  zIndex:90
                }}/>
              )}

              <TextInput
                value={fullName}
                onChangeText={v=>{setFullName(v);setAuthError('')}}
                autoCapitalize="words"
                autoCorrect={false}
                keyboardType="default"
                returnKeyType="next"
                placeholder=""
                placeholderTextColor="transparent"
                selectionColor="#1E56A0"
                underlineColorAndroid="transparent"
                style={[styles.signupInput,{left:INPUT_X*scale,top:SIGNUP_FULLNAME_Y*scale,width:INPUT_WIDTH*scale,height:INPUT_HEIGHT*scale,fontSize:14*scale}]}
              />

              {email.length>0&&(
                <View pointerEvents="none" style={{
                  position:'absolute',
                  left:(INPUT_X+MASK_INSET)*scale,
                  top:(SIGNUP_EMAIL_Y+MASK_INSET)*scale,
                  width:(INPUT_WIDTH-2*MASK_INSET)*scale,
                  height:(INPUT_HEIGHT-2*MASK_INSET)*scale,
                  backgroundColor:'#FFF',
                  borderRadius:((INPUT_HEIGHT-2*MASK_INSET)*scale)/2,
                  zIndex:90
                }}/>
              )}

              <TextInput
                value={email}
                onChangeText={v=>{setEmail(v);setAuthError('')}}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                placeholder=""
                placeholderTextColor="transparent"
                selectionColor="#1E56A0"
                underlineColorAndroid="transparent"
                style={[styles.signupInput,{left:INPUT_X*scale,top:SIGNUP_EMAIL_Y*scale,width:INPUT_WIDTH*scale,height:INPUT_HEIGHT*scale,fontSize:14*scale}]}
              />

              {password.length>0&&(
                <View pointerEvents="none" style={{
                  position:'absolute',
                  left:(INPUT_X+MASK_INSET)*scale,
                  top:(SIGNUP_PASSWORD_Y+MASK_INSET)*scale,
                  width:(INPUT_WIDTH-2*MASK_INSET)*scale,
                  height:(INPUT_HEIGHT-2*MASK_INSET)*scale,
                  backgroundColor:'#FFF',
                  borderRadius:((INPUT_HEIGHT-2*MASK_INSET)*scale)/2,
                  zIndex:90
                }}/>
              )}

              <TextInput
                key={showPassword?'signup-pw-shown':'signup-pw-hidden'}
                value={password}
                onChangeText={v=>{setPassword(v);setAuthError('');setShowPasswordSuggestion(false)}}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                placeholder=""
                placeholderTextColor="transparent"
                selectionColor="#1E56A0"
                underlineColorAndroid="transparent"
                style={[styles.signupInput,{left:INPUT_X*scale,top:SIGNUP_PASSWORD_Y*scale,width:INPUT_WIDTH*scale,height:INPUT_HEIGHT*scale,fontSize:14*scale}]}
              />

              <Pressable onPress={()=>setShowPassword(v=>!v)} hitSlop={6} style={[styles.signupControl,{left:SIGNUP_PASSWORD_EYE_X*scale,top:SIGNUP_PASSWORD_EYE_Y*scale,width:EYE_WIDTH*scale,height:EYE_HEIGHT*scale}]}>
                <Text style={[styles.eyeIcon,{fontSize:16*scale}]}>{showPassword?'🙈':'👁️'}</Text>
              </Pressable>

              {!showPasswordSuggestion&&(
                <Pressable onPress={handleGeneratePassword} hitSlop={6} style={[styles.generateLink,{left:GENERATE_LINK_X*scale,top:GENERATE_LINK_Y*scale,width:GENERATE_LINK_WIDTH*scale,height:GENERATE_LINK_HEIGHT*scale}]}>
                  <Text style={[styles.generateLinkText,{fontSize:10*scale}]}>Generate a secure password</Text>
                </Pressable>
              )}

              {showPasswordSuggestion&&(
                <View style={[styles.passwordSuggestionBox,{left:INPUT_X*scale,top:SIGNUP_PASSWORD_Y*scale,width:INPUT_WIDTH*scale}]}>
                  <Text style={[styles.passwordSuggestionLabel,{fontSize:11*scale}]}>Suggested password</Text>
                  <Text style={[styles.passwordSuggestionValue,{fontSize:15*scale}]} selectable>{suggestedPassword}</Text>
                  <View style={styles.passwordSuggestionActions}>
                    <Pressable onPress={acceptSuggestedPassword} style={styles.passwordSuggestionAccept}>
                      <Text style={[styles.passwordSuggestionAcceptText,{fontSize:12*scale}]}>Use this password</Text>
                    </Pressable>
                    <Pressable onPress={dismissSuggestedPassword} style={styles.passwordSuggestionDismiss}>
                      <Text style={[styles.passwordSuggestionDismissText,{fontSize:12*scale}]}>Write my own</Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {confirmPassword.length>0&&(
                <View pointerEvents="none" style={{
                  position:'absolute',
                  left:(INPUT_X+MASK_INSET)*scale,
                  top:(SIGNUP_CONFIRM_PASSWORD_Y+MASK_INSET)*scale,
                  width:(INPUT_WIDTH-2*MASK_INSET)*scale,
                  height:(INPUT_HEIGHT-2*MASK_INSET)*scale,
                  backgroundColor:'#FFF',
                  borderRadius:((INPUT_HEIGHT-2*MASK_INSET)*scale)/2,
                  zIndex:90
                }}/>
              )}

              <TextInput
                key={showConfirmPassword?'signup-confirm-shown':'signup-confirm-hidden'}
                value={confirmPassword}
                onChangeText={v=>{setConfirmPassword(v);setAuthError('')}}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                placeholder=""
                placeholderTextColor="transparent"
                selectionColor="#1E56A0"
                underlineColorAndroid="transparent"
                style={[styles.signupInput,{left:INPUT_X*scale,top:SIGNUP_CONFIRM_PASSWORD_Y*scale,width:INPUT_WIDTH*scale,height:INPUT_HEIGHT*scale,fontSize:14*scale}]}
              />

              <Pressable onPress={()=>setShowConfirmPassword(v=>!v)} hitSlop={6} style={[styles.signupControl,{left:SIGNUP_CONFIRM_EYE_X*scale,top:SIGNUP_CONFIRM_EYE_Y*scale,width:EYE_WIDTH*scale,height:EYE_HEIGHT*scale}]}>
                <Text style={[styles.eyeIcon,{fontSize:16*scale}]}>{showConfirmPassword?'🙈':'👁️'}</Text>
              </Pressable>

              <Pressable onPress={()=>setTermsAccepted(v=>!v)} hitSlop={8} style={[styles.signupControl,{left:SIGNUP_CHECK_X*scale,top:SIGNUP_CHECK_Y*scale,width:SIGNUP_CHECK_WIDTH*scale,height:SIGNUP_CHECK_HEIGHT*scale}]}>
                {termsAccepted&&<View style={[styles.checkMark,{width:20*scale,height:20*scale,borderRadius:5*scale}]}><Text style={[styles.checkText,{fontSize:13*scale}]}>✓</Text></View>}
              </Pressable>

              <Pressable onPress={()=>setSignupIndex(6)} hitSlop={4} style={[styles.signupControl,{left:SIGNUP_TERMS_X*scale,top:SIGNUP_TERMS_Y*scale,width:SIGNUP_TERMS_WIDTH*scale,height:SIGNUP_TERMS_HEIGHT*scale}]}/>
              <Pressable onPress={()=>setSignupIndex(7)} hitSlop={4} style={[styles.signupControl,{left:SIGNUP_PRIVACY_X*scale,top:SIGNUP_PRIVACY_Y*scale,width:SIGNUP_PRIVACY_WIDTH*scale,height:SIGNUP_PRIVACY_HEIGHT*scale}]}/>

              <Pressable
                disabled={!signupEnabled||loading}
                onPress={handleSignUp}
                onPressIn={handleButtonPressIn}
                onPressOut={handleButtonPressOut}
                style={{position:'absolute',zIndex:130,left:SIGNUP_BUTTON_X*scale,top:SIGNUP_BUTTON_Y*scale,width:SIGNUP_BUTTON_WIDTH*scale,height:SIGNUP_BUTTON_HEIGHT*scale}}
              />

              {loading&&(
                <View pointerEvents="none" style={[styles.loadingOverlay,{left:INPUT_X*scale,width:INPUT_WIDTH*scale,top:(SIGNUP_BUTTON_Y+SIGNUP_BUTTON_HEIGHT+6)*scale}]}>
                  <Text style={[styles.loadingText,{fontSize:12*scale}]}>Creating your account…</Text>
                </View>
              )}

              <Pressable
                onPress={() => setAuthError('Google sign-in is coming soon — please use email for now.')}
                hitSlop={6}
                style={[styles.signupControl,{left:SIGNUP_GOOGLE_X*scale,top:SIGNUP_GOOGLE_Y*scale,width:SIGNUP_GOOGLE_WIDTH*scale,height:SIGNUP_GOOGLE_HEIGHT*scale}]}/>
              <Pressable
                onPress={() => setAuthError('Apple sign-in is coming soon — please use email for now.')}
                hitSlop={6}
                style={[styles.signupControl,{left:SIGNUP_APPLE_X*scale,top:SIGNUP_APPLE_Y*scale,width:SIGNUP_APPLE_WIDTH*scale,height:SIGNUP_APPLE_HEIGHT*scale}]}/>
              <Pressable onPress={goToLogin} hitSlop={6} style={[styles.signupControl,{left:SIGNUP_LOGIN_X*scale,top:SIGNUP_LOGIN_Y*scale,width:SIGNUP_LOGIN_WIDTH*scale,height:SIGNUP_LOGIN_HEIGHT*scale}]}/>

              {authError&&(
                <View pointerEvents="none" style={[styles.loginErrorOverlay,{left:INPUT_X*scale,width:INPUT_WIDTH*scale,top:(SIGNUP_CONFIRM_PASSWORD_Y+INPUT_HEIGHT+8)*scale}]}>
                  <Text style={[styles.loginErrorText,{fontSize:12*scale}]}>{authError}</Text>
                </View>
              )}
            </View>
          </View>
          </ScrollView>
        </View>
      );
    }

    if(signupIndex===3){
      return(
        <Pressable style={styles.fullScreen} onLayout={onRootLayout} onPress={()=>{if(!navigatingRef.current)setSignupIndex(0)}}>
          <StatusBar hidden/>
          <View style={[styles.svgFrame,{width,height:scaledHeight}]}>{renderSignupSVG()}</View>
        </Pressable>
      );
    }

    return(
      <View style={[styles.fullScreen,{backgroundColor:signupIndex===4||signupIndex===5?'#0F2942':'#FFF'}]} onLayout={onRootLayout} {...signupPanResponder.panHandlers}>
        <StatusBar hidden={signupIndex===4||signupIndex===5}/>
        <View style={[styles.svgFrame,{width,height:scaledHeight}]}>{renderSignupSVG()}</View>
      </View>
    );
  }

  const buttonLabel=onboardingIndex===3?'Get Started':'Continue';

  return(
    <View style={styles.fullScreen} onLayout={onRootLayout} {...panResponder.panHandlers}>
      <StatusBar hidden/>
      <View style={[styles.svgFrame,{width,height:scaledHeight}]}>
        {renderOnboardingSVG()}
        <Pressable onPress={skip} hitSlop={10} style={[styles.skipTouchArea,{left:SKIP_X*scale,top:SKIP_Y*scale,width:SKIP_WIDTH*scale,height:SKIP_HEIGHT*scale}]}/>
        <Animated.View style={[styles.nativeButtonWrapper,{left:BUTTON_X*scale,top:BUTTON_Y*scale,width:BUTTON_WIDTH*scale,height:BUTTON_HEIGHT*scale,transform:[{scale:buttonScale}],opacity:buttonOpacity}]}>
          <Pressable onPress={next} onPressIn={handleButtonPressIn} onPressOut={handleButtonPressOut} style={styles.nativeButton}>
            <Text style={[styles.nativeButtonText,{fontSize:14*scale}]}>{buttonLabel}</Text>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

const styles=StyleSheet.create({
  fullScreen:{flex:1,backgroundColor:'#FFF',overflow:'hidden'},
  svgFrame:{position:'relative',overflow:'hidden'},
  skipTouchArea:{position:'absolute',backgroundColor:'transparent',zIndex:20},
  nativeButtonWrapper:{position:'absolute',zIndex:30},
  nativeButton:{flex:1,backgroundColor:BUTTON_COLOR,borderWidth:1,borderColor:BUTTON_BORDER,borderRadius:BUTTON_R,alignItems:'center',justifyContent:'center',overflow:'hidden'},
  nativeButtonText:{color:'#FFF',fontWeight:'600',textAlign:'center'},
  signupInput:{position:'absolute',zIndex:100,backgroundColor:'transparent',color:'#0B1220',paddingLeft:16,paddingRight:16,paddingTop:0,paddingBottom:0,borderWidth:0,fontFamily:'Roboto',fontWeight:'400',textAlign:'left',textAlignVertical:'center',includeFontPadding:false},
  signupControl:{position:'absolute',zIndex:120,backgroundColor:'transparent',alignItems:'center',justifyContent:'center'},
  eyeIcon:{textAlign:'center'},
  checkMark:{backgroundColor:'#1E56A0',alignItems:'center',justifyContent:'center'},
  checkText:{color:'#FFF',fontWeight:'800'},
  scrollView:{flex:1,backgroundColor:'#FFF'},
  scrollContent:{flexGrow:1,alignItems:'flex-start'},
  mainScreen:{flex:1,backgroundColor:'#FFF'},
  mainContent:{flex:1,alignItems:'center',justifyContent:'center'},
  welcomeText:{fontSize:24,fontWeight:'600',color:'#0B1220',marginBottom:20},
  logoutButton:{paddingHorizontal:30,paddingVertical:12,borderRadius:20,backgroundColor:'#1E56A0'},
  logoutText:{color:'#FFF',fontWeight:'600'},
  loginErrorOverlay:{position:'absolute',alignItems:'center',zIndex:200},
  loginErrorText:{color:'#D32F2F',fontWeight:'500',textAlign:'center'},
  infoOverlay:{position:'absolute',alignItems:'center',zIndex:200},
  infoText:{color:'#1E56A0',fontWeight:'500',textAlign:'center'},
  loadingOverlay:{position:'absolute',alignItems:'center',zIndex:200},
  loadingText:{color:'#1E56A0',fontWeight:'500'},
  generateLink:{position:'absolute',zIndex:110,backgroundColor:'transparent',justifyContent:'center'},
  generateLinkText:{color:'#1E56A0',fontWeight:'600',textDecorationLine:'underline'},
  passwordSuggestionBox:{position:'absolute',zIndex:150,backgroundColor:'#FFF',borderWidth:1,borderColor:'#5381BB',borderRadius:12,paddingVertical:10,paddingHorizontal:14,shadowColor:'#000',shadowOpacity:.15,shadowRadius:8,shadowOffset:{width:0,height:4},elevation:6},
  passwordSuggestionLabel:{color:'#5C6B7A',fontWeight:'500',marginBottom:4},
  passwordSuggestionValue:{color:'#0B1220',fontWeight:'700',fontFamily:'Roboto',marginBottom:10,letterSpacing:.5},
  passwordSuggestionActions:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  passwordSuggestionAccept:{backgroundColor:'#1E56A0',borderRadius:16,paddingVertical:8,paddingHorizontal:14},
  passwordSuggestionAcceptText:{color:'#FFF',fontWeight:'600'},
  passwordSuggestionDismiss:{paddingVertical:8,paddingHorizontal:10},
  passwordSuggestionDismissText:{color:'#1E56A0',fontWeight:'600'},
  resetContainer:{flex:1,justifyContent:'center',paddingHorizontal:24},
  resetTitle:{fontSize:28,fontWeight:'700',color:'#0B1220',textAlign:'center'},
  resetDescription:{marginTop:12,marginBottom:24,fontSize:15,lineHeight:22,color:'#5C6B7A',textAlign:'center'},
  resetInput:{height:48,borderWidth:1,borderColor:'#5381BB',borderRadius:24,paddingHorizontal:16,color:'#0B1220',marginBottom:14},
  resetPasswordFieldWrapper:{position:'relative',justifyContent:'center',marginBottom:14},
  resetInputWithIcon:{paddingRight:44,marginBottom:0},
  resetEyeButton:{position:'absolute',right:8,height:48,width:36,alignItems:'center',justifyContent:'center'},
  resetEyeIcon:{fontSize:16,textAlign:'center'},
  resetHeaderBar:{height:110,backgroundColor:'#0B1220',alignItems:'center',justifyContent:'center'},
  resetHeaderLogo:{color:'#FFF',fontSize:14,fontWeight:'700',letterSpacing:1},
  resetCard:{flex:1,backgroundColor:'#FFF',borderTopLeftRadius:28,borderTopRightRadius:28,marginTop:-24,paddingHorizontal:24,paddingTop:32,justifyContent:'center'},
  otpRow:{flexDirection:'row',justifyContent:'space-between',marginBottom:14},
  otpBox:{width:64,height:64,borderRadius:14,borderWidth:1.5,borderColor:'#5381BB',backgroundColor:'#FFF',color:'#0B1220',fontSize:24,fontWeight:'700',textAlign:'center'},
  otpBoxFilled:{borderColor:'#1E56A0'},
  otpBoxError:{borderColor:'#E57373',backgroundColor:'#FDEDED'},
  resendRow:{flexDirection:'row',justifyContent:'center',marginBottom:18},
  resendText:{fontSize:13,color:'#5C6B7A'},
  resendTextError:{color:'#D32F2F'},
  resendCount:{color:'#1E56A0',fontWeight:'700'},
  resendLink:{color:'#1E56A0',fontWeight:'700'},
  successIconWrap:{alignItems:'center',justifyContent:'center',marginVertical:24},
  successIconCircle:{width:72,height:72,borderRadius:36,backgroundColor:'#0F2942',alignItems:'center',justifyContent:'center'},
  successIconCheck:{color:'#FFF',fontSize:30,fontWeight:'800'},
  successTitle:{fontSize:16,fontStyle:'italic',fontWeight:'600',color:'#0B1220',textAlign:'center'},
  resetInputError:{borderColor:'#E57373'},
  resetButton:{minHeight:48,borderRadius:24,alignItems:'center',justifyContent:'center'},
  resetButtonEnabled:{backgroundColor:'#1E56A0'},
  resetButtonDisabled:{backgroundColor:'#94A3BB'},
  resetButtonText:{color:'#FFF',fontSize:15,fontWeight:'600'},
  resetError:{marginTop:14,color:'#D32F2F',fontSize:13,textAlign:'center'},
  resetInfo:{marginTop:14,color:'#1E56A0',fontSize:13,textAlign:'center'},
  resetBackButton:{minHeight:48,marginTop:16,alignItems:'center',justifyContent:'center'},
  topBar:{flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingTop:50,paddingBottom:12,backgroundColor:'#FFF',borderBottomWidth:1,borderBottomColor:'#EEF1F4'},
topBarTitleWrap:{flex:1,marginLeft:12},
topBarTitle:{fontSize:15,fontWeight:'700',color:'#0B1220'},
topBarSubtitle:{fontSize:11,color:'#8A97A6'},
topBarRight:{flexDirection:'row',alignItems:'center',gap:12},
bellWrap:{position:'relative'},
bellDot:{position:'absolute',top:-1,right:-1,width:7,height:7,borderRadius:4,backgroundColor:'#D32F2F'},
bottomNav:{flexDirection:'row',alignItems:'center',justifyContent:'space-around',paddingVertical:10,backgroundColor:'#FFF',borderTopWidth:1,borderTopColor:'#EEF1F4'},
navItem:{padding:8,borderRadius:20},
navItemActive:{backgroundColor:'#EEF1F4'},
navBrainItem:{flexDirection:'row',alignItems:'center',gap:4,paddingHorizontal:14,paddingVertical:8,borderRadius:20,backgroundColor:'#EEF1F4'},
navBrainItemActive:{backgroundColor:'#0B1220'},
navBrainText:{fontSize:12,fontWeight:'700',color:'#0B1220'},
navBrainTextActive:{color:'#FFF'},
homeScroll:{flex:1,backgroundColor:'#F5F6F8'},
homeScrollContent:{padding:16,paddingBottom:24},
homeSearchBar:{flexDirection:'row',alignItems:'center',gap:8,backgroundColor:'#FFF',borderRadius:24,paddingHorizontal:16,height:44,marginBottom:16},
homeSearchPlaceholder:{color:'#8A97A6',fontSize:13},
insightCard:{backgroundColor:'#FFF',borderRadius:16,padding:16,marginBottom:20},
insightTagRow:{flexDirection:'row',alignItems:'center',gap:6,marginBottom:8},
insightTag:{fontSize:11,fontWeight:'700',color:'#1E9E6D'},
insightTitle:{fontSize:15,fontWeight:'700',color:'#0B1220',marginBottom:4},
insightDescription:{fontSize:12,color:'#5C6B7A',marginBottom:12},
insightBottomRow:{flexDirection:'row',alignItems:'flex-end',justifyContent:'space-between'},
insightLink:{fontSize:12,fontWeight:'600',color:'#1E56A0'},
miniChart:{flexDirection:'row',alignItems:'flex-end',gap:4},
miniChartBar:{width:6,borderRadius:3,backgroundColor:'#1E56A0'},
sectionLabel:{fontSize:14,fontWeight:'700',color:'#0B1220',marginBottom:12},
sectionHeaderRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:20,marginBottom:12},
sectionViewAll:{fontSize:12,color:'#1E56A0',fontWeight:'600'},
commandGrid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between'},
commandItem:{width:'23%',alignItems:'center',marginBottom:16},
commandIconCircle:{width:48,height:48,borderRadius:24,backgroundColor:'#FFF',alignItems:'center',justifyContent:'center',marginBottom:6},
commandLabel:{fontSize:10,color:'#5C6B7A',textAlign:'center'},
attentionItem:{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:'#FFF',borderRadius:12,padding:12,marginBottom:10},
attentionTextWrap:{flex:1},
attentionTitle:{fontSize:12,fontWeight:'600',color:'#0B1220'},
attentionSubtitle:{fontSize:11,color:'#8A97A6'},
attentionButton:{backgroundColor:'#F5F6F8',borderRadius:14,paddingHorizontal:10,paddingVertical:6},
attentionButtonText:{fontSize:11,fontWeight:'600',color:'#0B1220'},
monthChip:{flexDirection:'row',alignItems:'center',gap:4,backgroundColor:'#FFF',borderRadius:14,paddingHorizontal:10,paddingVertical:6},
monthChipText:{fontSize:11,color:'#5C6B7A'},
chatScroll:{flex:1,backgroundColor:'#0F2942'},
chatScrollContent:{padding:16,paddingBottom:12},
brainHero:{alignItems:'center',marginTop:32,marginBottom:24},
brainHeroTitle:{fontSize:22,fontWeight:'700',color:'#FFF',marginTop:12},
brainHeroSubtitle:{fontSize:13,color:'#8A97A6',marginTop:4},
popularLabel:{fontSize:13,fontWeight:'700',color:'#FFF',marginBottom:8},
popularItem:{flexDirection:'row',alignItems:'center',gap:8,backgroundColor:'rgba(255,255,255,0.06)',borderRadius:12,padding:12,marginBottom:8},
popularItemText:{flex:1,fontSize:12,color:'#E5E9EF'},
bubbleRow:{flexDirection:'row',marginBottom:10},
bubbleRowUser:{justifyContent:'flex-end'},
bubbleRowAi:{justifyContent:'flex-start'},
bubble:{maxWidth:'80%',borderRadius:14,paddingHorizontal:14,paddingVertical:10},
bubbleUser:{backgroundColor:'#1E56A0'},
bubbleAi:{backgroundColor:'rgba(255,255,255,0.08)'},
bubbleText:{fontSize:13,color:'#E5E9EF',lineHeight:19},
bubbleTextUser:{color:'#FFF'},
bubbleImage:{width:200,height:150,borderRadius:10,backgroundColor:'#0B1220'},
attachMenu:{marginHorizontal:16,marginBottom:8,backgroundColor:'#16324F',borderRadius:14,padding:8},
attachOption:{flexDirection:'row',alignItems:'center',gap:10,paddingVertical:10,paddingHorizontal:8},
attachOptionText:{fontSize:13,color:'#FFF'},
chatInputBar:{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:'#FFF',borderRadius:26,marginHorizontal:16,marginBottom:12,paddingHorizontal:14,paddingVertical:8},
chatTextInput:{flex:1,fontSize:13,color:'#0B1220'},
chatSendButton:{width:30,height:30,borderRadius:15,alignItems:'center',justifyContent:'center'},
waveformRow:{flex:1,flexDirection:'row',alignItems:'center',gap:3},
waveformBar:{width:3,borderRadius:2,backgroundColor:'#1E56A0'},
stopButton:{width:24,height:24,borderRadius:6,backgroundColor:'#0B1220',alignItems:'center',justifyContent:'center'},
  resetBackText:{color:'#1E56A0',fontSize:14,fontWeight:'600'},
  knowledgeHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16,paddingTop:50,paddingBottom:16,backgroundColor:'#FFF'},
  knowledgeHeaderTitle:{fontSize:17,fontWeight:'700',color:'#0B1220'},
  knowledgeHeaderAction:{fontSize:14,fontWeight:'600',color:'#1E56A0'},
  gaugeCard:{backgroundColor:'#FFF',borderRadius:16,padding:16,marginBottom:20,alignItems:'center'},
  gaugeCircle:{width:140,height:140,borderRadius:70,borderWidth:14,borderColor:'#1E9E6D',alignItems:'center',justifyContent:'center',marginVertical:12},
  gaugePercent:{fontSize:28,fontWeight:'700',color:'#0B1220'},
  gaugeLabel:{fontSize:12,color:'#1E9E6D',fontWeight:'600'},
  statsRow:{flexDirection:'row',gap:24,marginTop:8},
  statBox:{alignItems:'center'},
  statValue:{fontSize:15,fontWeight:'700',color:'#0B1220',marginTop:4},
  statLabel:{fontSize:11,color:'#8A97A6'},
  commandCount:{fontSize:10,color:'#8A97A6',marginTop:2},
  listCountTitle:{fontSize:18,fontWeight:'700',color:'#0B1220'},
  listCountSubtitle:{fontSize:12,color:'#1E9E6D',marginBottom:12},
  searchBarPlain:{flexDirection:'row',alignItems:'center',gap:8,backgroundColor:'#FFF',borderRadius:12,paddingHorizontal:14,height:44,marginBottom:12},
  filterRow:{flexDirection:'row',gap:8,marginBottom:16},
  filterChip:{paddingHorizontal:12,paddingVertical:7,borderRadius:14,backgroundColor:'#FFF'},
  filterChipActive:{backgroundColor:'#0B1220'},
  filterChipText:{fontSize:12,color:'#5C6B7A',fontWeight:'600'},
  filterChipTextActive:{color:'#FFF'},
  knowledgeRow:{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:'#FFF',borderRadius:12,padding:12,marginBottom:10},
  knowledgeRowIcon:{width:40,height:40,borderRadius:10,alignItems:'center',justifyContent:'center'},
  statusPill:{backgroundColor:'#E7F7EF',borderRadius:12,paddingHorizontal:10,paddingVertical:4},
  statusPillWarn:{backgroundColor:'#FDEFE0'},
  statusPillText:{fontSize:11,fontWeight:'600',color:'#1E9E6D'},
  statusPillTextWarn:{color:'#E5A63A'},
  detailCard:{backgroundColor:'#FFF',borderRadius:16,padding:16,marginBottom:14},
  detailFieldRow:{flexDirection:'row',justifyContent:'space-between',paddingVertical:8,borderBottomWidth:1,borderBottomColor:'#F0F2F5'},
  detailFieldLabel:{fontSize:12,color:'#8A97A6',marginBottom:6},
  detailFieldValue:{fontSize:13,color:'#0B1220',fontWeight:'600'},
  featureRow:{flexDirection:'row',alignItems:'center',gap:8,marginTop:8},
  sourceRow:{flexDirection:'row',alignItems:'center',gap:8,marginBottom:6},
  editLink:{flexDirection:'row',alignItems:'center',gap:6,alignSelf:'center',marginTop:4,marginBottom:24},
  editInput:{height:46,borderWidth:1,borderColor:'#5381BB',borderRadius:12,paddingHorizontal:14,color:'#0B1220',marginTop:6},
  choiceCard:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:'#FFF',borderRadius:14,padding:16,marginBottom:12},
  dropZone:{alignItems:'center',gap:8,backgroundColor:'#FFF',borderRadius:16,borderWidth:1,borderColor:'#EEF1F4',borderStyle:'dashed',padding:32,marginTop:8}
});
