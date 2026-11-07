import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, TextInput } from '../lib/inter';
import { ChoiceChip } from './AutopilotCard';
import { MoreDetails } from './MoreDetails';
import {
  PO_STATUS, REASON, WRITE_OFF, addVariant, adjust, createPurchaseOrder, deletePurchaseOrder, download, loadInventory, loadMoves, loadPurchaseOrders, loadRestock,
  ordersForReturn, poText, receivePurchase, recordReturn, removeVariant, requestId, returnedSoFar, saveCount, saveDetails, saveRemindAt, saveSku,
  setPurchaseStatus, setStockPush, toCsv, unitsOf, updateVariant, waLink,
  type InvProduct, type Move, type OrderForReturn, type PoLine, type PurchaseOrder, type RestockRow, type SiteLink, type Variant,
} from '../lib/inventory';

// Products and Inventory Management (capability 2.9), the app's screen. Same data and rules as the website's /inventory.
const TITLE = 'Products and inventory';
type Tab = 'overview' | 'stock' | 'restock' | 'history' | 'count' | 'returns';
const TABS: { k: Tab; label: string; icon: string }[] = [
  { k: 'overview', label: 'Overview', icon: 'bar-chart-outline' }, { k: 'stock', label: 'Stock', icon: 'cube-outline' }, { k: 'restock', label: 'Restock', icon: 'cart-outline' },
  { k: 'history', label: 'History', icon: 'time-outline' }, { k: 'count', label: 'Stock count', icon: 'clipboard-outline' }, { k: 'returns', label: 'Returns', icon: 'return-down-back-outline' },
];
const SYM: Record<string, string> = { NGN: '₦', USD: '$', EUR: '€', GBP: '£', GHS: 'GH₵', KES: 'KSh ', ZAR: 'R' };
const fmt = (n: number, ccy: string) => `${SYM[ccy] ?? (ccy ? `${ccy} ` : '')}${Math.round(n).toLocaleString('en-US')}`;
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const num = (v: string) => { const n = Number(v.replace(/[^\d.]/g, '')); return v.trim() === '' || !Number.isFinite(n) ? null : n; };
const digits = (v: string) => v.replace(/\D/g, '');
const LEVEL: Record<string, [string, string]> = { out: ['#FDECEC', '#B42318'], low: ['#FDF3E1', '#B7791F'], soon: ['#FDF3E1', '#B7791F'], in: ['#E6F4ED', '#1E9E6D'], none: ['#F2F4F7', '#5C6B7A'] };
const levelOf = (stock: number | null, at: number) => stock === null ? 'none' : stock <= 0 ? 'out' : stock <= at ? 'low' : 'in';
const levelText = (l: string, n: number) => l === 'out' ? 'Out of stock' : l === 'low' ? `Only ${n} left` : l === 'soon' ? 'Runs out soon' : l === 'none' ? 'Not tracked' : `${n} in stock`;
const Pill = ({ l, n, text }: { l: string; n?: number; text?: string }) => (
  <View style={{ backgroundColor: LEVEL[l][0], borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}><Text style={{ color: LEVEL[l][1], fontSize: 11, fontWeight: '700' }}>{text ?? levelText(l, n ?? 0)}</Text></View>
);
const ask = (title: string, text: string, action: string, go: () => void) => Alert.alert(title, text, [{ text: 'Cancel', style: 'cancel' }, { text: action, style: 'destructive', onPress: go }]);
type Props = { userId: string; business: string; currency: string; canManage: boolean; flash: (t: string) => void; onBack: () => void; onProducts: () => void; topInset?: number; wide?: boolean };

export function Inventory({ userId, business, currency: ccy, canManage, flash, onBack, onProducts, topInset = 0, wide = false }: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  const [products, setProducts] = useState<InvProduct[] | null>(null);
  const [sites, setSites] = useState<SiteLink[]>([]);
  const [moves, setMoves] = useState<Move[]>([]);
  const [restock, setRestock] = useState<RestockRow[]>([]);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      const [inv, m, r, p] = await Promise.all([loadInventory(), loadMoves(), loadRestock(), loadPurchaseOrders()]);
      setProducts(inv.products); setSites(inv.sites); setMoves(m); setRestock(r); setPos(p);
    } catch (e) { flash((e as Error).message); setProducts(x => x ?? []); }
  }, [flash]);
  useEffect(() => {
    let live = true;
    Promise.all([loadInventory(), loadMoves(), loadRestock(), loadPurchaseOrders()]).then(([inv, m, r, p]) => {
      if (live) { setProducts(inv.products); setSites(inv.sites); setMoves(m); setRestock(r); setPos(p); }
    }, e => { if (live) { flash((e as Error).message); setProducts([]); } });
    return () => { live = false; };
  }, [flash]);
  const toRestock = restock.filter(r => r.level !== 'ok').length;
  const product = products?.find(p => p.id === open) ?? null;
  return (
    <View style={{ flex: 1, backgroundColor: '#F5F6F8', paddingTop: topInset }}>
      <View style={s.header}>
        <Pressable onPress={onBack} hitSlop={10} accessibilityLabel="Back"><Ionicons name="chevron-back" size={26} color="#0B1220" /></Pressable>
        <Text style={s.title} numberOfLines={1}>{TITLE}</Text>
      </View>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}>
          {TABS.map(t => (
            <Pressable key={t.k} onPress={() => setTab(t.k)} style={[s.tab, tab === t.k && s.tabOn]}>
              <Ionicons name={t.icon as any} size={15} color={tab === t.k ? '#FFF' : '#26313D'} />
              <Text style={[s.tabText, tab === t.k && { color: '#FFF' }]}>{t.label}{t.k === 'restock' && toRestock ? ` (${toRestock})` : ''}</Text>
            </Pressable>))}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={[{ padding: 16, paddingBottom: 80, gap: 12 }, wide && { width: '100%', maxWidth: 1100, alignSelf: 'center' }]} keyboardShouldPersistTaps="handled">
        {products === null ? <ActivityIndicator color="#1E56A0" style={{ marginTop: 40 }} /> : <>
          {tab === 'overview' && <Overview products={products} moves={moves} restock={restock} sites={sites} ccy={ccy} go={setTab} canManage={canManage} flash={flash} onSites={setSites} />}
          {tab === 'stock' && <StockList products={products} openProduct={setOpen} onProducts={onProducts} />}
          {tab === 'restock' && <Restock rows={restock} pos={pos} ccy={ccy} business={business} userId={userId} canManage={canManage} flash={flash} reload={reload} />}
          {tab === 'history' && <History moves={moves} />}
          {tab === 'count' && <Count products={products} canManage={canManage} flash={flash} reload={reload} />}
          {tab === 'returns' && <Returns canManage={canManage} flash={flash} reload={reload} />}
        </>}
      </ScrollView>
      {product && <ProductSheet p={product} userId={userId} ccy={ccy} canManage={canManage} moves={moves.filter(m => m.item_id === product.id)} flash={flash}
        onClose={() => setOpen(null)} reload={reload} onProducts={() => { setOpen(null); onProducts(); }} />}
    </View>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={[s.row, { marginBottom: 6 }]}><Text style={[s.bold, { flex: 1, fontSize: 16 }]} numberOfLines={2}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close"><Ionicons name="close" size={24} color="#5C6B7A" /></Pressable></View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 30 }}>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}
const Btn = ({ label, onPress, soft, busy, disabled, icon }: { label: string; onPress: () => void; soft?: boolean; busy?: boolean; disabled?: boolean; icon?: string }) => (
  <Pressable onPress={onPress} disabled={busy || disabled} style={[s.btn, soft && s.btnSoft, (busy || disabled) && { opacity: 0.5 }]}>
    {busy ? <ActivityIndicator color={soft ? '#1E56A0' : '#FFF'} /> : <>{icon && <Ionicons name={icon as any} size={16} color={soft ? '#1E56A0' : '#FFF'} />}<Text style={[s.btnText, soft && { color: '#1E56A0' }]}>{label}</Text></>}
  </Pressable>
);
const Field = ({ label, value, onChange, numeric, placeholder, editable = true }: { label: string; value: string; onChange: (v: string) => void; numeric?: boolean; placeholder?: string; editable?: boolean }) => (
  <View style={{ flexGrow: 1, flexBasis: '45%' }}>
    <Text style={s.label}>{label}</Text>
    <TextInput value={value} onChangeText={v => onChange(numeric ? digits(v) : v)} keyboardType={numeric ? 'number-pad' : 'default'} placeholder={placeholder} placeholderTextColor="#8A97A6" editable={editable} style={s.input} />
  </View>
);

/* ---------------- overview ---------------- */
function Overview({ products, moves, restock, sites, ccy, go, canManage, flash, onSites }: {
  products: InvProduct[]; moves: Move[]; restock: RestockRow[]; sites: SiteLink[]; ccy: string; go: (t: Tab) => void; canManage: boolean; flash: (t: string) => void; onSites: (s: SiteLink[]) => void;
}) {
  const live = products.filter(p => p.status !== 'Draft');
  const tracked = live.filter(p => p.stock !== null);
  const units = tracked.reduce((n, p) => n + Math.max(0, p.stock ?? 0), 0);
  const withCost = tracked.filter(p => p.details?.cost_price != null);
  const costValue = withCost.reduce((n, p) => n + (!p.details!.cost_currency || p.details!.cost_currency === ccy ? (p.details!.cost_price ?? 0) * Math.max(0, p.stock ?? 0) : 0), 0);
  const out = restock.filter(r => r.level === 'out').length, low = restock.filter(r => r.level === 'low').length, soon = restock.filter(r => r.level === 'soon').length;
  const [now] = useState(() => Date.now());
  const month = moves.filter(m => now - new Date(m.created_at).getTime() < 30 * 86400000);
  const sold = -month.filter(m => ['shop_order', 'manual_order', 'website_order', 'order_reopened', 'order_cancelled'].includes(m.reason)).reduce((n, m) => n + m.change, 0);
  const got = month.filter(m => ['received', 'restock_received', 'returned'].includes(m.reason)).reduce((n, m) => n + m.change, 0);
  const lost = -month.filter(m => m.reason === 'write_off').reduce((n, m) => n + m.change, 0);
  const top = [...restock].filter(r => r.sold_30d > 0).sort((a, b) => b.sold_30d - a.sold_30d).slice(0, 5);
  const Kpi = ({ label, value, note, red }: { label: string; value: string; note: string; red?: boolean }) => (
    <View style={s.kpi}><Text style={s.small}>{label}</Text><Text style={{ fontSize: 22, fontWeight: '900', color: red ? '#B42318' : '#0B1220' }}>{value}</Text><Text style={s.tiny} numberOfLines={1}>{note}</Text></View>
  );
  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Kpi label="Products with a stock count" value={String(tracked.length)} note={`${live.length - tracked.length} without a stock number yet`} />
        <Kpi label="Units in stock" value={units.toLocaleString('en-US')} note={`${live.reduce((n, p) => n + p.variants.filter(v => v.active).length, 0)} variants`} />
        <Kpi label="Need restocking" value={String(out + low)} note={`${out} sold out · ${low} low · ${soon} soon`} red={out + low > 0} />
      </View>
      {out + low + soon > 0 && (
        <Pressable onPress={() => go('restock')} style={[s.card, s.row, { gap: 10 }]}>
          <Ionicons name="alert-circle-outline" size={24} color="#B7791F" />
          <View style={{ flex: 1 }}><Text style={s.bold}>{out + low + soon} item{out + low + soon === 1 ? '' : 's'} to restock</Text>
            <Text style={s.small} numberOfLines={1}>{restock.filter(r => r.level !== 'ok').slice(0, 4).map(r => `${r.name}${r.variant_name ? ` (${r.variant_name})` : ''}`).join(', ')}</Text></View>
          <Text style={s.link}>Restock ›</Text>
        </Pressable>
      )}
      <MoreDetails label="Show stock value, best sellers and where stock is kept the same">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <Kpi label="Stock value at cost" value={withCost.length ? fmt(costValue, ccy) : '—'} note={withCost.length ? `${withCost.length} of ${tracked.length} with a cost` : 'Add cost prices to see it'} />
        </View>
        <View style={s.card}>
          <Text style={s.bold}>Last 30 days</Text>
          <Text style={[s.small, { marginTop: 4 }]}>{sold} sold · {got} received or returned · {lost} written off</Text>
          {top.length > 0 && <Text style={[s.label, { marginTop: 12 }]}>Best sellers</Text>}
          {top.map(r => (
            <View key={`${r.item_id}|${r.variant_id ?? ''}`} style={[s.row, { paddingVertical: 5 }]}>
              <Text style={[s.small, { flex: 1, color: '#0B1220' }]} numberOfLines={1}>{r.name}{r.variant_name ? ` (${r.variant_name})` : ''}</Text>
              <Text style={s.small}>{r.sold_30d} sold · {r.stock} left</Text>
            </View>))}
        </View>
        <View style={s.card}>
          <Text style={s.bold}>Where your stock is kept the same</Text>
          <Text style={[s.small, { marginTop: 6 }]}>AI shop link: customers can’t order more than you have. Orders you add take stock; cancelled orders give it back. You’re alerted if an order takes more than you had.</Text>
          {sites.map(site => {
            const cb = String(site.settings?.callback_url ?? ''), push = site.settings?.stock_push === true, takes = site.settings?.stock_from_orders !== false;
            return (
              <View key={site.id} style={[s.row, { gap: 10, marginTop: 10 }]}>
                <View style={{ flex: 1 }}><Text style={s.bold}>{site.name}</Text>
                  <Text style={s.tiny}>{takes ? 'Its orders take stock here' : 'Its orders don’t change stock'} · {cb ? (push ? 'Nexora sends it stock changes' : 'Send stock changes to it?') : 'Add a callback address in Websites to send stock changes'}</Text></View>
                {canManage && <Switch value={push} disabled={!cb} accessibilityLabel={`Send stock changes to ${site.name}`} onValueChange={async v => {
                  try { await setStockPush(site, v); onSites(sites.map(x => x.id === site.id ? { ...x, settings: { ...x.settings, stock_push: v } } : x)); flash(v ? 'Stock changes will be sent' : 'Stopped sending stock changes'); } catch (e) { flash((e as Error).message); }
                }} />}
              </View>);
          })}
          {!sites.length && <Text style={[s.tiny, { marginTop: 8 }]}>No website connected. Connect one in AI shop link › Websites to keep its stock the same.</Text>}
        </View>
      </MoreDetails>
    </>
  );
}

/* ---------------- stock list ---------------- */
function StockList({ products, openProduct, onProducts }: { products: InvProduct[]; openProduct: (id: string) => void; onProducts: () => void }) {
  const [q, setQ] = useState('');
  const [f, setF] = useState<'all' | 'low' | 'untracked' | 'variants'>('all');
  const shown = products.filter(p => {
    const t = q.trim().toLowerCase();
    const hit = !t || `${p.name} ${p.sku} ${p.category} ${p.details?.barcode ?? ''} ${p.variants.map(v => `${v.name} ${v.sku} ${v.barcode}`).join(' ')}`.toLowerCase().includes(t);
    const l = levelOf(p.stock, p.remindAt);
    return hit && (f === 'all' || (f === 'low' && (l === 'low' || l === 'out' || p.variants.some(v => v.active && v.stock <= (v.remind_at ?? p.remindAt))))
      || (f === 'untracked' && p.stock === null) || (f === 'variants' && p.variants.length > 0));
  });
  const exportCsv = () => {
    const rows: (string | number | null)[][] = [['Product', 'Variant', 'SKU', 'Barcode', 'Stock', 'Low-stock level', 'Price', 'Cost price', 'Supplier', 'Supplier phone', 'Status']];
    for (const p of products) {
      if (p.variants.length) for (const v of p.variants) rows.push([p.name, v.name, v.sku, v.barcode, v.stock, v.remind_at ?? p.remindAt, v.price ?? p.price.amount, p.details?.cost_price ?? null, p.details?.supplier_name ?? '', p.details?.supplier_phone ?? '', p.status]);
      else rows.push([p.name, '', p.sku, p.details?.barcode ?? '', p.stock, p.remindAt, p.price.amount, p.details?.cost_price ?? null, p.details?.supplier_name ?? '', p.details?.supplier_phone ?? '', p.status]);
    }
    download(`stock-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
  };
  return (
    <>
      <TextInput value={q} onChangeText={setQ} placeholder="Search name, SKU or barcode" placeholderTextColor="#8A97A6" style={s.input} accessibilityLabel="Search products" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {([['all', 'All'], ['low', 'Low or out'], ['untracked', 'Not tracked'], ['variants', 'With variants']] as const).map(([k, l]) => <ChoiceChip key={k} on={f === k} label={l} onPress={() => setF(k)} />)}
        <Pressable onPress={exportCsv} style={{ justifyContent: 'center', paddingHorizontal: 6 }}><Text style={s.link}>Export CSV</Text></Pressable>
      </View>
      <View style={[s.card, { padding: 0 }]}>
        {!shown.length && <Text style={[s.small, { padding: 20, textAlign: 'center' }]}>{products.length ? 'Nothing matches.' : 'No products yet. Add them in Products.'}</Text>}
        {shown.map((p, i) => {
          const l = levelOf(p.stock, p.remindAt);
          return (
            <Pressable key={p.id} onPress={() => openProduct(p.id)} style={[s.row, { gap: 10, padding: 12 }, i > 0 && s.divider]}>
              {p.image_url ? <Image source={{ uri: p.image_url }} style={{ width: 44, height: 44, borderRadius: 10 }} /> : <View style={s.thumb}><Ionicons name="cube-outline" size={20} color="#8A97A6" /></View>}
              <View style={{ flex: 1 }}><Text style={s.bold} numberOfLines={1}>{p.name}</Text>
                <Text style={s.tiny} numberOfLines={1}>{[p.sku && `SKU ${p.sku}`, p.variants.length ? `${p.variants.filter(v => v.active).length} variants` : '', p.category].filter(Boolean).join(' · ') || 'No SKU yet'}</Text></View>
              <Pill l={l} n={p.stock ?? 0} />
            </Pressable>);
        })}
      </View>
      <Pressable onPress={onProducts}><Text style={[s.link, { textAlign: 'center' }]}>Add or edit products (names, photos, prices) ›</Text></Pressable>
    </>
  );
}

/* ---------------- one product ---------------- */
function ProductSheet({ p, userId, ccy, canManage, moves, flash, onClose, reload, onProducts }: {
  p: InvProduct; userId: string; ccy: string; canManage: boolean; moves: Move[]; flash: (t: string) => void; onClose: () => void; reload: () => void; onProducts: () => void;
}) {
  const [act, setAct] = useState<null | { mode: 'add' | 'set' | 'remove'; variant: Variant | null }>(null);
  const [d, setD] = useState({
    sku: p.sku, barcode: p.details?.barcode ?? '', cost: p.details?.cost_price?.toString() ?? '', costCcy: p.details?.cost_currency || ccy, supplier: p.details?.supplier_name ?? '',
    phone: p.details?.supplier_phone ?? '', email: p.details?.supplier_email ?? '', reorder: p.details?.reorder_qty?.toString() ?? '', lead: p.details?.lead_days?.toString() ?? '', remind: String(p.remindAt),
  });
  const [nv, setNv] = useState<null | { name: string; sku: string; price: string; stock: string; remind: string }>(null);
  const [ev, setEv] = useState<null | { id: string; name: string; sku: string; barcode: string; price: string; remind: string }>(null);
  const [busy, setBusy] = useState('');
  const vs = p.variants.filter(v => v.active);
  const save = async () => {
    setBusy('save');
    try {
      if (d.sku.trim() !== p.sku) await saveSku(p.id, p.fields, d.sku);
      const rem = num(d.remind);
      if (rem !== p.remindAt) await saveRemindAt(p.id, p.fields.filter(f => f.label.toLowerCase() !== 'sku').concat(d.sku.trim() ? [{ label: 'SKU', value: d.sku.trim() }] : []), rem);
      await saveDetails(userId, p.id, {
        barcode: d.barcode.trim().slice(0, 60), cost_price: num(d.cost), cost_currency: d.costCcy, supplier_name: d.supplier.trim().slice(0, 120), supplier_phone: d.phone.trim().slice(0, 40),
        supplier_email: d.email.trim().slice(0, 120), reorder_qty: num(d.reorder) ? Math.round(num(d.reorder)!) : null, lead_days: num(d.lead) !== null ? Math.min(365, Math.round(num(d.lead)!)) : null,
      });
      flash('Saved'); reload();
    } catch (e) { flash((e as Error).message); }
    setBusy('');
  };
  const l = levelOf(p.stock, p.remindAt);
  return (
    <Sheet title={p.name} onClose={onClose}>
      <View style={[s.row, { gap: 8, flexWrap: 'wrap' }]}>
        <Pill l={l} n={p.stock ?? 0} />
        {p.price.amount !== null && <Text style={s.small}>Price {fmt(p.price.amount, p.price.currency || ccy)}</Text>}
        <Pressable onPress={onProducts} style={{ marginLeft: 'auto' }}><Text style={s.link}>Edit name, photos, price ›</Text></Pressable>
      </View>
      {canManage && !vs.length && (
        <View style={[s.row, { gap: 8, marginTop: 12, flexWrap: 'wrap' }]}>
          <Btn label="Add stock" icon="arrow-up" soft onPress={() => setAct({ mode: 'add', variant: null })} />
          <Btn label="Correct count" soft onPress={() => setAct({ mode: 'set', variant: null })} />
          {p.stock !== null && <Btn label="Write off" soft onPress={() => setAct({ mode: 'remove', variant: null })} />}
        </View>)}

      <Text style={s.section}>Variants</Text>
      {!vs.length && <Text style={s.small}>Sell this in sizes, colours or other options? Add variants: each gets its own SKU, price and stock, customers choose one on your shop, and this product’s stock becomes their total.</Text>}
      {vs.map(v => ev?.id === v.id ? (
        <View key={v.id} style={[s.copy, { flexDirection: 'column', alignItems: 'stretch' }]}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Field label="Name" value={ev.name} onChange={x => setEv({ ...ev, name: x })} />
            <Field label="SKU" value={ev.sku} onChange={x => setEv({ ...ev, sku: x })} />
            <Field label="Barcode" value={ev.barcode} onChange={x => setEv({ ...ev, barcode: x })} />
            <Field label="Price (blank = product price)" value={ev.price} onChange={x => setEv({ ...ev, price: x })} />
            <Field label="Low at" value={ev.remind} onChange={x => setEv({ ...ev, remind: x })} numeric />
          </View>
          <View style={[s.row, { gap: 8, marginTop: 10 }]}>
            <Btn label="Save" onPress={async () => { try { await updateVariant(v.id, { name: ev.name.trim().slice(0, 80) || v.name, sku: ev.sku.trim(), barcode: ev.barcode.trim(), price: num(ev.price), remind_at: num(ev.remind) }); setEv(null); flash('Saved'); reload(); } catch (e) { flash((e as Error).message); } }} />
            <Pressable onPress={() => setEv(null)}><Text style={s.link}>Cancel</Text></Pressable>
          </View>
        </View>
      ) : (
        <View key={v.id} style={[s.row, { gap: 8, paddingVertical: 8, flexWrap: 'wrap' }, s.divider]}>
          <View style={{ flex: 1, minWidth: 140 }}><Text style={s.bold}>{v.name}</Text>
            <Text style={s.tiny}>{[v.sku && `SKU ${v.sku}`, v.price !== null ? fmt(v.price, p.price.currency || ccy) : 'Product price'].filter(Boolean).join(' · ')}</Text></View>
          <Pill l={levelOf(v.stock, v.remind_at ?? p.remindAt)} n={v.stock} />
          {canManage && <>
            <Pressable onPress={() => setAct({ mode: 'add', variant: v })} hitSlop={6}><Text style={s.link}>+ Stock</Text></Pressable>
            <Pressable onPress={() => setAct({ mode: 'set', variant: v })} hitSlop={6}><Text style={s.link}>Correct</Text></Pressable>
            {v.stock > 0 && <Pressable onPress={() => setAct({ mode: 'remove', variant: v })} hitSlop={6}><Text style={s.link}>Write off</Text></Pressable>}
            <Pressable onPress={() => setEv({ id: v.id, name: v.name, sku: v.sku, barcode: v.barcode, price: v.price?.toString() ?? '', remind: v.remind_at?.toString() ?? '' })} hitSlop={6} accessibilityLabel={`Edit ${v.name}`}><Ionicons name="create-outline" size={18} color="#5C6B7A" /></Pressable>
            <Pressable onPress={() => ask(`Remove ${v.name}?`, v.stock > 0 ? `Its ${v.stock} in stock are removed from the total. Orders that already have it keep it.` : 'Orders that already have it keep it.', 'Remove', async () => { try { await removeVariant(v.id); flash('Variant removed'); reload(); } catch (e) { flash((e as Error).message); } })} hitSlop={6} accessibilityLabel={`Remove ${v.name}`}><Ionicons name="trash-outline" size={18} color="#5C6B7A" /></Pressable>
          </>}
        </View>))}
      {canManage && (nv ? (
        <View style={[s.copy, { flexDirection: 'column', alignItems: 'stretch' }]}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Field label="Name, e.g. Black / L" value={nv.name} onChange={x => setNv({ ...nv, name: x })} />
            <Field label="SKU (optional)" value={nv.sku} onChange={x => setNv({ ...nv, sku: x })} />
            <Field label="Price (blank = product price)" value={nv.price} onChange={x => setNv({ ...nv, price: x })} />
            <Field label="Stock now" value={nv.stock} onChange={x => setNv({ ...nv, stock: x })} numeric />
            <Field label={`Low at (default ${p.remindAt})`} value={nv.remind} onChange={x => setNv({ ...nv, remind: x })} numeric />
          </View>
          {!vs.length && (p.stock ?? 0) > 0 && <Text style={[s.tiny, { color: '#B7791F', marginTop: 6 }]}>This product has {p.stock} in stock now. Once it has variants, its stock is the total of their stock, so put those {p.stock} across the variants.</Text>}
          <View style={[s.row, { gap: 8, marginTop: 10 }]}>
            <Btn label="Add variant" busy={busy === 'nv'} disabled={!nv.name.trim()} onPress={async () => {
              setBusy('nv');
              try { await addVariant(userId, p.id, { name: nv.name, sku: nv.sku, barcode: '', price: num(nv.price), stock: Math.round(num(nv.stock) ?? 0), remind_at: num(nv.remind) }, p.variants.length); setNv(null); flash('Variant added'); reload(); }
              catch (e) { flash((e as Error).message); }
              setBusy('');
            }} />
            <Pressable onPress={() => setNv(null)}><Text style={s.link}>Cancel</Text></Pressable>
          </View>
        </View>
      ) : <View style={{ marginTop: 8 }}><Btn label="Add a variant" icon="add" soft onPress={() => setNv({ name: '', sku: '', price: '', stock: '', remind: '' })} /></View>)}

      <Text style={s.section}>Stock details (private)</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Field label={vs.length ? 'SKU (product)' : 'SKU'} value={d.sku} onChange={x => setD({ ...d, sku: x })} editable={canManage} />
        <Field label="Barcode" value={d.barcode} onChange={x => setD({ ...d, barcode: x })} editable={canManage} />
        <Field label={`Cost price (${d.costCcy})`} value={d.cost} onChange={x => setD({ ...d, cost: x })} editable={canManage} />
        <Field label="Remind me at or below" value={d.remind} onChange={x => setD({ ...d, remind: x })} numeric editable={canManage} />
        <Field label="Supplier" value={d.supplier} onChange={x => setD({ ...d, supplier: x })} editable={canManage} />
        <Field label="Supplier WhatsApp or phone" value={d.phone} onChange={x => setD({ ...d, phone: x })} placeholder="+234…" editable={canManage} />
        <Field label="Usual reorder quantity" value={d.reorder} onChange={x => setD({ ...d, reorder: x })} numeric editable={canManage} />
        <Field label="Days to deliver" value={d.lead} onChange={x => setD({ ...d, lead: x })} numeric placeholder="7" editable={canManage} />
      </View>
      <Text style={[s.tiny, { marginTop: 6 }]}>Cost prices and suppliers are never shown on your shop or told to customers.</Text>
      {canManage && <View style={{ marginTop: 10 }}><Btn label="Save details" busy={busy === 'save'} onPress={save} /></View>}

      <Text style={s.section}>Stock history</Text>
      <MoveList moves={moves.slice(0, 25)} compact />
      {act && <AdjustSheet p={p} variant={act.variant} mode={act.mode} flash={flash} onClose={() => setAct(null)} reload={reload} />}
    </Sheet>
  );
}

function AdjustSheet({ p, variant, mode, flash, onClose, reload }: { p: InvProduct; variant: Variant | null; mode: 'add' | 'set' | 'remove'; flash: (t: string) => void; onClose: () => void; reload: () => void }) {
  const [qty, setQty] = useState('');
  const [why, setWhy] = useState<string>('damaged');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [req] = useState(requestId);
  const cur = variant ? variant.stock : p.stock;
  const n = num(qty);
  return (
    <Sheet title={`${mode === 'add' ? 'Add stock' : mode === 'set' ? 'Correct the count' : 'Write off'} · ${p.name}${variant ? ` (${variant.name})` : ''}`} onClose={onClose}>
      <Text style={s.small}>Now: {cur ?? 'not tracked'}. {mode === 'set' ? 'Type how many you really have.' : mode === 'add' ? 'How many arrived?' : 'How many can’t be sold?'}</Text>
      <TextInput autoFocus value={qty} onChangeText={v => setQty(digits(v))} keyboardType="number-pad" style={[s.input, { marginTop: 10 }]} accessibilityLabel="Quantity" />
      {mode === 'remove' && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>{WRITE_OFF.map(w => <ChoiceChip key={w.k} on={why === w.k} label={w.label} onPress={() => setWhy(w.k)} />)}</View>}
      <TextInput value={note} onChangeText={setNote} placeholder={mode === 'add' ? 'Note, e.g. supplier delivery' : 'Reason or note (optional)'} placeholderTextColor="#8A97A6" style={[s.input, { marginTop: 10 }]} />
      {mode === 'set' && n !== null && cur !== null && n !== cur && <Text style={[s.tiny, { marginTop: 6 }]}>{n > cur ? `+${n - cur}` : n - cur} will be recorded as a correction.</Text>}
      <View style={{ marginTop: 14 }}><Btn label="Save" busy={busy} disabled={n === null || (mode !== 'set' && n === 0)} onPress={async () => {
        setBusy(true);
        try { await adjust(p.id, variant?.id ?? null, mode, Math.round(n ?? 0), mode === 'remove' ? why : '', note, req); flash(mode === 'add' ? 'Stock added' : mode === 'set' ? 'Count corrected' : 'Written off'); onClose(); reload(); }
        catch (e) { flash((e as Error).message); }
        setBusy(false);
      }} /></View>
    </Sheet>
  );
}

/* ---------------- restock ---------------- */
function Restock({ rows, pos, ccy, business, userId, canManage, flash, reload }: {
  rows: RestockRow[]; pos: PurchaseOrder[]; ccy: string; business: string; userId: string; canManage: boolean; flash: (t: string) => void; reload: () => void;
}) {
  const need = rows.filter(r => r.level !== 'ok');
  const key = (r: RestockRow) => `${r.item_id}|${r.variant_id ?? ''}`;
  const [pick, setPick] = useState<Record<string, number>>(() => Object.fromEntries(need.map(r => [key(r), Math.max(1, r.suggest)])));
  const [sel, setSel] = useState<Set<string>>(() => new Set(need.map(key)));
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openPo, setOpenPo] = useState<PurchaseOrder | null>(null);
  const list = all ? rows : need;
  const create = async () => {
    const chosen = rows.filter(r => sel.has(key(r)) && (pick[key(r)] ?? 0) > 0);
    if (!chosen.length) { flash('Tick at least one item.'); return; }
    setBusy(true);
    try {
      const groups = new Map<string, RestockRow[]>();
      for (const r of chosen) { const k = `${r.supplier_name}|${r.supplier_phone}`; groups.set(k, [...(groups.get(k) ?? []), r]); }
      for (const [k, g] of groups) {
        const [supplier_name, supplier_phone] = k.split('|');
        const lines: PoLine[] = g.map(r => ({ item_id: r.item_id, variant_id: r.variant_id, name: `${r.name}${r.variant_name ? ` (${r.variant_name})` : ''}`, qty: pick[key(r)], received: 0, cost: r.cost_price }));
        await createPurchaseOrder(userId, { supplier_name, supplier_phone, lines, note: '', currency: g[0].cost_currency || ccy, expected_at: null });
      }
      flash(groups.size === 1 ? 'Restock order created' : `${groups.size} restock orders created, one per supplier`); reload();
    } catch (e) { flash((e as Error).message); }
    setBusy(false);
  };
  return (
    <>
      <View style={s.card}>
        <View style={s.row}><Text style={[s.bold, { flex: 1 }]}>{need.length ? `${need.length} item${need.length === 1 ? '' : 's'} to restock` : 'Nothing needs restocking right now'}</Text>
          <Text style={s.tiny}>Show all </Text><Switch value={all} onValueChange={setAll} accessibilityLabel="Show all products" /></View>
        <Text style={[s.small, { marginTop: 4 }]}>Suggestions use your sales of the last 30 days, the supplier’s delivery time (7 days if not set) and two weeks of cover. Nexora also reminds you every morning.</Text>
        {list.map(r => {
          const k = key(r), on = sel.has(k);
          return (
            <View key={k} style={[s.row, { gap: 8, paddingVertical: 8 }, s.divider]}>
              {canManage && <Pressable onPress={() => { const n = new Set(sel); if (on) n.delete(k); else n.add(k); setSel(n); }} hitSlop={6} accessibilityLabel={`Restock ${r.name}`}>
                <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color="#1E56A0" /></Pressable>}
              <View style={{ flex: 1 }}><Text style={s.bold} numberOfLines={1}>{r.name}{r.variant_name ? ` (${r.variant_name})` : ''}</Text>
                <Text style={s.tiny}>{r.stock} left · sold {r.sold_30d} in 30 days{r.days_left !== null ? ` · about ${r.days_left} days left` : ''}{r.supplier_name ? ` · ${r.supplier_name}` : ''}</Text></View>
              {r.level !== 'ok' && <Pill l={r.level} text={r.level === 'out' ? 'Sold out' : r.level === 'low' ? 'Low' : 'Soon'} />}
              {canManage && <TextInput value={String(pick[k] ?? '')} onChangeText={v => setPick({ ...pick, [k]: Number(digits(v)) || 0 })} keyboardType="number-pad" style={[s.input, { width: 64, textAlign: 'center', minHeight: 38 }]} accessibilityLabel={`Quantity of ${r.name}`} />}
            </View>);
        })}
        {canManage && list.length > 0 && <View style={{ marginTop: 10 }}><Btn label="Create restock order" busy={busy} onPress={create} /></View>}
      </View>
      <View style={s.card}>
        <Text style={s.bold}>Restock orders</Text>
        {pos.map(po => (
          <Pressable key={po.id} onPress={() => setOpenPo(po)} style={[s.row, { gap: 8, paddingVertical: 9 }, s.divider]}>
            <View style={{ flex: 1 }}><Text style={s.bold}>{po.number} <Text style={s.small}>· {po.supplier_name || 'No supplier'}</Text></Text>
              <Text style={s.tiny} numberOfLines={1}>{po.lines.map(l => `${l.name} ${l.received}/${l.qty}`).join(', ')}</Text></View>
            <Text style={[s.tiny, { fontWeight: '700' }]}>{PO_STATUS[po.status].label}</Text>
          </Pressable>))}
        {!pos.length && <Text style={[s.small, { marginTop: 6 }]}>No restock orders yet. Tick items above and create one; send it to your supplier on WhatsApp, then receive the stock when it arrives.</Text>}
      </View>
      {openPo && <PoSheet po={openPo} business={business} canManage={canManage} flash={flash} onClose={() => setOpenPo(null)} reload={() => { setOpenPo(null); reload(); }} />}
    </>
  );
}

function PoSheet({ po, business, canManage, flash, onClose, reload }: { po: PurchaseOrder; business: string; canManage: boolean; flash: (t: string) => void; onClose: () => void; reload: () => void }) {
  const [got, setGot] = useState<Record<number, string>>(() => Object.fromEntries(po.lines.map((l, i) => [i, String(Math.max(0, l.qty - l.received))])));
  const [busy, setBusy] = useState(false);
  const [req] = useState(requestId);
  const open = po.status !== 'received' && po.status !== 'cancelled';
  const text = poText(po, business);
  return (
    <Sheet title={`${po.number} · ${po.supplier_name || 'Restock order'}`} onClose={onClose}>
      <Text style={s.small}>{PO_STATUS[po.status].label} · created {when(po.created_at)}</Text>
      {po.lines.map((l, i) => (
        <View key={i} style={[s.row, { gap: 8, paddingVertical: 8 }, s.divider]}>
          <Text style={[s.small, { flex: 1, color: '#0B1220' }]} numberOfLines={2}>{l.name}</Text><Text style={s.tiny}>{l.received}/{l.qty} received</Text>
          {open && canManage && l.received < l.qty && <TextInput value={got[i] ?? ''} onChangeText={v => setGot({ ...got, [i]: digits(v) })} keyboardType="number-pad" style={[s.input, { width: 64, textAlign: 'center', minHeight: 38 }]} accessibilityLabel={`Arrived of ${l.name}`} />}
        </View>))}
      {open && canManage && (
        <View style={{ gap: 8, marginTop: 12 }}>
          <Btn label="Receive stock" icon="checkmark-circle" busy={busy} onPress={async () => {
            setBusy(true);
            try { const r = await receivePurchase(po.id, po.lines.map((_, i) => ({ index: i, qty: Number(got[i] || 0) })).filter(x => x.qty > 0), req); flash(r.duplicate ? 'Already received' : `Received ${r.units}. Stock updated.`); reload(); }
            catch (e) { flash((e as Error).message); }
            setBusy(false);
          }} />
          {!!po.supplier_phone && <Btn label="Send on WhatsApp" icon="logo-whatsapp" soft onPress={() => { Linking.openURL(waLink(po.supplier_phone, text)).catch(() => flash('Couldn’t open WhatsApp')); if (po.status === 'draft') setPurchaseStatus(po, 'sent', 'Sent on WhatsApp').catch(() => {}); }} />}
          {po.status === 'draft'
            ? <Pressable onPress={() => ask(`Delete ${po.number}?`, 'This restock order will be removed.', 'Delete', async () => { try { await deletePurchaseOrder(po.id); flash('Deleted'); reload(); } catch (e) { flash((e as Error).message); } })}><Text style={[s.link, { color: '#B42318', textAlign: 'center' }]}>Delete</Text></Pressable>
            : <Pressable onPress={() => ask(`Cancel ${po.number}?`, 'Stock already received stays.', 'Cancel order', async () => { try { await setPurchaseStatus(po, 'cancelled', 'Cancelled'); flash('Cancelled'); reload(); } catch (e) { flash((e as Error).message); } })}><Text style={[s.link, { color: '#B42318', textAlign: 'center' }]}>Cancel order</Text></Pressable>}
        </View>)}
      <Text style={s.section}>History</Text>
      {po.history.map((h, i) => <Text key={i} style={s.tiny}>{when(h.at)} · {h.text}</Text>)}
    </Sheet>
  );
}

/* ---------------- history ---------------- */
function History({ moves }: { moves: Move[] }) {
  const [q, setQ] = useState('');
  const [r, setR] = useState<'all' | 'sales' | 'in' | 'out' | 'fixes'>('all');
  const groups: Record<string, string[]> = { sales: ['shop_order', 'manual_order', 'website_order', 'order_cancelled', 'order_reopened'], in: ['received', 'restock_received', 'returned'], out: ['write_off', 'return_damaged'], fixes: ['correction', 'count', 'edit', 'website_sync'] };
  const shown = moves.filter(m => (r === 'all' || groups[r].includes(m.reason)) && (!q.trim() || `${m.item_name} ${m.variant_name} ${m.order_number ?? ''} ${m.note}`.toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <>
      <TextInput value={q} onChangeText={setQ} placeholder="Search product, order number or note" placeholderTextColor="#8A97A6" style={s.input} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {([['all', 'All'], ['sales', 'Orders'], ['in', 'Received and returns'], ['out', 'Write-offs'], ['fixes', 'Counts and corrections']] as const).map(([k, l]) => <ChoiceChip key={k} on={r === k} label={l} onPress={() => setR(k)} />)}
        <Pressable onPress={() => download(`stock-history-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([['When', 'Product', 'Variant', 'Change', 'Balance', 'Why', 'Order', 'Note'], ...shown.map(m => [m.created_at, m.item_name, m.variant_name, m.change, m.balance, REASON[m.reason] ?? m.reason, m.order_number ?? '', m.note])]))} style={{ justifyContent: 'center', paddingHorizontal: 6 }}><Text style={s.link}>Export CSV</Text></Pressable>
      </View>
      <View style={s.card}><MoveList moves={shown.slice(0, 200)} /></View>
    </>
  );
}
function MoveList({ moves, compact }: { moves: Move[]; compact?: boolean }) {
  if (!moves.length) return <Text style={[s.small, { textAlign: 'center', padding: 10 }]}>No stock changes yet.</Text>;
  return <>{moves.map((m, i) => (
    <View key={m.id} style={[s.row, { gap: 10, paddingVertical: 7 }, i > 0 && s.divider]}>
      <Text style={{ width: 44, textAlign: 'right', fontWeight: '800', color: m.change > 0 ? '#1E9E6D' : m.change < 0 ? '#B42318' : '#5C6B7A' }}>{m.change > 0 ? `+${m.change}` : m.change}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[s.small, { color: '#0B1220' }]} numberOfLines={1}>{compact ? '' : `${m.item_name}${m.variant_name ? ` (${m.variant_name})` : ''} · `}{REASON[m.reason] ?? m.reason}{m.order_number ? ` · ${m.order_number}` : ''}</Text>
        <Text style={s.tiny} numberOfLines={1}>{when(m.created_at)}{m.note ? ` · ${m.note}` : ''}</Text>
      </View>
      <Text style={s.tiny}>{m.balance} left</Text>
    </View>))}</>;
}

/* ---------------- stock count ---------------- */
function Count({ products, canManage, flash, reload }: { products: InvProduct[]; canManage: boolean; flash: (t: string) => void; reload: () => void }) {
  const units = useMemo(() => unitsOf(products.filter(p => p.status !== 'Draft')), [products]);
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [req, setReq] = useState(requestId);
  if (!canManage) return <Text style={[s.card, s.small]}>Only people who can manage products can do stock counts.</Text>;
  const entered = units.filter(u => counted[u.key] !== undefined && counted[u.key] !== '');
  const diffs = entered.filter(u => Number(counted[u.key]) !== (u.stock ?? -1));
  const shown = units.filter(u => !q.trim() || `${u.name} ${u.variant} ${u.sku}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <Text style={s.small}>Count what is really on your shelves and type it in. Only the products you fill in are checked, and only the differences are corrected, all recorded as a stock count.</Text>
      <TextInput value={q} onChangeText={setQ} placeholder="Find a product, variant or SKU" placeholderTextColor="#8A97A6" style={s.input} />
      <View style={s.card}>
        {shown.map((u, i) => {
          const v = counted[u.key], diff = v !== undefined && v !== '' && u.stock !== null ? Number(v) - u.stock : null;
          return (
            <View key={u.key} style={[s.row, { gap: 8, paddingVertical: 7 }, i > 0 && s.divider]}>
              <View style={{ flex: 1 }}><Text style={s.bold} numberOfLines={1}>{u.name}{u.variant ? ` (${u.variant})` : ''}</Text><Text style={s.tiny}>{u.sku ? `SKU ${u.sku} · ` : ''}Nexora says {u.stock ?? 'not tracked'}</Text></View>
              {diff !== null && <Text style={{ fontWeight: '800', color: diff > 0 ? '#1E9E6D' : diff < 0 ? '#B42318' : '#1E9E6D' }}>{diff === 0 ? '✓' : diff > 0 ? `+${diff}` : diff}</Text>}
              <TextInput value={v ?? ''} onChangeText={x => setCounted({ ...counted, [u.key]: digits(x) })} keyboardType="number-pad" placeholder="Counted" placeholderTextColor="#8A97A6" style={[s.input, { width: 82, textAlign: 'center', minHeight: 38 }]} accessibilityLabel={`Counted ${u.name} ${u.variant}`} />
            </View>);
        })}
      </View>
      <View style={[s.card, s.row, { gap: 10 }]}>
        <Text style={[s.small, { flex: 1 }]}>{entered.length} counted · {diffs.length} different</Text>
        <Btn label="Save count" busy={busy} disabled={!entered.length} onPress={async () => {
          setBusy(true);
          try {
            const r = await saveCount(entered.map(u => ({ item_id: u.item_id, variant_id: u.variant_id, counted: Number(counted[u.key]) })), 'Stock count', req);
            flash(r.changed ? `Count saved: ${r.changed} corrected (${r.units} units), ${r.unchanged} already right` : 'Everything matched'); setCounted({}); setReq(requestId()); reload();
          } catch (e) { flash((e as Error).message); }
          setBusy(false);
        }} />
      </View>
    </>
  );
}

/* ---------------- returns ---------------- */
function Returns({ canManage, flash, reload }: { canManage: boolean; flash: (t: string) => void; reload: () => void }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState<OrderForReturn[] | null>(null);
  const [o, setO] = useState<OrderForReturn | null>(null);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => { ordersForReturn(q).then(r => { if (live) setList(r); }, () => { if (live) setList([]); }); }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [q]);
  if (!canManage) return <Text style={[s.card, s.small]}>Only people who can manage products can record returns.</Text>;
  const withItems = (list ?? []).filter(x => x.line_items.some(l => l.id));
  return (
    <>
      <Text style={s.small}>A customer brought something back? Find the order, choose what came back and whether it can be sold again. Nexora never lets you return more than the order had.</Text>
      <TextInput value={q} onChangeText={setQ} placeholder="Order number or customer name" placeholderTextColor="#8A97A6" style={s.input} />
      <View style={s.card}>
        {list === null ? <ActivityIndicator color="#1E56A0" /> : withItems.map((x, i) => (
          <Pressable key={x.id} onPress={() => setO(x)} style={[{ paddingVertical: 8 }, i > 0 && s.divider]}>
            <Text style={s.bold}>{x.order_number || 'Order'} <Text style={s.small}>· {x.customer_name}</Text></Text>
            <Text style={s.tiny} numberOfLines={1}>{x.line_items.map(l => `${l.name} x${l.qty}`).join(', ')} · {when(x.created_at)}</Text>
          </Pressable>))}
        {list && !withItems.length && <Text style={[s.small, { textAlign: 'center' }]}>No matching orders with products.</Text>}
      </View>
      {o && <ReturnSheet o={o} flash={flash} onClose={() => setO(null)} reload={reload} />}
    </>
  );
}
function ReturnSheet({ o, flash, onClose, reload }: { o: OrderForReturn; flash: (t: string) => void; onClose: () => void; reload: () => void }) {
  const lines = o.line_items.filter(l => l.id);
  const [done, setDone] = useState<Record<string, number> | null>(null);
  const [qty, setQty] = useState<Record<number, string>>({});
  const [back, setBack] = useState<Record<number, boolean>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [req] = useState(requestId);
  useEffect(() => { let live = true; returnedSoFar(o.id).then(r => { if (live) setDone(r); }, () => { if (live) setDone({}); }); return () => { live = false; }; }, [o.id]);
  return (
    <Sheet title={`Return on ${o.order_number || 'this order'}`} onClose={onClose}>
      {!done ? <ActivityIndicator color="#1E56A0" /> : <>
        {lines.map((l, i) => {
          const left = l.qty - (done[`${l.id}|${l.variant_id ?? ''}`] ?? 0);
          return (
            <View key={i} style={[{ paddingVertical: 8, gap: 6 }, i > 0 && s.divider]}>
              <View style={[s.row, { gap: 8 }]}>
                <View style={{ flex: 1 }}><Text style={s.bold}>{l.name}</Text><Text style={s.tiny}>Bought {l.qty}{left < l.qty ? ` · ${l.qty - left} already returned` : ''}</Text></View>
                <TextInput value={qty[i] ?? ''} onChangeText={v => setQty({ ...qty, [i]: digits(v) })} editable={left > 0} keyboardType="number-pad" placeholder={`0–${Math.max(0, left)}`} placeholderTextColor="#8A97A6" style={[s.input, { width: 72, textAlign: 'center', minHeight: 38 }]} accessibilityLabel={`Returned ${l.name}`} />
              </View>
              <View style={[s.row, { gap: 8 }]}><Switch value={back[i] !== false} onValueChange={v => setBack({ ...back, [i]: v })} accessibilityLabel={`${l.name} can be sold again`} /><Text style={s.tiny}>Back to stock (turn off for damaged items)</Text></View>
            </View>);
        })}
        <TextInput value={note} onChangeText={setNote} placeholder="Reason, e.g. wrong size, faulty" placeholderTextColor="#8A97A6" style={[s.input, { marginTop: 10 }]} />
        <Text style={[s.tiny, { marginTop: 6 }]}>Damaged items are recorded but not added to stock. Refunds are recorded on the order in Orders.</Text>
        <View style={{ marginTop: 12 }}><Btn label="Record return" busy={busy} disabled={!lines.some((_, i) => Number(qty[i] || 0) > 0)} onPress={async () => {
          setBusy(true);
          try {
            const r = await recordReturn(o.id, lines.map((l, i) => ({ item_id: l.id!, variant_id: l.variant_id ?? null, qty: Number(qty[i] || 0), restock: back[i] !== false })).filter(x => x.qty > 0), note, req);
            flash(r.duplicate ? 'Already recorded' : `Return recorded: ${r.restocked} back to stock${r.damaged ? `, ${r.damaged} damaged` : ''}`); onClose(); reload();
          } catch (e) { flash((e as Error).message); }
          setBusy(false);
        }} /></View>
      </>}
    </Sheet>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E3E8EF' },
  title: { flex: 1, fontSize: 17, fontWeight: '800', color: '#0B1220' },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 14, borderRadius: 999, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E3E8EF' },
  tabOn: { backgroundColor: '#0B2545', borderColor: '#0B2545' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#26313D' },
  row: { flexDirection: 'row', alignItems: 'center' },
  divider: { borderTopWidth: 1, borderTopColor: '#EEF1F5' },
  card: { backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: '#E3E8EF', padding: 14 },
  kpi: { flexGrow: 1, flexBasis: '45%', backgroundColor: '#FFF', borderRadius: 14, borderWidth: 1, borderColor: '#E3E8EF', padding: 12 },
  thumb: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#F2F4F7', alignItems: 'center', justifyContent: 'center' },
  bold: { fontSize: 14, fontWeight: '700', color: '#0B1220' },
  small: { fontSize: 12.5, color: '#5C6B7A', lineHeight: 18 },
  tiny: { fontSize: 11, color: '#8A97A6' },
  section: { marginTop: 18, marginBottom: 6, fontSize: 13, fontWeight: '800', color: '#0B1220' },
  label: { marginTop: 8, marginBottom: 4, fontSize: 12, fontWeight: '600', color: '#5C6B7A' },
  link: { fontSize: 13, fontWeight: '700', color: '#1E56A0' },
  input: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: '#D5DEE8', paddingHorizontal: 12, fontSize: 14, color: '#0B1220', backgroundColor: '#FFF' },
  btn: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', height: 44, borderRadius: 999, backgroundColor: '#1E56A0', paddingHorizontal: 16 },
  btnSoft: { backgroundColor: '#EEF4FC' },
  btnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  copy: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F5F7FA', borderRadius: 12, padding: 10, marginTop: 8 },
  backdrop: { flex: 1, backgroundColor: 'rgba(11,18,32,0.45)', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { width: '100%', maxWidth: 720, maxHeight: '92%', backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18 },
});
