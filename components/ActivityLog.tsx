import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../lib/inter';
import { ACTION_LABEL, loadActivity, loadTeam, type Activity, type ActivityAction, type TeamMember } from '../lib/team';

// Activity log: who did what and when (team changes, orders, payments, refunds, stock, products, customers, campaigns,
// exports). Written by the database itself, so entries can't be edited or removed. Same as the website's /activity.
const ICON: Record<ActivityAction, keyof typeof Ionicons.glyphMap> = {
  team: 'people-outline', invite: 'people-outline', order: 'bag-handle-outline', payment: 'card-outline', refund: 'return-down-back-outline',
  stock: 'cube-outline', product: 'pricetag-outline', customer: 'people-outline', campaign: 'megaphone-outline', export: 'cloud-download-outline',
};
const FILTERS: { label: string; actions?: ActivityAction[] }[] = [
  { label: 'All' }, { label: 'Team', actions: ['team', 'invite'] }, { label: 'Orders', actions: ['order', 'payment', 'refund'] },
  { label: 'Stock & products', actions: ['stock', 'product'] }, { label: 'Customers', actions: ['customer'] }, { label: 'Campaigns', actions: ['campaign'] }, { label: 'Exports', actions: ['export'] },
];
const day = (iso: string) => {
  const d = new Date(iso), today = new Date(); const y = new Date(); y.setDate(today.getDate() - 1);
  return d.toDateString() === today.toDateString() ? 'Today' : d.toDateString() === y.toDateString() ? 'Yesterday' : d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
};
const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export function ActivityLog({ onBack, topInset = 0 }: { onBack: () => void; topInset?: number }) {
  const [rows, setRows] = useState<Activity[] | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [filter, setFilter] = useState(0);
  const [person, setPerson] = useState('');
  const [more, setMore] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (before?: string) => {
    setBusy(true);
    try {
      const page = await loadActivity({ actions: FILTERS[filter].actions, actorId: person || undefined, before });
      setRows(r => (before && r ? [...r, ...page] : page)); setMore(page.length === 50); setError('');
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }, [filter, person]);
  useEffect(() => { setRows(null); load().catch(() => {}); }, [load]);
  useEffect(() => { loadTeam().then(setTeam).catch(() => {}); }, []);

  let lastDay = '';
  return (
    <View style={s.screen}>
      <View style={[s.header, { paddingTop: topInset + 12 }]}>
        <Pressable onPress={onBack} hitSlop={8} accessibilityLabel="Back"><Ionicons name="chevron-back" size={24} color="#0B1220" /></Pressable>
        <Text style={s.headerTitle}>Activity log</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={s.muted}>Every important change in your business: who made it and when. Entries can’t be edited or deleted.</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }} contentContainerStyle={{ gap: 8 }}>
          {FILTERS.map((f, i) => (
            <Pressable key={f.label} onPress={() => setFilter(i)} style={[s.chip, filter === i && s.chipOn]} accessibilityState={{ selected: filter === i }}>
              <Text style={[s.chipText, filter === i && { color: '#FFF' }]}>{f.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {team.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }} contentContainerStyle={{ gap: 8 }}>
            {[{ user_id: '', full_name: 'Everyone' } as TeamMember, ...team].map(m => (
              <Pressable key={m.user_id || 'all'} onPress={() => setPerson(m.user_id)} style={[s.chip, person === m.user_id && s.chipOnSoft]}>
                <Text style={[s.chipText, person === m.user_id && { color: '#1E56A0' }]}>{m.full_name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
        {error ? <Text style={[s.muted, { color: '#B42318', marginTop: 16 }]}>{error}</Text>
          : !rows ? <ActivityIndicator color="#1E56A0" style={{ marginTop: 24 }} />
          : !rows.length ? <Text style={[s.muted, { textAlign: 'center', marginTop: 32 }]}>{FILTERS[filter].actions || person ? 'Nothing matches this filter yet.' : 'Nothing has been recorded yet. Changes to your team, orders, stock and more will appear here.'}</Text>
          : (
            <View style={s.card}>
              {rows.map(r => {
                const d = day(r.created_at); const head = d !== lastDay; lastDay = d;
                return (
                  <View key={r.id}>
                    {head && <Text style={s.day}>{d}</Text>}
                    <View style={s.entry}>
                      <View style={s.icon}><Ionicons name={ICON[r.action] ?? 'ellipse-outline'} size={16} color="#1E56A0" /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.summary}>{r.summary}</Text>
                        <Text style={s.meta}>{r.actor_name} · {ACTION_LABEL[r.action] ?? r.action} · {time(r.created_at)}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        {!!rows?.length && more && (
          <Pressable disabled={busy} onPress={() => { load(rows[rows.length - 1].created_at).catch(() => {}); }} style={s.more}>
            {busy ? <ActivityIndicator color="#1E56A0" /> : <Text style={{ color: '#1E56A0', fontWeight: '600' }}>Show older</Text>}
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F6F8' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, backgroundColor: '#FFFFFF' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#0B1220' },
  muted: { fontSize: 14, color: '#5C6B7A' },
  chip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: '#FFFFFF' },
  chipOn: { backgroundColor: '#0F2942' },
  chipOnSoft: { backgroundColor: '#EAF1FB' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#5C6B7A' },
  card: { marginTop: 12, backgroundColor: '#FFFFFF', borderRadius: 16, paddingHorizontal: 16 },
  day: { paddingTop: 16, paddingBottom: 4, fontSize: 11, fontWeight: '700', color: '#8A97A6', textTransform: 'uppercase', letterSpacing: 0.5 },
  entry: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E1E5EA' },
  icon: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#EAF1FB', alignItems: 'center', justifyContent: 'center' },
  summary: { fontSize: 14, color: '#0B1220' },
  meta: { marginTop: 2, fontSize: 12, color: '#5C6B7A' },
  more: { alignSelf: 'center', marginTop: 12, height: 40, paddingHorizontal: 20, borderRadius: 999, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
});
