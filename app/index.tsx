import React,{useEffect,useRef,useState}from'react';
import{ActivityIndicator,Animated,Image,PanResponder,Platform,Pressable,ScrollView,StyleSheet,Text,TextInput,View,useWindowDimensions}from'react-native';
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
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
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

// Bump this whenever a file at one of these Supabase paths is replaced
// in-place (same filename, new bytes) — e.g. the product photos got
// reuploaded with white backgrounds instead of black, but the app kept
// showing the old black-background versions. Supabase Storage serves
// these as normal cacheable URLs, so expo-image's on-disk cache
// (cachePolicy 'memory-disk') has no way to know the content changed and
// keeps the stale copy indefinitely. Appending ?v=N busts that cache;
// bump N after every reupload of brain-illustration.png, healthy.png, or
// any product-*.jpg.
// FIX: bump this whenever an asset already in the bucket gets replaced
// with a new file at the same name (e.g. a corrected product photo or
// icon) — the query string is what actually forces a refetch, since
// ExpoImage's disk cache (and some CDN layers) key purely on URL, so the
// same URL after a same-name file swap in Supabase still serves the old
// cached bytes until this changes. Bumped 4 -> 5 for this pass (Home-1/
// Home-2's truth image and product-speaker.jpg were both re-uploaded).
const ASSET_VERSION = 6;
const withCacheBust = (url: string) => `${url}?v=${ASSET_VERSION}`;

// Product photos straight out of the Figma "Product list-5" export (the
// truth screen uses real photography, not icon glyphs). Upload these to
// the 'brain-gallery' bucket under the exact filenames below for them to
// resolve; knowledgeRow/detail views fall back to the old icon+color box
// if a photo 404s, so nothing breaks before they're uploaded.
const PRODUCT_IMAGE_URL: Record<string, string> = {
  headphone: withCacheBust(supabase.storage.from('brain-gallery').getPublicUrl('product-headphone.jpg').data.publicUrl),
  smartwatch: withCacheBust(supabase.storage.from('brain-gallery').getPublicUrl('product-smartwatch.jpg').data.publicUrl),
  speaker: withCacheBust(supabase.storage.from('brain-gallery').getPublicUrl('product-speaker.jpg').data.publicUrl),
  // Titanium Phone Case — the 4th product in the truth screen, previously
  // left out of KNOWLEDGE_DATA entirely.
  phonecase: withCacheBust(supabase.storage.from('brain-gallery').getPublicUrl('product-smartphone.jpg').data.publicUrl),
};

// Small line-art icons that Figma draws as one fused custom glyph with no
// close-enough stock equivalent in Ionicons or MaterialCommunityIcons —
// each cropped straight out of its Figma export (delivery from Service/
// Operations/Policies list, the rest from Operations and Policies list)
// with a transparent background and recolored to match that row's exact
// Figma color, same treatment as the product photos and the brain
// illustration. Each entry carries its own `fallback` icon name (used by
// KnowledgeIcon below) for the window before it's uploaded, or if the
// file 404s for any other reason — previously there was a single
// hardcoded fallback ('truck-delivery-outline') shared by every 'img:'
// icon, which made sense when delivery-icon was the only one, but would
// have shown a truck for a failed phone-repair or order-processing icon
// now that there are several.
const ICON_IMAGE_URL: Record<string, { url: string; fallback: string }> = {
  'delivery-icon': {
    url: withCacheBust(supabase.storage.from('brain-gallery').getPublicUrl('delivery-icon.png').data.publicUrl),
    fallback: 'mci:truck-delivery-outline',
  },
  'phone-repair-icon': {
    url: withCacheBust(supabase.storage.from('brain-gallery').getPublicUrl('phone-repair-icon.png').data.publicUrl),
    fallback: 'mci:tools',
  },
  'customer-returns-icon': {
    url: withCacheBust(supabase.storage.from('brain-gallery').getPublicUrl('customer-returns-icon.png').data.publicUrl),
    fallback: 'cube-outline',
  },
  'refund-policy-cash-icon': {
    url: withCacheBust(supabase.storage.from('brain-gallery').getPublicUrl('refund-policy-cash-icon.png').data.publicUrl),
    fallback: 'mci:cash-refund',
  },
  'discount-policy-icon': {
    url: withCacheBust(supabase.storage.from('brain-gallery').getPublicUrl('discount-policy-icon.png').data.publicUrl),
    fallback: 'time-outline',
  },
  'order-processing-icon': {
    url: withCacheBust(supabase.storage.from('brain-gallery').getPublicUrl('order-processing-icon.png').data.publicUrl),
    fallback: 'mci:file-clock-outline',
  },
  'opening-hours-icon': {
    url: withCacheBust(supabase.storage.from('brain-gallery').getPublicUrl('opening-hours-icon.png').data.publicUrl),
    fallback: 'time-outline',
  },
  'refund-policy-history-icon': {
    url: withCacheBust(supabase.storage.from('brain-gallery').getPublicUrl('refund-policy-history-icon.png').data.publicUrl),
    fallback: 'time-outline',
  },
  // NEW: Home-1's "8 Orders hasn't shipped" attention item uses this same
  // truck+clock illustration as 'delivery-icon' above, but in Home-1's own
  // orange (not the blue used for Services/Operations/Policies delivery
  // rows) — a separately-colored export, so it needs its own entry rather
  // than reusing 'delivery-icon'.
  'orders-shipping-icon': {
    url: withCacheBust(supabase.storage.from('brain-gallery').getPublicUrl('orders-shipping-icon.png').data.publicUrl),
    fallback: 'mci:truck-delivery-outline',
  },
};

// Fixed per-row colors read directly off the Figma truth screens
// (Service list, Operations list, Policies list). These used to be
// assigned by the item's STATUS (Verified -> blue, Need review -> orange)
// via a shared convention that doesn't exist in Figma at all — Figma
// gives each row its own fixed color regardless of status, and the same
// label can even get a different color in a different category ("Refund
// Policy" is orange under Operations but navy under Policies). Named here
// so the mapping below reads as "this row is orange" rather than a bare
// hex, and so the same truth color is reused verbatim everywhere it
// appears instead of drifting between near-identical hex values.
const CAT_ORANGE = { iconBg: '#FBF1E6', iconColor: '#D97706' };
const CAT_BLUE = { iconBg: '#EAF1FB', iconColor: '#1E56A0' };
const CAT_NAVY = { iconBg: '#EAF1FB', iconColor: '#0F2942' };
const CAT_RED = { iconBg: '#FFEBEB', iconColor: '#FF383C' };

const KNOWLEDGE_DATA:Record<KnowledgeCategory,{title:string;icon:string;items:KnowledgeItem[]}>={
  products:{title:'Products',icon:'cube-outline',items:[
    {id:'p1',name:'Oraimo Headphone',subtitle:'Accessories · $59.00',status:'Verified',icon:'headset-outline',iconBg:'#EAF1FB',iconColor:'#1E56A0',image:PRODUCT_IMAGE_URL.headphone,
      overview:'High quality wireless headphone with noise cancellation 30 hours battery life and fast charging.',
      // This array also drives the EDIT screen (via EDIT_FIELD_ORDER
      // re-sorting), so it stays limited to fields Product details-4
      // actually shows there — Visibility/Last Updated are detail-only
      // (see viewOnlyFields + DETAIL_FIELD_ORDER, which interleaves them
      // into the right position rather than just appending at the end).
      fields:[{label:'Category',value:'Electronics'},{label:'Specification',value:'AXS 104 Pro'},{label:'Brand',value:'Oraimo'},{label:'Price',value:'$45.00'},{label:'Status',value:'Verified'}],
      // NEW: view-only metadata shown on the Product details-6 truth
      // screen (Visibility, Last Updated) that itemEdit never shows —
      // see viewOnlyFields below and its use in itemDetail.
      viewOnlyFields:[{label:'Visibility',value:'Active'},{label:'Last Updated',value:'May 24, 2026'}],
      // FIX: the Product details-4 (edit) and Product details-6 (view)
      // truth screens actually show two different feature lists for the
      // same product (different battery-life/Bluetooth wording, and
      // view has a 5th "Built in Microphone" item edit doesn't) — a
      // Figma mockup inconsistency between the two frames, not
      // something this app can show two versions of at once. Went with
      // the view screen's list since it's the more complete of the two;
      // both itemDetail and itemEdit read from this one array.
      features:['Active Noise Cancellation','30-hours battery Life','Fast Charging','Bluetooth 7.1','Built in Microphone for calls']},
    {id:'p2',name:'BST Smartwatch',subtitle:'Wearables · $49.00',status:'Verified',icon:'watch-outline',iconBg:'#EAF1FB',iconColor:'#1E56A0',image:PRODUCT_IMAGE_URL.smartwatch,
      overview:'Fitness-tracking smartwatch with heart-rate monitor and 10-day battery.',
      fields:[{label:'Category',value:'Wearables'},{label:'Brand',value:'BST'},{label:'Price',value:'$49.00'},{label:'Status',value:'Verified'}],
      features:['Heart-rate monitor','10-day battery','Water resistant']},
    {id:'p3',name:'TXR Bluetooth Speaker',subtitle:'Electronics · $52.00',status:'Need review',icon:'volume-high-outline',iconBg:'#FDEFE0',iconColor:'#E5A63A',image:PRODUCT_IMAGE_URL.speaker,
      overview:'Portable Bluetooth speaker with deep bass and 12-hour playtime.',
      fields:[{label:'Category',value:'Electronics'},{label:'Brand',value:'TXR'},{label:'Price',value:'$52.00'},{label:'Status',value:'Need review'}]},
    {id:'p4',name:'Titanium Phone Case',subtitle:'Accessories · $22.00',status:'Verified',icon:'phone-portrait-outline',iconBg:'#EAF1FB',iconColor:'#1E56A0',image:PRODUCT_IMAGE_URL.phonecase,
      overview:'Slim titanium-finish silicone case with raised camera bezel protection.',
      fields:[{label:'Category',value:'Accessories'},{label:'Brand',value:'Generic'},{label:'Price',value:'$22.00'},{label:'Status',value:'Verified'}]},
  ]},
  services:{title:'Services',icon:'briefcase-outline',items:[
    {id:'s1',name:'Phone Screen Replacement',subtitle:'Mobile Phones · $45.00',status:'Verified',icon:'img:phone-repair-icon',...CAT_ORANGE,
      overview:'Replacement of cracked or damaged phone screen with original quality parts.',
      fields:[{label:'Category',value:'Mobile Phones'},{label:'Price',value:'$45.00'},{label:'Duration',value:'1 - 2 hours'},{label:'Availability',value:'Mon - Sat, 9:00AM–6:00PM'},{label:'Location',value:'All branches'},{label:'Status',value:'Verified'}]},
    {id:'s2',name:'Delivery Service',subtitle:'Wearables',status:'Verified',icon:'img:delivery-icon',...CAT_BLUE,
      overview:'Same-day delivery for orders placed before 2pm.',
      fields:[{label:'Category',value:'Wearables'},{label:'Duration',value:'Same day'},{label:'Status',value:'Verified'}]},
    {id:'s3',name:'Power Installations',subtitle:'Solar System',status:'Need review',icon:'flash-outline',...CAT_ORANGE,
      overview:'Installation and setup of solar power systems for homes and small businesses.',
      fields:[{label:'Category',value:'Solar System'},{label:'Status',value:'Need review'}]},
    {id:'s4',name:'Web Design',subtitle:'Saas and Commerce',status:'Verified',icon:'globe-outline',...CAT_NAVY,
      overview:'Website design and build for SaaS and e-commerce businesses.',
      fields:[{label:'Category',value:'Saas and Commerce'},{label:'Status',value:'Verified'}]},
  ]},
  operations:{title:'Operations',icon:'settings-outline',items:[
    {id:'o1',name:'Order Processing',subtitle:'Orders are processed within 24h',status:'Verified',icon:'img:order-processing-icon',...CAT_NAVY,
      overview:'Orders are reviewed, packed and handed to courier within 24 hours of confirmation.',
      fields:[{label:'Status',value:'Verified'}]},
    {id:'o2',name:'Delivery Policy',subtitle:'Orders ship Monday to Saturday',status:'Verified',icon:'img:delivery-icon',...CAT_BLUE,
      overview:'Standard shipping runs Monday through Saturday, excluding public holidays.',
      fields:[{label:'Status',value:'Verified'}]},
    {id:'o3',name:'Opening Hours',subtitle:'Mon - Sat',status:'Verified',icon:'img:opening-hours-icon',...CAT_RED,
      overview:'Store and support hours customers can expect a response within.',
      fields:[{label:'Status',value:'Verified'}]},
    {id:'o4',name:'Refund Policy',subtitle:'Refund within 7 days',status:'Need review',icon:'img:refund-policy-history-icon',...CAT_ORANGE,
      overview:'Refunds are processed within 7 business days of an approved return.',
      fields:[{label:'Status',value:'Need review'}]},
  ]},
  policies:{title:'Policies',icon:'pricetag-outline',items:[
    {id:'pol1',name:'Customer Returns',subtitle:'30 days return policy',status:'Verified',icon:'img:customer-returns-icon',...CAT_ORANGE,
      overview:'Replacement Warranty Policy covering returns within the stated window.',
      fields:[{label:'Category',value:'Rules and Policies'},{label:'Policy Type',value:'Warranty'},{label:'Applies To',value:'Phone Screen Repair'},{label:'Duration',value:'30 Days'},{label:'Effective from',value:'May 1, 2024'},{label:'To',value:'June 1, 2024'},{label:'Status',value:'Verified'}],
      features:['Refund requests must be made within 7 days of purchase','Items must be unused and in original condition','Refunds will be processed within 5 business days']},
    {id:'pol2',name:'Delivery Policy',subtitle:'Lagos: 1 - 2 business days',status:'Verified',icon:'img:delivery-icon',...CAT_BLUE,
      overview:'Standard delivery windows by region.',fields:[{label:'Status',value:'Verified'}]},
    {id:'pol3',name:'Refund Policy',subtitle:'Refund within 7 days',status:'Need review',icon:'img:refund-policy-cash-icon',...CAT_NAVY,
      overview:'Refunds honored within 7 days of purchase with proof of payment.',fields:[{label:'Status',value:'Need review'}]},
    {id:'pol4',name:'Discount Policy',subtitle:'Accessories',status:'Verified',icon:'img:discount-policy-icon',...CAT_RED,
      overview:'Discount eligibility and terms for accessory purchases.',fields:[{label:'Category',value:'Accessories'},{label:'Status',value:'Verified'}]},
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

// Figma titles these "<Category> Knowledge" — but not by simply appending
// the word: the Operations category truth screen reads "Operation
// Knowledge" (singular), not "Operations Knowledge". Same reason the Edit
// screen titles need their own singular form ("Edit Policy", not "Edit
// Policie" from a blind s-strip of "Policies").
const KNOWLEDGE_LIST_TITLE: Record<KnowledgeCategory, string> = {
  products: 'Products Knowledge',
  services: 'Services Knowledge',
  operations: 'Operation Knowledge',
  policies: 'Policies Knowledge',
  faqs: 'FAQs Knowledge',
};
const KNOWLEDGE_EDIT_TITLE: Record<KnowledgeCategory, string> = {
  products: 'Edit Product',
  services: 'Edit Service',
  operations: 'Edit Operation',
  policies: 'Edit Policy',
  faqs: 'Edit FAQ',
};
// NEW: the top card's Name field label — one per category, matching each
// truth screen exactly ("Product Name", "Service Name", "Policy",
// "Question"). Didn't exist before since there was no Name field in
// editDraft at all.
const KNOWLEDGE_NAME_LABEL: Record<KnowledgeCategory, string> = {
  products: 'Product Name',
  services: 'Service Name',
  operations: 'Operation Name',
  policies: 'Policy',
  faqs: 'Question',
};
// NEW: fields that render as a multi-line box instead of a single-line
// input, matching the taller text areas Figma uses for these.
const MULTILINE_EDIT_FIELDS = new Set(['Description', 'Key Features', 'Policy details', 'Answer', 'Keywords']);
// NEW: edit-screen-only field display order (see restFields in itemEdit).
// Matches Product details-4's truth order (Price, Specification, Brand,
// Status) — deliberately different from the detail screen's order below,
// which groups Category/Specification/Brand/Price before Status.
const EDIT_FIELD_ORDER = ['Price', 'Specification', 'Brand', 'Status'];
// NEW: detail-screen-only field display order (see itemDetail's field
// list). Interleaves each item's viewOnlyFields (Visibility, Last
// Updated, etc.) into their correct truth position instead of just
// appending them after item.fields — Product details-6 shows Visibility
// between Price and Status, but Last Updated at the very end, so a plain
// concatenation can't produce the right order for both at once.
const DETAIL_FIELD_ORDER = ['Category', 'Specification', 'Brand', 'Price', 'Visibility', 'Status', 'Last Updated'];
// A light per-field icon so detail/edit rows match the truth screens
// (Category/Price/Brand/etc. each have their own icon) without having to
// carry an icon name on every field of every mock item.
const KNOWLEDGE_FIELD_ICON: Record<string, string> = {
  // FIX: re-verified directly against Product details-6's truth icon column
  // — Category/Specification/Brand/Status were reusing generic or
  // duplicated icons (Category had a box instead of a folder; Specification
  // had sliders instead of an info-circle; Brand reused Price's price-tag
  // glyph, so Brand had no icon of its own; Status used a plain
  // checkmark-circle instead of a checkmark-shield).
  Category: 'folder-open-outline', Specification: 'information-circle-outline', Brand: 'mci:check-decagram-outline',
  Price: 'pricetag-outline', Status: 'shield-checkmark-outline', Visibility: 'eye-outline',
  'Last Updated': 'time-outline', Duration: 'time-outline', Availability: 'time-outline',
  Location: 'location-outline',
  // FIX: these two were reusing generic icons (a shield for Policy Type, a
  // link/chain for Applies To) that don't match the Figma truth screens at
  // all — Policy Type actually uses the same price-tag glyph as Price,
  // and Applies To uses the same cube/box glyph as Category.
  'Policy Type': 'pricetag-outline', 'Applies To': 'cube-outline', 'Applies to': 'cube-outline',
  Answer: 'chatbubble-ellipses-outline', Keywords: 'key-outline',
  // NEW: these three didn't have entries at all before (they didn't exist
  // as fields anywhere yet), so they fell through to the generic
  // 'ellipse-outline' dot.
  'Effective from': 'calendar-outline', To: 'calendar-outline',
  'Policy details': 'information-circle-outline', Description: 'reader-outline',
  // FIX: truth's edit screen (Product details-4) shows an info-circle icon
  // next to "Key Features", not a list-lines icon — 'list-outline' was a
  // reasonable guess but doesn't match.
  'Key Features': 'information-circle-outline',
};

// Recent Knowledge feed shown on the Knowledge Health dashboard.
const RECENT_KNOWLEDGE_DOCS = [
  { name: 'SBX Privacy and Policies.pdf', status: 'Approved', time: '2hr ago' },
  { name: 'FAQs Database', status: 'Approved', time: '2hr ago' },
  { name: 'Wholesale Pricing.pdf', status: 'Approved', time: '2hr ago' },
  { name: 'Brand guidelines', status: 'Approved', time: '2hr ago' },
];

// "Review Extracted Knowledge" checklist (Product list-3.png truth) — a
// sample of the 124 items NEXORA claims to have found, tagged by type so
// the filter tabs (All/Pricing Item/FAQs/Discount rules) have something
// real to filter.
// FIX (TS2367): 'type' was inferred narrowly from only the literals this
// 5-item mock sample actually uses (Pricing Item/FAQs/Policy) via `as
// const`, which silently excluded 'Discount rules' from the type — even
// though it's still a real filter tab on the truth screen (Product list-4:
// All/Pricing Item/FAQs/Discount rules). This mock sample just doesn't
// happen to include a Discount-rules row; the type should still allow one.
type ReviewItemType = 'Pricing Item' | 'FAQs' | 'Policy' | 'Discount rules';
const EXTRACTED_REVIEW_ITEMS: { id: string; name: string; subtitle: string; type: ReviewItemType; image?: string }[] = [
  // FIX: rk1 had no `image`, so the confirm-match screen (Product list-1
  // truth) always fell back to a plain gray headset glyph instead of
  // showing the real Oraimo Headphone photo truth displays. The other
  // four items have no corresponding extracted photo, so they correctly
  // keep using the icon fallback.
  { id: 'rk1', name: 'Oraimo Headphone', subtitle: 'High quality wireless headphone with noise cancellation and long battery.', type: 'Pricing Item', image: PRODUCT_IMAGE_URL.headphone },
  { id: 'rk2', name: 'TWS Airpod', subtitle: 'High quality wireless headphone with noise cancellation and long battery.', type: 'Pricing Item' },
  { id: 'rk3', name: 'SDT Sandisk', subtitle: 'High quality wireless headphone with noise cancellation and long battery.', type: 'Pricing Item' },
  // FIX: truth tags this row "Policy" (a category the top filter chips
  // don't even list — Policy items only ever show under "All") — this had
  // it mislabeled as 'Discount rules', which put it under the wrong filter
  // entirely and gave it the wrong badge text/color.
  { id: 'rk4', name: 'Return Policy', subtitle: 'High quality wireless smartwatch with strava preinstalled and long battery.', type: 'Policy' },
  { id: 'rk5', name: 'Warranty on Purchase?', subtitle: 'High quality wireless bluetooth speaker with noise cancellation and long battery.', type: 'FAQs' },
];

// Suggested-image matches for the "Add Image" sub-flow (Product list-5/6.png
// truth). Real per-source product photography isn't in this data set, so
// every suggestion reuses the one real Oraimo Headphone photo we do have
// rather than 6 different stock photos — still a real photo instead of a
// generic icon placeholder, which is what the truth screen actually shows
// (a grid of photos, not icons).
// FIX: truth says "We found 6 images that match this product" and shows 6
// tiles (4 visible + 2 more on scroll) — this only had 4.
const IMAGE_SUGGESTIONS = [
  { source: 'amazon.com', match: 92, best: true, image: PRODUCT_IMAGE_URL.headphone },
  { source: 'walmart.com', match: 84, best: false, image: PRODUCT_IMAGE_URL.headphone },
  { source: 'bestbuy.com', match: 72, best: false, image: PRODUCT_IMAGE_URL.headphone },
  { source: 'sony.com', match: 66, best: false, image: PRODUCT_IMAGE_URL.headphone },
  { source: 'ebay.com', match: 58, best: false, image: PRODUCT_IMAGE_URL.headphone },
  { source: 'aliexpress.com', match: 51, best: false, image: PRODUCT_IMAGE_URL.headphone },
];

// ---- Inbox mock data --------------------------------------------------
// Built from Inbox-5 through Inbox-9, Frame 916/917 (the customer-message
// list + AI-suggested-reply threads) — five conversations covering all 4
// status types the truth screens show: AI can handle, Needs Information,
// AI Low confidence, and Human attention.
type ConversationStatus = 'AI can handle' | 'Needs Information' | 'AI Low confidence' | 'Human attention';
type ConversationMessage = { id: string; from: 'customer' | 'business'; text: string; time: string };
type Conversation = {
  id: string; name: string; platform: 'Whatsapp' | 'Facebook' | 'Instagram' | 'Email';
  status: ConversationStatus; unread: number; lastMessage: string; lastTime: string;
  messages: ConversationMessage[];
  aiSuggestion?: { confidence: number; text: string; reasons: string[] };
  needInfo?: string;
};
const CONVERSATIONS: Conversation[] = [
  {
    id: 'sarah', name: 'Sarah Johnson', platform: 'Whatsapp', status: 'AI can handle', unread: 3,
    lastMessage: 'Is the black smartwatch still available?', lastTime: '10:45 AM',
    messages: [{ id: 'm1', from: 'customer', text: 'Is the black smartwatch still available?', time: '10:45 AM' }],
    aiSuggestion: {
      confidence: 92,
      text: 'Yes the black smartwatch is currently available. Its N45,000 and we can deliver to Lagos within 1-2 business days. Would you like me to place an order for you?',
      reasons: ['Product information found', 'Price remain unchanged', 'Delivery policy', "Customer's previous conversation"],
    },
  },
  {
    id: 'ayra', name: 'Ayra Stelph', platform: 'Facebook', status: 'AI can handle', unread: 1,
    lastMessage: 'That sound great! Please send the qu...', lastTime: '9:56 AM',
    messages: [
      { id: 'm1', from: 'customer', text: "I'm interested in buying 20 units of your premium model. Do you have any special pricing for bulk orders?", time: '10:45 AM' },
      { id: 'm2', from: 'business', text: 'Yes, we currently have the 20-unit package available at a special rate of $450 per unit. Would you like me to send you the full quote and terms?', time: '10:45 AM' },
      { id: 'm3', from: 'customer', text: 'That sounds great! Please send the quote', time: '10:47 AM' },
    ],
  },
  {
    id: 'david-adams', name: 'David Adams', platform: 'Instagram', status: 'Needs Information', unread: 1,
    lastMessage: 'Do you have X200 in stock?', lastTime: '11:45 PM',
    messages: [{ id: 'm1', from: 'customer', text: 'Do you have blue X200 in stock?', time: '10:45 AM' }],
    aiSuggestion: {
      confidence: 62,
      text: "I'm sorry, I don't have enough information to confirm the availability of the blue X200 variant. Let me get someone from the team to check this for you",
      reasons: ['Product information found', 'Blue variant not found', 'Requires human confirmation'],
    },
    needInfo: "I couldn't find reliable information about blue X200 variant in your business brain",
  },
  {
    id: 'grace', name: 'Grace Wilson', platform: 'Email', status: 'Human attention', unread: 0,
    lastMessage: 'I want a refund for my order #102', lastTime: '10:45 AM',
    messages: [{ id: 'm1', from: 'customer', text: 'I want a refund for my order #102', time: '10:45 AM' }],
  },
  {
    id: 'david-brown', name: 'David Brown', platform: 'Facebook', status: 'AI Low confidence', unread: 0,
    lastMessage: 'Do you have blue X200 in stock?', lastTime: '10:45 AM',
    messages: [{ id: 'm1', from: 'customer', text: 'Is the black smartwatch still available?', time: '10:45 AM' }],
    aiSuggestion: {
      confidence: 92,
      text: 'The black smartwatch is currently available. Its N45,000 and we can deliver to Lagos within 1-2 business days. Would you like me to place an order for you?',
      reasons: ['Product information found', 'Price remain unchanged', 'Delivery policy'],
    },
  },
];
const STATUS_BADGE_STYLE: Record<ConversationStatus, { bg: string; color: string }> = {
  'AI can handle': { bg: '#E6F4ED', color: '#1E9E6D' },
  'Needs Information': { bg: '#FDEFE0', color: '#C2760C' },
  'AI Low confidence': { bg: '#FDEFE0', color: '#C2760C' },
  'Human attention': { bg: '#FDEDED', color: '#D32F2F' },
};
const PLATFORM_ICON: Record<Conversation['platform'], string> = {
  Whatsapp: 'logo-whatsapp', Facebook: 'logo-facebook', Instagram: 'logo-instagram', Email: 'mail',
};
const PLATFORM_COLOR: Record<Conversation['platform'], string> = {
  Whatsapp: '#25D366', Facebook: '#1877F2', Instagram: '#E1306C', Email: '#5C6B7A',
};
const CONNECT_CHANNELS = [
  { key: 'whatsapp', name: 'Whatsapp', desc: 'Chat with your customers', icon: 'logo-whatsapp', color: '#25D366', connected: true },
  { key: 'instagram', name: 'Instagram', desc: 'Manage DMs and comments', icon: 'logo-instagram', color: '#E1306C', connected: true },
  { key: 'facebook', name: 'Facebook', desc: 'Respond to messages', icon: 'logo-facebook', color: '#1877F2', connected: false },
  { key: 'email', name: 'Email', desc: 'Handle customers email', icon: 'mail', color: '#5C6B7A', connected: false },
  { key: 'sms', name: 'SMS', desc: 'Text message conversion', icon: 'chatbox-outline', color: '#1E56A0', connected: false },
];
// iconColor defaults to white in the render below — Snapchat's brand
// yellow (#FFFC00) is too light for a white glyph to read against, so it
// gets an explicit dark icon color instead. This is the "social media
// icons not displaying properly" bug: the Snapchat icon was rendering as
// a near-invisible white ghost on a bright yellow tile.
const SHARE_TARGETS = [
  { name: 'Messages', icon: 'chatbubble', color: '#34C759' },
  { name: 'Instagram', icon: 'logo-instagram', color: '#E1306C' },
  { name: 'Facebook', icon: 'logo-facebook', color: '#1877F2' },
  { name: 'Whatsapp', icon: 'logo-whatsapp', color: '#25D366' },
  { name: 'Snapchat', icon: 'logo-snapchat', color: '#FFFC00', iconColor: '#0B1220' },
  { name: 'Gmail', icon: 'mail', color: '#EA4335' },
  { name: 'Telegram', icon: 'paper-plane', color: '#229ED9' },
];

// Mock data for the Schedule calendar (reached from Home's "More" ->
// "Schedule" command tile). Dates are ISO 'YYYY-MM-DD' strings so they're
// trivial to match against the day grid without timezone drift.
const SCHEDULE_EVENTS: { date: string; time: string; title: string; withWhom: string }[] = [
  { date: new Date().toISOString().slice(0, 10), time: '10:00 AM', title: 'Meeting with Sarah', withWhom: 'Sarah Johnson' },
  { date: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10), time: '2:30 PM', title: 'Supplier call', withWhom: 'TXR Distribution' },
  { date: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10), time: '9:00 AM', title: 'Inventory restock', withWhom: 'Warehouse team' },
];

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
  { label: 'Operations List', file: 'Operation list.png' },
  { label: 'Policies List', file: 'Policies list.png' },
  { label: 'FAQs List', file: 'FAQ list.png' },
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
// FIX: same missing-cache-bust issue as HOME1_TRUTH_URL above — every
// gallery entry was fetched as a bare URL, so re-uploading any truth PNG
// under its existing filename wouldn't show up here either.
const BRAIN_GALLERY_SCREENS = BRAIN_GALLERY_FILENAMES.map(({ label, file }) => ({
  label,
  url: withCacheBust(supabase.storage.from('brain-gallery').getPublicUrl(file).data.publicUrl),
}));

// Used directly by the live Home tab (not just the brain-gallery debug
// viewer) to render the search bar / insight card / command center /
// attention list section pixel-exact against the Figma truth file.
// FIX: these two never went through withCacheBust at all — every other
// bucket-hosted asset in this file gets a `?v=` query param specifically
// so a same-name file replacement in Supabase actually shows up (see
// ASSET_VERSION above); Home-1/Home-2's truth image was the one truth
// screen still fetched as a bare URL, so any re-upload of it was
// invisible until the app's image cache happened to clear on its own.
const HOME1_TRUTH_URL = withCacheBust(supabase.storage.from('brain-gallery').getPublicUrl('Home-1.png').data.publicUrl);
const HOME2_TRUTH_URL = withCacheBust(supabase.storage.from('brain-gallery').getPublicUrl('Home-2.png').data.publicUrl);

// Contact photo for the Inbox chat screen (Figma node 1335:306, "Nexora/Inbox").
// Not uploaded yet — see the note at the end of this fix for the exact file
// to add to the 'social-media' bucket. Until then this resolves to a URL
// that 404s and expo-image just renders an empty circle, which is harmless.
const INBOX_AVATAR_URL = withCacheBust(supabase.storage.from('social-media').getPublicUrl('Inbox-1-avatar.jpg').data.publicUrl);

// The Brain tab's idle hero illustration (the network-of-dots brain graphic
// from "Brain General Interface" 1/2/5/6). This was previously a plain
// Ionicons "hardware-chip-outline" glyph — a placeholder that never got
// swapped for the real artwork, which is why the Brain screen didn't match
// the truth screens. Cropped straight out of the Figma export with a
// transparent background so it drops onto brainScreenDark cleanly; upload
// it to the 'brain-gallery' bucket as 'brain-illustration.png' (attached
// alongside this file) for this to resolve.
const BRAIN_ILLUSTRATION_URL = withCacheBust(supabase.storage.from('brain-gallery').getPublicUrl('brain-illustration.png').data.publicUrl);

// The "Knowledge Health" gauge on the AI Brain Train screen was hand-built
// out of 18 rotated tick-mark Views, which never quite matched the smooth
// rounded-bar gauge graphic in the Figma truth screen. Using the real
// exported graphic (percentage + "Healthy" label baked in) instead — upload
// it to the 'brain-gallery' bucket as 'healthy.png' for this to resolve.
// Falls back to the old tick-built gauge if that file isn't there yet.
const KNOWLEDGE_HEALTH_GAUGE_URL = withCacheBust(supabase.storage.from('brain-gallery').getPublicUrl('healthy.png').data.publicUrl);

// The "Add Knowledge" processing screen's decorative orb — truth shows a
// gradient sphere with scattered sparkle/star shapes around it, not a
// plain flat-blue circle with a single sparkles glyph. Pure vector in
// Figma (gradient + star shapes), so cropped straight out of the export
// with a transparent background rather than hand-building a gradient
// (this project has no gradient library like expo-linear-gradient
// installed). Falls back to the old flat circle if the file 404s.
const PROCESSING_ORB_URL = withCacheBust(supabase.storage.from('brain-gallery').getPublicUrl('processing-orb.png').data.publicUrl);

const SOCIAL_MEDIA_FILENAMES=[
  {label:'Brain Chat Share',file:'Brain chat share.png',width:394,height:855},
  {label:'File UI',file:'file -ui.png',width:529,height:852},
  {label:'Frame 916',file:'Frame 916.png',width:393,height:852},
  {label:'Frame 917',file:'Frame 917.png',width:393,height:852},
  {label:'Inbox 1',file:'Inbox-1.png',width:393,height:852},
  {label:'Inbox 2',file:'Inbox-2.png',width:393,height:852},
  {label:'Inbox 3',file:'Inbox-3.png',width:393,height:852},
  {label:'Inbox 4',file:'Inbox-4.png',width:393,height:852},
  {label:'Inbox 5',file:'Inbox-5.png',width:393,height:852},
  {label:'Inbox 6',file:'Inbox-6.png',width:393,height:852},
  {label:'Inbox 7',file:'Inbox-7.png',width:393,height:852},
  {label:'Inbox 8',file:'Inbox-8.png',width:393,height:852},
  {label:'Inbox 9',file:'Inbox-9.png',width:393,height:852},
  {label:'Inbox 10',file:'Inbox-10.png',width:561,height:852},
  {label:'Inbox 11',file:'Inbox-11.png',width:561,height:852},
  {label:'Inbox 12',file:'Inbox-12.png',width:393,height:852},
  {label:'Inbox 13',file:'Inbox-13.png',width:561,height:852},
  {label:'Inbox 14',file:'Inbox-14.png',width:561,height:852},
  {label:'Message Failed',file:'Message failed.png',width:393,height:852},
  {label:'Nexora AI Processing',file:'Nexora ai processing.png',width:393,height:852},
  {label:'Offline Message',file:'Offline Message.png',width:393,height:852},
];
const SOCIAL_MEDIA_SCREENS=SOCIAL_MEDIA_FILENAMES.map(({label,file,width,height})=>({label,file,width,height,url:withCacheBust(supabase.storage.from('social-media').getPublicUrl(file).data.publicUrl)}));

type Screen='launch'|'onboarding'|'signup'|'login'|'forgotPassword'|'main'|'knowledgeHealth'|'knowledgeList'|'itemDetail'|'itemEdit'|'addKnowledge'|'brainGallery'|'socialMedia'|'inboxChat'|'connectChannels'|'calendar';
type KnowledgeCategory='products'|'services'|'operations'|'policies'|'faqs';
type KnowledgeField={label:string;value:string};
type KnowledgeItem={id:string;name:string;subtitle:string;status:'Verified'|'Need review'|'Draft';icon:string;iconBg:string;iconColor:string;overview:string;fields:KnowledgeField[];features?:string[];image?:string;viewOnlyFields?:KnowledgeField[]};

// A couple of items don't have a good match in Ionicons or
// MaterialCommunityIcons at all — e.g. Figma's "Delivery" icon fuses a
// truck and a clock into one custom illustration. Names prefixed 'img:'
// render the real cropped Figma asset (see ICON_IMAGE_URL) instead of a
// stock glyph, falling back to the truck icon if that file 404s. Names
// prefixed 'mci:' render through MaterialCommunityIcons (ships in the same
// @expo/vector-icons package, no new dependency) for the handful of items
// — like Phone Repair's screwdriver+wrench — where that set has a much
// closer match than Ionicons. Everything else still renders through
// Ionicons exactly as before.
// A couple of items don't have a good match in Ionicons or
// MaterialCommunityIcons at all — e.g. Figma's "Delivery" icon fuses a
// truck and a clock into one custom illustration. Names prefixed 'img:'
// render the real cropped Figma asset (see ICON_IMAGE_URL) instead of a
// stock glyph, falling back to that entry's own `fallback` icon if the
// file 404s. Names prefixed 'mci:' render through MaterialCommunityIcons
// (ships in the same @expo/vector-icons package, no new dependency) for
// the handful of items where that set has a much closer match than
// Ionicons. Everything else still renders through Ionicons exactly as
// before.
function KnowledgeIcon({ name, size, color }: { name: string; size: number; color: string }) {
  const [imgFailed, setImgFailed] = useState(false);
  if (name.startsWith('img:')) {
    const key = name.slice(4);
    const entry = ICON_IMAGE_URL[key];
    if (!imgFailed && entry) {
      return (
        <ExpoImage
          source={{ uri: entry.url }}
          style={{ width: size, height: size }}
          contentFit="contain"
          cachePolicy="memory-disk"
          onError={() => setImgFailed(true)}
        />
      );
    }
    return <KnowledgeIcon name={entry?.fallback ?? 'help-circle-outline'} size={size} color={color} />;
  }
  if (name.startsWith('mci:')) {
    return <MaterialCommunityIcons name={name.slice(4) as any} size={size} color={color} />;
  }
  return <Ionicons name={name as any} size={size} color={color} />;
}

// FIX: item.image being a non-empty URL string was previously enough to
// commit to rendering <ExpoImage> at both call sites below (the
// knowledgeList row and the itemDetail header) — neither had an onError
// handler, so a photo that hasn't been uploaded to the bucket yet (or
// 404s for any other reason) rendered as a blank/broken image instead of
// falling back to the icon+color box, which is almost certainly what
// "images not displaying properly" was seeing. This wraps the same
// imgFailed/onError pattern KnowledgeIcon already uses above into a
// small reusable component so both call sites degrade gracefully.
function KnowledgeRowImage({ uri, style, fallback, contentFit = 'cover' }: { uri: string; style: any; fallback: React.ReactNode; contentFit?: 'cover' | 'contain' }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return (
    <ExpoImage
      source={{ uri }}
      style={style}
      contentFit={contentFit}
      cachePolicy="memory-disk"
      onError={() => setFailed(true)}
    />
  );
}

// NEW: the Source card's PDF citation (Product catalogue.pdf, Page 12) is
// the same pink-badge-with-red-PDF-icon on every detail/edit screen in
// Figma. It was previously a bare Ionicons "document-text" glyph with no
// background — this matches the real badge: MaterialCommunityIcons'
// "file-pdf-box" already IS the red document-with-folded-corner-and-
// "PDF"-text glyph Figma uses, just needs the pink rounded-square behind
// it.
function PdfSourceBadge() {
  return (
    <View style={styles.pdfBadge}>
      <MaterialCommunityIcons name="file-pdf-box" size={26} color="#E5484D" />
    </View>
  );
}

// NEW: itemDetail's overview card shows the item's icon/photo large and
// with no background box (just the glyph or photo sitting directly on
// the white card) — a completely different treatment from the small
// colored-square icon used in list rows. Previously itemDetail reused
// the small list-row treatment here (a colored box around a 30px icon),
// which is why every detail screen's icon looked wrong relative to
// Figma. Photos (item.image) get the same large treatment via a plain
// contain-fit image instead of an icon glyph.
function DetailOverviewIcon({ item }: { item: KnowledgeItem }) {
  if (item.image) {
    return (
      <KnowledgeRowImage
        uri={item.image}
        style={styles.detailOverviewPhoto}
        contentFit="contain"
        fallback={<KnowledgeIcon name={item.icon} size={64} color={item.iconColor} />}
      />
    );
  }
  return <KnowledgeIcon name={item.icon} size={64} color={item.iconColor} />;
}

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
  type MainTab = 'home' | 'brain' | 'inbox' | 'profile';
  type ChatMessage = { id: string; role: 'user' | 'ai'; text: string; imageUri?: string };

  const [mainTab, setMainTab] = useState<MainTab>('home');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const chatScrollRef = useRef<ScrollView>(null);

  // (commandExpanded/setCommandExpanded removed — the Home tab's command
  // center now renders as part of the Home-1.png truth image, so there's
  // no more expand-to-8-items toggle to drive.)
  const [brainGalleryIndex, setBrainGalleryIndex] = useState(0);
  const [socialMediaIndex, setSocialMediaIndex] = useState(0);
  const [inboxDraft, setInboxDraft] = useState('');
  const [homeCommandExpanded, setHomeCommandExpanded] = useState(false);
  const [connectedChannels, setConnectedChannels] = useState<Record<string, boolean>>(
    Object.fromEntries(CONNECT_CHANNELS.map(c => [c.key, c.connected]))
  );
  const [channelConnectStep, setChannelConnectStep] = useState<null | 'permission' | 'connecting' | 'done'>(null);
  const [channelConnectKey, setChannelConnectKey] = useState<string | null>(null);
  const [demoFailCount, setDemoFailCount] = useState(0);
  const [conversations, setConversations] = useState<Conversation[]>(CONVERSATIONS);
  const [activeConversationId, setActiveConversationId] = useState('sarah');
  const [inboxListFilter, setInboxListFilter] = useState<'All' | 'Unread' | 'Need attention'>('All');
  const [inboxPlatformFilter, setInboxPlatformFilter] = useState<'All' | 'Whatsapp' | 'Facebook' | 'Instagram' | 'Email'>('All');
  const [inboxModal, setInboxModal] = useState<null | 'takeover' | 'sending' | 'failed' | 'offline' | 'share'>(null);
  const [humanHandling, setHumanHandling] = useState<Record<string, boolean>>({});
  // True pixel dimensions of the file actually sitting in Supabase, read off
  // the image itself once it loads. The PNG exports don't share one fixed
  // size the way the Figma frames did, so we can't assume FIGMA_WIDTH x
  // FIGMA_HEIGHT (or the guessed width/height in SOCIAL_MEDIA_FILENAMES)
  // matches the real file — forcing a mismatched box with contentFit="fill"
  // is what was stretching/squishing the designs. Null while unknown/loading.
  const [brainNaturalSize, setBrainNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [socialNaturalSize, setSocialNaturalSize] = useState<{ width: number; height: number } | null>(null);
  // Image.getSize (from react-native core, not expo-image's onLoad) asks the
  // OS to read the file's actual header dimensions directly — it does NOT
  // depend on the size the <Image> is rendered at. expo-image's onLoad event
  // is unreliable for this on Android (it reports the rendered layout size,
  // not the source's real pixel size, whenever the view isn't already at its
  // intrinsic size — see github.com/expo/expo/issues/29982), which is why
  // the previous onLoad-based fix had no visible effect on an Android build.
  useEffect(() => {
    const current = BRAIN_GALLERY_SCREENS[brainGalleryIndex];
    if (!current) return;
    let cancelled = false;
    setBrainNaturalSize(null);
    Image.getSize(
      current.url,
      (w, h) => { if (!cancelled) setBrainNaturalSize({ width: w, height: h }); },
      (err) => { if (!cancelled) console.warn('[brainGallery] getSize failed for', current.label, current.url, err); }
    );
    return () => { cancelled = true; };
  }, [brainGalleryIndex]);
  useEffect(() => {
    const current = SOCIAL_MEDIA_SCREENS[socialMediaIndex];
    if (!current) return;
    let cancelled = false;
    setSocialNaturalSize(null);
    Image.getSize(
      current.url,
      (w, h) => { if (!cancelled) setSocialNaturalSize({ width: w, height: h }); },
      (err) => { if (!cancelled) console.warn('[socialMedia] getSize failed for', current.label, current.url, err); }
    );
    return () => { cancelled = true; };
  }, [socialMediaIndex]);
  const [activeCategory, setActiveCategory] = useState<KnowledgeCategory>('products');
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [listStatusFilter, setListStatusFilter] = useState<'All' | 'Verified' | 'Drafts' | 'Need review'>('All');
  const [editDraft, setEditDraft] = useState<KnowledgeField[]>([]);
  // NEW: 'uploadImage' — the "Upload your own image" choice on the
  // addImage step used to just call setAddKnowledgeStep('review')
  // directly, with no screen of its own — a dead no-op that silently
  // skipped the actual upload screen. This is why "Upload Picture"
  // (Add image-1.svg) and the alternate "Add Knowledge"-titled version
  // of it (Add image-2.svg) had no way to reach them at all.
  const [addKnowledgeStep, setAddKnowledgeStep] = useState<'choose' | 'upload' | 'processing' | 'summary' | 'review' | 'addImage' | 'uploadImage' | 'imageMatch'>('choose');
  const [reviewChecks, setReviewChecks] = useState<Record<string, boolean>>({ rk1: true, rk2: true, rk3: true, rk5: true });
  const [reviewFilter, setReviewFilter] = useState<'All' | 'Pricing Item' | 'FAQs' | 'Discount rules'>('All');
  const [imageMatchTarget, setImageMatchTarget] = useState<string | null>(null);
  const [imageMatchStage, setImageMatchStage] = useState<'suggestions' | 'confirm'>('suggestions');
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const [licenseConfirmed, setLicenseConfirmed] = useState(false);
  // Schedule calendar (Home -> More -> Schedule)
  const [calendarCursor, setCalendarCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const todayIso = new Date().toISOString().slice(0, 10);
  const [selectedScheduleDate, setSelectedScheduleDate] = useState(todayIso);
  const [brainImageFailed, setBrainImageFailed] = useState(false);
  const [gaugeImageFailed, setGaugeImageFailed] = useState(false);
  const [processingOrbFailed, setProcessingOrbFailed] = useState(false);

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
  // The backend (ai-chat function) returns free-form text, same as before —
  // this doesn't invent a parallel structured-response format. It just
  // recognizes common LLM output patterns (numbered lists, short
  // header-like lines, a trailing "what next" prompt) and renders them with
  // real typography instead of one flat paragraph. Any reply that doesn't
  // match those patterns still renders fine as plain lines.
  const renderFormattedAiText = (text: string) => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const nextIdx = lines.findIndex(l => /what would you like to do next\??$/i.test(l.replace(/\*\*/g, '')));
    const bodyLines = nextIdx === -1 ? lines : lines.slice(0, nextIdx);
    const followUpHeader = nextIdx === -1 ? null : lines[nextIdx].replace(/\*\*/g, '');
    const chipLines = nextIdx === -1 ? [] : lines.slice(nextIdx + 1).filter(l => l.length < 40).map(l => l.replace(/^[-•\d.]+\s*/, ''));
    return (
      <View>
        {bodyLines.map((line, i) => {
          const numbered = line.match(/^(\d+)\.\s+(.*)/);
          const boldHeader = line.match(/^\*\*(.+?)\*\*:?$/);
          const shortHeader = !numbered && !boldHeader && /:$/.test(line) && line.length < 40;
          if (numbered) {
            return <Text key={i} style={[styles.bubbleText, styles.aiListItem]}><Text style={styles.aiListNumber}>{numbered[1]}. </Text>{numbered[2]}</Text>;
          }
          if (boldHeader || shortHeader) {
            return <Text key={i} style={styles.aiSectionHeader}>{(boldHeader ? boldHeader[1] : line)}</Text>;
          }
          return <Text key={i} style={styles.bubbleText}>{line}</Text>;
        })}
        {followUpHeader && (
          <>
            <Text style={[styles.aiSectionHeader, { marginTop: 10 }]}>{followUpHeader}</Text>
            <View style={styles.aiChipRow}>
              {chipLines.map(chip => (
                <Pressable key={chip} onPress={() => sendChatMessage(chip)} style={styles.aiChip}>
                  <Text style={styles.aiChipText}>{chip}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </View>
    );
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
    if (option === 'Connect Apps') { openSocialMediaScreen('Brain Chat Share'); return; }

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

  // FIX: editDraft used to be a raw copy of item.fields, which for every
  // category starts with 'Category' — so idx===0 in the old itemEdit
  // render was actually the Category field, not the item's name, and
  // there was no way to edit the name at all (Figma's top card always
  // has a Name field: "Product Name"/"Service Name"/"Policy"/
  // "Question"). It also never included Description (item.overview) or
  // Key Features/Policy details (item.features), so those couldn't be
  // edited even though itemDetail displays them. This builds the full
  // field set the truth screens actually show, in the same order.
  const openItemEdit = () => {
    const item = KNOWLEDGE_DATA[activeCategory].items.find(i => i.id === activeItemId);
    if (!item) { setEditDraft([]); setScreen('itemEdit'); return; }
    const nameLabel = KNOWLEDGE_NAME_LABEL[activeCategory];
    const hasCategory = item.fields.some(f => f.label === 'Category');
    // FIX: two ordering/scope bugs from the first pass —
    //  1. Figma always shows Key Features/Policy details BEFORE
    //     Description (Edit Product: Price/Specification/Brand/Status/
    //     Key Features/Description), this had Description pushed first.
    //  2. Policies (and Operations) don't get a separate Description
    //     field at all in Figma — Policy details (their `features`) is
    //     the only long-text field. Description is products/services
    //     only; this was adding it for every category with an overview,
    //     which every category has.
    const draft: KnowledgeField[] = [
      { label: nameLabel, value: item.name },
      // FAQs have no stored Category field (it's always just "FAQ" in
      // Figma) — every other category already carries a real one.
      ...(hasCategory ? [] : [{ label: 'Category', value: 'FAQ' }]),
      ...item.fields.map(f => ({ ...f })),
      // FIX: Figma's Key Features/Policy details box shows actual bullet
      // points ("• Active Noise Cancellation"), not plain lines — this
      // was joining the raw feature strings with no bullet prefix at all.
      ...(item.features ? [{ label: activeCategory === 'policies' ? 'Policy details' : 'Key Features', value: item.features.map(f => `\u2022 ${f}`).join('\n') }] : []),
      ...(item.overview && (activeCategory === 'products' || activeCategory === 'services') ? [{ label: 'Description', value: item.overview }] : []),
    ];
    setEditDraft(draft);
    setScreen('itemEdit');
  };

  const openAddKnowledge = () => {
    setAddKnowledgeStep('choose');
    setReviewFilter('All');
    setImageMatchStage('suggestions');
    setScreen('addKnowledge');
  };

  const runKnowledgeProcessing = () => {
    setAddKnowledgeStep('processing');
    setTimeout(() => setAddKnowledgeStep('summary'), 1800);
  };

  // Jumps straight to one labeled screen in the 'social-media' gallery
  // instead of always landing on index 0 — used by "Connect Apps" below,
  // which should land on the "Brain Chat Share" reference screen rather
  // than the first file in the bucket.
  const openSocialMediaScreen = (label: string) => {
    const idx = SOCIAL_MEDIA_SCREENS.findIndex(s => s.label === label);
    setSocialMediaIndex(idx >= 0 ? idx : 0);
    setScreen('socialMedia');
  };

  const handleCommandCenterPress=(label:string)=>{
    if(label==='Train AI'){setScreen('knowledgeHealth');return;}
    if(label==='Policies'){openKnowledgeList('policies');return;}
    if(label==='FAQs'){openKnowledgeList('faqs');return;}
    if(label==='Inbox'){setMainTab('inbox');setScreen('main');return;}
    if(label==='Connect Apps'){openSocialMediaScreen('Brain Chat Share');return;}
    if(label==='Schedule'){setScreen('calendar');return;}
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

  const renderTopBar = (dark: boolean = false) => (
    <View style={[styles.topBar, dark && styles.topBarDark]}>
      <Ionicons name="menu-outline" size={26} color={dark ? '#FFF' : '#0B1220'} />
      <View style={styles.topBarTitleWrap}>
        <Text style={[styles.topBarTitle, dark && styles.topBarTitleDark]}>Nexora AI</Text>
        <Text style={[styles.topBarSubtitle, dark && styles.topBarSubtitleDark]}>AI Business Manager</Text>
      </View>
      <View style={styles.topBarRight}>
        <View style={[styles.bellWrap, dark && styles.bellWrapDark]}>
          <Ionicons name="notifications-outline" size={22} color={dark ? '#FFF' : '#0B1220'} />
          <View style={styles.bellDot} />
        </View>
        <ExpoImage source={{ uri: INBOX_AVATAR_URL }} style={styles.topBarAvatar} contentFit="cover" cachePolicy="memory-disk" />
      </View>
    </View>
  );

  const renderBottomNav = () => {
    const renderTab = (tab: MainTab, icon: string, label: string, activeColor: string = '#0B1220') => {
      const active = mainTab === tab;
      return (
        <Pressable
          key={tab}
          onPress={() => { setMainTab(tab); setScreen('main'); }}
          style={[styles.navItem, active && styles.navBrainItem, active && { backgroundColor: activeColor }]}
        >
          <Ionicons name={icon as any} size={active ? 18 : 20} color={active ? '#FFF' : '#8A97A6'} />
          {active && <Text style={[styles.navBrainText, styles.navBrainTextActive]}>{label}</Text>}
        </Pressable>
      );
    };
    return (
      <View style={styles.bottomNav}>
        {renderTab('home', 'home-outline', 'Home')}
        {renderTab('inbox', 'chatbubble-ellipses-outline', 'Inbox', '#1E9E6D')}
        {renderTab('brain', 'sparkles', 'Brain')}
        <Pressable style={styles.navItem}>
          <Ionicons name="storefront-outline" size={20} color="#8A97A6" />
        </Pressable>
        {renderTab('profile', 'person-outline', 'Profile')}
      </View>
    );
  };

  if (screen === 'main') {
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
            <Pressable onPress={() => { setSocialMediaIndex(0); setScreen('socialMedia'); }} style={[styles.resetButton, styles.resetButtonEnabled, { marginTop: 12, width: '80%' }]}>
              <Text style={styles.resetButtonText}>View Social Media (21)</Text>
            </Pressable>
          </View>
          {renderBottomNav()}
        </View>
      );
    }

    if (mainTab === 'inbox') {
      const listCounts = {
        All: conversations.length,
        Unread: conversations.filter(c => c.unread > 0).length,
        'Need attention': conversations.filter(c => c.status === 'Needs Information' || c.status === 'Human attention').length,
      };
      const filtered = conversations
        .filter(c => inboxListFilter === 'All' ? true : inboxListFilter === 'Unread' ? c.unread > 0 : (c.status === 'Needs Information' || c.status === 'Human attention'))
        .filter(c => inboxPlatformFilter === 'All' ? true : c.platform === inboxPlatformFilter);
      return (
        <View style={styles.mainScreen}>
          <StatusBar style="dark" />
          <View style={styles.knowledgeHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.knowledgeHeaderTitle}>Inbox</Text>
            </View>
            {/* Entry point into the social-media reference gallery (all 21
                files in the Supabase 'social-media' bucket: Inbox-1..14,
                Frame 916/917, Message failed, Offline Message, Nexora AI
                Processing, Brain Chat Share, File UI). Previously only
                reachable from the Profile tab, buried away from the Inbox
                screen these screens actually belong to. */}
            <Pressable onPress={() => { setSocialMediaIndex(0); setScreen('socialMedia'); }} hitSlop={8} style={{ marginRight: 16 }}>
              <Ionicons name="images-outline" size={22} color="#0B1220" />
            </Pressable>
            <Pressable onPress={() => setScreen('connectChannels')} hitSlop={8}>
              <Ionicons name="settings-outline" size={22} color="#0B1220" />
            </Pressable>
          </View>
          <Text style={styles.inboxSubtitle}>All your customers conversations in one place</Text>
          <View style={[styles.searchBarPlain, { marginHorizontal: 16 }]}>
            <Ionicons name="search-outline" size={16} color="#8A97A6" />
            <Text style={styles.homeSearchPlaceholder}>Search conversations...</Text>
          </View>
          <View style={[styles.filterRow, { paddingHorizontal: 16 }]}>
            {(['All', 'Unread', 'Need attention'] as const).map(f => (
              <Pressable key={f} onPress={() => setInboxListFilter(f)} style={[styles.filterChip, inboxListFilter === f && styles.filterChipActive]}>
                <Text style={[styles.filterChipText, inboxListFilter === f && styles.filterChipTextActive]}>{f} ({listCounts[f]})</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.platformChipRow}>
            {(['All', 'Whatsapp', 'Facebook', 'Instagram', 'Email'] as const).map(p => {
              const active = inboxPlatformFilter === p;
              // Each platform's brand color (WhatsApp green, Instagram pink,
              // Facebook blue) should show all the time, like the truth
              // screen — not just on the selected chip. Previously the
              // `active &&` guard meant every unselected icon fell back to
              // plain gray, so color only appeared while a chip was
              // pressed/selected. Selection is now shown with a dark ring
              // around the circle and a bold label instead of stripping
              // the color from everything else.
              const chipColor = p === 'All' ? '#0B1220' : PLATFORM_COLOR[p];
              return (
                <Pressable key={p} onPress={() => setInboxPlatformFilter(p)} style={styles.platformChipItem}>
                  <View style={[styles.platformChipCircle, { backgroundColor: chipColor }, active && styles.platformChipCircleSelected]}>
                    <Ionicons name={p === 'All' ? 'apps' : (PLATFORM_ICON[p] as any)} size={16} color="#FFF" />
                  </View>
                  <Text style={[styles.platformChipLabel, active && styles.platformChipLabelActive]}>{p}</Text>
                </Pressable>
              );
            })}
          </View>
          <ScrollView style={styles.homeScroll} contentContainerStyle={[styles.homeScrollContent, { paddingTop: 8 }]}>
            {filtered.map(c => (
              <Pressable key={c.id} onPress={() => { setActiveConversationId(c.id); setConversations(prev => prev.map(x => x.id === c.id ? { ...x, unread: 0 } : x)); setScreen('inboxChat'); }} style={styles.conversationRow}>
                <View style={styles.conversationAvatarWrap}>
                  <View style={styles.conversationAvatar}><Text style={styles.conversationAvatarText}>{c.name.split(' ').map(n => n[0]).join('')}</Text></View>
                  <View style={[styles.conversationPlatformBadge, { backgroundColor: PLATFORM_COLOR[c.platform] }]}>
                    <Ionicons name={PLATFORM_ICON[c.platform] as any} size={9} color="#FFF" />
                  </View>
                </View>
                <View style={styles.attentionTextWrap}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={styles.attentionTitle}>{c.name}</Text>
                    <Text style={styles.conversationTime}>{c.lastTime}</Text>
                  </View>
                  <Text style={styles.attentionSubtitle} numberOfLines={1}>{c.lastMessage}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 }}>
                    <View style={[styles.conversationStatusPill, { backgroundColor: STATUS_BADGE_STYLE[c.status].bg }]}>
                      <Text style={[styles.conversationStatusPillText, { color: STATUS_BADGE_STYLE[c.status].color }]}>{c.status}</Text>
                    </View>
                    {c.unread > 0 && <View style={styles.conversationUnreadBadge}><Text style={styles.conversationUnreadBadgeText}>{c.unread}</Text></View>}
                  </View>
                </View>
              </Pressable>
            ))}
          </ScrollView>
          {renderBottomNav()}
        </View>
      );
    }

    if (mainTab === 'brain') {
      return (
        <View style={[styles.mainScreen, styles.brainScreenDark]}>
          <StatusBar style="light" />
          {renderTopBar(true)}

          <ScrollView ref={chatScrollRef} style={styles.chatScroll} contentContainerStyle={styles.chatScrollContent}>
            {chatMessages.length === 0 ? (
              <>
                <View style={styles.brainHero}>
                  <View style={styles.brainHeroIconWrap}>
                    {brainImageFailed ? (
                      <Ionicons name="hardware-chip-outline" size={64} color="#EAF1FB" />
                    ) : (
                      <ExpoImage
                        source={{ uri: BRAIN_ILLUSTRATION_URL }}
                        style={styles.brainHeroImage}
                        contentFit="contain"
                        cachePolicy="memory-disk"
                        onError={() => {
                          // Falls back to the old chip icon rather than a
                          // blank gap if 'brain-illustration.png' hasn't
                          // been uploaded to the 'brain-gallery' bucket yet.
                          console.warn('[brainHero] failed to load', BRAIN_ILLUSTRATION_URL);
                          setBrainImageFailed(true);
                        }}
                      />
                    )}
                  </View>
                  <Text style={styles.brainHeroTitle}>Hi, {fullName || 'there'}</Text>
                  <Text style={styles.brainHeroSubtitle}>What would you like to do today?</Text>
                </View>
                <Text style={styles.popularLabel}>Popular Questions</Text>
                {popularQuestions.map(q => (
                  <Pressable key={q} onPress={() => sendChatMessage(q)} style={styles.popularItem}>
                    <Ionicons name="search-outline" size={16} color="#8FA3BC" />
                    <Text style={styles.popularItemText}>{q}</Text>
                    <Ionicons name="chevron-forward" size={16} color="#5C6B7A" />
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
                      m.role === 'ai'
                        ? renderFormattedAiText(m.text)
                        : <Text style={[styles.bubbleText, styles.bubbleTextUser, m.imageUri ? { marginTop: 8 } : null]}>{m.text}</Text>
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

          {/* Entry point into the brain-gallery reference viewer (Product
              details/list, Add Knowledge, Add image, FAQ/Service/Operations
              lists, Home-1/2, Brain General Interface 1-6, AI Brain Train —
              all 30 files in the Supabase 'brain-gallery' bucket). This was
              previously a dead button with no onPress, which is why there
              was no way to reach these screens from the Brain tab. */}
          <Pressable
            style={styles.brainFloatingBtn}
            onPress={() => { setBrainGalleryIndex(0); setScreen('brainGallery'); }}
            accessibilityLabel="View brain-gallery reference screens"
            hitSlop={8}
          >
            <Ionicons name="sparkles" size={16} color="#FFF" />
          </Pressable>

          {showAttachMenu && (
            <View style={styles.attachMenu}>
              {[
                { icon: 'camera-outline', label: 'Camera' },
                { icon: 'document-attach-outline', label: 'Add Files' },
                { icon: 'extension-puzzle-outline', label: 'Connect Apps' },
                { icon: 'hardware-chip-outline', label: 'Train Your AI' },
              ].map(opt => (
                <Pressable key={opt.label} onPress={() => handleAttachOption(opt.label)} style={styles.attachOption}>
                  <Ionicons name={opt.icon as any} size={18} color="#FFF" />
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
    // The block below (search bar through "Review orders") used to be
    // hand-built from Ionicons + Views, which is why it drifted from the
    // Figma frame (wrong icon set, missing robot illustration, slightly
    // different spacing). It's now the actual Home-1.png truth file from
    // the 'brain-gallery' bucket, cropped to just that section and scaled
    // the same width-based way every other truth screen in this file is
    // (see LaunchSVG/OnboardingSVG usage above: width=width, height=
    // FIGMA_HEIGHT*scale). Invisible Pressables sit on top at the same
    // Figma-space coordinates to keep every existing tap handler working.
    // "More" toggles to the Home-2.png truth file (the real 8-item expanded
    // grid, measured the same way) instead of falling through to a generic
    // chat handler. Both states crop out right before "Need Your Attention"
    // and hand off to a real, always-tappable rendering of that section
    // (same styles as the Knowledge Health dashboard) rather than pixel
    // overlays on the image — Home-2's truth frame doesn't even show that
    // section in full (it's pushed down/truncated by the taller grid), so
    // there's no image content to overlay there anyway.
    const homeTruthUrl = homeCommandExpanded ? HOME2_TRUTH_URL : HOME1_TRUTH_URL;
    // FIX: HOME1_BOTTOM_Y (526) was being reused for BOTH the collapsed
    // and expanded states, but Home-2's truth layout is taller — it has a
    // second icon row, so "Need Your Attention" doesn't start until
    // y≈655 in Figma space (checked directly against Home-2.svg), not
    // y≈540 like Home-1. Reusing 526 as the crop bottom for both meant the
    // expanded view's crop window never grew to fit the second row, so
    // row 2 (Policies/Inbox/Schedule/FAQs) — and even "More" itself once
    // tapped — sat below the visible, touchable area entirely, clipped by
    // this container's overflow:'hidden'. Each state now gets its own
    // measured bottom bound.
    const HOME1_TOP_Y = 102;
    const HOME1_BOTTOM_Y = homeCommandExpanded ? 645 : 526; // crop window bottom, in 393x852 Figma space
    const home1FullHeight = FIGMA_HEIGHT * scale;
    const home1VisibleHeight = (HOME1_BOTTOM_Y - HOME1_TOP_Y) * scale;
    const y = (figmaY: number) => (figmaY - HOME1_TOP_Y) * scale; // figma-space Y -> position inside the crop window
    const x = (figmaX: number) => figmaX * scale; // figma-space X -> on-screen X
    const commandItems = homeCommandExpanded
      ? ['Train AI', 'Connect Apps', 'Create Post', 'AI Employees', 'Policies', 'Inbox', 'Schedule', 'FAQs']
      : ['Train AI', 'Connect Apps', 'Create Post', 'More'];
    return (
      <View style={styles.mainScreen}>
        <StatusBar style="dark" />
        {renderTopBar()}

        <ScrollView style={styles.homeScroll} contentContainerStyle={styles.homeScrollContent}>
          <View style={{ width, height: home1VisibleHeight, overflow: 'hidden' }}>
            <ExpoImage
              source={{ uri: homeTruthUrl }}
              style={{ width, height: home1FullHeight, marginTop: -HOME1_TOP_Y * scale }}
              contentFit="cover"
              cachePolicy="memory-disk"
            />

            {/* search bar */}
            <Pressable
              onPress={() => setMainTab('brain')}
              style={{ position: 'absolute', left: x(16), top: y(102), width: x(361), height: y(149) - y(102) }}
            />

            {/* "View recommendations" link */}
            <Pressable
              onPress={() => setMainTab('brain')}
              style={{ position: 'absolute', left: x(16), top: y(302), width: x(184), height: y(345) - y(302) }}
            />

            {/* AI Command Center — 4 columns, 1 row collapsed / 2 rows expanded */}
            {commandItems.map((label, i) => {
              const row = Math.floor(i / 4), col = i % 4;
              const rowTop = row === 0 ? 422 : 537, rowBottom = row === 0 ? 511 : 626;
              return (
                <Pressable
                  key={label}
                  onPress={() => label === 'More' ? setHomeCommandExpanded(true) : handleCommandCenterPress(label)}
                  style={{
                    position: 'absolute',
                    left: x(16 + col * 90.25),
                    top: y(rowTop),
                    width: x(90.25),
                    height: y(rowBottom) - y(rowTop),
                  }}
                />
              );
            })}
          </View>

          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>Need Your Attention</Text>
            <Text style={styles.sectionViewAll}>View All ›</Text>
          </View>
          <View style={styles.attentionCard}>
            {/* NEW: truth screen (Home-1) shows this as the first "Need
                Your Attention" item — it was missing entirely from the
                Home screen's own attention list (a different item already
                covers the phone-icon slot on the AI Brain Train dashboard's
                version of this section, but Home's own list never had it). */}
            <View style={styles.attentionItem}>
              <View style={styles.attentionIconWrap}>
                <View style={[styles.attentionCountBadge, { backgroundColor: '#D64545' }]}><Text style={styles.attentionCountBadgeText}>8</Text></View>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#FBE7E7', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="call" size={16} color="#D64545" />
                </View>
              </View>
              <View style={styles.attentionTextWrap}>
                <Text style={styles.attentionTitle}>Nexora AI called you</Text>
                <Text style={styles.attentionSubtitle}>Blue variant of headphone requested</Text>
              </View>
              <Pressable onPress={() => { setMainTab('brain'); sendChatMessage('Tell me about the call regarding the blue headphone variant'); }} style={[styles.attentionButton, { backgroundColor: '#FBE7E7' }]}>
                <Text style={[styles.attentionButtonText, { color: '#D64545' }]}>Review orders</Text>
              </Pressable>
            </View>
            <View style={styles.attentionItem}>
              <View style={styles.attentionIconWrap}>
                <View style={styles.attentionCountBadge}><Text style={styles.attentionCountBadgeText}>5</Text></View>
                {/* FIX: truth uses the filled "image" glyph, not the
                    thin-line outline variant. */}
                <Ionicons name="image" size={18} color="#1E56A0" />
              </View>
              <View style={styles.attentionTextWrap}>
                <Text style={styles.attentionTitle}>Images required for 5 items</Text>
                <Text style={styles.attentionSubtitle}>Add images to improve products discovery</Text>
              </View>
              <Pressable onPress={() => { setMainTab('brain'); sendChatMessage('Which 5 items need images?'); }} style={styles.attentionButton}>
                <Text style={styles.attentionButtonText}>Fix now</Text>
              </Pressable>
            </View>
            <View style={styles.attentionItem}>
              {/* FIX: truth themes this whole item orange, not blue — the
                  icon color was already orange, but the box background and
                  the count badge were both left on the shared blue style,
                  and the icon itself was a plain cube instead of the
                  truck+clock illustration truth actually shows (extracted
                  as its own asset — see 'orders-shipping-icon' above,
                  a separately-colored export of the same illustration used
                  for the blue "delivery-icon" elsewhere). */}
              <View style={[styles.attentionIconWrap, { backgroundColor: '#FBE7D6' }]}>
                <View style={[styles.attentionCountBadge, { backgroundColor: '#C2760C' }]}><Text style={styles.attentionCountBadgeText}>8</Text></View>
                <KnowledgeIcon name="img:orders-shipping-icon" size={18} color="#C2760C" />
              </View>
              <View style={styles.attentionTextWrap}>
                <Text style={styles.attentionTitle}>8 Orders hasn't shipped</Text>
                <Text style={styles.attentionSubtitle}>Some orders are pending shipment</Text>
              </View>
              <Pressable onPress={() => { setMainTab('brain'); sendChatMessage('Show me the 8 orders that haven\'t shipped'); }} style={styles.attentionButton}>
                <Text style={styles.attentionButtonText}>Review orders</Text>
              </Pressable>
            </View>
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
    // Figma's dashboard only surfaces 4 categories in this grid (no FAQs
    // tile) — FAQs is still a real category, just reached via "View All"
    // rather than the main grid, same as the truth screen.
    const gridCategories: KnowledgeCategory[] = ['products', 'services', 'policies', 'operations'];
    return (
      <View style={styles.mainScreen}>
        <StatusBar style="dark" />
        {renderTopBar()}
        <ScrollView style={styles.homeScroll} contentContainerStyle={styles.homeScrollContent}>
          <Pressable onPress={() => setMainTab('brain')} style={styles.homeSearchBar}>
            <Ionicons name="add" size={18} color="#0B1220" />
            <Text style={styles.homeSearchPlaceholder}>Ask Nexora about your business…</Text>
            <View style={{ flex: 1 }} />
            <Ionicons name="mic-outline" size={18} color="#5C6B7A" style={{ marginRight: 8 }} />
            <View style={styles.homeSearchSendButton}>
              <Ionicons name="arrow-up" size={14} color="#FFF" />
            </View>
          </Pressable>

          <View style={styles.gaugeCard}>
            <View style={styles.gaugeTitleRow}>
              <View style={styles.gaugeShieldIcon}>
                <Ionicons name="shield-checkmark" size={14} color="#1E9E6D" />
              </View>
              <Text style={styles.gaugeTitleText}>Knowledge Health</Text>
            </View>
            <View style={styles.gaugeRow}>
              {gaugeImageFailed ? (
                <View style={styles.gaugeArcWrap}>
                  {Array.from({ length: 18 }).map((_, i) => {
                    const t = i / 17;
                    const angle = -90 + t * 180;
                    const color = t < 0.72 ? '#1E9E6D' : t < 0.85 ? '#E5A63A' : '#D64545';
                    return (
                      <View
                        key={i}
                        style={[
                          styles.gaugeTick,
                          { backgroundColor: color, transform: [{ rotate: `${angle}deg` }, { translateY: -54 }] },
                        ]}
                      />
                    );
                  })}
                  <View style={styles.gaugeCenterText}>
                    <Text style={styles.gaugePercent}>80%</Text>
                    <Text style={styles.gaugeLabel}>Healthy</Text>
                  </View>
                </View>
              ) : (
                <ExpoImage
                  source={{ uri: KNOWLEDGE_HEALTH_GAUGE_URL }}
                  style={styles.gaugeArcWrap}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  onError={() => {
                    console.warn('[gauge] failed to load', KNOWLEDGE_HEALTH_GAUGE_URL);
                    setGaugeImageFailed(true);
                  }}
                />
              )}
              <View style={styles.gaugeLegend}>
                <View style={styles.gaugeLegendRow}><View style={[styles.gaugeDot, { backgroundColor: '#1E9E6D' }]} /><Text style={styles.gaugeLegendText}>80%</Text></View>
                <View style={styles.gaugeLegendRow}><View style={[styles.gaugeDot, { backgroundColor: '#E5A63A' }]} /><Text style={styles.gaugeLegendText}>15%</Text></View>
                <View style={styles.gaugeLegendRow}><View style={[styles.gaugeDot, { backgroundColor: '#D64545' }]} /><Text style={styles.gaugeLegendText}>5%</Text></View>
              </View>
            </View>
            <View style={styles.statsRow}>
              <View style={styles.statBoxCard}>
                {/* FIX: truth screen gives each stat icon a light tinted
                    circular background (blue for Documents, purple for
                    Storage) — these were bare icons with no background at
                    all. Storage's icon was also 'server-outline' (rack
                    bars), which doesn't match truth's rounded-cylinder
                    database icon — swapped to MaterialCommunityIcons'
                    'database-outline' via the shared KnowledgeIcon helper. */}
                <View style={styles.statIconCircleBlue}>
                  <Ionicons name="document-text-outline" size={16} color="#1E56A0" />
                </View>
                <Text style={styles.statLabel}>Documents</Text>
                <Text style={styles.statValue}>1,223</Text>
                <View style={styles.statDeltaPill}><Ionicons name="arrow-up" size={10} color="#1E9E6D" /><Text style={styles.statDeltaText}>19% vs Last month</Text></View>
              </View>
              <View style={styles.statBoxCard}>
                <View style={styles.statIconCirclePurple}>
                  <KnowledgeIcon name="mci:database-outline" size={16} color="#7C3AED" />
                </View>
                <Text style={styles.statLabel}>Storage</Text>
                <Text style={styles.statValue}>13.34 GB</Text>
                <View style={styles.statDeltaPill}><Ionicons name="arrow-up" size={10} color="#1E9E6D" /><Text style={styles.statDeltaText}>32% vs Last month</Text></View>
              </View>
            </View>
          </View>

          <View style={styles.knowledgeCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>Knowledge Categories</Text>
              {/* FAQs is a real category but doesn't get its own tile in the
                  4-up grid below (matches the truth screen) — "View All"
                  is how it's reached from here. Was plain, untappable Text. */}
              <Pressable onPress={() => openKnowledgeList('faqs')}><Text style={styles.sectionViewAll}>View All ›</Text></Pressable>
            </View>
            <View style={styles.commandGrid}>
              {gridCategories.map(key => (
                <Pressable key={key} onPress={() => openKnowledgeList(key)} style={styles.commandItem}>
                  <View style={styles.commandIconCircle}>
                    {/* Truth screen (AI Brain Train 2) shows these as plain
                        dark-navy glyphs with no color-coded circle behind
                        them — was using the app's generic blue (#1E56A0). */}
                    <Ionicons name={cat[key].icon.replace('-outline', '') as any} size={22} color="#0F2942" />
                  </View>
                  <Text style={styles.commandLabel}>{cat[key].title}</Text>
                  <Text style={styles.commandCount}>{cat[key].items.length}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>Need Your Attention</Text>
            <Text style={styles.sectionViewAll}>View All ›</Text>
          </View>
          <View style={styles.attentionCard}>
            <View style={styles.attentionItem}>
              <View style={styles.attentionIconWrap}>
                <View style={styles.attentionCountBadge}><Text style={styles.attentionCountBadgeText}>5</Text></View>
                <Ionicons name="image-outline" size={18} color="#1E56A0" />
              </View>
              <View style={styles.attentionTextWrap}>
                <Text style={styles.attentionTitle}>Images required for 5 items</Text>
                <Text style={styles.attentionSubtitle}>Add images to improve products discovery</Text>
              </View>
              <Pressable onPress={openAddKnowledge} style={styles.attentionButton}>
                <Text style={styles.attentionButtonText}>Fix now</Text>
              </Pressable>
              <Pressable onPress={openAddKnowledge} style={styles.attentionAddCircle}>
                <Ionicons name="add" size={16} color="#FFF" />
              </Pressable>
            </View>
            <View style={styles.attentionItem}>
              <View style={styles.attentionIconWrap}>
                <View style={styles.attentionCountBadge}><Text style={styles.attentionCountBadgeText}>8</Text></View>
                <Ionicons name="cube-outline" size={18} color="#C2760C" />
              </View>
              <View style={styles.attentionTextWrap}>
                <Text style={styles.attentionTitle}>8 Orders hasn't shipped</Text>
                <Text style={styles.attentionSubtitle}>Some orders are pending shipment.</Text>
              </View>
              <Pressable onPress={() => { setMainTab('brain'); sendChatMessage('Show me the 8 orders that haven\'t shipped'); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={styles.attentionButtonTextOnly}>Review orders</Text>
                <Ionicons name="chevron-forward" size={14} color="#8A97A6" />
              </Pressable>
            </View>
            <View style={styles.attentionItem}>
              <View style={styles.attentionIconWrap}>
                <View style={styles.attentionCountBadge}><Text style={styles.attentionCountBadgeText}>1</Text></View>
                <Ionicons name="document-lock-outline" size={18} color="#1E56A0" />
              </View>
              <View style={styles.attentionTextWrap}>
                <Text style={styles.attentionTitle}>Update delivery policy</Text>
                <Text style={styles.attentionSubtitle}>Your delivery policy hasn't been updated in 90 days</Text>
              </View>
              <Pressable onPress={() => openItemDetail('policies', 'pol2')} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={styles.attentionButtonTextOnly}>Update now</Text>
                <Ionicons name="chevron-forward" size={14} color="#8A97A6" />
              </Pressable>
            </View>
          </View>

          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>Recent Knowledge</Text>
            <Text style={styles.sectionViewAll}>View All ›</Text>
          </View>
          <View style={styles.attentionCard}>
            {RECENT_KNOWLEDGE_DOCS.map(doc => (
              <View key={doc.name} style={styles.recentDocRow}>
                <Ionicons name="checkmark-circle" size={20} color="#1E9E6D" />
                <View style={styles.attentionTextWrap}>
                  <Text style={styles.attentionTitle}>{doc.name}</Text>
                  <Text style={styles.recentDocMeta}>{doc.status}  ·  {doc.time}</Text>
                </View>
                <Ionicons name="ellipsis-vertical" size={16} color="#8A97A6" />
              </View>
            ))}
          </View>
        </ScrollView>
        {renderBottomNav()}
      </View>
    );
  }

  if (screen === 'knowledgeList') {
    const data = KNOWLEDGE_DATA[activeCategory];
    const isFaqs = activeCategory === 'faqs';
    const verified = data.items.filter(i => i.status === 'Verified').length;
    const drafts = data.items.filter(i => i.status === 'Draft').length;
    const needReview = data.items.filter(i => i.status === 'Need review').length;
    const filterCounts: Record<'All' | 'Verified' | 'Drafts' | 'Need review', number> = {
      All: data.items.length, Verified: verified, Drafts: drafts, 'Need review': needReview,
    };
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
          <Text style={styles.knowledgeHeaderTitle}>{KNOWLEDGE_LIST_TITLE[activeCategory]}</Text>
          <Pressable onPress={openAddKnowledge}><Text style={styles.knowledgeHeaderAction}>+ Add</Text></Pressable>
        </View>
        <ScrollView style={styles.homeScroll} contentContainerStyle={styles.homeScrollContent}>
          <View style={styles.listCountRow}>
            <View>
              <Text style={styles.listCountTitle}>{data.items.length} {data.title}</Text>
              <Text style={styles.listCountSubtitle}>{verified} verified  ·  {data.items.length - verified} drafts</Text>
            </View>
            <Pressable style={styles.listFilterButton}>
              <Ionicons name="options-outline" size={14} color="#5C6B7A" />
              <Text style={styles.listFilterButtonText}>Filter</Text>
            </Pressable>
          </View>
          <View style={styles.searchBarPlain}>
            <Ionicons name="search-outline" size={16} color="#8A97A6" />
            <Text style={styles.homeSearchPlaceholder}>Search {data.title}...</Text>
          </View>
          {/* The truth screen (FAQs list) has no status filter chips at all —
              just a "Popular Questions" label — unlike Products/Services/
              Operations/Policies, which all show the All/Verified/Drafts/
              Need review row. FAQs previously reused that same filter row,
              which doesn't exist in the FAQs truth design. */}
          {isFaqs ? (
            <Text style={styles.sectionLabel}>Popular Questions</Text>
          ) : (
            <View style={styles.filterRow}>
              {(['All', 'Verified', 'Drafts', 'Need review'] as const).map(f => (
                <Pressable key={f} onPress={() => setListStatusFilter(f)} style={[styles.filterChip, listStatusFilter === f && styles.filterChipActive]}>
                  <Text style={[styles.filterChipText, listStatusFilter === f && styles.filterChipTextActive]}>{f} ({filterCounts[f]})</Text>
                </Pressable>
              ))}
            </View>
          )}
          {isFaqs ? (
            // Plain white cards, bold question, green "Answer available",
            // chevron — no icon box, no colored status pill. The richer
            // row style below is correct for the other 4 categories, but
            // FAQs' own truth screen never had it.
            filtered.map(item => (
              <Pressable key={item.id} onPress={() => openItemDetail(activeCategory, item.id)} style={styles.faqRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.attentionTitle}>{item.name}</Text>
                  <Text style={styles.faqAnswerAvailable}>Answer available</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#8A97A6" />
              </Pressable>
            ))
          ) : (
            filtered.map(item => (
              <Pressable key={item.id} onPress={() => openItemDetail(activeCategory, item.id)} style={styles.knowledgeRow}>
                {item.image ? (
                  <KnowledgeRowImage
                    uri={item.image}
                    style={styles.knowledgeRowPhoto}
                    fallback={
                      <View style={[styles.knowledgeRowIcon, { backgroundColor: item.iconBg }]}>
                        <KnowledgeIcon name={item.icon} size={20} color={item.iconColor} />
                      </View>
                    }
                  />
                ) : (
                  <View style={[styles.knowledgeRowIcon, { backgroundColor: item.iconBg }]}>
                    <KnowledgeIcon name={item.icon} size={20} color={item.iconColor} />
                  </View>
                )}
                <View style={styles.attentionTextWrap}>
                  <Text style={styles.attentionTitle}>{item.name}</Text>
                  <Text style={styles.attentionSubtitle}>{item.subtitle}</Text>
                </View>
                <View style={[styles.statusPill, item.status !== 'Verified' && styles.statusPillWarn]}>
                  <Text style={[styles.statusPillText, item.status !== 'Verified' && styles.statusPillTextWarn]}>{item.status}</Text>
                </View>
              </Pressable>
            ))
          )}
        </ScrollView>
        {renderBottomNav()}
      </View>
    );
  }

  if (screen === 'itemDetail') {
    const item = KNOWLEDGE_DATA[activeCategory].items.find(i => i.id === activeItemId);
    if (!item) { setScreen('knowledgeList'); return null; }
    // FIX: this card's heading isn't the same rule for every category —
    // confirmed against two different truth screens: Product details-6
    // (products) uses the fixed generic label "Product Overview", while
    // Product details-5 (services) repeats the item's own name
    // ("Phone Screen Replacement"). Previously hardcoded to always
    // repeat the name, which duplicated the nav-bar title for products.
    const overviewHeading = activeCategory === 'products' ? 'Product Overview' : item.name;
    // FIX: policies call this list "Policy details" in Figma, while
    // products/services call it "Key Features" — this was hardcoded to
    // "Key Features" even for policies.
    const featuresHeading = activeCategory === 'policies' ? 'Policy details' : 'Key Features';
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
            <View style={styles.detailOverviewRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionLabel}>{overviewHeading}</Text>
                <Text style={styles.attentionSubtitle}>{item.overview}</Text>
              </View>
              <DetailOverviewIcon item={item} />
            </View>
          </View>
          <View style={styles.detailCard}>
            {/* FIX: viewOnlyFields (Visibility, Last Updated for products)
                were just appended after item.fields, which put them both
                at the very end — Product details-6's truth screen puts
                Visibility between Price and Status, and only Last Updated
                at the end. Sorting the combined list by DETAIL_FIELD_ORDER
                interleaves each field into its correct truth position. */}
            {[...item.fields, ...(item.viewOnlyFields ?? [])].sort((a, b) => {
              const ia = DETAIL_FIELD_ORDER.indexOf(a.label), ib = DETAIL_FIELD_ORDER.indexOf(b.label);
              return (ia === -1 ? DETAIL_FIELD_ORDER.length : ia) - (ib === -1 ? DETAIL_FIELD_ORDER.length : ib);
            }).map(f => (
              <View key={f.label} style={styles.detailFieldRow}>
                <View style={styles.detailFieldLabelRow}>
                  <KnowledgeIcon name={KNOWLEDGE_FIELD_ICON[f.label] || 'ellipse-outline'} size={14} color="#8A97A6" />
                  <Text style={styles.detailFieldLabel}>{f.label}</Text>
                </View>
                <Text style={[styles.detailFieldValue, f.value === 'Need review' && { color: '#E5A63A' }, f.value === 'Verified' && { color: '#1E9E6D' }]}>{f.value}</Text>
              </View>
            ))}
          </View>
          {item.features && (
            <View style={styles.detailCard}>
              <Text style={styles.sectionLabel}>{featuresHeading}</Text>
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
              <PdfSourceBadge />
              <View style={{ flex: 1 }}>
                <Text style={styles.attentionTitle}>Product catalogue.pdf</Text>
                <Text style={styles.sourcePageText}>Page 12</Text>
              </View>
              <Text style={styles.insightLink}>View</Text>
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
    // FIX: this used to render every field (including Category, which
    // used to accidentally sit at idx 0 and get treated as the Name
    // field — see openItemEdit above) as one flat list of identical
    // text inputs. Figma splits these into: a top card with Name +
    // Category + a large image preview and "Change Image" button, a
    // detail card for the rest of the fields (Status shown as
    // read-only colored text, not an input), and a Source citation
    // card — all missing before.
    const item = KNOWLEDGE_DATA[activeCategory].items.find(i => i.id === activeItemId);
    const nameField = editDraft[0];
    const categoryField = editDraft.find(f => f.label === 'Category');
    const restFieldsRaw = editDraft.filter(f => f !== nameField && f.label !== 'Category');
    // FIX: was rendered in raw data-array order (Specification, Brand,
    // Price, Status), but Product details-4's truth screen shows Price
    // first. Sorting by EDIT_FIELD_ORDER instead of touching the data
    // array itself, since the DETAIL screen (Product details-6) needs a
    // different order from the same underlying fields.
    const restFields = [...restFieldsRaw].sort((a, b) => {
      const ia = EDIT_FIELD_ORDER.indexOf(a.label), ib = EDIT_FIELD_ORDER.indexOf(b.label);
      return (ia === -1 ? EDIT_FIELD_ORDER.length : ia) - (ib === -1 ? EDIT_FIELD_ORDER.length : ib);
    });
    const updateField = (label: string, v: string) =>
      setEditDraft(prev => prev.map(p => (p.label === label ? { ...p, value: v } : p)));
    return (
      <View style={styles.mainScreen}>
        <StatusBar style="dark" />
        <View style={styles.knowledgeHeader}>
          <Pressable onPress={() => setScreen('itemDetail')} hitSlop={8}><Ionicons name="chevron-back" size={24} color="#0B1220" /></Pressable>
          <Text style={styles.knowledgeHeaderTitle}>{KNOWLEDGE_EDIT_TITLE[activeCategory]}</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView style={styles.homeScroll} contentContainerStyle={styles.homeScrollContent}>
          <View style={styles.detailCard}>
            <View style={{ flexDirection: 'row', gap: 14 }}>
              <View style={{ flex: 1 }}>
                {nameField && (
                  <View style={{ marginBottom: 14 }}>
                    <Text style={styles.detailFieldLabel}>{nameField.label}</Text>
                    <TextInput value={nameField.value} onChangeText={v => updateField(nameField.label, v)} style={styles.editInput} />
                  </View>
                )}
                {categoryField && (
                  <View>
                    <Text style={styles.detailFieldLabel}>Category</Text>
                    <TextInput value={categoryField.value} onChangeText={v => updateField('Category', v)} style={styles.editInput} />
                  </View>
                )}
              </View>
              <View style={{ alignItems: 'center', gap: 8 }}>
                {item ? <DetailOverviewIcon item={item} /> : null}
                <Pressable style={styles.editChangeImageBox}>
                  <Ionicons name="image-outline" size={16} color="#1E56A0" />
                  <Text style={styles.editChangeImageText}>Change{'\n'}Image</Text>
                </Pressable>
              </View>
            </View>
          </View>

          <View style={styles.detailCard}>
            {restFields.map(f => (
              <View key={f.label} style={{ marginBottom: 14 }}>
                <View style={styles.detailFieldLabelRow}>
                  <KnowledgeIcon name={KNOWLEDGE_FIELD_ICON[f.label] || 'ellipse-outline'} size={14} color="#8A97A6" />
                  {/* FIX: truth's edit screen marks every field but Status
                      as required with a red asterisk — none were shown. */}
                  <Text style={styles.detailFieldLabel}>{f.label}{f.label !== 'Status' && <Text style={{ color: '#D64545' }}> *</Text>}</Text>
                </View>
                {f.label === 'Status' ? (
                  <Text style={[styles.detailFieldValue, { marginTop: 6 }, f.value === 'Need review' && { color: '#E5A63A' }, f.value === 'Verified' && { color: '#1E9E6D' }]}>{f.value}</Text>
                ) : (
                  <TextInput
                    value={f.value}
                    onChangeText={v => updateField(f.label, v)}
                    style={[styles.editInput, MULTILINE_EDIT_FIELDS.has(f.label) && { height: 90, paddingTop: 12, textAlignVertical: 'top' }]}
                    multiline={MULTILINE_EDIT_FIELDS.has(f.label)}
                  />
                )}
              </View>
            ))}
          </View>

          <View style={styles.detailCard}>
            <Text style={styles.sectionLabel}>Source</Text>
            <View style={styles.sourceRow}>
              <PdfSourceBadge />
              <View style={{ flex: 1 }}>
                <Text style={styles.attentionTitle}>Product catalogue.pdf</Text>
                <Text style={styles.sourcePageText}>Page 12</Text>
              </View>
              <Text style={styles.insightLink}>View</Text>
            </View>
          </View>

          <View style={styles.editButtonRow}>
            <Pressable onPress={() => setScreen('itemDetail')} style={[styles.resetButton, { flex: 1, borderWidth: 1, borderColor: '#5381BB' }]}>
              <Text style={[styles.resetButtonText, { color: '#1E56A0' }]}>Save As Draft</Text>
            </Pressable>
            <Pressable onPress={() => setScreen('itemDetail')} style={[styles.resetButton, styles.resetButtonEnabled, { flex: 1 }]}>
              <Text style={styles.resetButtonText}>Save Changes</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (screen === 'addKnowledge') {
    const headerByStep: Record<typeof addKnowledgeStep, { title: string; onBack: () => void; showAdd?: boolean }> = {
      choose: { title: 'Add Knowledge', onBack: () => setScreen('main'), showAdd: true },
      upload: { title: 'Add Knowledge', onBack: () => setAddKnowledgeStep('choose') },
      processing: { title: 'Add Knowledge', onBack: () => setAddKnowledgeStep('upload') },
      // FIX: truth screen has no "+ Add" button on this step (it's the
      // post-extraction summary, not a place to add another item) —
      // showAdd:true was showing one anyway.
      summary: { title: 'Add Knowledge', onBack: () => setAddKnowledgeStep('upload') },
      review: { title: 'Review Extracted Knowledge', onBack: () => setAddKnowledgeStep('summary') },
      addImage: { title: 'Add Image', onBack: () => setAddKnowledgeStep('review') },
      // NEW: see the addKnowledgeStep state comment above.
      uploadImage: { title: 'Upload Picture', onBack: () => setAddKnowledgeStep('addImage') },
      imageMatch: { title: 'Review Extracted Knowledge', onBack: () => setAddKnowledgeStep('addImage') },
    };
    const header = headerByStep[addKnowledgeStep];
    const reviewCounts = {
      All: EXTRACTED_REVIEW_ITEMS.length,
      'Pricing Item': EXTRACTED_REVIEW_ITEMS.filter(i => i.type === 'Pricing Item').length,
      FAQs: EXTRACTED_REVIEW_ITEMS.filter(i => i.type === 'FAQs').length,
      'Discount rules': EXTRACTED_REVIEW_ITEMS.filter(i => i.type === 'Discount rules').length,
    };
    const reviewFiltered = EXTRACTED_REVIEW_ITEMS.filter(i => reviewFilter === 'All' ? true : i.type === reviewFilter);
    const matchTargetItem = EXTRACTED_REVIEW_ITEMS.find(i => i.id === imageMatchTarget);
    return (
      <View style={styles.mainScreen}>
        <StatusBar style="dark" />
        <View style={styles.knowledgeHeader}>
          <Pressable onPress={header.onBack} hitSlop={8}><Ionicons name="chevron-back" size={24} color="#0B1220" /></Pressable>
          <Text style={styles.knowledgeHeaderTitle}>{header.title}</Text>
          {header.showAdd ? (
            <Pressable onPress={openAddKnowledge}><Text style={styles.knowledgeHeaderAction}>+ Add</Text></Pressable>
          ) : <View style={{ width: 24 }} />}
        </View>
        <ScrollView style={styles.homeScroll} contentContainerStyle={styles.homeScrollContent}>

          {addKnowledgeStep === 'choose' && (
            <>
              {/* FIX: was left-aligned; truth centers this line. */}
              <Text style={[styles.attentionSubtitle, { marginBottom: 16, textAlign: 'center' }]}>Choose how you want to add knowledge to your business brain.</Text>
              {/* FIX: both icons had no background tint at all — truth
                  gives each its own colored square (light blue-gray for
                  Upload Files, light cyan for Tell Nexora). */}
              <Pressable onPress={() => setAddKnowledgeStep('upload')} style={styles.choiceCard}>
                <View style={[styles.knowledgeRowIcon, { backgroundColor: '#EAF1FB' }]}><Ionicons name="cloud-upload-outline" size={20} color="#1E56A0" /></View>
                <View style={styles.attentionTextWrap}>
                  <Text style={styles.attentionTitle}>Upload Files</Text>
                  <Text style={styles.attentionSubtitle}>Upload PDF, CSV, TXT or DOCX files</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#8A97A6" />
              </Pressable>
              <Pressable onPress={() => { setScreen('main'); setMainTab('brain'); sendChatMessage('I want to describe my business or idea'); }} style={styles.choiceCard}>
                <View style={[styles.knowledgeRowIcon, { backgroundColor: '#E3F6FB' }]}><Ionicons name="chatbubble-ellipses-outline" size={20} color="#1E9ED0" /></View>
                <View style={styles.attentionTextWrap}>
                  <Text style={styles.attentionTitle}>Tell Nexora</Text>
                  <Text style={styles.attentionSubtitle}>Describe your business or idea</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#8A97A6" />
              </Pressable>
              <View style={styles.privacyBanner}>
                <Ionicons name="lock-closed" size={16} color="#1E56A0" />
                <Text style={styles.privacyBannerText}>All data is secure and private. Only you can see your business Knowledge</Text>
              </View>
            </>
          )}

          {addKnowledgeStep === 'upload' && (
            <>
              <Pressable onPress={runKnowledgeProcessing} style={styles.dropZone}>
                <Ionicons name="cloud-upload-outline" size={36} color="#1E56A0" />
                <Text style={styles.attentionTitle}>Drag and drop files here or tap to browse</Text>
                <Text style={styles.attentionSubtitle}>Supported files: PDF, CSV, TXT or DOCX (Max file size 20MB)</Text>
              </Pressable>
              <View style={styles.privacyBanner}>
                <Ionicons name="lock-closed" size={16} color="#1E56A0" />
                <Text style={styles.privacyBannerText}>All data is secure and private. Only you can see your business Knowledge</Text>
              </View>
            </>
          )}

          {addKnowledgeStep === 'processing' && (
            <View style={{ alignItems: 'center', paddingTop: 24 }}>
              {processingOrbFailed ? (
                <View style={styles.processingOrb}>
                  <Ionicons name="sparkles" size={26} color="#FFF" />
                </View>
              ) : (
                <ExpoImage
                  source={{ uri: PROCESSING_ORB_URL }}
                  style={{ width: 140, height: 80 }}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  onError={() => setProcessingOrbFailed(true)}
                />
              )}
              <Text style={[styles.attentionTitle, { marginTop: 16, marginBottom: 16 }]}>NEXORA is analyzing your file…</Text>
              {/* FIX: every step used to show a green checkmark, all at
                  once, for the whole 1800ms wait — Figma shows the first
                  2 steps already done and the remaining 3 still in
                  progress (a spinner, not a checkmark). A real timed
                  per-step reveal is more than this mock upload needs;
                  matching Figma's single captured frame (2 done / 3 in
                  progress) gets the same visual result. */}
              {['Reading documents', 'Extracting Information', 'Understanding content', 'Organizing knowledge', 'Looking for Images'].map((step, i) => (
                <View key={step} style={styles.featureRow}>
                  {i < 2
                    ? <Ionicons name="checkmark-circle" size={16} color="#1E9E6D" />
                    : <ActivityIndicator size="small" color="#3B82F6" />}
                  <Text style={styles.attentionSubtitle}>{step}</Text>
                </View>
              ))}
            </View>
          )}

          {addKnowledgeStep === 'summary' && (
            <>
              <View style={styles.detailCard}>
                <View style={styles.sourceRow}>
                  <PdfSourceBadge />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.attentionTitle}>Product catalogue.pdf</Text>
                    <Text style={styles.sourcePageText}>Uploaded on May 27, 2024</Text>
                  </View>
                </View>
                <View style={styles.extractedOkBanner}>
                  <Ionicons name="checkmark-circle" size={16} color="#1E9E6D" />
                  <Text style={styles.extractedOkText}>NEXORA has extracted and organized information from your file</Text>
                </View>
              </View>
              <Text style={[styles.sectionLabel, { marginTop: 12 }]}>124 Items found in this file</Text>
              {/* FIX: re-checked every icon/color here directly against the
                  truth screen — Discount Rules used a second price-tag
                  glyph instead of a percent/discount badge; FAQs' icon was
                  blue instead of orange; Policies/Rules was purple instead
                  of blue; Brands was green instead of neutral gray; and
                  every row's background was a flat gray box instead of a
                  tinted circle matching its icon color. */}
              {[
                ['Pricing Items', 72, 'pricetag-outline', CAT_ORANGE.iconColor, CAT_ORANGE.iconBg],
                ['Discount Rules', 20, 'mci:sale-outline', '#D64545', '#FBE7E7'],
                ['FAQs', 12, 'mci:comment-question-outline', CAT_ORANGE.iconColor, CAT_ORANGE.iconBg],
                ['Policies/Rules', 10, 'shield-outline', CAT_BLUE.iconColor, CAT_BLUE.iconBg],
                ['Brands', 2, 'mci:check-decagram-outline', '#5C6B7A', '#EEF0F2'],
              ].map(([label, count, icon, color, bg]) => (
                <View key={label as string} style={styles.knowledgeRow}>
                  <View style={[styles.knowledgeRowIcon, { backgroundColor: bg as string }]}>
                    <KnowledgeIcon name={icon as string} size={18} color={color as string} />
                  </View>
                  <Text style={[styles.attentionTitle, { flex: 1 }]}>{label}</Text>
                  <Text style={styles.attentionSubtitle}>{count}</Text>
                </View>
              ))}
              <Pressable onPress={() => setAddKnowledgeStep('review')} style={[styles.resetButton, styles.resetButtonEnabled, { marginTop: 16 }]}>
                <Text style={styles.resetButtonText}>Continue</Text>
              </Pressable>
            </>
          )}

          {addKnowledgeStep === 'review' && (
            <>
              <View style={[styles.choiceCard, { backgroundColor: '#EAF1FB', alignItems: 'flex-start' }]}>
                {/* FIX: truth overlays a small red "no entry" badge on the
                    bottom-right corner of this icon (reinforcing "no image
                    found") — the icon had no badge at all. */}
                <View style={[styles.reviewNoImageIcon, { width: 56, height: 56 }]}>
                  <Ionicons name="image-outline" size={28} color="#1E56A0" />
                  <View style={{ position: 'absolute', right: -2, bottom: -2, backgroundColor: '#FFF', borderRadius: 10 }}>
                    <Ionicons name="ban" size={16} color="#D64545" />
                  </View>
                </View>
                <View style={styles.attentionTextWrap}>
                  {/* FIX: same two-line truth styling as the Add Image
                      screen — plain first line, bold blue second line. */}
                  <Text style={styles.attentionTitle}>No Image found for</Text>
                  <Text style={[styles.attentionTitle, { color: '#1E56A0' }]}>5 of your 16 Pricing Items</Text>
                  <Text style={styles.attentionSubtitle}>Add images to make your knowledge base more visual and engaging</Text>
                  <View style={styles.reviewBannerButtonRow}>
                    <Pressable onPress={() => setAddKnowledgeStep('addImage')} style={[styles.resetButton, styles.resetButtonEnabled, { flex: 1, minHeight: 36 }]}>
                      <Text style={[styles.resetButtonText, { fontSize: 12 }]}>Add Image</Text>
                    </Pressable>
                    <Pressable onPress={() => setAddKnowledgeStep('summary')} style={[styles.resetButton, { flex: 1, minHeight: 36, borderWidth: 1, borderColor: '#5381BB' }]}>
                      <Text style={[styles.resetButtonText, { fontSize: 12, color: '#1E56A0' }]}>Dismiss</Text>
                    </Pressable>
                  </View>
                </View>
              </View>

              <View style={styles.filterRow}>
                {(['All', 'Pricing Item', 'FAQs', 'Discount rules'] as const).map(f => (
                  <Pressable key={f} onPress={() => setReviewFilter(f)} style={[styles.filterChip, reviewFilter === f && styles.filterChipActive]}>
                    <Text style={[styles.filterChipText, reviewFilter === f && styles.filterChipTextActive]}>{f} ({reviewCounts[f]})</Text>
                  </Pressable>
                ))}
              </View>

              {reviewFiltered.map(item => (
                <Pressable key={item.id} onPress={() => { setImageMatchTarget(item.id); setImageMatchStage('suggestions'); setSelectedSuggestion(0); setAddKnowledgeStep('imageMatch'); }} style={styles.knowledgeRow}>
                  <Pressable hitSlop={8} onPress={() => setReviewChecks(prev => ({ ...prev, [item.id]: !prev[item.id] }))}>
                    <Ionicons name={reviewChecks[item.id] ? 'checkbox' : 'square-outline'} size={20} color="#1E56A0" />
                  </Pressable>
                  <View style={styles.attentionTextWrap}>
                    <Text style={styles.attentionTitle}>{item.name}</Text>
                    <Text style={styles.attentionSubtitle} numberOfLines={1}>{item.subtitle}</Text>
                  </View>
                  {/* FIX: every badge used the same flat blue style and the
                      same text as the filter chip — truth shows FAQs in
                      orange (not blue), and shortens "Pricing Item" to just
                      "Pricing" on the row badge specifically (the filter
                      chip above keeps the longer "Pricing Item" label,
                      which is what truth's own chip says too). */}
                  <View style={[styles.reviewTypeBadge, item.type === 'FAQs' && { backgroundColor: '#FBF1E6' }]}>
                    <Text style={[styles.reviewTypeBadgeText, item.type === 'FAQs' && { color: '#D97706' }]}>{item.type === 'Pricing Item' ? 'Pricing' : item.type}</Text>
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
                {/* FIX: truth's icon is "image placeholder + magnifying
                    glass" composed together, much larger, in light blue —
                    this was a single small plain image-outline glyph.
                    Composed from two overlapping Ionicons rather than
                    pulling in a new asset, since both pieces already exist
                    as stock glyphs. */}
                <View style={{ width: 64, height: 64 }}>
                  <Ionicons name="image-outline" size={64} color="#B9CFEA" />
                  <View style={{ position: 'absolute', right: -4, bottom: -4, backgroundColor: '#FFF', borderRadius: 12 }}>
                    <Ionicons name="search-circle" size={26} color="#1E56A0" />
                  </View>
                </View>
                {/* FIX: truth splits this into a plain first line and a
                    bold blue second line — this was one plain black line.
                    Also missing truth's second, gray explanatory line
                    entirely. */}
                <Text style={[styles.attentionTitle, { marginTop: 10, textAlign: 'center', fontWeight: '400' }]}>No Image found for</Text>
                <Text style={[styles.attentionTitle, { textAlign: 'center', color: '#1E56A0' }]}>5 of your 16 Pricing Items</Text>
                <Text style={[styles.attentionSubtitle, { textAlign: 'center', marginTop: 4 }]}>Add images to make your knowledge base more visual and engaging</Text>
              </View>
              {/* FIX: all three option icons had no background tint at all
                  — truth gives each its own colored square (light cyan,
                  light blue, light gray). */}
              <Pressable onPress={() => { setImageMatchTarget(matchTargetItem?.id || EXTRACTED_REVIEW_ITEMS[0].id); setImageMatchStage('suggestions'); setSelectedSuggestion(0); setAddKnowledgeStep('imageMatch'); }} style={styles.choiceCard}>
                <View style={[styles.knowledgeRowIcon, { backgroundColor: '#E3F6FB' }]}><Ionicons name="sparkles" size={20} color="#1E9ED0" /></View>
                <View style={styles.attentionTextWrap}>
                  <Text style={styles.attentionTitle}>Find image online</Text>
                  <Text style={styles.attentionSubtitle}>Nexora will search for matching product images</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#8A97A6" />
              </Pressable>
              <Pressable onPress={() => setAddKnowledgeStep('uploadImage')} style={styles.choiceCard}>
                <View style={[styles.knowledgeRowIcon, { backgroundColor: '#EAF1FB' }]}><Ionicons name="add" size={22} color="#1E56A0" /></View>
                <View style={styles.attentionTextWrap}>
                  <Text style={styles.attentionTitle}>Upload your own image</Text>
                  <Text style={styles.attentionSubtitle}>Upload from your device</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#8A97A6" />
              </Pressable>
              <Pressable onPress={() => setAddKnowledgeStep('review')} style={styles.choiceCard}>
                <View style={[styles.knowledgeRowIcon, { backgroundColor: '#EEF0F2' }]}><Ionicons name="time-outline" size={20} color="#0F2942" /></View>
                <View style={styles.attentionTextWrap}>
                  <Text style={styles.attentionTitle}>Skip for now</Text>
                  <Text style={styles.attentionSubtitle}>You can add images later</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#8A97A6" />
              </Pressable>
            </>
          )}

          {/* NEW: previously unreachable — see the addKnowledgeStep state
              comment above. Tapping the dropzone simulates a successful
              upload the same way the document-upload step does (jumps
              straight to the next step rather than needing a real file
              picker for this mock flow). */}
          {addKnowledgeStep === 'uploadImage' && (
            <>
              <Pressable onPress={() => setAddKnowledgeStep('review')} style={styles.dropZone}>
                <Ionicons name="cloud-upload-outline" size={36} color="#1E56A0" />
                <Text style={styles.attentionTitle}>Drag and drop files here or tap to browse</Text>
                <Text style={styles.attentionSubtitle}>Supported files: JPG, PNG, or WEBP (Max file size 10MB)</Text>
              </Pressable>
              <View style={styles.privacyBanner}>
                <Ionicons name="lock-closed" size={16} color="#1E56A0" />
                <Text style={styles.privacyBannerText}>All data is secure and private. Only you can see your business Knowledge</Text>
              </View>
            </>
          )}

          {addKnowledgeStep === 'imageMatch' && imageMatchStage === 'suggestions' && (
            <>
              <View style={styles.matchItemRow}>
                {/* FIX: was a plain gray icon with no real photo — same
                    fallback pattern as the confirm screen. */}
                {matchTargetItem?.image ? (
                  <ExpoImage source={{ uri: matchTargetItem.image }} style={styles.detailImagePhoto} contentFit="cover" cachePolicy="memory-disk" />
                ) : (
                  <View style={styles.detailImageBox}><Ionicons name="headset-outline" size={28} color="#1E56A0" /></View>
                )}
                <View style={styles.attentionTextWrap}>
                  <Text style={styles.attentionTitle}>{matchTargetItem?.name || 'Oraimo Headphone'}</Text>
                  <Text style={styles.attentionSubtitle}>Brand : Sony</Text>
                  <Text style={styles.attentionSubtitle}>Description : Noise-cancelling wireless headphones</Text>
                </View>
              </View>
              <Text style={[styles.sectionLabel, { marginTop: 12, marginBottom: 8 }]}>Suggested images</Text>
              <Text style={[styles.attentionSubtitle, { marginBottom: 12 }]}>We found {IMAGE_SUGGESTIONS.length} images that match this product</Text>
              <View style={styles.suggestionGrid}>
                {IMAGE_SUGGESTIONS.map((s, i) => (
                  <Pressable key={s.source} onPress={() => setSelectedSuggestion(i)} style={[styles.suggestionCell, selectedSuggestion === i && styles.suggestionCellActive]}>
                    {s.best && <Text style={styles.suggestionBestBadge}>Best Match</Text>}
                    {/* FIX: every suggestion tile showed the same generic
                        gray headset glyph — truth shows an actual photo per
                        tile. Reuses the one real headphone photo we have
                        (see IMAGE_SUGGESTIONS above) rather than 6 unique
                        stock photos we don't have. */}
                    <View style={styles.suggestionImageBox}>
                      {s.image ? (
                        <ExpoImage source={{ uri: s.image }} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="memory-disk" />
                      ) : (
                        <Ionicons name="headset-outline" size={26} color="#8A97A6" />
                      )}
                    </View>
                    <Text style={styles.suggestionMatchText}>{s.match}% match</Text>
                    <Text style={styles.suggestionSourceText}>{s.source}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable onPress={() => setImageMatchStage('confirm')} style={[styles.resetButton, styles.resetButtonEnabled, { marginTop: 16 }]}>
                <Text style={styles.resetButtonText}>Use this image</Text>
              </Pressable>
              <Pressable onPress={() => setAddKnowledgeStep('review')} style={[styles.resetButton, { marginTop: 10, marginBottom: 4 }]}>
                <Text style={[styles.resetButtonText, { color: '#1E56A0' }]}>Choose a different image</Text>
              </Pressable>
              <Pressable onPress={() => setAddKnowledgeStep('review')} style={[styles.resetButton, { marginBottom: 16 }]}>
                <Text style={[styles.resetButtonText, { color: '#8A97A6' }]}>Skip</Text>
              </Pressable>
            </>
          )}

          {addKnowledgeStep === 'imageMatch' && imageMatchStage === 'confirm' && (
            <>
              {/* FIX: was a plain gray Ionicons headset glyph with no card
                  background at all — truth shows the item's real photo
                  inside a white rounded card. Falls back to the glyph only
                  if the item has no photo (e.g. a service/policy). */}
              <View style={styles.confirmImagePreview}>
                {matchTargetItem?.image ? (
                  <ExpoImage source={{ uri: matchTargetItem.image }} style={{ width: '100%', height: '100%' }} contentFit="contain" cachePolicy="memory-disk" />
                ) : (
                  <Ionicons name="headset-outline" size={64} color="#8A97A6" />
                )}
              </View>
              <View style={styles.detailCard}>
                <View style={styles.detailFieldRow}>
                  <Text style={styles.detailFieldLabel}>Sources</Text>
                  <Text style={styles.detailFieldValue}>{IMAGE_SUGGESTIONS[selectedSuggestion]?.source}</Text>
                </View>
                <View style={styles.detailFieldRow}>
                  <Text style={styles.detailFieldLabel}>Match confidence</Text>
                  <Text style={[styles.detailFieldValue, { color: '#1E9E6D' }]}>{IMAGE_SUGGESTIONS[selectedSuggestion]?.match}% (Best Match)</Text>
                </View>
                {/* FIX: truth shows "License" alone on its own row, then the
                    copyright note + "Learn more" link on a separate,
                    full-width line below — this had them squeezed onto one
                    label+value row instead. */}
                <Text style={styles.detailFieldLabel}>License</Text>
                <Text style={[styles.attentionSubtitle, { marginTop: 4 }]}>Image may be subject to copyright  <Text style={styles.insightLink}>Learn more</Text></Text>
              </View>
              <Pressable onPress={() => setLicenseConfirmed(v => !v)} style={styles.licenseCheckRow}>
                <Ionicons name={licenseConfirmed ? 'checkbox' : 'square-outline'} size={18} color="#1E56A0" />
                <Text style={styles.attentionSubtitle}>I confirm I have the right to use this image for my business</Text>
              </Pressable>
              <Pressable onPress={() => setAddKnowledgeStep('review')} style={[styles.resetButton, styles.resetButtonEnabled, { marginTop: 12 }]}>
                <Text style={styles.resetButtonText}>Use this image</Text>
              </Pressable>
              <Pressable onPress={() => setImageMatchStage('suggestions')} style={[styles.resetButton, { marginTop: 10 }]}>
                <Text style={[styles.resetButtonText, { color: '#1E56A0' }]}>Choose a different image</Text>
              </Pressable>
              {/* FIX: "Skip" was plain text with no border — truth shows it
                  as an outlined pill, same shape as the other two buttons
                  above it, just with a neutral border instead of a fill. */}
              <Pressable onPress={() => setAddKnowledgeStep('review')} style={[styles.resetButton, { marginBottom: 16, borderWidth: 1, borderColor: '#D8DCE1' }]}>
                <Text style={[styles.resetButtonText, { color: '#8A97A6' }]}>Skip</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </View>
    );
  }

  if(screen==='connectChannels'){
    if (channelConnectStep) {
      const ch = CONNECT_CHANNELS.find(c => c.key === channelConnectKey)!;
      if (channelConnectStep === 'permission') {
        return (
          <View style={styles.mainScreen}>
            <StatusBar style="dark" />
            <View style={styles.knowledgeHeader}>
              <Pressable onPress={() => setChannelConnectStep(null)} hitSlop={8}><Ionicons name="chevron-back" size={24} color="#0B1220" /></Pressable>
              <Text style={styles.knowledgeHeaderTitle}>Connect your channels</Text>
              <View style={{ width: 24 }} />
            </View>
            <View style={styles.homeScrollContent}>
              <View style={styles.connectFlowIconWrap}><Ionicons name={ch.icon as any} size={40} color={ch.color} /></View>
              <Text style={styles.connectFlowTitle}>Connect {ch.name}</Text>
              <Text style={[styles.attentionSubtitle, { textAlign: 'center', marginBottom: 20 }]}>NEXORA will access your {ch.name.toLowerCase()} messages so it can help you manage customers conversations.</Text>
              <View style={styles.detailCard}>
                <Text style={[styles.attentionTitle, { marginBottom: 8 }]}>NEXORA can:</Text>
                {['Read customer messages', 'Suggest replies', 'Send replies when you allow it'].map(p => (
                  <View key={p} style={styles.featureRow}><Ionicons name="checkmark-circle" size={16} color="#1E9E6D" /><Text style={styles.attentionSubtitle}>{p}</Text></View>
                ))}
              </View>
              <Pressable onPress={() => { setChannelConnectStep('connecting'); setTimeout(() => setChannelConnectStep('done'), 1600); }} style={[styles.resetButton, styles.resetButtonEnabled, { marginTop: 16 }]}>
                <Text style={styles.resetButtonText}>Continue to {ch.name}</Text>
              </Pressable>
              <View style={styles.privacyBanner}>
                <Ionicons name="lock-closed" size={16} color="#1E56A0" />
                <Text style={styles.privacyBannerText}>All data is secure and private. You can disconnect anytime.</Text>
              </View>
            </View>
          </View>
        );
      }
      if (channelConnectStep === 'connecting') {
        return (
          <View style={styles.mainScreen}>
            <StatusBar style="dark" />
            <View style={[styles.homeScrollContent, { flex: 1, alignItems: 'center', justifyContent: 'center' }]}>
              <View style={styles.processingOrb}><Ionicons name={ch.icon as any} size={26} color="#FFF" /></View>
              <Text style={[styles.attentionTitle, { marginTop: 16 }]}>Connecting to {ch.name}…</Text>
            </View>
          </View>
        );
      }
      // 'done'
      return (
        <View style={styles.mainScreen}>
          <StatusBar style="dark" />
          <View style={[styles.homeScrollContent, { flex: 1, alignItems: 'center', justifyContent: 'center' }]}>
            <View style={[styles.connectFlowIconWrap, { backgroundColor: '#E6F4ED' }]}><Ionicons name="checkmark-circle" size={40} color="#1E9E6D" /></View>
            <Text style={styles.connectFlowTitle}>{ch.name} connected</Text>
            <Text style={[styles.attentionSubtitle, { textAlign: 'center', marginBottom: 20 }]}>You can now receive and manage {ch.name.toLowerCase()} messages in your NEXORA inbox</Text>
            <Pressable
              onPress={() => { setConnectedChannels(prev => ({ ...prev, [ch.key]: true })); setChannelConnectStep(null); setChannelConnectKey(null); }}
              style={[styles.resetButton, styles.resetButtonEnabled, { width: '100%' }]}>
              <Text style={styles.resetButtonText}>Done</Text>
            </Pressable>
          </View>
        </View>
      );
    }
    return (
      <View style={styles.mainScreen}>
        <StatusBar style="dark" />
        <View style={styles.knowledgeHeader}>
          <Pressable onPress={() => setScreen('main')} hitSlop={8}><Ionicons name="chevron-back" size={24} color="#0B1220" /></Pressable>
          <Text style={styles.knowledgeHeaderTitle}>Connect your channels</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView style={styles.homeScroll} contentContainerStyle={styles.homeScrollContent}>
          <Text style={[styles.attentionSubtitle, { marginBottom: 16 }]}>Bring customer messages from your favorite platforms into NEXORA</Text>
          <Text style={styles.channelSectionLabel}>Messaging &amp; Social</Text>
          {CONNECT_CHANNELS.slice(0, 3).map(ch => (
            <View key={ch.key} style={styles.channelRow}>
              <View style={[styles.channelIconBox, { backgroundColor: ch.color }]}><Ionicons name={ch.icon as any} size={20} color="#FFF" /></View>
              <View style={styles.attentionTextWrap}>
                <Text style={styles.attentionTitle}>{ch.name}</Text>
                <Text style={styles.attentionSubtitle}>{ch.desc}</Text>
              </View>
              {connectedChannels[ch.key]
                ? <View style={styles.channelConnectedPill}><Ionicons name="checkmark" size={12} color="#1E9E6D" /><Text style={styles.channelConnectedText}>Connected</Text></View>
                : <Pressable onPress={() => { setChannelConnectKey(ch.key); setChannelConnectStep('permission'); }} style={styles.channelConnectBtn}><Text style={styles.channelConnectBtnText}>Connect</Text></Pressable>}
            </View>
          ))}
          <Text style={styles.channelSectionLabel}>Other channels</Text>
          {CONNECT_CHANNELS.slice(3).map(ch => (
            <View key={ch.key} style={styles.channelRow}>
              <View style={[styles.channelIconBox, { backgroundColor: ch.color }]}><Ionicons name={ch.icon as any} size={20} color="#FFF" /></View>
              <View style={styles.attentionTextWrap}>
                <Text style={styles.attentionTitle}>{ch.name}</Text>
                <Text style={styles.attentionSubtitle}>{ch.desc}</Text>
              </View>
              {connectedChannels[ch.key]
                ? <View style={styles.channelConnectedPill}><Ionicons name="checkmark" size={12} color="#1E9E6D" /><Text style={styles.channelConnectedText}>Connected</Text></View>
                : <Pressable onPress={() => { setChannelConnectKey(ch.key); setChannelConnectStep('permission'); }} style={styles.channelConnectBtn}><Text style={styles.channelConnectBtnText}>Connect</Text></Pressable>}
            </View>
          ))}
          <View style={styles.channelSummaryBar}>
            <Ionicons name="link-outline" size={16} color="#1E56A0" />
            <Text style={styles.channelSummaryText}>{Object.values(connectedChannels).filter(Boolean).length} of {CONNECT_CHANNELS.length} channels connected</Text>
          </View>
          <Pressable onPress={() => { setMainTab('brain'); setScreen('main'); }} style={[styles.resetButton, styles.resetButtonEnabled, { marginTop: 16 }]}>
            <Text style={styles.resetButtonText}>Ask NEXORA</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  if (screen === 'calendar') {
    const year = calendarCursor.getFullYear(), month = calendarCursor.getMonth();
    const monthLabel = calendarCursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const firstWeekday = new Date(year, month, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    type CalCell = { iso: string; day: number; inMonth: boolean };
    const cells: CalCell[] = [];
    for (let i = firstWeekday - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      const d = new Date(year, month - 1, day);
      cells.push({ iso: d.toISOString().slice(0, 10), day, inMonth: false });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      cells.push({ iso: d.toISOString().slice(0, 10), day, inMonth: true });
    }
    while (cells.length % 7 !== 0 || cells.length < 42) {
      const day = cells.length - (firstWeekday + daysInMonth) + 1;
      const d = new Date(year, month + 1, day);
      cells.push({ iso: d.toISOString().slice(0, 10), day, inMonth: false });
    }
    const eventDates = new Set(SCHEDULE_EVENTS.map(e => e.date));
    const dayEvents = SCHEDULE_EVENTS.filter(e => e.date === selectedScheduleDate).sort((a, b) => a.time.localeCompare(b.time));
    return (
      <View style={styles.mainScreen}>
        <StatusBar style="dark" />
        <View style={styles.knowledgeHeader}>
          <Pressable onPress={() => setScreen('main')} hitSlop={8}><Ionicons name="chevron-back" size={24} color="#0B1220" /></Pressable>
          <Text style={styles.knowledgeHeaderTitle}>Schedule</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView style={styles.homeScroll} contentContainerStyle={styles.homeScrollContent}>
          <View style={styles.calendarNavRow}>
            <Pressable onPress={() => setCalendarCursor(new Date(year, month - 1, 1))} hitSlop={8}>
              <Ionicons name="chevron-back" size={20} color="#0B1220" />
            </Pressable>
            <Text style={styles.calendarMonthLabel}>{monthLabel}</Text>
            <Pressable onPress={() => setCalendarCursor(new Date(year, month + 1, 1))} hitSlop={8}>
              <Ionicons name="chevron-forward" size={20} color="#0B1220" />
            </Pressable>
          </View>
          <View style={styles.calendarWeekdayRow}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, i) => (
              <Text key={i} style={styles.calendarWeekdayText}>{w}</Text>
            ))}
          </View>
          <View style={styles.calendarGrid}>
            {cells.map(c => {
              const isToday = c.iso === todayIso;
              const isSelected = c.iso === selectedScheduleDate;
              const hasEvent = eventDates.has(c.iso);
              return (
                <Pressable key={c.iso} onPress={() => setSelectedScheduleDate(c.iso)} style={styles.calendarCell}>
                  <View style={[
                    styles.calendarDayCircle,
                    isSelected && styles.calendarDaySelected,
                    !isSelected && isToday && styles.calendarDayToday,
                  ]}>
                    <Text style={[
                      styles.calendarDayText,
                      !c.inMonth && styles.calendarDayTextMuted,
                      isSelected && styles.calendarDayTextSelected,
                    ]}>{c.day}</Text>
                  </View>
                  {hasEvent && <View style={[styles.calendarEventDot, isSelected && { backgroundColor: '#FFF' }]} />}
                </Pressable>
              );
            })}
          </View>

          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>
              {selectedScheduleDate === todayIso ? 'Today' : new Date(selectedScheduleDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </Text>
          </View>
          <View style={styles.attentionCard}>
            {dayEvents.length === 0 ? (
              <Text style={styles.attentionSubtitle}>No appointments on this day.</Text>
            ) : dayEvents.map((e, i) => (
              <View key={i} style={styles.recentDocRow}>
                <View style={styles.attentionIconWrap}>
                  <Ionicons name="calendar-outline" size={18} color="#1E56A0" />
                </View>
                <View style={styles.attentionTextWrap}>
                  <Text style={styles.attentionTitle}>{e.title}</Text>
                  <Text style={styles.recentDocMeta}>{e.time}  ·  {e.withWhom}</Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
        {renderBottomNav()}
      </View>
    );
  }

  if(screen==='brainGallery'){
    const current=BRAIN_GALLERY_SCREENS[brainGalleryIndex];
    // Fit inside the available width using the REAL aspect ratio once we
    // know it (from Image.getSize, fetched in the effect above). Until then,
    // fall back to the Figma frame ratio only as a loading placeholder —
    // never as the final render size.
    const ratio = brainNaturalSize ? brainNaturalSize.width / brainNaturalSize.height : FIGMA_WIDTH / FIGMA_HEIGHT;
    const galleryWidth = Math.min(width, FIGMA_WIDTH);
    const galleryHeight = galleryWidth / ratio;
    return(
      <View style={styles.mainScreen}>
        <StatusBar style="dark"/>
        <View style={styles.knowledgeHeader}>
          {/* Don't force mainTab back to 'profile' here — this screen can now
              be opened from the Brain tab's floating button too, and forcing
              'profile' would strand a Brain-tab visitor on the wrong tab. */}
          <Pressable onPress={()=>setScreen('main')} hitSlop={8}><Ionicons name="chevron-back" size={24} color="#0B1220"/></Pressable>
          <Text style={styles.knowledgeHeaderTitle}>{current.label}</Text>
          <Text style={styles.listCountSubtitle}>{brainGalleryIndex+1}/{BRAIN_GALLERY_SCREENS.length}</Text>
        </View>
        <ScrollView style={styles.galleryScroll} contentContainerStyle={styles.galleryContent} showsVerticalScrollIndicator>
          <ExpoImage
            source={{uri:current.url}}
            style={{width:galleryWidth,height:galleryHeight}}
            contentFit="contain"
            cachePolicy="memory-disk"
            recyclingKey={current.url}
            onError={()=>{
              // Common cause: filename in BRAIN_GALLERY_FILENAMES doesn't
              // byte-for-byte match the file in the bucket (case, spaces,
              // or the bucket isn't set to Public so getPublicUrl 403s).
              console.warn('[brainGallery] failed to load', current.label, current.url);
            }}
          />
        </ScrollView>
        <View style={styles.galleryControls}>
          <Pressable disabled={brainGalleryIndex===0} onPress={()=>setBrainGalleryIndex(i=>Math.max(0,i-1))} style={[styles.resetButton,{paddingHorizontal:20},brainGalleryIndex===0?styles.resetButtonDisabled:styles.resetButtonEnabled]}><Text style={styles.resetButtonText}>Prev</Text></Pressable>
          <Text style={styles.listCountSubtitle}>{brainGalleryIndex+1} / {BRAIN_GALLERY_SCREENS.length}</Text>
          <Pressable disabled={brainGalleryIndex===BRAIN_GALLERY_SCREENS.length-1} onPress={()=>setBrainGalleryIndex(i=>Math.min(BRAIN_GALLERY_SCREENS.length-1,i+1))} style={[styles.resetButton,{paddingHorizontal:20},brainGalleryIndex===BRAIN_GALLERY_SCREENS.length-1?styles.resetButtonDisabled:styles.resetButtonEnabled]}><Text style={styles.resetButtonText}>Next</Text></Pressable>
        </View>
      </View>
    );
  }

  if(screen==='socialMedia'){
    const current=SOCIAL_MEDIA_SCREENS[socialMediaIndex];
    // Same fix as brainGallery: current.width/height are hand-typed guesses
    // in SOCIAL_MEDIA_FILENAMES, not read from the actual file. Use them
    // only as a placeholder ratio until Image.getSize reports the real one.
    const ratio = socialNaturalSize ? socialNaturalSize.width / socialNaturalSize.height : current.width / current.height;
    const galleryWidth = Math.min(width, current.width);
    const galleryHeight = galleryWidth / ratio;
    return(
      <View style={styles.mainScreen}>
        <StatusBar style="dark"/>
        <View style={styles.knowledgeHeader}>
          {/* Don't force mainTab back to 'home' — this can now be opened from
              Inbox or Home (Connect Apps), and forcing 'home' would strand
              an Inbox-tab visitor on the wrong tab, same fix as brainGallery. */}
          <Pressable onPress={()=>setScreen('main')} hitSlop={8}><Ionicons name="chevron-back" size={24} color="#0B1220"/></Pressable>
          <Text style={styles.knowledgeHeaderTitle}>{current.label}</Text>
          <Text style={styles.listCountSubtitle}>{socialMediaIndex+1}/{SOCIAL_MEDIA_SCREENS.length}</Text>
        </View>
        <ScrollView style={styles.galleryScroll} contentContainerStyle={styles.galleryContent} showsVerticalScrollIndicator>
          <ExpoImage
            source={{uri:current.url}}
            style={{width:galleryWidth,height:galleryHeight}}
            contentFit="contain"
            cachePolicy="memory-disk"
            recyclingKey={current.url}
            onError={()=>{
              console.warn('[socialMedia] failed to load', current.label, current.url);
            }}
          />
        </ScrollView>
        <View style={styles.galleryControls}>
          <Pressable disabled={socialMediaIndex===0} onPress={()=>setSocialMediaIndex(i=>Math.max(0,i-1))} style={[styles.resetButton,{paddingHorizontal:20},socialMediaIndex===0?styles.resetButtonDisabled:styles.resetButtonEnabled]}><Text style={styles.resetButtonText}>Prev</Text></Pressable>
          <Text style={styles.listCountSubtitle}>{socialMediaIndex+1} / {SOCIAL_MEDIA_SCREENS.length}</Text>
          <Pressable disabled={socialMediaIndex===SOCIAL_MEDIA_SCREENS.length-1} onPress={()=>setSocialMediaIndex(i=>Math.min(SOCIAL_MEDIA_SCREENS.length-1,i+1))} style={[styles.resetButton,{paddingHorizontal:20},socialMediaIndex===SOCIAL_MEDIA_SCREENS.length-1?styles.resetButtonDisabled:styles.resetButtonEnabled]}><Text style={styles.resetButtonText}>Next</Text></Pressable>
        </View>
      </View>
    );
  }

  if(screen==='inboxChat'){
    // Built directly from Figma node 1335:306 ("Nexora/Inbox") plus
    // Inbox-7/8/9 (AI-suggested replies) and Frame 916 (human takeover) —
    // pulled via the Figma MCP connection. The contact photo and small
    // vector icons (back, kebab, paperclip, mic, send, AI sparkle) use
    // Ionicons/one shared avatar rather than the exact exported bytes —
    // this sandbox can't reach figma.com to download those, only the
    // short-lived URLs the tool itself returns.
    const conv = conversations.find(c => c.id === activeConversationId) || conversations[0];
    const isHandling = humanHandling[conv.id];
    const showSuggestion = !!conv.aiSuggestion && !isHandling;
    const sendSuggestion = () => {
      const isDemoFailure = conv.id === 'david-brown';
      setInboxModal('sending');
      setTimeout(() => {
        if (isDemoFailure) {
          // No real network layer exists in this app to detect an actual
          // offline state, so this alternates failed/offline on each retry
          // — the most honest way to make both truth screens reachable
          // without faking a network condition that isn't really there.
          setDemoFailCount(n => n + 1);
          setInboxModal(demoFailCount % 2 === 0 ? 'failed' : 'offline');
          return;
        }
        setInboxModal(null);
        setConversations(prev => prev.map(c => c.id === conv.id
          ? { ...c, messages: [...c.messages, { id: `ai-${Date.now()}`, from: 'business', text: c.aiSuggestion!.text, time: 'Just now' }], aiSuggestion: undefined, needInfo: undefined }
          : c));
      }, 1600);
    };
    const sendDraft = () => {
      if (!inboxDraft.trim()) return;
      setConversations(prev => prev.map(c => c.id === conv.id
        ? { ...c, messages: [...c.messages, { id: `u-${Date.now()}`, from: 'business', text: inboxDraft.trim(), time: 'Just now' }] }
        : c));
      setInboxDraft('');
    };
    return(
      <View style={styles.mainScreen}>
        <StatusBar style="dark"/>
        <View style={{height:51*scale,width,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16*scale,borderBottomWidth:1,borderBottomColor:'#E7EAEC'}}>
          <View style={{flexDirection:'row',alignItems:'center',gap:20*scale}}>
            <Pressable onPress={()=>setScreen('main')} hitSlop={8}>
              <Ionicons name="chevron-back" size={20*scale} color="#0B1220"/>
            </Pressable>
            <View style={{flexDirection:'row',alignItems:'center',gap:8*scale}}>
              <ExpoImage source={{uri:INBOX_AVATAR_URL}} style={{width:40*scale,height:40*scale,borderRadius:20*scale,backgroundColor:'#E7EAEC'}} contentFit="cover" cachePolicy="memory-disk"/>
              <View>
                <Text style={{fontSize:14*scale,color:'#000'}}>{conv.name}</Text>
                <Text style={{fontSize:12*scale,color:'#6B7280'}}>{conv.platform}</Text>
              </View>
            </View>
          </View>
          <Pressable hitSlop={8} onPress={()=>setInboxModal('share')}>
            <Ionicons name="ellipsis-vertical" size={18*scale} color="#0B1220"/>
          </Pressable>
        </View>

        <ScrollView style={{flex:1,backgroundColor:'#FFF'}} contentContainerStyle={{paddingHorizontal:16*scale,paddingTop:16*scale,paddingBottom:8*scale}}>
          {conv.messages.map(m => (
            <View key={m.id}>
              {m.from === 'business' && <Text style={{alignSelf:'flex-end',fontSize:12*scale,color:'#6B7280',marginBottom:4*scale}}>You</Text>}
              <View style={m.from === 'customer'
                ? {alignSelf:'flex-start',maxWidth:308*scale,backgroundColor:'#E7EAEC',borderRadius:12*scale,borderTopLeftRadius:0,padding:12*scale}
                : {alignSelf:'flex-end',maxWidth:313*scale,backgroundColor:'#1E56A0',borderRadius:12*scale,borderTopRightRadius:0,padding:12*scale}}>
                <Text style={{fontSize:14*scale,color:m.from==='customer'?'#000':'#FFF'}}>{m.text}</Text>
              </View>
              <Text style={{alignSelf:m.from==='customer'?'flex-start':'flex-end',fontSize:12*scale,color:'#6B7280',marginTop:4*scale,marginBottom:12*scale}}>{m.time}</Text>
            </View>
          ))}

          {showSuggestion && (
            <View style={styles.suggestCard}>
              <View style={styles.suggestHeaderRow}>
                <Ionicons name="sparkles" size={14} color="#1E56A0" />
                <Text style={styles.suggestHeaderText}>NEXORA suggests this reply</Text>
              </View>
              <View style={styles.suggestConfidencePill}>
                <Text style={styles.suggestConfidenceText}>{conv.aiSuggestion!.confidence}% Confidence</Text>
              </View>
              <Text style={styles.suggestBodyText}>{conv.aiSuggestion!.text}</Text>
              <View style={styles.suggestActionRow}>
                <Pressable style={styles.suggestActionBtn}><Ionicons name="create-outline" size={14} color="#1E56A0" /><Text style={styles.suggestActionText}>Edit</Text></Pressable>
                <Pressable style={styles.suggestActionBtn}><Ionicons name="refresh-outline" size={14} color="#1E56A0" /><Text style={styles.suggestActionText}>Regenerate</Text></Pressable>
              </View>
              <Text style={styles.suggestReasonHeader}>AI message</Text>
              <Text style={styles.suggestReasonSub}>This message was generated because :</Text>
              {conv.aiSuggestion!.reasons.map((r, i) => (
                <Text key={r} style={styles.suggestReasonItem}>{i + 1}. {r}</Text>
              ))}
              <View style={styles.suggestSendRow}>
                <Pressable onPress={sendSuggestion} style={styles.suggestSendBtn}>
                  <Ionicons name="paper-plane-outline" size={14} color="#FFF" /><Text style={styles.suggestSendText}>Send</Text>
                </Pressable>
                <Pressable onPress={() => setInboxModal('takeover')} style={styles.suggestTakeoverBtn}>
                  <Ionicons name="person-outline" size={14} color="#1E56A0" /><Text style={styles.suggestTakeoverText}>Take over</Text>
                </Pressable>
              </View>
            </View>
          )}

          {!!conv.needInfo && !isHandling && (
            <View style={styles.needInfoBanner}>
              <View style={styles.needInfoHeaderRow}>
                <Ionicons name="alert-circle" size={14} color="#C2760C" />
                <Text style={styles.needInfoHeaderText}>Need Information</Text>
              </View>
              <Text style={styles.needInfoBodyText}>{conv.needInfo}</Text>
              <View style={styles.suggestActionRow}>
                <Pressable onPress={() => setInboxModal('takeover')} style={styles.needInfoBtn}><Text style={styles.needInfoBtnText}>Reply myself</Text></Pressable>
                <Pressable onPress={openAddKnowledge} style={styles.needInfoBtn}><Text style={styles.needInfoBtnText}>Add Information</Text></Pressable>
              </View>
            </View>
          )}
        </ScrollView>

        <Pressable style={{position:'absolute',right:16*scale,bottom:96*scale,width:34*scale,height:34*scale,borderRadius:16*scale,backgroundColor:'#0F2942',alignItems:'center',justifyContent:'center'}}>
          <Ionicons name="sparkles" size={16*scale} color="#FFF"/>
        </Pressable>

        <View style={{flexDirection:'row',alignItems:'center',marginHorizontal:16*scale,marginBottom:16*scale,height:48*scale,borderRadius:24*scale,backgroundColor:'#F5F6F8',paddingHorizontal:12*scale}}>
          <Ionicons name="attach-outline" size={20*scale} color="#5C6B7A"/>
          <TextInput
            value={inboxDraft}
            onChangeText={setInboxDraft}
            placeholder="Type your message..."
            placeholderTextColor="#94A3B8"
            style={{flex:1,fontSize:12*scale,marginLeft:8*scale,color:'#0B1220'}}
          />
          <Pressable hitSlop={8}>
            <Ionicons name="mic-outline" size={18*scale} color="#5C6B7A"/>
          </Pressable>
          <Pressable
            onPress={sendDraft}
            style={{width:32*scale,height:32*scale,borderRadius:16*scale,backgroundColor:'#0F2942',alignItems:'center',justifyContent:'center',marginLeft:8*scale}}>
            <Ionicons name="send" size={14*scale} color="#FFF"/>
          </Pressable>
        </View>

        {inboxModal === 'takeover' && (
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalIconCircle}><Ionicons name="git-network-outline" size={22} color="#1E56A0" /></View>
              <Text style={styles.modalTitle}>You are now handling this conversation</Text>
              <Text style={styles.modalSubtitle}>Nexora AI is paused</Text>
              <Pressable
                onPress={() => { setHumanHandling(prev => ({ ...prev, [conv.id]: true })); setInboxModal(null); }}
                style={[styles.resetButton, styles.resetButtonEnabled, { width: '100%', marginTop: 16 }]}>
                <Text style={styles.resetButtonText}>Continue</Text>
              </Pressable>
            </View>
          </View>
        )}

        {inboxModal === 'sending' && (
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.processingOrb}><Ionicons name="sparkles" size={22} color="#FFF" /></View>
              <Text style={styles.modalTitle}>NEXORA AI is sending your reply…</Text>
              <Text style={styles.modalSubtitle}>Please wait while we deliver your message to the customer</Text>
              {['Preparing message', `Connecting to ${conv.platform.toLowerCase()}`, 'Sending…', 'Almost done…'].map(s => (
                <View key={s} style={styles.featureRow}><Ionicons name="checkmark-circle" size={14} color="#1E9E6D" /><Text style={styles.attentionSubtitle}>{s}</Text></View>
              ))}
            </View>
          </View>
        )}

        {inboxModal === 'failed' && (
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={[styles.modalIconCircle, { backgroundColor: '#FDEDED' }]}><Ionicons name="warning" size={22} color="#D32F2F" /></View>
              <Text style={styles.modalTitle}>Message Failed</Text>
              <Text style={styles.modalSubtitle}>We couldn't send your message. Please check your connection and try again.</Text>
              <Pressable onPress={sendSuggestion} style={[styles.resetButton, styles.resetButtonEnabled, { width: '100%', marginTop: 16 }]}>
                <Text style={styles.resetButtonText}>Retry</Text>
              </Pressable>
              <Pressable onPress={() => setInboxModal(null)} style={[styles.resetButton, { width: '100%', marginTop: 10 }]}>
                <Text style={[styles.resetButtonText, { color: '#1E56A0' }]}>Edit Message</Text>
              </Pressable>
            </View>
          </View>
        )}

        {inboxModal === 'offline' && (
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalIconCircle}><Ionicons name="cloud-offline-outline" size={22} color="#1E56A0" /></View>
              <Text style={styles.modalTitle}>You are offline</Text>
              <Text style={styles.modalSubtitle}>New messages will appear when you are connected to the internet.</Text>
              <Pressable onPress={sendSuggestion} style={[styles.resetButton, styles.resetButtonEnabled, { width: '100%', marginTop: 16 }]}>
                <Text style={styles.resetButtonText}>Try Again</Text>
              </Pressable>
            </View>
          </View>
        )}

        {inboxModal === 'share' && (
          <View style={styles.modalOverlay}>
            <View style={styles.shareSheet}>
              <Text style={styles.shareSheetTitle}>Share link</Text>
              <View style={styles.shareGrid}>
                {SHARE_TARGETS.map(t => (
                  <Pressable key={t.name} onPress={() => setInboxModal(null)} style={styles.shareTarget}>
                    <View style={[styles.shareTargetIcon, { backgroundColor: t.color }]}><Ionicons name={t.icon as any} size={20} color={(t as any).iconColor ?? '#FFF'} /></View>
                    <Text style={styles.shareTargetLabel}>{t.name}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.shareBottomRow}>
                <Pressable onPress={() => setInboxModal(null)} style={styles.shareBottomBtn}><Ionicons name="link-outline" size={20} color="#0B1220" /><Text style={styles.shareBottomLabel}>Copy link</Text></Pressable>
                <Pressable onPress={() => setInboxModal(null)} style={styles.shareBottomBtn}><Ionicons name="share-social-outline" size={20} color="#0B1220" /><Text style={styles.shareBottomLabel}>Share via...</Text></Pressable>
              </View>
              <Pressable onPress={() => setInboxModal(null)} style={{ alignItems: 'center', marginTop: 12 }}>
                <Text style={{ color: '#8A97A6', fontWeight: '600' }}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        )}
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

              {resetError ? <Text style={styles.resetError}>{resetError}</Text> : null}

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

          {resetStep!=='success'&&resetStep!=='password'&&resetError?(
            <Text style={styles.resetError}>{resetError}</Text>
          ):null}
          {resetStep!=='success'&&!resetError&&infoMessage?(
            <Text style={styles.resetInfo}>{infoMessage}</Text>
          ):null}

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

              {authError?(
                <View pointerEvents="none" style={[styles.loginErrorOverlay,{left:INPUT_X*scale,width:INPUT_WIDTH*scale,top:(LOGIN_PASSWORD_Y+INPUT_HEIGHT+8)*scale}]}>
                  <Text style={[styles.loginErrorText,{fontSize:12*scale}]}>{authError}</Text>
                </View>
              ):null}

              {!authError&&infoMessage?(
                <View pointerEvents="none" style={[styles.infoOverlay,{left:INPUT_X*scale,width:INPUT_WIDTH*scale,top:(LOGIN_PASSWORD_Y+INPUT_HEIGHT+8)*scale}]}>
                  <Text style={[styles.infoText,{fontSize:12*scale}]}>{infoMessage}</Text>
                </View>
              ):null}
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

              {authError?(
                <View pointerEvents="none" style={[styles.loginErrorOverlay,{left:INPUT_X*scale,width:INPUT_WIDTH*scale,top:(SIGNUP_CONFIRM_PASSWORD_Y+INPUT_HEIGHT+8)*scale}]}>
                  <Text style={[styles.loginErrorText,{fontSize:12*scale}]}>{authError}</Text>
                </View>
              ):null}
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
  topBarDark:{backgroundColor:'#0F2942',borderBottomColor:'#1B3A5C'},
  topBarTitleDark:{color:'#FFF'},
  topBarSubtitleDark:{color:'#8FA3BC'},
  bellWrapDark:{},
  topBarAvatar:{width:32,height:32,borderRadius:16,backgroundColor:'#E7EAEC'},
  brainScreenDark:{backgroundColor:'#0F2942'},
  brainHeroIconWrap:{width:220,height:145,alignItems:'center',justifyContent:'center'},
  brainHeroImage:{width:220,height:145},
  brainFloatingBtn:{position:'absolute',right:16,bottom:88,width:38,height:38,borderRadius:19,backgroundColor:'#1E56A0',alignItems:'center',justifyContent:'center',borderWidth:2,borderColor:'rgba(255,255,255,0.3)'},
  aiListItem:{marginBottom:4},
  aiListNumber:{fontWeight:'700'},
  aiSectionHeader:{fontSize:13,fontWeight:'700',color:'#FFF',marginTop:8,marginBottom:4},
  aiChipRow:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:6},
  aiChip:{backgroundColor:'rgba(255,255,255,0.1)',borderRadius:14,paddingHorizontal:10,paddingVertical:6,borderWidth:1,borderColor:'rgba(255,255,255,0.2)'},
  aiChipText:{fontSize:11,color:'#FFF',fontWeight:'600'},
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
  galleryScroll:{flex:1,backgroundColor:'#FFF'},
  galleryContent:{alignItems:'center',paddingVertical:16},
  galleryControls:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16,paddingVertical:12,backgroundColor:'#FFF',borderTopWidth:1,borderTopColor:'#EEF1F4'},
homeScrollContent:{padding:16,paddingBottom:24},
homeSearchBar:{flexDirection:'row',alignItems:'center',gap:8,backgroundColor:'#FFF',borderRadius:24,paddingHorizontal:16,height:44,marginBottom:16},
homeSearchPlaceholder:{color:'#8A97A6',fontSize:13},
homeSearchSendButton:{width:28,height:28,borderRadius:14,backgroundColor:'#1E56A0',alignItems:'center',justifyContent:'center'},
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
sectionViewAll:{fontSize:12,color:'#8A97A6',fontWeight:'500'},
commandGrid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between'},
commandItem:{width:'23%',alignItems:'center',marginBottom:16},
commandIconCircle:{width:48,height:48,borderRadius:24,backgroundColor:'#FFF',alignItems:'center',justifyContent:'center',marginBottom:6},
commandLabel:{fontSize:10,color:'#5C6B7A',textAlign:'center'},
attentionItem:{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:'#FFF',borderRadius:12,padding:12,marginBottom:10},
attentionIconCircle:{width:36,height:36,borderRadius:18,alignItems:'center',justifyContent:'center'},
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
  gaugeCard:{backgroundColor:'#FFF',borderRadius:16,padding:16,marginBottom:16},
  gaugeTitleRow:{flexDirection:'row',alignItems:'center',gap:6,marginBottom:8},
  gaugeShieldIcon:{width:22,height:22,borderRadius:11,backgroundColor:'#E6F4ED',alignItems:'center',justifyContent:'center'},
  gaugeTitleText:{fontSize:13,fontWeight:'600',color:'#0B1220'},
  gaugeRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  gaugeArcWrap:{width:180,height:100,alignItems:'center'},
  gaugeTick:{position:'absolute',top:54,width:5,height:26,borderRadius:2.5},
  gaugeCenterText:{position:'absolute',bottom:0,alignItems:'center'},
  gaugePercent:{fontSize:26,fontWeight:'700',color:'#0B1220'},
  gaugeLabel:{fontSize:12,color:'#1E9E6D',fontWeight:'600'},
  gaugeLegend:{gap:6},
  gaugeLegendRow:{flexDirection:'row',alignItems:'center',gap:6},
  gaugeDot:{width:7,height:7,borderRadius:3.5},
  gaugeLegendText:{fontSize:12,color:'#5C6B7A',fontWeight:'600'},
  statsRow:{flexDirection:'row',gap:12,marginTop:14},
  statBoxCard:{flex:1,backgroundColor:'#F7F8FA',borderRadius:12,padding:12},
  statIconCircleBlue:{width:28,height:28,borderRadius:14,backgroundColor:'#E3ECFA',alignItems:'center',justifyContent:'center',marginBottom:6},
  statIconCirclePurple:{width:28,height:28,borderRadius:14,backgroundColor:'#F1E7FC',alignItems:'center',justifyContent:'center',marginBottom:6},
  statBox:{alignItems:'center'},
  statValue:{fontSize:17,fontWeight:'700',color:'#0B1220',marginTop:6},
  statLabel:{fontSize:12,color:'#5C6B7A',marginTop:6},
  statDeltaPill:{flexDirection:'row',alignItems:'center',gap:3,backgroundColor:'#E6F4ED',alignSelf:'flex-start',borderRadius:8,paddingHorizontal:6,paddingVertical:2,marginTop:8},
  statDeltaText:{fontSize:10,color:'#1E9E6D',fontWeight:'600'},
  knowledgeCard:{backgroundColor:'#FFF',borderRadius:16,padding:16,marginBottom:4},
  attentionCard:{backgroundColor:'#FFF',borderRadius:16,padding:12,marginBottom:4},
  attentionIconWrap:{width:36,height:36,borderRadius:10,backgroundColor:'#EAF1FB',alignItems:'center',justifyContent:'center'},
  attentionCountBadge:{position:'absolute',top:-6,left:-6,width:16,height:16,borderRadius:8,backgroundColor:'#1E56A0',alignItems:'center',justifyContent:'center',zIndex:1},
  attentionCountBadgeText:{fontSize:9,color:'#FFF',fontWeight:'700'},
  attentionAddCircle:{width:28,height:28,borderRadius:14,backgroundColor:'#0F2942',alignItems:'center',justifyContent:'center',marginLeft:8},
  attentionButtonTextOnly:{fontSize:11,fontWeight:'600',color:'#C2760C',marginRight:2},
  recentDocRow:{flexDirection:'row',alignItems:'center',gap:10,paddingVertical:10,borderBottomWidth:1,borderBottomColor:'#F0F2F4'},
  recentDocMeta:{fontSize:11,color:'#1E9E6D',marginTop:2},
  commandCount:{fontSize:10,color:'#8A97A6',marginTop:2},
  listCountRow:{flexDirection:'row',alignItems:'flex-start',justifyContent:'space-between'},
  listCountTitle:{fontSize:18,fontWeight:'700',color:'#0B1220'},
  listCountSubtitle:{fontSize:12,color:'#1E9E6D',marginBottom:12},
  listFilterButton:{flexDirection:'row',alignItems:'center',gap:4,backgroundColor:'#F5F6F8',borderRadius:14,paddingHorizontal:10,paddingVertical:6},
  listFilterButtonText:{fontSize:12,color:'#5C6B7A',fontWeight:'600'},
  searchBarPlain:{flexDirection:'row',alignItems:'center',gap:8,backgroundColor:'#FFF',borderRadius:12,paddingHorizontal:14,height:44,marginBottom:12},
  filterRow:{flexDirection:'row',gap:8,marginBottom:16},
  filterChip:{paddingHorizontal:12,paddingVertical:7,borderRadius:14,backgroundColor:'#FFF'},
  filterChipActive:{backgroundColor:'#0B1220'},
  filterChipText:{fontSize:12,color:'#5C6B7A',fontWeight:'600'},
  filterChipTextActive:{color:'#FFF'},
  knowledgeRow:{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:'#FFF',borderRadius:12,padding:12,marginBottom:10},
  knowledgeRowIcon:{width:40,height:40,borderRadius:10,alignItems:'center',justifyContent:'center'},
  knowledgeRowPhoto:{width:40,height:40,borderRadius:10,backgroundColor:'#F5F6F8'},
  faqRow:{flexDirection:'row',alignItems:'center',backgroundColor:'#FFF',borderRadius:14,padding:16,marginBottom:12},
  faqAnswerAvailable:{fontSize:12,color:'#1E9E6D',marginTop:4,fontWeight:'600'},
  statusPill:{backgroundColor:'#E7F7EF',borderRadius:12,paddingHorizontal:10,paddingVertical:4},
  statusPillWarn:{backgroundColor:'#FDEFE0'},
  statusPillText:{fontSize:11,fontWeight:'600',color:'#1E9E6D'},
  statusPillTextWarn:{color:'#E5A63A'},
  detailCard:{backgroundColor:'#FFF',borderRadius:16,padding:16,marginBottom:14},
  detailOverviewRow:{flexDirection:'row',gap:12},
  detailImageBox:{width:64,height:64,borderRadius:12,alignItems:'center',justifyContent:'center'},
  detailImagePhoto:{width:64,height:64,borderRadius:12,backgroundColor:'#F5F6F8'},
  // NEW: itemDetail's overview-card icon/photo — large and with no
  // background box, unlike the small colored-square treatment list rows
  // and the edit screen's thumbnail use. contentFit="contain" (set on
  // KnowledgeRowImage) keeps a real photo from being cropped at this size.
  detailOverviewPhoto:{width:64,height:64,borderRadius:8},
  // NEW: the Source card's pink PDF badge (see PdfSourceBadge).
  pdfBadge:{width:44,height:44,borderRadius:10,backgroundColor:'#FDE7E6',alignItems:'center',justifyContent:'center'},
  detailFieldRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:10,borderBottomWidth:1,borderBottomColor:'#F0F2F5'},
  detailFieldLabelRow:{flexDirection:'row',alignItems:'center',gap:6},
  detailFieldLabel:{fontSize:12,color:'#8A97A6'},
  detailFieldValue:{fontSize:13,color:'#0B1220',fontWeight:'600'},
  featureRow:{flexDirection:'row',alignItems:'center',gap:8,marginTop:8},
  sourceRow:{flexDirection:'row',alignItems:'center',gap:8,marginBottom:6},
  sourcePageText:{fontSize:11,color:'#8A97A6',marginTop:2},
  editLink:{flexDirection:'row',alignItems:'center',gap:6,alignSelf:'center',marginTop:4,marginBottom:24},
  editInput:{height:46,borderWidth:1,borderColor:'#5381BB',borderRadius:12,paddingHorizontal:14,color:'#0B1220',marginTop:6},
  editChangeImageBox:{minWidth:64,paddingHorizontal:8,height:48,borderRadius:10,borderWidth:1,borderColor:'#5381BB',backgroundColor:'#FFFFFF',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:5},
  editChangeImageText:{fontSize:12,color:'#1E56A0',fontWeight:'600',lineHeight:15},
  editButtonRow:{flexDirection:'row',gap:12,marginTop:8},
  choiceCard:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:'#FFF',borderRadius:14,padding:16,marginBottom:12},
  dropZone:{alignItems:'center',gap:8,backgroundColor:'#FFF',borderRadius:16,borderWidth:1,borderColor:'#EEF1F4',borderStyle:'dashed',padding:32,marginTop:8},
  privacyBanner:{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:'#EAF1FB',borderRadius:12,padding:14,marginTop:16},
  privacyBannerText:{flex:1,fontSize:12,color:'#1E56A0'},
  processingOrb:{width:64,height:64,borderRadius:32,backgroundColor:'#1E56A0',alignItems:'center',justifyContent:'center'},
  extractedOkBanner:{flexDirection:'row',alignItems:'flex-start',gap:8,backgroundColor:'#E6F4ED',borderRadius:10,padding:10,marginTop:10},
  extractedOkText:{flex:1,fontSize:12,color:'#1E9E6D'},
  reviewNoImageIcon:{width:36,height:36,borderRadius:10,backgroundColor:'#FFF',alignItems:'center',justifyContent:'center'},
  reviewBannerButtonRow:{flexDirection:'row',gap:8,marginTop:10},
  reviewTypeBadge:{backgroundColor:'#EAF1FB',borderRadius:8,paddingHorizontal:8,paddingVertical:3},
  reviewTypeBadgeText:{fontSize:10,fontWeight:'600',color:'#1E56A0'},
  matchItemRow:{flexDirection:'row',gap:12,marginBottom:16},
  suggestionGrid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between'},
  suggestionCell:{width:'48%',backgroundColor:'#FFF',borderRadius:12,padding:8,marginBottom:12,borderWidth:2,borderColor:'transparent'},
  suggestionCellActive:{borderColor:'#1E56A0'},
  suggestionBestBadge:{position:'absolute',top:6,left:6,zIndex:1,backgroundColor:'#1E56A0',color:'#FFF',fontSize:9,fontWeight:'700',paddingHorizontal:6,paddingVertical:2,borderRadius:6,overflow:'hidden'},
  suggestionImageBox:{height:80,borderRadius:8,backgroundColor:'#F5F6F8',alignItems:'center',justifyContent:'center',marginBottom:6},
  suggestionMatchText:{fontSize:11,fontWeight:'600',color:'#0B1220'},
  suggestionSourceText:{fontSize:10,color:'#8A97A6'},
  confirmImagePreview:{height:180,borderRadius:16,backgroundColor:'#F5F6F8',alignItems:'center',justifyContent:'center',marginBottom:14},
  licenseCheckRow:{flexDirection:'row',alignItems:'center',gap:8,marginTop:12},

  // Inbox list
  inboxSubtitle:{fontSize:12,color:'#8A97A6',paddingHorizontal:16,marginBottom:12},
  platformChipRow:{flexDirection:'row',justifyContent:'space-between',paddingHorizontal:16,marginTop:12},
  platformChipItem:{alignItems:'center',gap:4,width:56},
  platformChipCircle:{width:40,height:40,borderRadius:20,backgroundColor:'#F5F6F8',alignItems:'center',justifyContent:'center'},
  platformChipCircleSelected:{borderWidth:2,borderColor:'#0B1220'},
  platformChipLabel:{fontSize:9,color:'#5C6B7A'},
  platformChipLabelActive:{color:'#0B1220',fontWeight:'700'},
  conversationRow:{flexDirection:'row',gap:10,backgroundColor:'#FFF',borderRadius:14,padding:12,marginBottom:10},
  conversationAvatarWrap:{position:'relative'},
  conversationAvatar:{width:44,height:44,borderRadius:22,backgroundColor:'#EAF1FB',alignItems:'center',justifyContent:'center'},
  conversationAvatarText:{fontSize:14,fontWeight:'700',color:'#1E56A0'},
  conversationPlatformBadge:{position:'absolute',bottom:-2,right:-2,width:16,height:16,borderRadius:8,alignItems:'center',justifyContent:'center',borderWidth:2,borderColor:'#FFF'},
  conversationTime:{fontSize:11,color:'#8A97A6'},
  conversationStatusPill:{borderRadius:8,paddingHorizontal:8,paddingVertical:3},
  conversationStatusPillText:{fontSize:10,fontWeight:'600'},
  conversationUnreadBadge:{minWidth:18,height:18,borderRadius:9,backgroundColor:'#1E56A0',alignItems:'center',justifyContent:'center',paddingHorizontal:5},
  conversationUnreadBadgeText:{fontSize:10,color:'#FFF',fontWeight:'700'},

  // AI suggested-reply card + Need Information banner
  suggestCard:{backgroundColor:'#EAF1FB',borderRadius:14,padding:14,marginTop:4,marginBottom:16,alignSelf:'stretch'},
  suggestHeaderRow:{flexDirection:'row',alignItems:'center',gap:6,marginBottom:8},
  suggestHeaderText:{fontSize:12,fontWeight:'700',color:'#1E56A0'},
  suggestConfidencePill:{alignSelf:'flex-start',backgroundColor:'#E6F4ED',borderRadius:8,paddingHorizontal:8,paddingVertical:3,marginBottom:8},
  suggestConfidenceText:{fontSize:10,fontWeight:'700',color:'#1E9E6D'},
  suggestBodyText:{fontSize:13,color:'#0B1220',lineHeight:19,marginBottom:10},
  suggestActionRow:{flexDirection:'row',gap:10,marginBottom:10},
  suggestActionBtn:{flexDirection:'row',alignItems:'center',gap:4},
  suggestActionText:{fontSize:12,fontWeight:'600',color:'#1E56A0'},
  suggestReasonHeader:{fontSize:11,fontWeight:'700',color:'#0B1220'},
  suggestReasonSub:{fontSize:11,color:'#5C6B7A',marginBottom:4},
  suggestReasonItem:{fontSize:11,color:'#5C6B7A',marginBottom:2},
  suggestSendRow:{flexDirection:'row',gap:10,marginTop:12},
  suggestSendBtn:{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,backgroundColor:'#1E56A0',borderRadius:20,paddingVertical:10},
  suggestSendText:{color:'#FFF',fontSize:13,fontWeight:'700'},
  suggestTakeoverBtn:{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,borderRadius:20,paddingVertical:10,borderWidth:1,borderColor:'#1E56A0'},
  suggestTakeoverText:{color:'#1E56A0',fontSize:13,fontWeight:'700'},
  needInfoBanner:{backgroundColor:'#FDF3E7',borderRadius:14,padding:14,marginBottom:16},
  needInfoHeaderRow:{flexDirection:'row',alignItems:'center',gap:6,marginBottom:6},
  needInfoHeaderText:{fontSize:12,fontWeight:'700',color:'#C2760C'},
  needInfoBodyText:{fontSize:12,color:'#5C6B7A',marginBottom:10},
  needInfoBtn:{flex:1,alignItems:'center',backgroundColor:'#FFF',borderRadius:16,paddingVertical:8},
  needInfoBtnText:{fontSize:12,fontWeight:'600',color:'#0B1220'},

  // Overlay modals: take-over, sending, failed
  modalOverlay:{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(11,18,32,0.55)',alignItems:'center',justifyContent:'center',padding:24},
  modalCard:{width:'100%',backgroundColor:'#FFF',borderRadius:20,padding:24,alignItems:'center'},
  modalIconCircle:{width:56,height:56,borderRadius:28,backgroundColor:'#EAF1FB',alignItems:'center',justifyContent:'center',marginBottom:14},
  modalTitle:{fontSize:15,fontWeight:'700',color:'#0B1220',textAlign:'center',marginBottom:4},
  modalSubtitle:{fontSize:12,color:'#8A97A6',textAlign:'center',marginBottom:12},

  // Share-link bottom sheet
  shareSheet:{width:'100%',backgroundColor:'#0B1220',borderRadius:20,padding:20,position:'absolute',bottom:24,left:24,right:24},
  shareSheetTitle:{color:'#FFF',fontSize:14,fontWeight:'700',textAlign:'center',marginBottom:16},
  shareGrid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between'},
  shareTarget:{width:'23%',alignItems:'center',marginBottom:16,gap:6},
  shareTargetIcon:{width:44,height:44,borderRadius:12,alignItems:'center',justifyContent:'center'},
  shareTargetLabel:{fontSize:10,color:'#FFF'},
  shareBottomRow:{flexDirection:'row',justifyContent:'space-around',borderTopWidth:1,borderTopColor:'#242E3D',paddingTop:14},
  shareBottomBtn:{alignItems:'center',gap:6},
  shareBottomLabel:{fontSize:11,color:'#FFF'},

  // Connect Channels screen
  channelSectionLabel:{fontSize:12,fontWeight:'700',color:'#8A97A6',marginTop:8,marginBottom:8},
  channelRow:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:'#FFF',borderRadius:14,padding:14,marginBottom:10},
  channelIconBox:{width:40,height:40,borderRadius:12,alignItems:'center',justifyContent:'center'},
  channelConnectedPill:{flexDirection:'row',alignItems:'center',gap:4,backgroundColor:'#E6F4ED',borderRadius:12,paddingHorizontal:10,paddingVertical:5},
  channelConnectedText:{fontSize:11,fontWeight:'600',color:'#1E9E6D'},
  channelConnectBtn:{backgroundColor:'#EAF1FB',borderRadius:12,paddingHorizontal:14,paddingVertical:7},
  channelConnectBtnText:{fontSize:12,fontWeight:'600',color:'#1E56A0'},
  channelSummaryBar:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,backgroundColor:'#EAF1FB',borderRadius:12,padding:12,marginTop:8},
  channelSummaryText:{fontSize:12,color:'#1E56A0',fontWeight:'600'},
  connectFlowIconWrap:{width:88,height:88,borderRadius:44,backgroundColor:'#F5F6F8',alignItems:'center',justifyContent:'center',alignSelf:'center',marginTop:24,marginBottom:16},
  connectFlowTitle:{fontSize:18,fontWeight:'700',color:'#0B1220',textAlign:'center',marginBottom:8},

  // Schedule calendar
  calendarNavRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:8,marginBottom:12},
  calendarMonthLabel:{fontSize:16,fontWeight:'700',color:'#0B1220'},
  calendarWeekdayRow:{flexDirection:'row',marginBottom:6},
  calendarWeekdayText:{width:`${100/7}%`,textAlign:'center',fontSize:12,fontWeight:'600',color:'#8A97A6'},
  calendarGrid:{flexDirection:'row',flexWrap:'wrap',marginBottom:16},
  calendarCell:{width:`${100/7}%`,alignItems:'center',paddingVertical:4},
  calendarDayCircle:{width:32,height:32,borderRadius:16,alignItems:'center',justifyContent:'center'},
  calendarDaySelected:{backgroundColor:'#1E56A0'},
  calendarDayToday:{borderWidth:1,borderColor:'#1E56A0'},
  calendarDayText:{fontSize:13,color:'#0B1220'},
  calendarDayTextMuted:{color:'#C4CBD4'},
  calendarDayTextSelected:{color:'#FFF',fontWeight:'700'},
  calendarEventDot:{width:4,height:4,borderRadius:2,backgroundColor:'#1E56A0',marginTop:2}
});
