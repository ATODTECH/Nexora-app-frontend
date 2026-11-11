import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, Share, StyleSheet, Switch, View } from 'react-native';
import { Text, TextInput } from '../lib/inter';
import { ChoiceChip } from './AutopilotCard';

// AI shop link (blueprint 2.8), the app's extra sections on the "AI shop link" screen: which products show (hide,
// feature, AI listings, new product with AI), delivery fees and pickup, ways to pay (the owner's own Paystack, a
// payment link, bank transfer, pay on delivery), the shopping funnel, the short link and a custom web address.
// Same server calls and rules as the website's /shop.
type Call = (fn: string, body: Record<string, unknown>, timeoutMs?: number) => Promise<any>;
type Shop = Record<string, any> & { slug: string; enabled: boolean };
type Item = { id: string; kind?: string; name: string; price: string; category: string; image: string; images?: string[]; overview: string; featured: boolean; hidden: boolean; stats: { views: number; carts: number; sold: number } };
type Paystack = { connected: boolean; mode: string; last4: string };
type Tab = 'products' | 'pay' | 'report' | 'domain';
const errMsg = (e: unknown) => (e as Error)?.message || 'Something went wrong.';

/** Items on the shop with no working photo (none, or a link that doesn't load). Nexora never takes pictures from the
 *  internet for a product (they may show a different item); it asks the owner for real photos instead. */
function useMissingPhotos(items: Item[] | null): Set<string> {
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const key = (items ?? []).map(i => `${i.id}:${i.image || ''}`).join('|');
  useEffect(() => {
    let live = true;
    const next = new Set<string>();
    Promise.all((items ?? []).map(i => (!i.image ? (next.add(i.id), Promise.resolve()) : Promise.race([
      Image.prefetch(i.image).then(ok => { if (!ok) next.add(i.id); }, () => { next.add(i.id); }),
      new Promise<void>(res => setTimeout(res, 8000)),   // slow photo: treat as fine
    ])))).then(() => { if (live) setMissing(next); });
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return missing;
}

export function ShopMore({ shop, shopUrl, callFn, flash, onSaved, pickPhoto, onNoPhoto, focusNoPhoto }: { shop: Shop; shopUrl: (slug: string) => string; callFn: Call; flash: (t: string) => void; onSaved: (s: Shop) => void; pickPhoto?: () => Promise<string | null>; onNoPhoto?: (n: number) => void; focusNoPhoto?: number }) {
  const [tab, setTab] = useState<Tab>('products');
  useEffect(() => { if (focusNoPhoto) setTab('products'); }, [focusNoPhoto]);
  // The screen's callFn and flash change on every render; keep stable versions so the sections load once.
  const fnRef = useRef(callFn), flashRef = useRef(flash);
  useEffect(() => { fnRef.current = callFn; flashRef.current = flash; });
  const call = useCallback<Call>((n, b, t) => fnRef.current(n, b, t), []);
  const say = useCallback((t: string) => flashRef.current(t), []);
  return (
    <View style={{ marginTop: 22 }}>
      <Text style={s.section}>More for your shop</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        {([['products', 'Products'], ['pay', 'Delivery & payment'], ['report', 'Report'], ['domain', 'Links & web address']] as const).map(([k, l]) => <ChoiceChip key={k} on={tab === k} label={l} onPress={() => setTab(k)} />)}
      </View>
      {tab === 'products' && <Products shop={shop} shopUrl={shopUrl} callFn={call} flash={say} pickPhoto={pickPhoto} onNoPhoto={onNoPhoto} focusNoPhoto={focusNoPhoto} />}
      {tab === 'pay' && <Pay shop={shop} callFn={call} flash={say} onSaved={onSaved} />}
      {tab === 'report' && <Report callFn={call} />}
      {tab === 'domain' && <Domain shop={shop} shopUrl={shopUrl} callFn={call} flash={say} onSaved={onSaved} />}
    </View>
  );
}

function Products({ shop, shopUrl, callFn, flash, pickPhoto, onNoPhoto, focusNoPhoto }: { shop: Shop; shopUrl: (slug: string) => string; callFn: Call; flash: (t: string) => void; pickPhoto?: () => Promise<string | null>; onNoPhoto?: (n: number) => void; focusNoPhoto?: number }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [drafts, setDrafts] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [listing, setListing] = useState<{ id: string; description: string; features: string[] } | null>(null);
  const reload = useCallback(() => callFn('nexora-shop', { action: 'products' }).then(r => { setItems(r.items ?? []); setDrafts(r.drafts ?? []); }).catch(e => { flash(errMsg(e)); setItems([]); }), [callFn, flash]);
  useEffect(() => { reload(); }, [reload]);
  const missing = useMissingPhotos(items);
  const noPhoto = (items ?? []).filter(i => !i.hidden && missing.has(i.id));
  const noPhotoProducts = noPhoto.filter(i => (i.kind ?? 'product') === 'product').length;
  useEffect(() => { if (items) onNoPhoto?.(noPhotoProducts); }, [items, noPhotoProducts]); // eslint-disable-line react-hooks/exhaustive-deps
  const [onlyNoPhoto, setOnlyNoPhoto] = useState(false);
  useEffect(() => { if (focusNoPhoto) setOnlyNoPhoto(true); }, [focusNoPhoto]);
  const addPhoto = async (it: Item) => {
    if (!pickPhoto) return;
    setBusy(`photo:${it.id}`);
    try {
      const url = await pickPhoto();
      if (url) { await callFn('nexora-shop', { action: 'set_item', item_id: it.id, images: [...(it.images ?? []).filter(u => u !== it.image), url].slice(0, 7) }); flash('Photo added'); reload(); }
    } catch (e) { flash(errMsg(e)); }
    setBusy('');
  };
  const setItem = async (id: string, patch: Record<string, unknown>, ok: string) => {
    setItems(l => l && l.map(x => (x.id === id ? { ...x, ...('hidden' in patch ? { hidden: !!patch.hidden } : {}), ...('featured' in patch ? { featured: !!patch.featured } : {}) } : x)));
    try { await callFn('nexora-shop', { action: 'set_item', item_id: id, ...patch }); flash(ok); if (patch.publish) reload(); } catch (e) { flash(errMsg(e)); reload(); }
  };
  return (
    <View style={{ gap: 10 }}>
      <View style={s.card}>
        <Text style={s.bold}>Add a product or service with AI</Text>
        <Text style={s.small}>Describe it like you would to a customer. Nexora writes the name, category, description and features without inventing details, and saves it as a draft.</Text>
        <TextInput value={note} onChangeText={setNote} multiline maxLength={600} placeholder="e.g. Oraimo FreePods 4, black and white, 35 hours battery, ₦28,500" style={[s.input, { minHeight: 70, paddingTop: 10, textAlignVertical: 'top', marginTop: 8 }]} />
        <Pressable disabled={busy === 'draft' || note.trim().length < 3} onPress={async () => {
          setBusy('draft');
          try { const r = await callFn('nexora-shop', { action: 'draft_listing', text: note }, 45000); setNote(''); flash(`Draft "${r.item?.name}" saved. Publish it below.`); reload(); } catch (e) { flash(errMsg(e)); }
          setBusy('');
        }} style={[s.btn, { marginTop: 8 }, note.trim().length < 3 && { opacity: 0.5 }]}>{busy === 'draft' ? <ActivityIndicator color="#FFF" /> : <Text style={s.btnText}>Write it for me</Text>}</Pressable>
      </View>
      {drafts.length > 0 && <View style={s.card}>
        <Text style={s.bold}>Drafts (not on your shop yet)</Text>
        {drafts.map(d => <View key={d.id} style={[s.row, { marginTop: 8 }]}><Text style={[s.small, { flex: 1 }]} numberOfLines={1}>{d.name}</Text><Pressable onPress={() => setItem(d.id, { publish: true }, `${d.name} is on your shop`)}><Text style={s.link}>Publish</Text></Pressable></View>)}
      </View>}
      {(noPhoto.length > 0 || onlyNoPhoto) && (
        <View style={[s.card, { borderColor: '#F3C77A', backgroundColor: '#FFF8EA' }]}>
          <Text style={s.bold}>{noPhoto.length ? `${noPhoto.length} item${noPhoto.length === 1 ? '' : 's'} on your shop ${noPhoto.length === 1 ? 'has' : 'have'} no photo` : 'Every item on your shop has a photo'}</Text>
          <Text style={s.small}>Take a clear picture of the actual product on your phone and tap Add photo. Nexora never uses pictures from the internet for your products, so customers see exactly what they will get.</Text>
          <Pressable onPress={() => setOnlyNoPhoto(v => !v)} style={[s.mini, { alignSelf: 'flex-start', marginTop: 8 }]}><Text style={s.miniText}>{onlyNoPhoto ? 'Show all items' : 'Show only items without a photo'}</Text></Pressable>
        </View>
      )}
      {!items ? <ActivityIndicator color="#1E56A0" /> : items.length === 0 ? <Text style={s.small}>No products or services yet. Items Nexora learned from chats never show on your shop.</Text> : (onlyNoPhoto ? noPhoto : items).map(it => (
        <View key={it.id} style={[s.card, it.hidden && { opacity: 0.65 }]}>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.bold} numberOfLines={1}>{it.featured ? '★ ' : ''}{it.name}</Text>
              <Text style={s.small}>{[it.price || 'No price', it.category].filter(Boolean).join(' · ')}</Text>
              <Text style={s.tiny}>30 days: {it.stats.views} views · {it.stats.carts} added · {it.stats.sold} sold</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {!!pickPhoto && <Pressable disabled={busy === `photo:${it.id}`} onPress={() => addPhoto(it)} style={[s.mini, missing.has(it.id) && !it.hidden && { borderColor: '#B7791F' }]}>{busy === `photo:${it.id}` ? <ActivityIndicator size="small" color="#1E56A0" /> : <Text style={s.miniText}>{missing.has(it.id) ? 'Add photo' : 'Add another photo'}</Text>}</Pressable>}
            <Pressable onPress={() => setItem(it.id, { hidden: !it.hidden }, it.hidden ? 'Back on your shop' : 'Hidden from your shop')} style={s.mini}><Text style={s.miniText}>{it.hidden ? 'Show' : 'Hide'}</Text></Pressable>
            <Pressable onPress={() => setItem(it.id, { featured: !it.featured }, it.featured ? 'No longer featured' : 'Featured at the top')} style={s.mini}><Text style={s.miniText}>{it.featured ? 'Unfeature' : 'Feature'}</Text></Pressable>
            <Pressable disabled={busy === it.id} onPress={async () => {
              setBusy(it.id);
              try { const r = await callFn('nexora-shop', { action: 'write_listing', item_id: it.id }, 45000); setListing({ id: it.id, description: r.listing.description, features: r.listing.features ?? [] }); } catch (e) { flash(errMsg(e)); }
              setBusy('');
            }} style={s.mini}>{busy === it.id ? <ActivityIndicator size="small" color="#1E56A0" /> : <Text style={s.miniText}>Write with AI</Text>}</Pressable>
            {!it.hidden && shop.enabled && <Pressable onPress={() => Share.share({ message: `${it.name}${it.price ? ` · ${it.price}` : ''}: ${shopUrl(shop.slug)}&item=${it.id}&src=product` }).catch(() => {})} style={s.mini}><Text style={s.miniText}>Share</Text></Pressable>}
          </View>
          {listing?.id === it.id && (
            <View style={[s.copy, { flexDirection: 'column', alignItems: 'stretch' }]}>
              <Text style={s.tiny}>AI DRAFT · check it before saving</Text>
              <Text style={[s.small, { color: '#0B1220', marginTop: 4 }]}>{listing.description}</Text>
              {listing.features.map(f => <Text key={f} style={s.small}>• {f}</Text>)}
              <View style={[s.row, { gap: 14, marginTop: 8 }]}>
                <Pressable onPress={async () => { try { await callFn('nexora-shop', { action: 'apply_listing', item_id: it.id, description: listing.description, features: listing.features }); flash('Listing saved'); setListing(null); reload(); } catch (e) { flash(errMsg(e)); } }}><Text style={s.link}>Use this</Text></Pressable>
                <Pressable onPress={() => setListing(null)}><Text style={[s.link, { color: '#5C6B7A' }]}>Cancel</Text></Pressable>
              </View>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

function Pay({ shop, callFn, flash, onSaved }: { shop: Shop; callFn: Call; flash: (t: string) => void; onSaved: (s: Shop) => void }) {
  const [f, setF] = useState({
    delivery_fee: String(shop.delivery_fee ?? ''), free_delivery_over: shop.free_delivery_over == null ? '' : String(shop.free_delivery_over), pickup: !!shop.pickup, pickup_info: shop.pickup_info || '',
    pay_link: shop.pay_link || '', bank: shop.bank?.bank || '', account_name: shop.bank?.account_name || '', account_number: shop.bank?.account_number || '',
    pay_on_delivery: !!shop.pay_on_delivery, whatsapp_checkout: shop.whatsapp_checkout !== false, show_promos: shop.show_promos !== false, pay_online: !!shop.pay_online,
  });
  const [ps, setPs] = useState<Paystack | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => { callFn('nexora-shop', { action: 'mine' }).then(r => setPs(r.paystack ?? null)).catch(() => {}); }, [callFn]);
  const save = async () => {
    setBusy('save');
    try {
      const r = await callFn('nexora-shop', { action: 'save', ...shop, delivery_fee: f.delivery_fee, free_delivery_over: f.free_delivery_over === '' ? null : f.free_delivery_over, pickup: f.pickup, pickup_info: f.pickup_info,
        pay_link: f.pay_link, bank: { bank: f.bank, account_name: f.account_name, account_number: f.account_number }, pay_on_delivery: f.pay_on_delivery, whatsapp_checkout: f.whatsapp_checkout, show_promos: f.show_promos, pay_online: f.pay_online });
      onSaved(r.shop); flash('Saved');
    } catch (e) { flash(errMsg(e)); }
    setBusy('');
  };
  const connect = async (secret: string) => {
    setBusy('ps');
    try { const r = await callFn('nexora-shop', { action: 'paystack', secret }); setPs(r.paystack); setKey(''); setF(x => ({ ...x, pay_online: !!secret })); flash(secret ? `Paystack connected (${r.paystack.mode} mode)` : 'Paystack disconnected'); }
    catch (e) { flash(errMsg(e)); }
    setBusy('');
  };
  const sw = (label: string, k: 'pickup' | 'pay_on_delivery' | 'whatsapp_checkout' | 'show_promos' | 'pay_online', sub?: string) => (
    <View style={[s.row, { marginTop: 12 }]}><View style={{ flex: 1 }}><Text style={s.bold}>{label}</Text>{!!sub && <Text style={s.tiny}>{sub}</Text>}</View><Switch value={f[k]} onValueChange={v => setF({ ...f, [k]: v })} trackColor={{ true: '#5381BB', false: '#D5DEE8' }} thumbColor="#FFFFFF" /></View>
  );
  return (
    <View style={{ gap: 10 }}>
      <View style={s.card}>
        <Text style={s.bold}>Delivery</Text>
        <Text style={s.label}>Delivery fee (0 = free or agreed later)</Text>
        <TextInput value={f.delivery_fee} onChangeText={v => setF({ ...f, delivery_fee: v.replace(/[^\d.]/g, '') })} keyboardType="decimal-pad" style={s.input} />
        <Text style={s.label}>Free delivery on orders over (optional)</Text>
        <TextInput value={f.free_delivery_over} onChangeText={v => setF({ ...f, free_delivery_over: v.replace(/[^\d.]/g, '') })} keyboardType="decimal-pad" style={s.input} />
        {sw('Customers can pick up', 'pickup', 'Pickup orders pay no delivery fee')}
        {f.pickup && <TextInput value={f.pickup_info} onChangeText={v => setF({ ...f, pickup_info: v })} placeholder="Pickup address and times" style={[s.input, { marginTop: 8 }]} />}
      </View>
      <View style={s.card}>
        <Text style={s.bold}>Online payment with Paystack</Text>
        <Text style={s.small}>Customers pay by card, bank or USSD into your own Paystack account. Nexora checks each payment with Paystack and marks the order paid.</Text>
        {ps?.connected ? <>
          <Text style={[s.small, { color: '#1E9E6D', marginTop: 8 }]}>Connected · {ps.mode === 'test' ? 'test mode' : 'live'} · key ending {ps.last4}</Text>
          {sw('Offer online payment', 'pay_online')}
          <Pressable onPress={() => connect('')} style={{ marginTop: 8 }}><Text style={[s.link, { color: '#C53030' }]}>Disconnect</Text></Pressable>
        </> : <>
          <Text style={[s.small, { marginTop: 6 }]}>Paystack dashboard › Settings › API Keys & Webhooks › copy your Secret key (sk_live_… or sk_test_…).</Text>
          <TextInput value={key} onChangeText={v => setKey(v.trim())} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder="sk_live_…" style={[s.input, { marginTop: 8 }]} />
          <Pressable disabled={busy === 'ps' || key.length < 20} onPress={() => connect(key)} style={[s.btn, { marginTop: 8 }, key.length < 20 && { opacity: 0.5 }]}>{busy === 'ps' ? <ActivityIndicator color="#FFF" /> : <Text style={s.btnText}>Connect Paystack</Text>}</Pressable>
          <Pressable onPress={() => Linking.openURL('https://dashboard.paystack.com/#/settings/developers')} style={{ marginTop: 8 }}><Text style={s.link}>Open Paystack ›</Text></Pressable>
        </>}
      </View>
      <View style={s.card}>
        <Text style={s.bold}>Other ways to pay</Text>
        <Text style={s.label}>Payment link (https://…)</Text>
        <TextInput value={f.pay_link} onChangeText={v => setF({ ...f, pay_link: v.trim() })} autoCapitalize="none" placeholder="https://paystack.com/pay/your-shop" style={s.input} />
        <Text style={s.label}>Bank transfer</Text>
        <TextInput value={f.bank} onChangeText={v => setF({ ...f, bank: v })} placeholder="Bank" style={s.input} />
        <TextInput value={f.account_name} onChangeText={v => setF({ ...f, account_name: v })} placeholder="Account name" style={[s.input, { marginTop: 6 }]} />
        <TextInput value={f.account_number} onChangeText={v => setF({ ...f, account_number: v.replace(/\D/g, '') })} keyboardType="number-pad" placeholder="Account number" style={[s.input, { marginTop: 6 }]} />
        {sw('Pay on delivery', 'pay_on_delivery')}
        {sw('"Send my order on WhatsApp"', 'whatsapp_checkout', 'Customers send you the order in one tap after ordering')}
        {sw('Show my discount codes', 'show_promos', 'Active codes from Campaigns appear as offers')}
      </View>
      <Pressable disabled={busy === 'save'} onPress={save} style={s.btn}>{busy === 'save' ? <ActivityIndicator color="#FFF" /> : <Text style={s.btnText}>Save delivery and payment</Text>}</Pressable>
    </View>
  );
}

function Report({ callFn }: { callFn: Call }) {
  const [r, setR] = useState<{ funnel: Record<string, number>; shares: number } | null>(null);
  useEffect(() => { callFn('nexora-shop', { action: 'stats', days: 30 }).then(x => setR({ funnel: x.funnel ?? {}, shares: Number(x.totals?.shares ?? 0) })).catch(() => setR({ funnel: {}, shares: 0 })); }, [callFn]);
  if (!r) return <ActivityIndicator color="#1E56A0" />;
  const steps: [string, number][] = [['Visitors', r.funnel.visitors ?? 0], ['Looked at a product', r.funnel.viewed_item ?? 0], ['Added to order', r.funnel.added ?? 0], ['Started checkout', r.funnel.checkout ?? 0], ['Ordered', r.funnel.ordered ?? 0], ['Paid', r.funnel.paid ?? 0]];
  const top = Math.max(1, ...steps.map(x => x[1]));
  return (
    <View style={s.card}>
      <Text style={s.bold}>Shopping funnel · 30 days</Text>
      {steps.map(([l, n]) => (
        <View key={l} style={[s.row, { marginTop: 8, gap: 8 }]}>
          <Text style={[s.small, { width: 128 }]}>{l}</Text>
          <View style={{ flex: 1, height: 14, borderRadius: 6, backgroundColor: '#EEF2F7' }}><View style={{ width: `${Math.max(n ? 3 : 0, (n / top) * 100)}%`, height: 14, borderRadius: 6, backgroundColor: '#1E56A0' }} /></View>
          <Text style={[s.bold, { width: 34, textAlign: 'right' }]}>{n}</Text>
        </View>
      ))}
      <Text style={[s.tiny, { marginTop: 8 }]}>{r.shares} share{r.shares === 1 ? '' : 's'} by visitors.</Text>
    </View>
  );
}

function Domain({ shop, shopUrl, callFn, flash, onSaved }: { shop: Shop; shopUrl: (slug: string) => string; callFn: Call; flash: (t: string) => void; onSaved: (s: Shop) => void }) {
  const [value, setValue] = useState(shop.custom_domain || '');
  const [busy, setBusy] = useState(false);
  const short = shopUrl(shop.slug).replace(/\/\?shop=([^&]+).*$/, '/s/$1');
  const send = async (d: string) => {
    setBusy(true);
    try { const r = await callFn('nexora-shop', { action: 'domain', domain: d }); onSaved({ ...shop, custom_domain: r.domain, domain_status: r.status }); flash(d ? 'Request sent. We will tell you when it is connected.' : 'Web address removed'); }
    catch (e) { flash(errMsg(e)); }
    setBusy(false);
  };
  return (
    <View style={{ gap: 10 }}>
      <View style={s.card}>
        <Text style={s.bold}>Short link</Text>
        <Text selectable style={[s.small, { color: '#1E3A5F', marginTop: 4 }]}>{short}</Text>
        <Pressable onPress={() => Share.share({ message: short }).catch(() => {})} style={{ marginTop: 8 }}><Text style={s.link}>Share ›</Text></Pressable>
      </View>
      <View style={s.card}>
        <Text style={s.bold}>Your own web address (optional)</Text>
        <Text style={s.small}>Use an address you own, like shop.yourbusiness.com. Your Nexora link keeps working too.</Text>
        {shop.custom_domain ? <>
          <Text style={[s.small, { marginTop: 8, color: '#0B1220' }]}>{shop.custom_domain} · {shop.domain_status === 'connected' ? 'Connected' : shop.domain_status === 'failed' ? "Couldn't connect: check the DNS record" : 'Requested'}</Text>
          {shop.domain_status !== 'connected' && <Text style={[s.tiny, { marginTop: 6 }]}>Add a CNAME record named {String(shop.custom_domain).split('.').length > 2 ? String(shop.custom_domain).split('.')[0] : 'www'} pointing to cname.vercel-dns.com where you bought the address. The Nexora team then connects it, usually within one working day.</Text>}
          <Pressable disabled={busy} onPress={() => { setValue(''); send(''); }} style={{ marginTop: 8 }}><Text style={[s.link, { color: '#C53030' }]}>Remove</Text></Pressable>
        </> : <>
          <TextInput value={value} onChangeText={v => setValue(v.trim().toLowerCase())} autoCapitalize="none" placeholder="shop.yourbusiness.com" style={[s.input, { marginTop: 8 }]} />
          <Pressable disabled={busy || value.length < 4} onPress={() => send(value)} style={[s.btn, { marginTop: 8 }, value.length < 4 && { opacity: 0.5 }]}>{busy ? <ActivityIndicator color="#FFF" /> : <Text style={s.btnText}>Request</Text>}</Pressable>
        </>}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  section: { fontSize: 13, fontWeight: '700', color: '#8A97A6', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center' },
  card: { backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: '#E3E8EF', padding: 14 },
  bold: { fontSize: 14, fontWeight: '700', color: '#0B1220' },
  small: { fontSize: 12.5, color: '#5C6B7A', lineHeight: 18 },
  tiny: { fontSize: 11, color: '#8A97A6' },
  label: { marginTop: 10, marginBottom: 4, fontSize: 12, fontWeight: '600', color: '#5C6B7A' },
  link: { fontSize: 13, fontWeight: '700', color: '#1E56A0' },
  input: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: '#D5DEE8', paddingHorizontal: 12, fontSize: 14, color: '#0B1220', backgroundColor: '#FFF' },
  btn: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', height: 46, borderRadius: 999, backgroundColor: '#1E56A0', paddingHorizontal: 16 },
  btnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  copy: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F5F7FA', borderRadius: 10, padding: 10, marginTop: 8 },
  mini: { borderRadius: 999, borderWidth: 1, borderColor: '#D5DEE8', paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#FFF' },
  miniText: { fontSize: 12, fontWeight: '600', color: '#26313D' },
});
