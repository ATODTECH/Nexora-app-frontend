import { priceOf, stockInfo } from './products';
import { Platform, Share } from 'react-native';
import { supabase } from './supabase';

// Products and Inventory Management (capability 2.9), the app's copy of the website's lib/inventory.ts (same tables and rules). Builds on the stock tracking every order already uses:
// a product's "Stock" field, the stock history (stock_movements) and the database rules that take and give back stock.
// New here: variants with their own SKU/price/stock, private details (cost, supplier, reorder), returns, write-offs,
// stock counts, restock orders and restock suggestions. Every change goes through the database so it is recorded once.
type Fields = { label: string; value: string }[];

export type Variant = {
  id: string; item_id: string; name: string; sku: string; barcode: string; price: number | null; stock: number;
  remind_at: number | null; image_url: string | null; position: number; active: boolean;
};
export type Details = {
  item_id: string; barcode: string; cost_price: number | null; cost_currency: string; supplier_name: string; supplier_phone: string;
  supplier_email: string; reorder_qty: number | null; lead_days: number | null;
};
export type InvProduct = {
  id: string; name: string; status: string; image_url: string | null; fields: Fields; subtitle: string; shop_hidden: boolean;
  source_detail: string; sku: string; category: string; stock: number | null; remindAt: number; price: { amount: number | null; currency: string };
  variants: Variant[]; details: Details | null;
};
export type MoveReason = 'shop_order' | 'manual_order' | 'website_order' | 'order_cancelled' | 'order_reopened' | 'received' | 'correction' | 'edit'
  | 'returned' | 'return_damaged' | 'write_off' | 'count' | 'restock_received' | 'website_sync';
export type Move = {
  id: string; item_id: string; item_name: string; variant_id: string | null; variant_name: string; change: number; balance: number;
  reason: MoveReason; order_number: string | null; note: string; created_at: string;
};
export type RestockRow = {
  item_id: string; variant_id: string | null; name: string; variant_name: string; stock: number; remind_at: number; sold_30d: number;
  per_day: number; days_left: number | null; suggest: number; supplier_name: string; supplier_phone: string; cost_price: number | null;
  cost_currency: string; level: 'out' | 'low' | 'soon' | 'ok';
};
export type PoLine = { item_id: string; variant_id?: string | null; name: string; qty: number; received: number; cost?: number | null };
export type PurchaseOrder = {
  id: string; number: string; supplier_name: string; supplier_phone: string; status: 'draft' | 'sent' | 'partial' | 'received' | 'cancelled';
  lines: PoLine[]; note: string; currency: string; expected_at: string | null; history: { at: string; text: string }[]; created_at: string;
};
export type OrderForReturn = {
  id: string; order_number: string | null; customer_name: string; status: string; created_at: string;
  line_items: { id?: string; variant_id?: string; name: string; qty: number }[];
};
export type SiteLink = { id: string; name: string; status: string; settings: Record<string, unknown> };

export const REASON: Record<MoveReason, string> = {
  shop_order: 'Shop order', manual_order: 'Order recorded', website_order: 'Website order', order_cancelled: 'Order cancelled', order_reopened: 'Order reopened',
  received: 'Stock received', correction: 'Count corrected', edit: 'Changed on the product', returned: 'Returned to stock', return_damaged: 'Returned damaged',
  write_off: 'Written off', count: 'Stock count', restock_received: 'Restock received', website_sync: 'Updated by your website',
};
export const WRITE_OFF = [
  { k: 'damaged', label: 'Damaged' }, { k: 'lost', label: 'Lost or stolen' }, { k: 'expired', label: 'Expired' }, { k: 'own_use', label: 'Own use or gift' }, { k: 'other', label: 'Other' },
] as const;
export const PO_STATUS: Record<PurchaseOrder['status'], { label: string; pill: string }> = {
  draft: { label: 'Draft', pill: 'bg-surface text-muted' }, sent: { label: 'Sent', pill: 'bg-brand-soft text-brand' },
  partial: { label: 'Partly received', pill: 'bg-warning-soft text-warning-mid' }, received: { label: 'Received', pill: 'bg-success-soft text-success' },
  cancelled: { label: 'Cancelled', pill: 'bg-danger-soft text-danger-strong' },
};

/** A fresh id for one change, so a double tap or a retry records it once. */
export const requestId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const fieldOf = (f: Fields, l: string) => f.find(x => x.label.toLowerCase() === l.toLowerCase())?.value ?? '';
const nice = (e: { message?: string } | null, fallback: string) => {
  const m = e?.message ?? '';
  return /valid quantity|Choose|Only \d|not found|can't|cancelled|tracked|needs approval|Count each|Enter how many|already|expected/i.test(m) ? m.replace(/^.*?ERROR:\s*/, '') : fallback;
};

export async function loadInventory(): Promise<{ products: InvProduct[]; sites: SiteLink[] }> {
  const [p, v, d, w] = await Promise.all([
    supabase.from('knowledge_items').select('id,name,status,image_url,fields,subtitle,shop_hidden,source_detail').eq('category', 'products').order('name').limit(1000),
    supabase.from('product_variants').select('*').order('position').order('created_at').limit(5000),
    supabase.from('product_inventory').select('*').limit(2000),
    supabase.from('website_connections').select('id,name,status,settings').order('created_at'),
  ]);
  if (p.error) throw new Error("Couldn't load your products. Check your connection and try again.");
  const vs = (v.data ?? []) as Variant[];
  const ds = new Map(((d.data ?? []) as Details[]).map(x => [x.item_id, x]));
  const products = ((p.data ?? []) as any[]).map(r => {
    const fields: Fields = Array.isArray(r.fields) ? r.fields : [];
    const s = stockInfo(fields);
    return {
      id: r.id, name: r.name, status: r.status, image_url: r.image_url, fields, subtitle: r.subtitle ?? '', shop_hidden: !!r.shop_hidden, source_detail: r.source_detail ?? '',
      sku: fieldOf(fields, 'SKU'), category: fieldOf(fields, 'Category'), stock: s.stock, remindAt: s.at, price: priceOf(fields, r.subtitle ?? ''),
      variants: vs.filter(x => x.item_id === r.id), details: ds.get(r.id) ?? null,
    } as InvProduct;
  });
  return { products, sites: (w.data ?? []) as SiteLink[] };
}

export async function loadMoves(limit = 400): Promise<Move[]> {
  const { data, error } = await supabase.from('stock_movements').select('id,item_id,item_name,variant_id,variant_name,change,balance,reason,order_number,note,created_at')
    .order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error("Couldn't load the stock history.");
  return (data ?? []) as Move[];
}

export async function loadRestock(): Promise<RestockRow[]> {
  const { data, error } = await supabase.rpc('inv_restock_list');
  if (error) throw new Error("Couldn't work out what to restock.");
  return (data ?? []) as RestockRow[];
}

export async function loadPurchaseOrders(): Promise<PurchaseOrder[]> {
  const { data, error } = await supabase.from('purchase_orders').select('*').order('created_at', { ascending: false }).limit(200);
  if (error) throw new Error("Couldn't load your restock orders.");
  return (data ?? []) as PurchaseOrder[];
}

/** Add stock, correct the count or write some off — for a product, or one of its variants. */
export async function adjust(itemId: string, variantId: string | null, mode: 'add' | 'set' | 'remove', qty: number, reason = '', note = '', req = requestId()) {
  const { data, error } = await supabase.rpc('inv_adjust', { p_item: itemId, p_variant: variantId, p_mode: mode, p_qty: qty, p_reason: reason, p_note: note.trim().slice(0, 300), p_request: req });
  if (error) throw new Error(nice(error, "Couldn't update the stock. Check your connection and try again."));
  return data as { stock: number; product_stock: number };
}

export async function saveDetails(userId: string, itemId: string, d: Partial<Details>) {
  const row = { item_id: itemId, user_id: userId, ...d };
  const { error } = await supabase.from('product_inventory').upsert(row, { onConflict: 'item_id' });
  if (error) throw new Error("Couldn't save the stock details.");
}

/** The product's SKU lives on the product (websites match products by it), so it is written there. */
export async function saveSku(itemId: string, fields: Fields, sku: string) {
  const clean = sku.trim().slice(0, 60);
  const rest = fields.filter(f => f.label.toLowerCase() !== 'sku');
  const { error } = await supabase.from('knowledge_items').update({ fields: clean ? [...rest, { label: 'SKU', value: clean }] : rest }).eq('id', itemId);
  if (error) throw new Error("Couldn't save the SKU.");
}
export async function saveRemindAt(itemId: string, fields: Fields, at: number | null) {
  const rest = fields.filter(f => f.label !== 'Remind me at');
  const { error } = await supabase.from('knowledge_items').update({ fields: at === null ? rest : [...rest, { label: 'Remind me at', value: String(at) }] }).eq('id', itemId);
  if (error) throw new Error("Couldn't save the low-stock level.");
}

export async function addVariant(userId: string, itemId: string, v: { name: string; sku: string; barcode: string; price: number | null; stock: number; remind_at: number | null }, position: number) {
  const { error } = await supabase.from('product_variants').insert({ user_id: userId, item_id: itemId, position, ...v, name: v.name.trim().slice(0, 80), sku: v.sku.trim().slice(0, 60), barcode: v.barcode.trim().slice(0, 60) });
  if (error) throw new Error(error.code === '23505' ? 'Another variant already uses that SKU.' : "Couldn't add the variant.");
}
/** Name, SKU, barcode, price and low-stock level. Stock changes go through adjust(), so they are recorded. */
export async function updateVariant(id: string, v: Partial<Pick<Variant, 'name' | 'sku' | 'barcode' | 'price' | 'remind_at' | 'position'>>) {
  const { error } = await supabase.from('product_variants').update(v).eq('id', id);
  if (error) throw new Error(error.code === '23505' ? 'Another variant already uses that SKU.' : "Couldn't save the variant.");
}
export async function removeVariant(id: string) {
  const { error } = await supabase.from('product_variants').delete().eq('id', id);
  if (error) throw new Error("Couldn't remove the variant.");
}

export async function recordReturn(orderId: string, lines: { item_id: string; variant_id?: string | null; qty: number; restock: boolean }[], note: string, req = requestId()) {
  const { data, error } = await supabase.rpc('inv_return', { p_order: orderId, p_lines: lines, p_note: note.trim().slice(0, 200), p_request: req });
  if (error) throw new Error(nice(error, "Couldn't record the return."));
  return data as { restocked: number; damaged: number; duplicate?: boolean };
}
export async function ordersForReturn(q: string): Promise<OrderForReturn[]> {
  let query = supabase.from('orders').select('id,order_number,customer_name,status,created_at,line_items').neq('status', 'cancelled').order('created_at', { ascending: false }).limit(30);
  const s = q.trim().replace(/[%_,()]/g, '');
  if (s) query = query.or(`order_number.ilike.%${s}%,customer_name.ilike.%${s}%`);
  const { data, error } = await query;
  if (error) throw new Error("Couldn't load orders.");
  return ((data ?? []) as any[]).map(o => ({ ...o, line_items: Array.isArray(o.line_items) ? o.line_items : [] }));
}
export async function returnedSoFar(orderId: string): Promise<Record<string, number>> {
  const { data } = await supabase.from('stock_movements').select('item_id,variant_id,change,reason,note').eq('order_id', orderId).in('reason', ['returned', 'return_damaged']);
  const out: Record<string, number> = {};
  for (const m of (data ?? []) as any[]) {
    const k = `${m.item_id}|${m.variant_id ?? ''}`;
    out[k] = (out[k] ?? 0) + (m.reason === 'returned' ? m.change : Number(/x(\d+)/.exec(m.note)?.[1] ?? 0));
  }
  return out;
}

export async function saveCount(lines: { item_id: string; variant_id?: string | null; counted: number }[], note: string, req = requestId()) {
  const { data, error } = await supabase.rpc('inv_count', { p_lines: lines, p_note: note.trim().slice(0, 200) || 'Stock count', p_request: req });
  if (error) throw new Error(nice(error, "Couldn't save the count."));
  return data as { changed: number; unchanged: number; units: number };
}

export async function createPurchaseOrder(userId: string, po: { supplier_name: string; supplier_phone: string; lines: PoLine[]; note: string; currency: string; expected_at: string | null }) {
  const { data, error } = await supabase.from('purchase_orders').insert({ user_id: userId, ...po, status: 'draft', history: [{ at: new Date().toISOString(), text: 'Created' }] }).select('*').single();
  if (error) throw new Error("Couldn't create the restock order.");
  return data as PurchaseOrder;
}
export async function setPurchaseStatus(po: PurchaseOrder, status: 'sent' | 'cancelled', text: string) {
  const { error } = await supabase.from('purchase_orders').update({ status, history: [...(po.history ?? []), { at: new Date().toISOString(), text }] }).eq('id', po.id);
  if (error) throw new Error("Couldn't update the restock order.");
}
export async function receivePurchase(poId: string, lines: { index: number; qty: number }[], req = requestId()) {
  const { data, error } = await supabase.rpc('inv_po_receive', { p_po: poId, p_lines: lines, p_request: req });
  if (error) throw new Error(nice(error, "Couldn't receive the stock."));
  return data as { units: number; status: string; duplicate?: boolean };
}
export async function deletePurchaseOrder(id: string) {
  const { error } = await supabase.from('purchase_orders').delete().eq('id', id);
  if (error) throw new Error("Couldn't delete the restock order.");
}

/** Send stock changes to a connected website (it needs a callback address, set in the site's settings). */
export async function setStockPush(site: SiteLink, on: boolean) {
  const { error } = await supabase.from('website_connections').update({ settings: { ...site.settings, stock_push: on } }).eq('id', site.id);
  if (error) throw new Error("Couldn't change the website setting.");
}

/** The message to a supplier, ready for WhatsApp. */
export function poText(po: Pick<PurchaseOrder, 'number' | 'lines' | 'note' | 'expected_at'>, business: string) {
  const lines = po.lines.map(l => `• ${l.name} x${l.qty}`).join('\n');
  return `Hello, this is ${business || 'us'}. Please supply the following (${po.number}):\n${lines}${po.expected_at ? `\nNeeded by ${new Date(`${po.expected_at}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}${po.note ? `\n${po.note}` : ''}\nThank you.`;
}
export const waLink = (phone: string, text: string) => {
  const digits = phone.replace(/[^\d]/g, '').replace(/^0/, '234');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
};

/** Products and variants as one flat list of stock "units" (what you count and restock). */
export type Unit = { key: string; item_id: string; variant_id: string | null; name: string; variant: string; sku: string; stock: number | null; remindAt: number; product: InvProduct };
export function unitsOf(products: InvProduct[]): Unit[] {
  const out: Unit[] = [];
  for (const p of products) {
    if (p.variants.some(v => v.active)) for (const v of p.variants.filter(x => x.active)) out.push({ key: `${p.id}|${v.id}`, item_id: p.id, variant_id: v.id, name: p.name, variant: v.name, sku: v.sku, stock: v.stock, remindAt: v.remind_at ?? p.remindAt, product: p });
    else out.push({ key: `${p.id}|`, item_id: p.id, variant_id: null, name: p.name, variant: '', sku: p.sku, stock: p.stock, remindAt: p.remindAt, product: p });
  }
  return out;
}

export function toCsv(rows: (string | number | null)[][]) {
  return rows.map(r => r.map(c => { const s = c === null ? '' : String(c); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\n');
}
/** Save a CSV: a download on the web copy, the share sheet on phones (save to Files, Drive, email or WhatsApp). */
export function download(name: string, text: string) {
  const doc = (globalThis as any).document;
  if (Platform.OS === 'web' && doc) {
    const a = doc.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return;
  }
  Share.share({ message: text, title: name }).catch(() => {});
}
/** A simple CSV reader (quoted fields, commas, new lines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}
