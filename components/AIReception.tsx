import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Share, StyleSheet, Switch, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, TextInput } from '../lib/inter';
import { ChartCard, ChoiceChip } from './AutopilotCard';
import { MoreDetails } from './MoreDetails';
import {
  CATEGORY, DAY_NAMES, OUTCOME, PROVIDERS, chatStats, cleanPhone, getReception, loadCalls, mmss, saveReception, testChat, testEnd, testStart, testTurn,
  updateCall, waLink, type Call, type ChatTest, type ReceptionInfo, type ReceptionSettings,
} from '../lib/reception';

// AI Customer Communication, Chat and Phone Reception (blueprint 2.6), the app's screen. Same data and rules as the website's /reception.
const TITLE = 'Calls and chats';
type Tab = 'overview' | 'calls' | 'test' | 'settings';
const TABS: { k: Tab; label: string; icon: string }[] = [
  { k: 'overview', label: 'Overview', icon: 'bar-chart-outline' }, { k: 'calls', label: 'Calls', icon: 'call-outline' },
  { k: 'test', label: 'Try it', icon: 'play-circle-outline' }, { k: 'settings', label: 'Settings', icon: 'settings-outline' },
];
const DAY = 86400000;
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const PILL: Record<string, [string, string]> = {
  answered: ['#E6F4ED', '#1E9E6D'], transferred: ['#EEF4FC', '#1E56A0'], message: ['#FDF3E1', '#B7791F'], spam: ['#F2F4F7', '#5C6B7A'], missed: ['#F2F4F7', '#5C6B7A'], abandoned: ['#F2F4F7', '#5C6B7A'], '': ['#EEF4FC', '#1E56A0'],
};
const Pill = ({ t, k }: { t: string; k: string }) => <View style={{ backgroundColor: (PILL[k] ?? PILL[''])[0], borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}><Text style={{ fontSize: 11, fontWeight: '700', color: (PILL[k] ?? PILL[''])[1] }}>{t}</Text></View>;

export function AIReception({ onBack, flash, goTo, topInset = 0, wide = false }: { onBack: () => void; flash: (t: string) => void; goTo?: (href: string) => void; topInset?: number; wide?: boolean }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [info, setInfo] = useState<ReceptionInfo | null>(null);
  const [calls, setCalls] = useState<Call[] | null>(null);
  const [chats, setChats] = useState<{ aiReplies: number; handovers: number; byDay: Record<string, number> } | null>(null);
  const [open, setOpen] = useState<Call | null>(null);
  const reload = useCallback(async () => {
    try { const [i, c, s2] = await Promise.all([getReception(), loadCalls(), chatStats()]); setInfo(i); setCalls(c); setChats(s2); }
    catch (e) { flash((e as Error).message); setCalls(x => x ?? []); }
  }, [flash]);
  useEffect(() => {
    let live = true;
    Promise.all([getReception(), loadCalls(), chatStats()]).then(([i, c, s2]) => { if (live) { setInfo(i); setCalls(c); setChats(s2); } }, e => { if (live) { flash((e as Error).message); setCalls([]); } });
    return () => { live = false; };
  }, [flash]);
  const waiting = (calls ?? []).filter(c => c.follow_up_needed && !c.handled && c.status === 'ended').length;
  return (
    <View style={{ flex: 1, backgroundColor: '#F5F6F8', paddingTop: topInset }}>
      <View style={s.header}>
        <Pressable onPress={open ? () => setOpen(null) : onBack} hitSlop={10} accessibilityLabel="Back"><Ionicons name="chevron-back" size={26} color="#0B1220" /></Pressable>
        <Text style={s.title} numberOfLines={2}>{open ? (open.caller_name || open.from_number || 'Call') : TITLE}</Text>
      </View>
      {!open && (
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}>
            {TABS.map(t => <Pressable key={t.k} onPress={() => setTab(t.k)} style={[s.tab, tab === t.k && s.tabOn]}><Ionicons name={t.icon as any} size={15} color={tab === t.k ? '#FFF' : '#26313D'} />
              <Text style={[s.tabText, tab === t.k && { color: '#FFF' }]}>{t.label}{t.k === 'calls' && waiting ? ` (${waiting})` : ''}</Text></Pressable>)}
          </ScrollView>
        </View>
      )}
      <ScrollView contentContainerStyle={[{ padding: 16, paddingBottom: 60, gap: 12 }, wide && { width: '100%', maxWidth: 1100, alignSelf: 'center' }]} keyboardShouldPersistTaps="handled">
        {!info || !calls ? <ActivityIndicator color="#1E56A0" style={{ marginTop: 40 }} /> : open ? (
          <CallDetail c={open} flash={flash} goTo={goTo} onChanged={c => { setCalls(l => (l ?? []).map(x => x.id === c.id ? c : x)); setOpen(c); }} />
        ) : <>
          {tab === 'overview' && <Overview info={info} calls={calls} chats={chats} go={setTab} openCall={setOpen} />}
          {tab === 'calls' && <CallList calls={calls} openCall={setOpen} />}
          {tab === 'test' && <TryIt info={info} flash={flash} onDone={reload} openCall={setOpen} />}
          {tab === 'settings' && <Settings info={info} setInfo={setInfo} flash={flash} />}
        </>}
      </ScrollView>
    </View>
  );
}

function Overview({ info, calls, chats, go, openCall }: { info: ReceptionInfo; calls: Call[]; chats: { aiReplies: number; handovers: number; byDay: Record<string, number> } | null; go: (t: Tab) => void; openCall: (c: Call) => void }) {
  const { width } = useWindowDimensions();
  const st = info.settings;
  const [now] = useState(() => Date.now());
  const recent = calls.filter(c => now - new Date(c.started_at).getTime() < 30 * DAY && c.status === 'ended');
  const real = recent.filter(c => !c.is_test);
  const base = real.length ? real : recent;
  const n = (f: (c: Call) => boolean) => base.filter(f).length;
  const days = Array.from({ length: 14 }, (_, i) => new Date(now - (13 - i) * DAY).toISOString().slice(0, 10));
  const per = (f: (c: Call) => boolean) => days.map(d => base.filter(c => c.started_at.slice(0, 10) === d && f(c)).length);
  const cats = Object.entries(base.reduce<Record<string, number>>((a, c) => { const k = CATEGORY[c.category] ?? 'General question'; a[k] = (a[k] ?? 0) + 1; return a; }, {})).map(([label, value]) => ({ label, value }));
  const talk = base.filter(c => c.duration_s > 0);
  const avg = talk.length ? talk.reduce((a, c) => a + c.duration_s, 0) / talk.length : 0;
  const todo = calls.filter(c => c.follow_up_needed && !c.handled && c.status === 'ended').slice(0, 5);
  const w = Math.min(width, 1100) - 32;
  return (
    <>
      <View style={s.card}>
        <Row icon="call-outline" ok={st.phone_on && !!st.provider} title="Phone line" text={st.phone_on && st.provider ? `${PROVIDERS[st.provider].name}${st.business_number ? ` · ${st.business_number}` : ''}` : st.phone_on ? 'On, waiting for a phone number to be connected' : 'Off: Nexora isn’t answering calls yet'} />
        <Row icon="time-outline" ok={info.open_now} title={info.open_now ? 'Open now' : 'Closed now'} text={info.open_now ? 'Your team takes calls; Nexora helps' : `Nexora is on duty. Opens ${info.next_open || 'soon'}`} />
        <Row icon="chatbubbles-outline" ok title="Chats" text={st.chat.mode === 'always' ? 'Nexora answers chats at all times' : st.chat.mode === 'outside_hours' ? 'Nexora answers chats outside opening hours and when you’re away' : 'Nexora answers chats when Away mode is on'} />
        {!(st.phone_on && st.provider) && <Pressable onPress={() => go('settings')}><Text style={[s.link, { marginTop: 6 }]}>Connect a phone number</Text></Pressable>}
      </View>
      {!real.length && !!recent.length && <Text style={[s.small, { color: '#1E56A0' }]}>These figures come from your test calls until real calls come in.</Text>}
      <View style={s.card}>
        <Text style={s.bold}>Waiting for you</Text>
        {!todo.length ? <Text style={s.small}>Nothing waiting. Calls that need a callback show here.</Text> : todo.map(c => <CallRow key={c.id} c={c} onOpen={() => openCall(c)} />)}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Kpi label="Calls answered by Nexora" value={String(n(c => c.outcome === 'answered'))} note={`${base.length} calls in 30 days`} />
        <Kpi label="Passed to your team" value={String(n(c => c.outcome === 'transferred'))} note="With a briefing" />
        <Kpi label="Messages taken" value={String(n(c => c.outcome === 'message'))} note={`${n(c => !!c.task_id)} follow-up tasks`} />
      </View>
      <MoreDetails>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <Kpi label="After-hours calls caught" value={String(n(c => c.meta?.open_at_start === false))} note="Instead of voicemail" />
          <Kpi label="Average call" value={mmss(avg)} note="minutes" />
          <Kpi label="Chat replies by Nexora" value={String(chats?.aiReplies ?? 0)} note={`${chats?.handovers ?? 0} handed to a person`} />
        </View>
        <ChartCard w={w} cur="" c={{ type: 'line', title: 'Calls per day (14 days)', unit: 'count', x: days.map(d => d.slice(8)), series: [
          { name: 'Answered by Nexora', values: per(c => c.outcome === 'answered') }, { name: 'Needed a person', values: per(c => c.outcome === 'message' || c.outcome === 'transferred') },
          { name: 'Chat replies', values: days.map(d => chats?.byDay[d] ?? 0), dashed: true },
        ] }} />
        {!!cats.length && <ChartCard w={w} cur="" c={{ type: 'donut', title: 'What callers wanted', items: cats }} />}
      </MoreDetails>
    </>
  );
}
const Row = ({ icon, ok, title, text }: { icon: string; ok: boolean; title: string; text: string }) => (
  <View style={[s.row, { gap: 10, marginBottom: 8 }]}>
    <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: ok ? '#E6F4ED' : '#FDF3E1' }}><Ionicons name={icon as any} size={18} color={ok ? '#1E9E6D' : '#B7791F'} /></View>
    <View style={{ flex: 1 }}><Text style={s.bold}>{title}</Text><Text style={s.small}>{text}</Text></View>
  </View>
);
const Kpi = ({ label, value, note }: { label: string; value: string; note: string }) => (
  <View style={s.kpi}><Text style={s.tiny} numberOfLines={1}>{label}</Text><Text style={{ fontSize: 22, fontWeight: '900', color: '#0B1220' }}>{value}</Text><Text style={s.tiny} numberOfLines={1}>{note}</Text></View>
);

function CallList({ calls, openCall }: { calls: Call[]; openCall: (c: Call) => void }) {
  const [f, setF] = useState<'all' | 'todo' | 'test'>('all');
  const list = calls.filter(c => f === 'all' || (f === 'todo' ? c.follow_up_needed && !c.handled : c.is_test));
  return (
    <View style={s.card}>
      <View style={[s.row, { gap: 6, flexWrap: 'wrap', marginBottom: 6 }]}>
        <ChoiceChip on={f === 'all'} label={`All ${calls.length}`} onPress={() => setF('all')} />
        <ChoiceChip on={f === 'todo'} label="Needs follow-up" onPress={() => setF('todo')} />
        <ChoiceChip on={f === 'test'} label="Test calls" onPress={() => setF('test')} />
      </View>
      {!list.length ? <Text style={s.small}>No calls yet. Use “Try it” to make a test call, or connect a number in Settings.</Text> : list.map(c => <CallRow key={c.id} c={c} onOpen={() => openCall(c)} />)}
    </View>
  );
}
function CallRow({ c, onOpen }: { c: Call; onOpen: () => void }) {
  const k = c.status === 'live' ? '' : c.outcome;
  return (
    <Pressable onPress={onOpen} style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#EEF1F4' }}>
      <View style={[s.row, { gap: 6, flexWrap: 'wrap' }]}>
        <Text style={s.bold} numberOfLines={1}>{c.caller_name || c.from_number || 'Unknown caller'}</Text>
        <Pill t={OUTCOME[k]?.label ?? 'Call'} k={k} />{c.is_test && <Pill t="Test" k="spam" />}{c.follow_up_needed && !c.handled && <Pill t="Follow up" k="message" />}
      </View>
      <Text style={s.small} numberOfLines={2}>{c.summary || 'Call in progress…'}</Text>
      <Text style={s.tiny}>{when(c.started_at)}{c.duration_s ? ` · ${mmss(c.duration_s)}` : ''}{c.category ? ` · ${CATEGORY[c.category] ?? c.category}` : ''}</Text>
    </Pressable>
  );
}
function CallDetail({ c, flash, goTo, onChanged }: { c: Call; flash: (t: string) => void; goTo?: (h: string) => void; onChanged: (c: Call) => void }) {
  const [draft, setDraft] = useState(c.follow_up_draft);
  const phone = cleanPhone(c.from_number);
  return (
    <>
      <View style={s.card}>
        <View style={[s.row, { gap: 6, flexWrap: 'wrap' }]}><Pill t={OUTCOME[c.outcome]?.label ?? 'Call'} k={c.outcome} /><Text style={s.tiny}>{when(c.started_at)} · {mmss(c.duration_s)}{c.category ? ` · ${CATEGORY[c.category] ?? c.category}` : ''} · {c.sentiment}</Text></View>
        <Text style={[s.small, { marginTop: 8, color: '#0B1220' }]}><Text style={s.bold}>Summary: </Text>{c.summary || '—'}</Text>
        {!!c.task_id && <Pressable onPress={() => goTo?.('/schedule')}><Text style={[s.link, { marginTop: 8 }]}>Follow-up task added to your schedule</Text></Pressable>}
        {!!c.escalation_id && <Text style={[s.small, { marginTop: 4, color: '#B7791F' }]}>Flagged for you on Home</Text>}
        {!!c.customer_id && <Text style={[s.small, { marginTop: 4 }]}>Saved in Customers</Text>}
        {!!c.meta?.dnc && <Text style={[s.small, { marginTop: 4, color: '#B42318' }]}>Asked not to be contacted</Text>}
      </View>
      {c.follow_up_needed && !c.meta?.dnc && (
        <View style={s.card}>
          <Text style={s.bold}>Follow-up message (you send it)</Text>
          <TextInput value={draft} onChangeText={setDraft} multiline style={[s.input, { minHeight: 80, paddingTop: 10, marginTop: 6 }]} />
          <View style={[s.row, { gap: 8, marginTop: 8, flexWrap: 'wrap' }]}>
            {!!phone && <Pressable onPress={() => Linking.openURL(waLink(phone, draft))} style={[s.btn, s.btnSoft]}><Ionicons name="logo-whatsapp" size={16} color="#1E56A0" /><Text style={[s.btnText, { color: '#1E56A0' }]}>WhatsApp</Text></Pressable>}
            {!!phone && <Pressable onPress={() => Linking.openURL(`tel:${phone}`)} style={[s.btn, s.btnSoft]}><Ionicons name="call-outline" size={16} color="#1E56A0" /><Text style={[s.btnText, { color: '#1E56A0' }]}>Call back</Text></Pressable>}
            <Pressable onPress={() => Share.share({ message: draft }).catch(() => {})} style={[s.btn, s.btnSoft]}><Ionicons name="share-outline" size={16} color="#1E56A0" /><Text style={[s.btnText, { color: '#1E56A0' }]}>Share</Text></Pressable>
          </View>
        </View>
      )}
      {c.transcript?.length ? (
        <View style={s.card}>
          <Text style={[s.bold, { marginBottom: 6 }]}>Conversation</Text>
          {c.transcript.map((l, i) => l.who === 'system' ? <Text key={i} style={[s.tiny, { textAlign: 'center', marginVertical: 4 }]}>{l.text}</Text> : (
            <View key={i} style={{ alignSelf: l.who === 'caller' ? 'flex-start' : 'flex-end', maxWidth: '88%', backgroundColor: l.who === 'caller' ? '#F2F4F7' : '#1E56A0', borderRadius: 12, padding: 9, marginVertical: 3 }}>
              <Text style={{ fontSize: 13.5, color: l.who === 'caller' ? '#0B1220' : '#FFF' }}>{l.text}</Text>
            </View>
          ))}
        </View>
      ) : <Text style={s.small}>No transcript is kept for this call.</Text>}
      {c.status === 'ended' && (
        <Pressable onPress={async () => { try { await updateCall(c.id, { handled: !c.handled }); onChanged({ ...c, handled: !c.handled }); } catch (e) { flash((e as Error).message); } }} style={s.btn}>
          <Ionicons name="checkmark-circle" size={18} color="#FFF" /><Text style={s.btnText}>{c.handled ? 'Mark as not done' : 'Mark as done'}</Text>
        </Pressable>
      )}
    </>
  );
}

type Bubble = { who: 'caller' | 'ai' | 'system'; text: string };
function TryIt({ info, flash, onDone, openCall }: { info: ReceptionInfo; flash: (t: string) => void; onDone: () => void; openCall: (c: Call) => void }) {
  const [callId, setCallId] = useState<string | null>(null);
  const [lines, setLines] = useState<Bubble[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'now' | 'open' | 'closed'>('now');
  const [result, setResult] = useState<Call | null>(null);
  const [chat, setChat] = useState({ text: '', away: true, vip: false });
  const [chatOut, setChatOut] = useState<ChatTest | null>(null);
  const start = async () => {
    setBusy(true); setResult(null);
    try { const r = await testStart({ open: mode === 'now' ? undefined : mode === 'open' }); setCallId(r.call_id); setLines([{ who: 'ai', text: r.say }]); } catch (e) { flash((e as Error).message); }
    setBusy(false);
  };
  const send = async (said: string) => {
    if (!callId || busy || !said.trim()) return;
    setText(''); setLines(l => [...l, { who: 'caller', text: said.trim() }]); setBusy(true);
    try {
      const r = await testTurn(callId, said.trim());
      setLines(l => [...l, { who: 'ai', text: r.say }, ...(r.next === 'transfer' ? [{ who: 'system' as const, text: `In a real call, ${r.to.join(' then ') || 'your team'} would now be connected.` }] : [])]);
      if (r.next !== 'listen') { setCallId(null); setResult(r.call); onDone(); }
    } catch (e) { flash((e as Error).message); }
    setBusy(false);
  };
  const hangUp = async () => { if (!callId) return; setBusy(true); try { const r = await testEnd(callId); setCallId(null); setResult(r.call); onDone(); } catch (e) { flash((e as Error).message); } setBusy(false); };
  return (
    <>
      <View style={s.card}>
        <Text style={s.bold}>Test call</Text>
        <Text style={s.small}>Talk to Nexora as a caller would. It answers from your knowledge base and settings, exactly as on your phone line.</Text>
        {!callId ? (
          <>
            <View style={[s.row, { gap: 6, flexWrap: 'wrap', marginTop: 8 }]}>
              <ChoiceChip on={mode === 'now'} label={`Real time (${info.open_now ? 'open' : 'closed'})`} onPress={() => setMode('now')} />
              <ChoiceChip on={mode === 'open'} label="Pretend open" onPress={() => setMode('open')} />
              <ChoiceChip on={mode === 'closed'} label="Pretend closed" onPress={() => setMode('closed')} />
            </View>
            <Pressable disabled={busy} onPress={start} style={[s.btn, { marginTop: 10 }]}>{busy ? <ActivityIndicator color="#FFF" /> : <Ionicons name="call-outline" size={18} color="#FFF" />}<Text style={s.btnText}>Start test call</Text></Pressable>
          </>
        ) : (
          <>
            <View style={{ backgroundColor: '#F5F7FA', borderRadius: 12, padding: 10, marginTop: 8, gap: 6 }}>
              {lines.map((l, i) => l.who === 'system' ? <Text key={i} style={[s.tiny, { textAlign: 'center' }]}>{l.text}</Text> : (
                <View key={i} style={{ alignSelf: l.who === 'caller' ? 'flex-end' : 'flex-start', maxWidth: '88%', backgroundColor: l.who === 'caller' ? '#1E56A0' : '#FFF', borderRadius: 12, padding: 9 }}>
                  <Text style={{ fontSize: 13.5, color: l.who === 'caller' ? '#FFF' : '#0B1220' }}>{l.text}</Text>
                </View>
              ))}
              {busy && <ActivityIndicator color="#1E56A0" />}
            </View>
            <View style={[s.row, { gap: 6, flexWrap: 'wrap', marginTop: 8 }]}>
              {['How much is the Oraimo headphone?', 'I want to speak to the manager', 'No recording please', 'That’s all, bye'].map(t => <ChoiceChip key={t} on={false} label={t} onPress={() => send(t)} />)}
            </View>
            <TextInput value={text} onChangeText={setText} placeholder="Say something as the caller" onSubmitEditing={() => send(text)} style={[s.input, { marginTop: 8 }]} />
            <View style={[s.row, { gap: 8, marginTop: 8 }]}>
              <Pressable onPress={() => send(text)} style={[s.btn, { flex: 1 }]}><Text style={s.btnText}>Say it</Text></Pressable>
              <Pressable onPress={hangUp} style={[s.btn, { flex: 1, backgroundColor: '#D64545' }]}><Text style={s.btnText}>Hang up</Text></Pressable>
            </View>
          </>
        )}
        {result && (
          <Pressable onPress={() => openCall(result)} style={{ marginTop: 10, backgroundColor: '#E6F4ED', borderRadius: 12, padding: 10 }}>
            <Text style={s.bold}>After the call, Nexora:</Text>
            <Text style={s.small}>• {result.summary}</Text>
            <Text style={s.small}>• Sorted it as {CATEGORY[result.category] ?? result.category} · {OUTCOME[result.outcome]?.label}</Text>
            {!!result.customer_id && <Text style={s.small}>• Saved the caller in Customers</Text>}
            {!!result.task_id && <Text style={s.small}>• Added a follow-up task to your schedule</Text>}
            {!!result.escalation_id && <Text style={s.small}>• Flagged it for you on Home</Text>}
            {!!result.follow_up_draft && <Text style={s.small}>• Drafted a follow-up message</Text>}
            <Text style={[s.link, { marginTop: 4 }]}>Open the call</Text>
          </Pressable>
        )}
      </View>
      <View style={s.card}>
        <Text style={s.bold}>Test a chat message</Text>
        <Text style={s.small}>See who answers a WhatsApp, Instagram or Messenger message. Nothing is sent.</Text>
        <TextInput value={chat.text} onChangeText={t => setChat({ ...chat, text: t })} placeholder="e.g. How much is delivery to Ibadan?" style={[s.input, { marginTop: 8 }]} />
        <View style={[s.row, { justifyContent: 'space-between', marginTop: 8 }]}><Text style={s.small}>Away mode on</Text><Switch value={chat.away} onValueChange={v => setChat({ ...chat, away: v })} /></View>
        <View style={[s.row, { justifyContent: 'space-between' }]}><Text style={s.small}>VIP customer</Text><Switch value={chat.vip} onValueChange={v => setChat({ ...chat, vip: v })} /></View>
        <Pressable disabled={busy} onPress={async () => { if (!chat.text.trim()) return; setBusy(true); try { setChatOut(await testChat({ text: chat.text, customer: 'Ada', away: chat.away, segments: chat.vip ? ['VIP'] : [] })); } catch (e) { flash((e as Error).message); } setBusy(false); }} style={[s.btn, { marginTop: 8 }]}>
          <Text style={s.btnText}>See what happens</Text></Pressable>
        {chatOut && (
          <View style={{ marginTop: 8, gap: 6 }}>
            <Text style={[s.bold, { color: chatOut.decision.handover ? '#B7791F' : chatOut.decision.ai ? '#1E9E6D' : '#0B1220' }]}>
              {chatOut.decision.handover ? 'A person takes over. ' : chatOut.decision.ai ? 'Nexora replies straight away. ' : chatOut.decision.draftOnly ? 'Nexora drafts a reply for you. ' : 'Nexora stays quiet. '}<Text style={s.small}>{chatOut.decision.reason}</Text>
            </Text>
            {!!chatOut.decision.autoMessage && <Text style={s.small}>Sent automatically: {chatOut.decision.autoMessage}</Text>}
            {!!chatOut.reply && <Text style={s.small}>{chatOut.decision.ai && !chatOut.decision.draftOnly ? 'Nexora’s reply: ' : 'Draft: '}{chatOut.reply}</Text>}
          </View>
        )}
      </View>
    </>
  );
}

function Settings({ info, setInfo, flash }: { info: ReceptionInfo; setInfo: (i: ReceptionInfo) => void; flash: (t: string) => void }) {
  const [st, setSt] = useState<ReceptionSettings>(info.settings);
  const [busy, setBusy] = useState(false);
  const [kw, setKw] = useState('');
  const dirty = useMemo(() => JSON.stringify(st) !== JSON.stringify(info.settings), [st, info.settings]);
  const can = info.can_edit;
  const set = <K extends keyof ReceptionSettings>(k: K, v: ReceptionSettings[K]) => setSt(x => ({ ...x, [k]: v }));
  const save = async () => { setBusy(true); try { const r = await saveReception(st); setInfo({ ...info, ...r, settings: r.settings }); setSt(r.settings); flash('Saved'); } catch (e) { flash((e as Error).message); } setBusy(false); };
  const Sw = ({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) => (
    <View style={[s.row, { justifyContent: 'space-between', marginTop: 8, gap: 10 }]}><Text style={[s.small, { flex: 1, color: '#0B1220' }]}>{label}</Text><Switch value={on} onValueChange={onChange} disabled={!can} /></View>
  );
  const hook = st.provider && info.webhooks ? (st.provider === 'twilio' ? info.webhooks.twilio : info.webhooks.africastalking) : '';
  return (
    <>
      {!can && <Text style={s.small}>Only the business owner can change these settings.</Text>}
      <View style={s.card}>
        <Text style={s.bold}>Phone line</Text>
        <Sw label="Nexora answers calls" on={st.phone_on} onChange={v => set('phone_on', v)} />
        <View style={[s.row, { gap: 6, flexWrap: 'wrap', marginTop: 8 }]}>
          {(Object.keys(PROVIDERS) as (keyof typeof PROVIDERS)[]).map(k => <ChoiceChip key={k} on={st.provider === k} label={PROVIDERS[k].name} onPress={() => can && set('provider', k)} />)}
        </View>
        {!!st.provider && <Text style={[s.tiny, { marginTop: 4 }]}>{PROVIDERS[st.provider].note}</Text>}
        <Text style={s.label}>Business phone number</Text>
        <TextInput editable={can} value={st.business_number} onChangeText={v => set('business_number', v)} placeholder="+234 …" style={s.input} />
        {!!hook && (
          <Pressable onPress={() => Share.share({ message: hook }).catch(() => {})} style={s.copy}>
            <Text style={[s.tiny, { flex: 1 }]} numberOfLines={1}>{hook}</Text><Text style={s.link}>Share</Text>
          </Pressable>
        )}
        {!!hook && <Text style={[s.tiny, { marginTop: 4 }]}>Paste this address as the {st.provider === 'twilio' ? '“A call comes in” webhook (POST)' : 'number’s Callback URL'} in {PROVIDERS[st.provider as 'twilio'].name}. Full steps are on the website’s AI Reception page.</Text>}
        <Text style={s.label}>Greeting</Text>
        <TextInput editable={can} value={st.greeting} onChangeText={v => set('greeting', v)} multiline style={[s.input, { minHeight: 64, paddingTop: 10 }]} />
      </View>
      <View style={s.card}>
        <Text style={s.bold}>Opening hours</Text>
        <Text style={s.tiny}>{info.hours_text}</Text>
        {[1, 2, 3, 4, 5, 6, 0].map(d => {
          const day = st.hours.days[d];
          const upd = (p: Partial<typeof day>) => set('hours', { ...st.hours, days: st.hours.days.map((x, i) => (i === d ? { ...x, ...p } : x)) });
          return (
            <View key={d} style={[s.row, { gap: 8, marginTop: 6 }]}>
              <Text style={[s.small, { width: 86, color: '#0B1220' }]}>{DAY_NAMES[d]}</Text>
              <Switch value={day.open} onValueChange={v => upd({ open: v })} disabled={!can} />
              {day.open ? <>
                <TextInput editable={can} value={day.from} onChangeText={v => upd({ from: v })} style={[s.input, { width: 72, minHeight: 36 }]} />
                <Text style={s.tiny}>to</Text>
                <TextInput editable={can} value={day.to} onChangeText={v => upd({ to: v })} style={[s.input, { width: 72, minHeight: 36 }]} />
              </> : <Text style={s.tiny}>Closed</Text>}
            </View>
          );
        })}
      </View>
      <View style={s.card}>
        <Text style={s.bold}>Passing calls to your team</Text>
        <View style={[s.row, { gap: 6, flexWrap: 'wrap', marginTop: 8 }]}>
          <ChoiceChip on={st.routing.mode === 'ai_first'} label="Nexora answers every call" onPress={() => can && set('routing', { ...st.routing, mode: 'ai_first' })} />
          <ChoiceChip on={st.routing.mode !== 'ai_first'} label="Ring my team first in opening hours" onPress={() => can && set('routing', { ...st.routing, mode: 'team_first' })} />
        </View>
        {st.routing.team.map((m, i) => (
          <View key={i} style={[s.row, { gap: 6, marginTop: 8 }]}>
            <TextInput editable={can} value={m.name} onChangeText={v => set('routing', { ...st.routing, team: st.routing.team.map((x, j) => (j === i ? { ...x, name: v } : x)) })} placeholder="Name" style={[s.input, { flex: 1 }]} />
            <TextInput editable={can} value={m.phone} onChangeText={v => set('routing', { ...st.routing, team: st.routing.team.map((x, j) => (j === i ? { ...x, phone: v } : x)) })} placeholder="Phone" keyboardType="phone-pad" style={[s.input, { flex: 1 }]} />
            <Pressable disabled={!can} onPress={() => set('routing', { ...st.routing, team: st.routing.team.filter((_, j) => j !== i) })}><Ionicons name="trash-outline" size={20} color="#D64545" /></Pressable>
          </View>
        ))}
        {can && st.routing.team.length < 6 && <Pressable onPress={() => set('routing', { ...st.routing, team: [...st.routing.team, { name: '', phone: '' }] })}><Text style={[s.link, { marginTop: 8 }]}>+ Add a person</Text></Pressable>}
        <Sw label="Connect urgent callers too, not only when they ask" on={st.routing.transfer_when === 'asked_or_urgent'} onChange={v => set('routing', { ...st.routing, transfer_when: v ? 'asked_or_urgent' : 'asked' })} />
        <Sw label="Connect callers outside opening hours" on={st.routing.transfer_outside_hours} onChange={v => set('routing', { ...st.routing, transfer_outside_hours: v })} />
      </View>
      <View style={s.card}>
        <Text style={s.bold}>When a person takes over</Text>
        <View style={[s.row, { gap: 6, flexWrap: 'wrap', marginTop: 8 }]}>
          {st.escalation.keywords.map(k => <ChoiceChip key={k} on label={`${k}  ×`} onPress={() => can && set('escalation', { ...st.escalation, keywords: st.escalation.keywords.filter(x => x !== k) })} />)}
        </View>
        <TextInput editable={can} value={kw} onChangeText={setKw} placeholder="Add a handover word" onSubmitEditing={() => { const k = kw.trim().toLowerCase(); if (k && !st.escalation.keywords.includes(k)) set('escalation', { ...st.escalation, keywords: [...st.escalation.keywords, k] }); setKw(''); }} style={[s.input, { marginTop: 8 }]} />
        <Sw label="Unhappy customers" on={st.escalation.negative_sentiment} onChange={v => set('escalation', { ...st.escalation, negative_sentiment: v })} />
        <Sw label="Complaints" on={st.escalation.complaints} onChange={v => set('escalation', { ...st.escalation, complaints: v })} />
        <Sw label="VIP customers always get a person" on={st.escalation.vip_segments.length > 0} onChange={v => set('escalation', { ...st.escalation, vip_segments: v ? ['VIP'] : [] })} />
      </View>
      <View style={s.card}>
        <Text style={s.bold}>Chats</Text>
        <View style={[s.row, { gap: 6, flexWrap: 'wrap', marginTop: 8 }]}>
          <ChoiceChip on={st.chat.mode === 'away'} label="Only when Away is on" onPress={() => can && set('chat', { ...st.chat, mode: 'away' })} />
          <ChoiceChip on={st.chat.mode === 'outside_hours'} label="Outside opening hours" onPress={() => can && set('chat', { ...st.chat, mode: 'outside_hours' })} />
          <ChoiceChip on={st.chat.mode === 'always'} label="All the time" onPress={() => can && set('chat', { ...st.chat, mode: 'always' })} />
        </View>
        <Sw label="After you take over a chat, Nexora stays quiet in it" on={st.chat.handover_pause_ai} onChange={v => set('chat', { ...st.chat, handover_pause_ai: v })} />
        <Sw label="Send the after-hours message" on={st.chat.after_hours_message} onChange={v => set('chat', { ...st.chat, after_hours_message: v })} />
      </View>
      <View style={s.card}>
        <Text style={s.bold}>After calls, consent and privacy</Text>
        <Sw label="Create a follow-up task when someone needs a callback" on={st.follow_up.create_task} onChange={v => set('follow_up', { ...st.follow_up, create_task: v })} />
        <Sw label="Draft a follow-up WhatsApp message" on={st.follow_up.draft_message} onChange={v => set('follow_up', { ...st.follow_up, draft_message: v })} />
        <Sw label="Keep call transcripts (callers can say “no recording”)" on={st.consent.record} onChange={v => set('consent', { ...st.consent, record: v })} />
        <Text style={[s.tiny, { marginTop: 6 }]}>Nexora always tells callers they’re speaking with an AI assistant. Callers who say “don’t call me again” go on your do-not-contact list. Message templates and the full do-not-contact list are on the website’s AI Reception page.</Text>
      </View>
      {can && <Pressable disabled={!dirty || busy} onPress={save} style={[s.btn, (!dirty || busy) && { backgroundColor: '#A5AFBB' }]}>{busy ? <ActivityIndicator color="#FFF" /> : <Ionicons name="checkmark-circle" size={18} color="#FFF" />}<Text style={s.btnText}>{dirty ? 'Save changes' : 'Saved'}</Text></Pressable>}
    </>
  );
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
});
