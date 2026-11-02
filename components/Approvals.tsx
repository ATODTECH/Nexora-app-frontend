import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, TextInput } from '../lib/inter';
import { STATUS_COLORS, STATUS_TEXT, decideApproval, isWaiting, loadApprovals, withdrawApproval, type Approval, type ApprovalKind } from '../lib/approvals';

// Approvals: requests from the team (refunds, cancellations, stock corrections, campaign posts, bulk messages).
// Approvers (the owner and anyone with "Approve team requests") decide; everyone else sees what they asked for.
// Same as the website's /approvals.
type CallFn = (name: string, body: Record<string, unknown>, ms?: number) => Promise<any>;
const ICON: Record<ApprovalKind, keyof typeof Ionicons.glyphMap> = {
  order_cancel: 'bag-handle-outline', refund: 'return-down-back-outline', stock_correct: 'cube-outline', campaign_post: 'megaphone-outline', bulk_message: 'chatbubbles-outline',
};
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};
const daysLeft = (iso: string) => Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));

export function Approvals({ userId, approver, isOwner, callFn, flash, onBack, onOpenRules, topInset = 0 }: {
  userId: string; approver: boolean; isOwner: boolean; callFn: CallFn; flash: (t: string) => void; onBack: () => void; onOpenRules: () => void; topInset?: number;
}) {
  const [tab, setTab] = useState<'waiting' | 'history'>('waiting');
  const [rows, setRows] = useState<Approval[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { loadApprovals(tab === 'waiting').then(r => { setRows(r); setError(''); }, e => setError((e as Error).message)); }, [tab]);
  useEffect(() => { setRows(null); load(); }, [load]);
  const done = (text: string) => { flash(text); load(); };

  return (
    <View style={s.screen}>
      <View style={[s.header, { paddingTop: topInset + 12 }]}>
        <Pressable onPress={onBack} hitSlop={8} accessibilityLabel="Back"><Ionicons name="chevron-back" size={24} color="#0B1220" /></Pressable>
        <Text style={s.headerTitle}>Approvals</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={s.muted}>
          {approver ? 'Requests from your team. Approving carries the action out straight away and tells them; rejecting tells them why.'
            : 'Things you asked to be approved. You get a notification when they’re decided.'}
          {isOwner && <Text style={{ color: '#1E56A0', fontWeight: '600' }} onPress={onOpenRules}> Choose what needs approval.</Text>}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          {(['waiting', 'history'] as const).map(t => (
            <Pressable key={t} onPress={() => setTab(t)} style={[s.chip, tab === t && s.chipOn]} accessibilityState={{ selected: tab === t }}>
              <Text style={[s.chipText, tab === t && { color: '#FFF' }]}>{t === 'waiting' ? 'Waiting' : 'History'}</Text>
            </Pressable>
          ))}
        </View>
        {error ? <Text style={[s.muted, { color: '#B42318', marginTop: 16 }]}>{error}</Text>
          : !rows ? <ActivityIndicator color="#1E56A0" style={{ marginTop: 24 }} />
          : !rows.length ? (
            <View style={{ alignItems: 'center', marginTop: 40 }}>
              <Ionicons name="shield-checkmark-outline" size={36} color="#A5AFBB" />
              <Text style={[s.muted, { marginTop: 8 }]}>{tab === 'waiting' ? (approver ? 'Nothing is waiting for you.' : 'You have no requests waiting.') : 'No decisions yet.'}</Text>
            </View>
          ) : rows.map(a => <Request key={a.id} a={a} mine={a.requested_by === userId} approver={approver} callFn={callFn} onDone={done} />)}
      </ScrollView>
    </View>
  );
}

function Request({ a, mine, approver, callFn, onDone }: { a: Approval; mine: boolean; approver: boolean; callFn: CallFn; onDone: (text: string) => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'' | 'yes' | 'no' | 'withdraw'>('');
  const [err, setErr] = useState('');
  const waiting = isWaiting(a);
  const status = a.status === 'pending' && !waiting ? 'expired' : a.status;
  const decide = async (approve: boolean) => {
    if (!approve && !note.trim()) { setErr('Say why, so they know what to do instead.'); return; }
    setBusy(approve ? 'yes' : 'no'); setErr('');
    try {
      const r = await decideApproval(a, approve, note, callFn);
      onDone(!approve ? 'Rejected. They’ve been told.' : r.sent ?? (r.approval.status === 'not_needed' ? 'Nothing to do: it had already changed.' : 'Approved and done.'));
    } catch (e) { setErr((e as Error).message); setBusy(''); }
  };
  const withdraw = async () => {
    setBusy('withdraw'); setErr('');
    try { await withdrawApproval(a.id); onDone('Request withdrawn.'); } catch (e) { setErr((e as Error).message); setBusy(''); }
  };
  const d = daysLeft(a.expires_at);
  return (
    <View style={s.card}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={s.icon}><Ionicons name={ICON[a.kind]} size={18} color="#1E56A0" /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{a.title}</Text>
          <View style={[s.pill, { backgroundColor: STATUS_COLORS[status].bg }]}><Text style={[s.pillText, { color: STATUS_COLORS[status].fg }]}>{STATUS_TEXT[status]}</Text></View>
          {!!a.detail && <Text style={[s.detail, a.kind === 'bulk_message' && s.quoteBox]}>{a.detail}</Text>}
          {!!a.reason && <Text style={s.reason}>“{a.reason}”</Text>}
          <Text style={s.meta}>{mine ? 'You' : a.requester_name} · {ago(a.created_at)}{waiting ? ` · expires in ${d} day${d === 1 ? '' : 's'}` : ''}</Text>
          {!!a.decider_name && (
            <Text style={s.meta}>{a.status === 'rejected' ? 'Rejected' : 'Approved'} by {a.decider_name}{a.decision_note ? `: “${a.decision_note}”` : ''}
              {a.kind === 'bulk_message' && a.result?.sent != null ? ` · sent to ${a.result.sent}${a.result.failed ? `, ${a.result.failed} not sent` : ''}` : ''}</Text>
          )}
          {a.status === 'not_needed' && <Text style={s.meta}>It had already changed, so nothing was done.</Text>}
        </View>
      </View>
      {waiting && approver && !mine && (
        <View style={{ marginTop: 12 }}>
          <TextInput value={note} onChangeText={setNote} maxLength={300} placeholder="Note for them (needed if you reject)" placeholderTextColor="#A5AFBB" style={s.input} accessibilityLabel="Note" />
          {!!err && <Text style={s.error} accessibilityRole="alert">{err}</Text>}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Pressable disabled={!!busy} onPress={() => { decide(false).catch(() => {}); }} style={[s.btn, s.btnReject]}>
              {busy === 'no' ? <ActivityIndicator color="#B42318" /> : <Text style={[s.btnText, { color: '#B42318' }]}>Reject</Text>}
            </Pressable>
            <Pressable disabled={!!busy} onPress={() => { decide(true).catch(() => {}); }} style={[s.btn, s.btnApprove]}>
              {busy === 'yes' ? <ActivityIndicator color="#FFF" /> : <Text style={[s.btnText, { color: '#FFF' }]}>Approve</Text>}
            </Pressable>
          </View>
        </View>
      )}
      {waiting && mine && (
        <View style={{ marginTop: 12 }}>
          {!!err && <Text style={s.error} accessibilityRole="alert">{err}</Text>}
          <Pressable disabled={!!busy} onPress={() => { withdraw().catch(() => {}); }} style={s.withdraw}>
            {busy === 'withdraw' ? <ActivityIndicator color="#0B1220" /> : <Text style={{ fontSize: 13, fontWeight: '600', color: '#0B1220' }}>Withdraw request</Text>}
          </Pressable>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F6F8' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, backgroundColor: '#FFFFFF' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#0B1220' },
  muted: { fontSize: 14, color: '#5C6B7A', lineHeight: 20 },
  chip: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 7, backgroundColor: '#FFFFFF' },
  chipOn: { backgroundColor: '#0F2942' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#5C6B7A' },
  card: { marginTop: 12, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E6ECF3', padding: 16 },
  icon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#EAF1FB', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '600', color: '#0B1220' },
  pill: { alignSelf: 'flex-start', marginTop: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { fontSize: 11, fontWeight: '600' },
  detail: { marginTop: 4, fontSize: 13, color: '#4B5563' },
  quoteBox: { backgroundColor: '#F3F5F8', borderRadius: 8, padding: 10 },
  reason: { marginTop: 6, fontSize: 13, fontStyle: 'italic', color: '#5C6B7A' },
  meta: { marginTop: 6, fontSize: 12, color: '#8A97A6' },
  input: { height: 42, borderWidth: 1, borderColor: '#D5DEE8', borderRadius: 12, paddingHorizontal: 12, fontSize: 14, color: '#0B1220' },
  error: { marginTop: 6, fontSize: 13, color: '#B42318' },
  btn: { flex: 1, height: 42, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  btnReject: { borderWidth: 1, borderColor: '#F2C4C4' },
  btnApprove: { backgroundColor: '#1E56A0' },
  btnText: { fontSize: 14, fontWeight: '700' },
  withdraw: { alignSelf: 'flex-start', height: 36, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: '#D5DEE8', alignItems: 'center', justifyContent: 'center' },
});
