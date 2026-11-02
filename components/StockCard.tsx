import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, TextInput } from '../lib/inter';
import { LEVEL_COLORS, REASON_TEXT, STOCK_LABEL, adjustStock, loadMovements, stockInfo, type Movement } from '../lib/products';

// A product's stock on its detail screen: how many are left, "Add stock (received)", "Correct count" and the
// history of every change. Same behaviour as the website's StockCard.
type Props = { itemId: string; fields: { label: string; value: string }[]; onChanged: () => void };
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export function StockCard({ itemId, fields, onChanged }: Props) {
  const info = stockInfo(fields);
  const [stock, setStock] = useState(info.stock);
  const [history, setHistory] = useState<Movement[] | null>(null);
  const [form, setForm] = useState<null | { mode: 'add' | 'set'; qty: string; note: string }>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const shown = stockInfo([...fields.filter(f => f.label !== STOCK_LABEL), ...(stock === null ? [] : [{ label: STOCK_LABEL, value: String(stock) }])]);

  const loadHistory = useCallback(() => { loadMovements(itemId).then(setHistory).catch(() => setHistory([])); }, [itemId]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  const save = async () => {
    if (!form) return;
    const qty = Number(form.qty);
    if (!form.qty || !Number.isInteger(qty) || qty < (form.mode === 'add' ? 1 : 0)) { setErr(form.mode === 'add' ? 'Enter how many arrived.' : 'Enter how many you have now.'); return; }
    if (form.mode === 'set' && stock !== null && !form.note.trim()) { setErr('Say why the count changed, e.g. "Counted the shelf" or "2 damaged".'); return; }
    setBusy(true); setErr('');
    try { setStock(await adjustStock(itemId, form.mode, qty, form.note)); setForm(null); loadHistory(); onChanged(); }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };

  return (
    <View style={s.card} accessibilityLabel="Stock">
      <View style={s.row}>
        <View style={s.icon}><Ionicons name="cube-outline" size={20} color="#1E56A0" /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.small}>Stock</Text>
          <Text style={s.big}>{stock === null ? 'Not tracked' : stock}</Text>
        </View>
        {shown.level && <View style={[s.pill, { backgroundColor: LEVEL_COLORS[shown.level].bg }]}><Text style={[s.pillText, { color: LEVEL_COLORS[shown.level].fg }]}>{shown.label}</Text></View>}
      </View>
      {stock !== null && <Text style={[s.small, { marginTop: 6 }]}>Orders take stock when they're placed and give it back if cancelled. Nexora tells you when it reaches {info.at}.</Text>}

      {form ? (
        <View style={s.form}>
          <Text style={[s.label, { fontSize: 14, fontWeight: '700', marginBottom: 8 }]}>{form.mode === 'add' ? 'Add stock (received)' : stock === null ? 'Start tracking stock' : 'Correct count'}</Text>
          <Text style={s.label}>{form.mode === 'add' ? 'How many arrived?' : stock === null ? 'How many do you have?' : 'How many do you have now?'}</Text>
          <TextInput autoFocus value={form.qty} onChangeText={v => setForm({ ...form, qty: v.replace(/[^\d]/g, '').slice(0, 9) })} keyboardType="number-pad" placeholder="0" placeholderTextColor="#A5AFBB" style={s.input} />
          {stock !== null && <>
            <Text style={[s.label, { marginTop: 10 }]}>{form.mode === 'add' ? 'Note (optional)' : 'Why did it change?'}</Text>
            <TextInput value={form.note} onChangeText={v => setForm({ ...form, note: v })} maxLength={300} placeholder={form.mode === 'add' ? 'e.g. Delivery from supplier' : 'e.g. Counted the shelf, 2 damaged'} placeholderTextColor="#A5AFBB" style={s.input} />
          </>}
          {!!err && <Text style={s.error} accessibilityRole="alert">{err}</Text>}
          <View style={[s.row, { marginTop: 12, gap: 8 }]}>
            <Pressable onPress={() => { setForm(null); setErr(''); }} style={[s.btn, s.btnOutline]}><Text style={[s.btnText, { color: '#0B1220' }]}>Cancel</Text></Pressable>
            <Pressable disabled={busy} onPress={() => { save().catch(() => {}); }} style={[s.btn, s.btnPrimary, busy && { opacity: 0.6 }]}>
              {busy ? <ActivityIndicator color="#FFF" /> : <Text style={[s.btnText, { color: '#FFF' }]}>Save</Text>}
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={[s.row, { marginTop: 12, gap: 8 }]}>
          {stock === null
            ? <Pressable onPress={() => setForm({ mode: 'set', qty: '', note: '' })} style={[s.btn, s.btnSoft]}><Ionicons name="add" size={16} color="#1E56A0" /><Text style={[s.btnText, { color: '#1E56A0' }]}>Start tracking stock</Text></Pressable>
            : <>
              <Pressable onPress={() => setForm({ mode: 'add', qty: '', note: '' })} style={[s.btn, s.btnPrimary]}><Ionicons name="add" size={16} color="#FFF" /><Text style={[s.btnText, { color: '#FFF' }]}>Add stock</Text></Pressable>
              <Pressable onPress={() => setForm({ mode: 'set', qty: String(stock), note: '' })} style={[s.btn, s.btnOutline, { borderColor: '#5381BB' }]}><Ionicons name="create-outline" size={16} color="#1E56A0" /><Text style={[s.btnText, { color: '#1E56A0' }]}>Correct count</Text></Pressable>
            </>}
        </View>
      )}

      {stock !== null && (
        <View style={{ marginTop: 16 }}>
          <Text style={s.label}>History</Text>
          {history === null ? <ActivityIndicator color="#1E56A0" style={{ marginTop: 8, alignSelf: 'flex-start' }} />
            : !history.length ? <Text style={[s.small, { marginTop: 4 }]}>No changes yet.</Text>
            : history.map(m => (
              <View key={m.id} style={s.historyRow}>
                <Text style={[s.change, { color: m.change > 0 ? '#1E9E6D' : m.change < 0 ? '#B42318' : '#5C6B7A' }]}>{m.change > 0 ? `+${m.change}` : m.change}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.historyTitle} numberOfLines={1}>{REASON_TEXT[m.reason]}{m.order_number ? ` · ${m.order_number}` : ''}</Text>
                  <Text style={s.small} numberOfLines={1}>{when(m.created_at)}{m.note ? ` · ${m.note}` : ''}</Text>
                </View>
                <Text style={s.small}>{m.balance} left</Text>
              </View>
            ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center' },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#EAF1FB', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  small: { fontSize: 12, color: '#5C6B7A' },
  big: { fontSize: 20, fontWeight: '700', color: '#0B1220' },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 11, fontWeight: '600' },
  form: { marginTop: 12, backgroundColor: '#F5F6F8', borderRadius: 12, padding: 12 },
  label: { fontSize: 13, fontWeight: '600', color: '#0B1220' },
  input: { marginTop: 6, height: 44, borderRadius: 12, borderWidth: 1, borderColor: '#E1E5EA', backgroundColor: '#FFFFFF', paddingHorizontal: 12, fontSize: 14, color: '#0B1220' },
  error: { marginTop: 8, fontSize: 13, color: '#B42318' },
  btn: { flex: 1, height: 40, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  btnPrimary: { backgroundColor: '#1E56A0' },
  btnSoft: { backgroundColor: '#EAF1FB' },
  btnOutline: { borderWidth: 1, borderColor: '#D5DEE8', backgroundColor: '#FFFFFF' },
  btnText: { fontSize: 14, fontWeight: '600' },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E1E5EA' },
  change: { width: 44, fontSize: 13, fontWeight: '700' },
  historyTitle: { fontSize: 13, fontWeight: '600', color: '#0B1220' },
});
