import { supabase } from './supabase';

// Products: price and stock as Nexora reads them everywhere (shop link, orders, Home, the AI), plus the stock history.
// Same rules as the website (nexora-app-web/src/lib/products.ts). A product's stock and its "Remind me at" level are
// fields on the product ({ label: 'Stock', value: '12' }). The database changes stock for orders, cancellations,
// "Add stock" and "Correct count", and records every change in stock_movements.
type Fields = { label: string; value: string }[] | null | undefined;

export const STOCK_LABEL = 'Stock';
export const STOCK_ALERT_LABEL = 'Remind me at';
export const DEFAULT_REMIND_AT = 5;

export type StockLevel = 'out' | 'low' | 'in';
export type StockInfo = { stock: number | null; at: number; level: StockLevel | null; label: string };
export type MovementReason = 'shop_order' | 'manual_order' | 'order_cancelled' | 'order_reopened' | 'received' | 'correction' | 'edit';
export type Movement = { id: string; change: number; balance: number; reason: MovementReason; order_number: string | null; note: string; created_at: string };
export type OrderLine = { id?: string; name: string; qty: number; unit_price: number; total: number };

export const REASON_TEXT: Record<MovementReason, string> = {
  shop_order: 'Shop order', manual_order: 'Order recorded', order_cancelled: 'Order cancelled', order_reopened: 'Order reopened',
  received: 'Stock received', correction: 'Count corrected', edit: 'Changed on the product',
};
/** Badge colours (same as the website's danger / warning / success pills). */
export const LEVEL_COLORS: Record<StockLevel, { bg: string; fg: string }> = {
  out: { bg: '#FDECEC', fg: '#B42318' }, low: { bg: '#FFF4E5', fg: '#B76E00' }, in: { bg: '#E7F6EF', fg: '#1E9E6D' },
};

const wholeNumber = (fields: Fields, label: string) => {
  const v = (fields ?? []).find(f => f.label === label)?.value;
  const m = v ? /-?\d+/.exec(String(v).replace(/,/g, '')) : null;
  return m ? Number(m[0]) : null;
};

/** How much is left and whether it's running low (at or below "Remind me at", default 5). */
export function stockInfo(fields: Fields): StockInfo {
  const stock = wholeNumber(fields, STOCK_LABEL);
  const at = wholeNumber(fields, STOCK_ALERT_LABEL) ?? DEFAULT_REMIND_AT;
  if (stock === null) return { stock, at, level: null, label: '' };
  const level: StockLevel = stock <= 0 ? 'out' : stock <= at ? 'low' : 'in';
  return { stock, at, level, label: level === 'out' ? 'Out of stock' : level === 'low' ? `Only ${stock} left` : `${stock} in stock` };
}
/** The shape the Home screen and reminders use. */
export const stockOf = (fields: Fields) => {
  const s = stockInfo(fields);
  return { stock: s.stock, at: s.at, low: s.level === 'low' || s.level === 'out' };
};

const CCY: Record<string, string> = { '₦': 'NGN', $: 'USD', '€': 'EUR', '£': 'GBP', NGN: 'NGN', USD: 'USD', GHS: 'GHS', KES: 'KES', ZAR: 'ZAR' };
/** A fixed price as a number ("₦25,000" -> 25000 NGN); null for "from ₦5,000", ranges, hourly rates or no price. Same rules as the shop link. */
export function priceOf(fields: Fields, subtitle = ''): { amount: number | null; currency: string } {
  let text = (fields ?? []).find(f => /price|cost|fee|rate/i.test(f.label))?.value?.trim() ?? '';
  if (!text) text = /[$₦€£]\s?[\d,.]+|(NGN|USD|GHS|KES|ZAR)\s?[\d,.]+/.exec(subtitle)?.[0] ?? '';
  const n = /\d+(?:\.\d+)?/.exec(text.replace(/,/g, ''));
  const sym = /[$₦€£]|NGN|USD|GHS|KES|ZAR/.exec(text);
  const amount = n ? Number(n[0]) : null;
  return { amount: amount && amount > 0 && !/from|starting|per hour|\/hr|range|-\s*\d/i.test(text) ? amount : null, currency: sym ? CCY[sym[0]] ?? '' : '' };
}

export async function loadMovements(itemId: string, limit = 20): Promise<Movement[]> {
  const { data, error } = await supabase.from('stock_movements').select('id,change,balance,reason,order_number,note,created_at')
    .eq('item_id', itemId).order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error("Couldn't load the stock history.");
  return (data ?? []) as Movement[];
}

/** "Add stock (received)" adds qty; "Correct count" sets the real count. Returns the new stock. */
export async function adjustStock(itemId: string, mode: 'add' | 'set', qty: number, note = ''): Promise<number> {
  const { data, error } = await supabase.rpc('adjust_stock', { p_item: itemId, p_mode: mode, p_qty: qty, p_note: note.trim().slice(0, 300) });
  if (error) throw new Error(/valid quantity|can't change|not found/i.test(error.message) ? error.message : "Couldn't update the stock. Check your connection and try again.");
  return Number((data as { stock: number }).stock);
}

/** The product's stock as saved now (editing a product keeps it, so an order placed meanwhile isn't overwritten). */
export async function currentStockField(itemId: string): Promise<string> {
  const { data } = await supabase.from('knowledge_items').select('fields').eq('id', itemId).maybeSingle();
  return ((data?.fields ?? []) as { label: string; value: string }[]).find(f => f.label === STOCK_LABEL)?.value ?? '';
}
