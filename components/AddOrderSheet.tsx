import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, TextInput } from '../lib/inter';
import { LEVEL_COLORS, priceOf, stockInfo, type OrderLine } from '../lib/products';

// "Add an order yourself": a walk-in, phone or chat sale. Products picked from the list take their stock
// (the database does it when the order is saved); anything else can be typed in. Same as the website's AddOrderSheet.
export type ManualOrder = { name: string; phone: string; lines: OrderLine[]; other: string; total: number; currency: string; paid: boolean };
type Product = { id: string; name: string; subtitle: string; status: string; fields: { label: string; value: string }[] };
type Props = { products: Product[]; defaultCurrency: string; onClose: () => void; onSave: (o: ManualOrder) => Promise<void> };
const amount = (v: string) => Number(v.replace(/[^\d.]/g, '')) || 0;

export function AddOrderSheet({ products: all, defaultCurrency, onClose, onSave }: Props) {
  // Drafts aren't for sale (same as the shop link).
  const products = useMemo(() => all.filter(p => p.status !== 'Draft').map(p => ({ id: p.id, name: p.name, ...priceOf(p.fields, p.subtitle), stock: stockInfo(p.fields) })), [all]);
  const [f, setF] = useState({ name: '', phone: '', other: '', total: '', paid: false });
  const [qty, setQty] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const picked = products.filter(p => qty[p.id] > 0);
  const lines: OrderLine[] = picked.map(p => ({ id: p.id, name: p.name, qty: qty[p.id], unit_price: p.amount ?? 0, total: Math.round((p.amount ?? 0) * qty[p.id] * 100) / 100 }));
  const currency = picked.find(p => p.currency)?.currency || defaultCurrency;
  const linesTotal = lines.reduce((n, l) => n + l.total, 0);
  // The total follows the picked products until the owner types their own (e.g. a discount or extra items).
  const total = f.total.trim() ? amount(f.total) : linesTotal;
  const mixed = new Set(picked.map(p => p.currency).filter(Boolean)).size > 1;
  const setLine = (id: string, n: number) => setQty(q => ({ ...q, [id]: Math.max(0, Math.min(n, 9999)) }));

  const save = async () => {
    if (f.name.trim().length < 2) { setErr('Add the customer’s name.'); return; }
    if (!lines.length && !f.other.trim()) { setErr('Pick what they bought, or type it under “Something else”.'); return; }
    if (mixed) { setErr('These products have different currencies. Record them as separate orders.'); return; }
    if (!(total > 0)) { setErr('Enter the total.'); return; }
    setBusy(true); setErr('');
    try { await onSave({ name: f.name, phone: f.phone, lines, other: f.other, total, currency, paid: f.paid }); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  return (
    <View style={s.sheet}>
      <View style={s.row}>
        <Text style={s.title}>Add an order</Text>
        <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close"><Ionicons name="close" size={22} color="#5C6B7A" /></Pressable>
      </View>
      <ScrollView style={{ maxHeight: 560 }} keyboardShouldPersistTaps="handled">
        <Text style={[s.label, { marginTop: 12 }]}>Customer</Text>
        <TextInput value={f.name} onChangeText={v => setF({ ...f, name: v })} placeholder="e.g. John Doe" placeholderTextColor="#A5AFBB" style={s.input} maxLength={120} />
        <Text style={s.label}>Phone (optional)</Text>
        <TextInput value={f.phone} onChangeText={v => setF({ ...f, phone: v })} placeholder="+234 801 234 5678" placeholderTextColor="#A5AFBB" keyboardType="phone-pad" style={s.input} maxLength={40} />

        <Text style={s.label}>What they bought</Text>
        {!products.length
          ? <Text style={s.hint}>No products yet. Add them in Train AI to pick them here, or type below.</Text>
          : (
            <View style={s.list}>
              {products.map(p => {
                const n = qty[p.id] || 0;
                const over = p.stock.stock !== null && n > p.stock.stock;
                return (
                  <View key={p.id} style={s.item}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.itemName} numberOfLines={1}>{p.name}</Text>
                      <View style={[s.row, { gap: 6, marginTop: 2 }]}>
                        <Text style={s.hint}>{p.amount !== null ? p.amount.toLocaleString() : 'No fixed price'}</Text>
                        {p.stock.level && <View style={[s.pill, { backgroundColor: LEVEL_COLORS[p.stock.level].bg }]}><Text style={[s.pillText, { color: LEVEL_COLORS[p.stock.level].fg }]}>{p.stock.label}</Text></View>}
                      </View>
                      {over && <Text style={[s.hint, { color: '#B76E00' }]}>More than you have: stock will go to 0. Correct the count later if needed.</Text>}
                    </View>
                    {n === 0
                      ? <Pressable onPress={() => setLine(p.id, 1)} accessibilityLabel={`Add ${p.name}`} style={[s.round, { backgroundColor: '#EAF1FB' }]}><Ionicons name="add" size={18} color="#1E56A0" /></Pressable>
                      : <View style={[s.row, { gap: 8 }]}>
                        <Pressable onPress={() => setLine(p.id, n - 1)} accessibilityLabel="One less" style={s.round}><Ionicons name="remove" size={18} color="#0B1220" /></Pressable>
                        <Text style={s.qty}>{n}</Text>
                        <Pressable onPress={() => setLine(p.id, n + 1)} accessibilityLabel="One more" style={s.round}><Ionicons name="add" size={18} color="#0B1220" /></Pressable>
                      </View>}
                  </View>
                );
              })}
            </View>
          )}
        <Text style={s.label}>Something else (optional)</Text>
        <TextInput value={f.other} onChangeText={v => setF({ ...f, other: v })} placeholder="e.g. Gift wrapping" placeholderTextColor="#A5AFBB" style={s.input} maxLength={300} />
        <Text style={s.label}>Total</Text>
        <TextInput value={f.total} onChangeText={v => setF({ ...f, total: v })} placeholder={linesTotal ? linesTotal.toLocaleString() : '0'} placeholderTextColor="#A5AFBB" keyboardType="decimal-pad" style={s.input} maxLength={14} />
        {!!linesTotal && !f.total.trim() && <Text style={s.hint}>Worked out from the products. Type a different total if you gave a discount or added something.</Text>}
        <View style={[s.row, { marginTop: 12 }]}>
          <Text style={[s.itemName, { flex: 1, fontSize: 14 }]}>Already paid</Text>
          <Switch value={f.paid} onValueChange={v => setF({ ...f, paid: v })} trackColor={{ true: '#5381BB', false: '#D5DEE8' }} thumbColor="#FFFFFF" />
        </View>
      </ScrollView>
      {!!err && <Text style={s.error} accessibilityRole="alert">{err}</Text>}
      <Pressable disabled={busy} onPress={() => { save().catch(() => {}); }} style={[s.save, busy && { opacity: 0.6 }]}>
        {busy ? <ActivityIndicator color="#FFF" /> : <Text style={s.saveText}>Save order</Text>}
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  sheet: { width: '100%', maxWidth: 520, alignSelf: 'center', backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20 },
  row: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1, fontSize: 18, fontWeight: '700', color: '#0B1220' },
  label: { marginTop: 10, fontSize: 13, fontWeight: '600', color: '#334155' },
  input: { marginTop: 6, height: 44, borderRadius: 12, borderWidth: 1, borderColor: '#E1E5EA', paddingHorizontal: 12, fontSize: 14, color: '#0B1220' },
  hint: { marginTop: 4, fontSize: 12, color: '#5C6B7A' },
  list: { marginTop: 6, borderWidth: 1, borderColor: '#E1E5EA', borderRadius: 12 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E1E5EA' },
  itemName: { fontSize: 14, fontWeight: '600', color: '#0B1220' },
  pill: { borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  pillText: { fontSize: 10, fontWeight: '600' },
  round: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F5F6F8', alignItems: 'center', justifyContent: 'center' },
  qty: { width: 24, textAlign: 'center', fontSize: 14, fontWeight: '700', color: '#0B1220' },
  error: { marginTop: 8, fontSize: 13, color: '#B42318' },
  save: { marginTop: 14, height: 48, borderRadius: 999, backgroundColor: '#1E56A0', alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
