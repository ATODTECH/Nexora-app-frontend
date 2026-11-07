import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Share, StyleSheet, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, TextInput } from '../lib/inter';
import { ChoiceChip } from './AutopilotCard';
import {
  CRM_DEFAULTS, DEAL_STAGES, LOST_REASONS, OPEN_STAGES, RFM, addTasks, canMarket, checkDeal, contactsCsv, deleteDeal, describeRules, fmtMoney, inSegment, isLead,
  loadCrmContacts, loadCrmSettings, loadDeals, loadDuplicates, localIsoDate, mergeContacts, moveDeal, rfmTone, saveCrmSettings, saveDeal, stageLabel, stageProb,
  type Contact, type CrmSettings, type Deal, type DealForm, type DealStage, type Duplicate,
} from '../lib/crm';
import { logExport } from '../lib/team';

// Customer Relationship Management (blueprint 2.7), the app's screen: the sales pipeline, smart segments and re-engagement,
// duplicates and settings. Same data and rules as the website's Customers › Sales pipeline / Segments / Duplicates & settings.
type Tab = 'pipeline' | 'segments' | 'tools';
const TABS: { k: Tab; label: string; icon: string }[] = [
  { k: 'pipeline', label: 'Sales pipeline', icon: 'trending-up-outline' }, { k: 'segments', label: 'Segments', icon: 'people-outline' }, { k: 'tools', label: 'Duplicates & settings', icon: 'settings-outline' },
];
const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');
const fmtDay = (d?: string | null) => (d ? new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return localIsoDate(d); };
const Tag = ({ t, c }: { t: string; c: readonly [string, string] }) => <View style={{ backgroundColor: c[0], borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}><Text style={{ fontSize: 11, fontWeight: '700', color: c[1] }}>{t}</Text></View>;

export function CRMScreen({ userId, onBack, flash, openCustomer, isOwner, canManage, canExport, topInset = 0, wide = false }: {
  userId: string; onBack: () => void; flash: (t: string) => void; openCustomer?: (id: string) => void; isOwner: boolean; canManage: boolean; canExport: boolean; topInset?: number; wide?: boolean;
}) {
  const [tab, setTab] = useState<Tab>('pipeline');
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const reload = useCallback(() => loadCrmContacts().then(setContacts).catch(e => { flash(errMsg(e)); setContacts([]); }), [flash]);
  useEffect(() => { reload(); }, [reload]);
  return (
    <View style={{ flex: 1, backgroundColor: '#F5F6F8', paddingTop: topInset }}>
      <View style={s.header}>
        <Pressable onPress={onBack} hitSlop={10} accessibilityLabel="Back"><Ionicons name="chevron-back" size={26} color="#0B1220" /></Pressable>
        <Text style={s.title}>Pipeline and segments</Text>
      </View>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}>
          {TABS.map(t => <Pressable key={t.k} onPress={() => setTab(t.k)} style={[s.tab, tab === t.k && s.tabOn]}><Ionicons name={t.icon as never} size={15} color={tab === t.k ? '#FFF' : '#26313D'} /><Text style={[s.tabText, tab === t.k && { color: '#FFF' }]}>{t.label}</Text></Pressable>)}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={[{ padding: 16, paddingBottom: 60, gap: 12 }, wide && { width: '100%', maxWidth: 1100, alignSelf: 'center' }]} keyboardShouldPersistTaps="handled">
        {!contacts ? <ActivityIndicator color="#1E56A0" style={{ marginTop: 40 }} /> : <>
          {tab === 'pipeline' && <Pipeline contacts={contacts} userId={userId} canManage={canManage} flash={flash} openCustomer={openCustomer} />}
          {tab === 'segments' && <Segments contacts={contacts} userId={userId} canManage={canManage} canExport={canExport} flash={flash} openCustomer={openCustomer} />}
          {tab === 'tools' && <Tools userId={userId} isOwner={isOwner} canManage={canManage} flash={flash} reload={reload} />}
        </>}
      </ScrollView>
    </View>
  );
}

function Pipeline({ contacts, userId, canManage, flash, openCustomer }: { contacts: Contact[]; userId: string; canManage: boolean; flash: (t: string) => void; openCustomer?: (id: string) => void }) {
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [stage, setStage] = useState<DealStage>('new');
  const [form, setForm] = useState<DealForm | null>(null);
  const [losing, setLosing] = useState<Deal | null>(null);
  const reload = useCallback(() => loadDeals().then(setDeals).catch(e => { flash(errMsg(e)); setDeals([]); }), [flash]);
  useEffect(() => { reload(); }, [reload]);
  const byId = useMemo(() => new Map(contacts.map(c => [c.id, c])), [contacts]);
  const cur = deals?.find(d => d.currency)?.currency || 'NGN';
  const sum = (l: Deal[], w = false) => l.reduce((n, d) => n + d.value * (w ? stageProb(d.stage) : 1), 0);
  const open = (deals ?? []).filter(d => OPEN_STAGES.includes(d.stage));
  const closed = (deals ?? []).filter(d => d.stage === 'won' || d.stage === 'lost');
  const m0 = new Date(); m0.setDate(1); m0.setHours(0, 0, 0, 0);
  const won = (deals ?? []).filter(d => d.stage === 'won' && d.closed_at && new Date(d.closed_at) >= m0);
  const move = async (d: Deal, to: DealStage, reason = '') => {
    if (to === 'lost' && !reason) { setLosing(d); return; }
    setDeals(p => p && p.map(x => (x.id === d.id ? { ...x, stage: to } : x)));
    try { await moveDeal(d.id, to, reason); flash(to === 'won' ? `Won: ${d.title}` : `Moved to ${stageLabel(to)}`); } catch (e) { flash(errMsg(e)); reload(); }
  };
  const kpi = (l: string, v: string, sub?: string) => <View style={s.kpi}><Text style={s.small}>{l}</Text><Text style={{ fontSize: 18, fontWeight: '800', color: '#0B1220', marginTop: 2 }}>{v}</Text>{!!sub && <Text style={s.tiny}>{sub}</Text>}</View>;
  if (!deals) return <ActivityIndicator color="#1E56A0" style={{ marginTop: 30 }} />;
  if (form) return <DealEditor form={form} setForm={setForm} contacts={contacts} flash={flash} onSaved={() => { setForm(null); reload(); }} userId={userId} />;
  const list = deals.filter(d => d.stage === stage);
  return <>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {kpi('Open opportunities', String(open.length), fmtMoney(sum(open), cur))}
      {kpi('Expected (weighted)', fmtMoney(sum(open, true), cur), 'Value × chance at each stage')}
      {kpi('Won this month', fmtMoney(sum(won), cur), `${won.length} deal${won.length === 1 ? '' : 's'}`)}
      {kpi('Win rate', closed.length ? `${Math.round((closed.filter(d => d.stage === 'won').length / closed.length) * 100)}%` : '—', `${closed.length} closed`)}
    </View>
    {canManage && <Pressable onPress={() => setForm({ customer_id: null, title: '', value: '', currency: cur, stage: 'new', expected_close: '', notes: '', source: '' })} style={s.btn}><Ionicons name="add" size={18} color="#FFF" /><Text style={s.btnText}>New opportunity</Text></Pressable>}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {DEAL_STAGES.map(st => { const l = deals.filter(d => d.stage === st.key); return <ChoiceChip key={st.key} on={stage === st.key} label={`${st.label} ${l.length}${l.length ? ` · ${fmtMoney(sum(l), cur)}` : ''}`} onPress={() => setStage(st.key)} />; })}
    </ScrollView>
    {list.length === 0 ? <View style={s.card}><Text style={s.small}>{deals.length ? `Nothing at "${stageLabel(stage)}".` : 'No opportunities yet. When someone asks for a quote or a bulk order, add it here with its value and move it along as you talk.'}</Text></View> : list.map(d => {
      const c = d.customer_id ? byId.get(d.customer_id) : undefined;
      const late = OPEN_STAGES.includes(d.stage) && !!d.expected_close && d.expected_close < localIsoDate();
      return (
        <View key={d.id} style={[s.card, late && { borderColor: '#F5B5B5' }]}>
          <Pressable onPress={() => canManage && setForm({ id: d.id, customer_id: d.customer_id, title: d.title, value: d.value ? String(d.value) : '', currency: d.currency || cur, stage: d.stage, expected_close: d.expected_close ?? '', notes: d.notes, source: d.source })}>
            <Text style={s.bold}>{d.title}</Text>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#1E56A0', marginTop: 2 }}>{d.value ? fmtMoney(d.value, d.currency) : 'No value yet'}</Text>
          </Pressable>
          {c && <Pressable onPress={() => openCustomer?.(c.id)}><Text style={[s.small, { marginTop: 4 }]}>{c.name} ›</Text></Pressable>}
          {!!d.expected_close && <Text style={[s.tiny, late && { color: '#C53030', fontWeight: '700' }]}>{late ? 'Overdue · ' : 'Close by '}{fmtDay(d.expected_close)}</Text>}
          {d.stage === 'lost' && !!d.lost_reason && <Text style={s.tiny}>Lost: {d.lost_reason}</Text>}
          {canManage && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 8 }}>
            {DEAL_STAGES.filter(x => x.key !== d.stage).map(x => <Pressable key={x.key} onPress={() => move(d, x.key)} style={s.mini}><Text style={s.miniText}>→ {x.label}</Text></Pressable>)}
          </ScrollView>}
        </View>
      );
    })}
    {losing && <View style={s.card}>
      <Text style={s.bold}>Why was &quot;{losing.title}&quot; lost?</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>{LOST_REASONS.map(r => <ChoiceChip key={r} on={false} label={r} onPress={() => { const d = losing; setLosing(null); move(d, 'lost', r); }} />)}</View>
      <Pressable onPress={() => setLosing(null)} style={{ marginTop: 8 }}><Text style={s.link}>Cancel</Text></Pressable>
    </View>}
  </>;
}

function DealEditor({ form, setForm, contacts, flash, onSaved, userId }: { form: DealForm; setForm: (f: DealForm | null) => void; contacts: Contact[]; flash: (t: string) => void; onSaved: () => void; userId: string }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof DealForm>(k: K, v: DealForm[K]) => setForm({ ...form, [k]: v });
  const picked = contacts.find(c => c.id === form.customer_id);
  const found = q.trim() ? contacts.filter(c => c.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : [];
  return (
    <View style={s.card}>
      <Text style={[s.bold, { fontSize: 16 }]}>{form.id ? 'Opportunity' : 'New opportunity'}</Text>
      <Text style={s.label}>What is it?*</Text>
      <TextInput value={form.title} onChangeText={v => set('title', v)} maxLength={200} placeholder="e.g. 20 headphones for Ada's office" style={s.input} />
      <Text style={s.label}>Customer or lead</Text>
      {picked ? <Pressable onPress={() => set('customer_id', null)} style={s.copy}><Text style={[s.bold, { flex: 1 }]}>{picked.name}</Text><Ionicons name="close-circle" size={18} color="#8A97A6" /></Pressable> : <>
        <TextInput value={q} onChangeText={setQ} placeholder="Search by name" style={s.input} />
        {found.map(c => <Pressable key={c.id} onPress={() => { set('customer_id', c.id); setQ(''); }} style={{ paddingVertical: 8 }}><Text style={s.small}>{c.name}{isLead(c) ? ' (lead)' : ''}</Text></Pressable>)}
      </>}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Text style={s.label}>Value</Text><TextInput value={form.value} onChangeText={v => set('value', v)} keyboardType="decimal-pad" placeholder="0" style={s.input} /></View>
        <View style={{ width: 90 }}><Text style={s.label}>Currency</Text><TextInput value={form.currency} onChangeText={v => set('currency', v.toUpperCase())} maxLength={3} style={s.input} /></View>
      </View>
      <Text style={s.label}>Stage</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{DEAL_STAGES.map(x => <ChoiceChip key={x.key} on={form.stage === x.key} label={x.label} onPress={() => set('stage', x.key)} />)}</View>
      <Text style={s.label}>Expected to close (YYYY-MM-DD)</Text>
      <TextInput value={form.expected_close} onChangeText={v => set('expected_close', v)} placeholder={tomorrow()} maxLength={10} style={s.input} />
      <Text style={s.label}>Notes</Text>
      <TextInput value={form.notes} onChangeText={v => set('notes', v)} multiline maxLength={2000} style={[s.input, { minHeight: 70, paddingTop: 10 }]} />
      <Pressable disabled={busy} onPress={async () => {
        const p = checkDeal(form) || (form.expected_close && !/^\d{4}-\d{2}-\d{2}$/.test(form.expected_close) ? 'Write the date as YYYY-MM-DD.' : '');
        if (p) { flash(p); return; }
        setBusy(true); try { await saveDeal(userId, form); flash(form.id ? 'Opportunity saved' : 'Opportunity added'); onSaved(); } catch (e) { flash(errMsg(e)); setBusy(false); }
      }} style={[s.btn, { marginTop: 14 }]}>{busy ? <ActivityIndicator color="#FFF" /> : <Text style={s.btnText}>Save</Text>}</Pressable>
      <Pressable onPress={() => setForm(null)} style={{ alignItems: 'center', marginTop: 10 }}><Text style={s.link}>Cancel</Text></Pressable>
      {form.id && <Pressable onPress={async () => { try { await deleteDeal(form.id as string); flash('Opportunity deleted'); onSaved(); } catch (e) { flash(errMsg(e)); } }} style={{ alignItems: 'center', marginTop: 10 }}><Text style={[s.link, { color: '#C53030' }]}>Delete opportunity</Text></Pressable>}
    </View>
  );
}

function Segments({ contacts, userId, canManage, canExport, flash, openCustomer }: { contacts: Contact[]; userId: string; canManage: boolean; canExport: boolean; flash: (t: string) => void; openCustomer?: (id: string) => void }) {
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const value = (l: Contact[]) => l.reduce((n, c) => n + Number(c.spent ?? c.total_spent ?? 0), 0);
  if (pick) {
    const r = RFM.find(x => x.key === pick);
    const members = contacts.filter(c => inSegment(c, { rfm: [pick] }, isLead));
    const reach = members.filter(canMarket);
    return <>
      <Pressable onPress={() => setPick(null)}><Text style={s.link}>‹ All segments</Text></Pressable>
      <View style={s.card}>
        <Text style={[s.bold, { fontSize: 17 }]}>{r?.label}</Text>
        <Text style={s.small}>{r?.blurb}</Text>
        <Text style={[s.small, { marginTop: 6 }]}>{members.length} people · {reach.length} agreed to offers · {fmtMoney(value(members), 'NGN')} lifetime</Text>
        {members.length > reach.length && <Text style={[s.tiny, { marginTop: 4 }]}>{members.length - reach.length} said no to offers or asked not to be contacted, so they are left out.</Text>}
        {canManage && reach.length > 0 && <Pressable disabled={busy} onPress={async () => { setBusy(true); try { const n = await addTasks(userId, reach, tomorrow(), name => `Re-engage ${name} (${r?.label})`, '10:00 AM', `From the "${r?.label}" segment`); flash(`${n} follow-up task${n === 1 ? '' : 's'} added for tomorrow`); } catch (e) { flash(errMsg(e)); } finally { setBusy(false); } }} style={[s.btn, { marginTop: 10 }]}>
          {busy ? <ActivityIndicator color="#FFF" /> : <><Ionicons name="alarm-outline" size={17} color="#FFF" /><Text style={s.btnText}>Add a follow-up task for each</Text></>}</Pressable>}
        {canExport && members.length > 0 && <Pressable onPress={() => { Share.share({ message: contactsCsv(members), title: `${r?.label}.csv` }).catch(() => {}); logExport(`segment "${r?.label}"`, members.length); }} style={[s.btn, s.btnSoft, { marginTop: 8 }]}><Text style={[s.btnText, { color: '#1E56A0' }]}>Share as spreadsheet (CSV)</Text></Pressable>}
      </View>
      {members.map(c => {
        const ph = !c.masked ? (c.phone || c.handle || '').replace(/\D/g, '') : '';
        return (
          <View key={c.id} style={[s.card, s.row, { gap: 10 }]}>
            <Pressable onPress={() => openCustomer?.(c.id)} style={{ flex: 1 }}>
              <Text style={s.bold}>{c.name}</Text>
              <Text style={s.small}>{c.orders_n ?? c.total_orders ?? 0} orders · {fmtMoney(Number(c.spent ?? c.total_spent ?? 0), 'NGN')}{c.last_order || c.last_order_at ? ` · last ${fmtDay(c.last_order || c.last_order_at)}` : ''}</Text>
            </Pressable>
            {!canMarket(c) ? <Text style={s.tiny}>No offers</Text> : ph.length >= 7 && <Pressable onPress={() => Linking.openURL(`https://wa.me/${ph}?text=${encodeURIComponent(`Hi ${c.name.split(' ')[0]}, it's been a while! `)}`)} accessibilityLabel={`WhatsApp ${c.name}`}><Ionicons name="logo-whatsapp" size={22} color="#25D366" /></Pressable>}
          </View>
        );
      })}
    </>;
  }
  return <>
    <Text style={s.small}>Nexora groups your customers by how recently, how often and how much they buy, and updates the groups every time an order comes in.</Text>
    {RFM.map(r => {
      const l = contacts.filter(c => c.rfm === r.key);
      return (
        <Pressable key={r.key} onPress={() => setPick(r.key)} style={s.card}>
          <View style={[s.row, { justifyContent: 'space-between' }]}><Tag t={r.label} c={rfmTone(r.key)} /><Text style={{ fontSize: 20, fontWeight: '800', color: '#0B1220' }}>{l.length}</Text></View>
          <Text style={[s.small, { marginTop: 6 }]}>{r.blurb}</Text>
          {l.length > 0 && <Text style={[s.tiny, { marginTop: 4 }]}>{fmtMoney(value(l), 'NGN')} lifetime · {describeRules({ rfm: [r.key] })}</Text>}
        </Pressable>
      );
    })}
  </>;
}

function Tools({ userId, isOwner, canManage, flash, reload }: { userId: string; isOwner: boolean; canManage: boolean; flash: (t: string) => void; reload: () => void }) {
  const [dups, setDups] = useState<Duplicate[] | null>(null);
  const [st, setSt] = useState<CrmSettings | null>(null);
  const loadDups = useCallback(() => loadDuplicates().then(setDups).catch(() => setDups([])), []);
  useEffect(() => { loadDups(); loadCrmSettings().then(setSt).catch(() => setSt(CRM_DEFAULTS)); }, [loadDups]);
  const save = async (n: CrmSettings) => { setSt(n); try { await saveCrmSettings(userId, n); flash('Saved'); } catch (e) { flash(errMsg(e)); } };
  const merge = async (keep: string, drop: string) => { try { await mergeContacts(keep, drop); flash('Merged'); loadDups(); reload(); } catch (e) { flash(errMsg(e)); } };
  return <>
    <View style={s.card}>
      <Text style={s.bold}>Possible duplicates</Text>
      <Text style={s.small}>Same phone number or email. Merging keeps their orders, chats, calls, tasks, notes and opportunities.</Text>
      {!dups ? <ActivityIndicator color="#1E56A0" /> : dups.length === 0 ? <Text style={[s.small, { color: '#1E9E6D', marginTop: 6 }]}>No duplicates found.</Text> : dups.map(d => (
        <View key={d.a_id + d.b_id} style={s.copy}>
          <View style={{ flex: 1 }}>
            <Text style={s.bold}>{d.a_name} and {d.b_name}</Text><Text style={s.tiny}>{d.reason}</Text>
            {canManage && <View style={[s.row, { gap: 8, marginTop: 6 }]}>
              <Pressable onPress={() => merge(d.a_id, d.b_id)} style={s.mini}><Text style={s.miniText}>Keep {d.a_name}</Text></Pressable>
              <Pressable onPress={() => merge(d.b_id, d.a_id)} style={s.mini}><Text style={s.miniText}>Keep {d.b_name}</Text></Pressable>
            </View>}
          </View>
        </View>
      ))}
    </View>
    <View style={s.card}>
      <Text style={s.bold}>How Nexora keeps your records</Text>
      {!st ? <ActivityIndicator color="#1E56A0" /> : <>
        <View style={[s.row, { marginTop: 10 }]}><View style={{ flex: 1 }}><Text style={s.bold}>Link orders and chats to customers</Text><Text style={s.tiny}>Matches by phone number, then email, then an exact name</Text></View><Switch value={st.auto_link} disabled={!isOwner} onValueChange={v => save({ ...st, auto_link: v })} /></View>
        <View style={[s.row, { marginTop: 10 }]}><View style={{ flex: 1 }}><Text style={s.bold}>Create a customer from a new buyer</Text><Text style={s.tiny}>When an order has a phone number or email Nexora hasn’t seen</Text></View><Switch value={st.auto_create} disabled={!isOwner || !st.auto_link} onValueChange={v => save({ ...st, auto_create: v })} /></View>
        <Text style={s.label}>Count a customer as lapsed after</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{[30, 60, 90, 120, 180, 365].map(n => <ChoiceChip key={n} on={st.lapsed_days === n} label={`${n} days`} onPress={() => { if (isOwner) save({ ...st, lapsed_days: n }); }} />)}</View>
        {!isOwner && <Text style={[s.tiny, { marginTop: 6 }]}>Only the owner can change these.</Text>}
      </>}
    </View>
    <View style={s.card}>
      <Text style={s.bold}>Privacy and access</Text>
      <Text style={[s.small, { marginTop: 4 }]}>Team members only see phone numbers, emails and addresses if their role includes “See contact details”. Each time they open someone’s details it’s written to the Activity log. People who said no to offers are left out of re-engagement.</Text>
    </View>
  </>;
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E3E8EF' },
  title: { flex: 1, fontSize: 17, fontWeight: '800', color: '#0B1220' },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 14, borderRadius: 999, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E3E8EF' },
  tabOn: { backgroundColor: '#0B2545', borderColor: '#0B2545' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#26313D' },
  row: { flexDirection: 'row', alignItems: 'center' },
  card: { backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: '#E3E8EF', padding: 14 },
  kpi: { flexGrow: 1, flexBasis: '45%', backgroundColor: '#FFF', borderRadius: 14, borderWidth: 1, borderColor: '#E3E8EF', padding: 12 },
  bold: { fontSize: 14, fontWeight: '700', color: '#0B1220' },
  small: { fontSize: 12.5, color: '#5C6B7A', lineHeight: 18 },
  tiny: { fontSize: 11, color: '#8A97A6' },
  label: { marginTop: 10, marginBottom: 4, fontSize: 12, fontWeight: '600', color: '#5C6B7A' },
  link: { fontSize: 13, fontWeight: '700', color: '#1E56A0' },
  input: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: '#D5DEE8', paddingHorizontal: 12, fontSize: 14, color: '#0B1220', backgroundColor: '#FFF' },
  btn: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', height: 46, borderRadius: 999, backgroundColor: '#1E56A0', paddingHorizontal: 16 },
  btnSoft: { backgroundColor: '#EEF4FC' },
  btnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  copy: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F5F7FA', borderRadius: 10, padding: 10, marginTop: 8 },
  mini: { borderRadius: 999, borderWidth: 1, borderColor: '#D5DEE8', paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#FFF' },
  miniText: { fontSize: 12, fontWeight: '600', color: '#26313D' },
});
