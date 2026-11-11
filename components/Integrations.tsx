import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, TextInput } from '../lib/inter';
import {
  EVENTS, RUN_STATUS, SEGMENTS, STEPS, TEAM_ROLES, TEMPLATES, TRIGGERS, createWebhook, decideRun, deleteWebhook, deleteWorkflow, describeStep, describeWorkflow,
  loadRuns, loadStatus, loadWebhooks, loadWorkflows, resendDelivery, retryRun, rotateSecret, saveAnalytics, saveWorkflow, sendDraftLink, setPaused, setWorkflowOn,
  stepInfo, stepsOf, testWebhook, triggerLabel, updateWebhook,
  type Delivery, type Run, type Status, type Step, type StepType, type Webhook, type WebhookEvent, type Workflow, type WorkflowForm,
} from '../lib/integrations';
import { loadRoles } from '../lib/workspace';

// Capability 2.15 in the app: the Integrations and Automation Centre. Same data and rules as the website's /integrations page:
// Connections (everything connected, with where to change it), Workflows (several steps, on/off, Pause all, templates),
// Approvals (higher-risk steps and drafted messages), History (step by step, errors, Try again) and Webhooks (signed, retried).
const BLUE = '#1E56A0', INK = '#0B1220', MUTED = '#5C6B7A', LINE = '#E3E8EF', RED = '#B42318', GREEN = '#127A4B', AMBER = '#B54708';
type Tab = 'connections' | 'workflows' | 'approvals' | 'history' | 'webhooks';
type Links = { onOpenConnect: () => void; onOpenSocial: () => void; onOpenWebsites: () => void; onOpenShop: () => void; onOpenReception: () => void; onOpenApprovals: () => void; onOpenTeam: () => void };
const ago = (iso: string | null) => {
  if (!iso) return '';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 0) return -m < 60 ? `in ${-m} min` : `in ${Math.round(-m / 60)} h`;
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

function Btn({ label, onPress, kind = 'primary', busy, icon, flex, disabled }: { label: string; onPress: () => void; kind?: 'primary' | 'outline' | 'danger'; busy?: boolean; icon?: keyof typeof Ionicons.glyphMap; flex?: boolean; disabled?: boolean }) {
  const color = kind === 'primary' ? '#FFFFFF' : kind === 'danger' ? RED : BLUE;
  return (
    <Pressable disabled={busy || disabled} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={[s.btn, kind === 'primary' ? { backgroundColor: BLUE } : kind === 'danger' ? { borderWidth: 1, borderColor: '#F3B8B2', backgroundColor: '#FDECEC' } : { borderWidth: 1, borderColor: '#9DB8DD', backgroundColor: '#FFF' }, flex && { flex: 1 }, (busy || disabled) && { opacity: 0.55 }]}>
      {busy ? <ActivityIndicator color={color} /> : <>{!!icon && <Ionicons name={icon} size={16} color={color} />}<Text style={[s.btnText, { color }]}>{label}</Text></>}
    </Pressable>
  );
}
const Chip = ({ on, label, onPress, disabled }: { on: boolean; label: string; onPress: () => void; disabled?: boolean }) => (
  <Pressable disabled={disabled} onPress={onPress} accessibilityState={{ selected: on, disabled }} style={[s.chip, on && { backgroundColor: BLUE }, disabled && { opacity: 0.4 }]}><Text style={[s.chipText, on && { color: '#FFF' }]}>{label}</Text></Pressable>
);
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.backdrop}>
        <View style={s.sheet}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <Text style={[s.title, { flex: 1 }]} numberOfLines={2}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close"><Ionicons name="close" size={24} color={INK} /></Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const Field = ({ label, ...p }: { label: string } & React.ComponentProps<typeof TextInput>) => (
  <View style={{ marginTop: 10 }}><Text style={s.label}>{label}</Text><TextInput placeholderTextColor="#98A2B3" {...p} style={[s.input, p.multiline && { minHeight: 70, textAlignVertical: 'top', paddingTop: 10 }]} /></View>
);

export function Integrations({ me, isOwner, flash, links, onBack, topInset = 0 }: { me: string; isOwner: boolean; flash: (t: string) => void; links: Links; onBack: () => void; topInset?: number }) {
  const [tab, setTab] = useState<Tab>('connections');
  const [status, setStatus] = useState<Status | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[] | null>(null);
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [hooks, setHooks] = useState<{ hooks: Webhook[]; deliveries: Delivery[] } | null>(null);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    try {
      const st = await loadStatus(); setStatus(st); setError('');
      if (st.is_owner) { const [w, r, h] = await Promise.all([loadWorkflows(), loadRuns(), loadWebhooks()]); setWorkflows(w); setRuns(r); setHooks(h); }
    } catch (e: any) { setError(e?.message || "Couldn't load."); }
  }, []);
  useEffect(() => { reload(); const t = setInterval(reload, 30000); return () => clearInterval(t); }, [reload]);
  const owner = isOwner && !!status?.is_owner;
  const waiting = (runs ?? []).filter(r => r.status === 'awaiting_approval');
  const failed = (runs ?? []).filter(r => r.status === 'failed');
  const tabs: [Tab, string][] = owner
    ? [['connections', 'Connections'], ['workflows', `Workflows (${(workflows ?? []).length})`], ['approvals', `Approvals (${waiting.length})`], ['history', failed.length ? `History (${failed.length} failed)` : 'History'], ['webhooks', `Webhooks (${hooks?.hooks.length ?? 0})`]]
    : [['connections', 'Connections']];
  const props = { me, flash, reload };
  return (
    <View style={{ flex: 1, backgroundColor: '#F7F9FC' }}>
      <View style={[s.header, { paddingTop: topInset + 12 }]}>
        <Pressable onPress={onBack} hitSlop={8} accessibilityLabel="Back"><Ionicons name="chevron-back" size={24} color={INK} /></Pressable>
        <Text style={s.title}>Integrations and automation</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 48, width: '100%', maxWidth: 900, alignSelf: 'center' }}>
        <Text style={s.muted}>Everything Nexora is connected to, and the workflows that run by themselves. Higher-risk steps always wait for {owner ? 'your' : 'the owner’s'} approval.</Text>
        {owner && status?.paused && (
          <View style={[s.card, { borderColor: '#FEDF89', backgroundColor: '#FFFAEB' }]}>
            <Text style={[s.bodyBold, { color: AMBER }]}>All workflows are paused. Nothing runs until you resume them.</Text>
            <View style={s.wrap}><Btn label="Resume all" icon="play-circle-outline" onPress={() => setPaused(false).then(() => { flash('Workflows resumed'); reload(); }, (e: any) => flash(e?.message))} /></View>
          </View>
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 10 }}>
          {tabs.map(([k, l]) => <Chip key={k} on={tab === k} label={l} onPress={() => setTab(k)} />)}
        </ScrollView>
        {!!error && <Text style={[s.body, { color: RED }]}>{error}</Text>}
        {!status && !error ? <ActivityIndicator color={BLUE} style={{ marginTop: 20 }} /> : status && (
          <>
            {tab === 'connections' && <Connections st={status} owner={owner} links={links} go={setTab} {...props} />}
            {tab === 'workflows' && owner && <Workflows list={workflows} paused={status.paused} links={links} {...props} />}
            {tab === 'approvals' && owner && <Approvals runs={waiting} workflows={workflows ?? []} {...props} />}
            {tab === 'history' && owner && <History runs={runs} workflows={workflows ?? []} {...props} />}
            {tab === 'webhooks' && owner && <Webhooks data={hooks} links={links} {...props} />}
          </>
        )}
      </ScrollView>
    </View>
  );
}
type P = { me: string; flash: (t: string) => void; reload: () => Promise<void> };

// ---------- Connections ----------
type Row = { name: string; ok: boolean | null; detail: string };
function Group({ icon, title, rows, onPress, action, children }: { icon: keyof typeof Ionicons.glyphMap; title: string; rows: Row[]; onPress?: () => void; action?: string; children?: React.ReactNode }) {
  const n = rows.filter(r => r.ok !== false).length;
  return (
    <View style={s.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={s.icon}><Ionicons name={icon} size={18} color={BLUE} /></View>
        <Text style={[s.bodyBold, { flex: 1 }]}>{title}</Text>
        <Text style={[s.small, { color: n ? GREEN : MUTED, fontWeight: '700' }]}>{n} of {rows.length} connected</Text>
      </View>
      {rows.map(r => (
        <View key={r.name} style={s.row}>
          <Ionicons name={r.ok ? 'checkmark-circle' : r.ok === false ? 'close-circle-outline' : 'alert-circle-outline'} size={18} color={r.ok ? GREEN : r.ok === false ? '#98A2B3' : AMBER} />
          <View style={{ flex: 1 }}><Text style={s.bodyBold}>{r.name}</Text><Text style={s.small}>{r.detail}</Text></View>
        </View>
      ))}
      {children}
      {!!onPress && <View style={s.wrap}><Btn label={action ?? 'Manage'} kind="outline" icon="chevron-forward" onPress={onPress} /></View>}
    </View>
  );
}
function Connections({ st, owner, links, go, flash, reload }: { st: Status; owner: boolean; links: Links; go: (t: Tab) => void } & P) {
  const msg = (k: string) => st.messaging.find(m => m.key === k);
  const soc = (p: string, name: string): Row => { const a = st.social.filter(x => x.platform === p); const ok = a.filter(x => x.status === 'connected'); return { name, ok: ok.length ? true : a.length ? null : false, detail: ok.length ? ok.map(x => x.name || x.handle).join(', ') : a.length ? a[0].note || 'Needs to be connected again' : 'Not connected' }; };
  const m = (k: string, name: string): Row => ({ name, ok: !!msg(k)?.connected, detail: msg(k)?.connected ? msg(k)?.handle || 'Connected' : 'Not connected' });
  const shop = st.shop;
  const [ga, setGa] = useState(st.analytics.ga_id);
  const [px, setPx] = useState(st.analytics.meta_pixel_id);
  const [busy, setBusy] = useState(false);
  return (
    <View>
      {owner && (
        <View style={[s.wrap, { marginTop: 0 }]}>
          {([['Workflows on', st.automations.on, `of ${st.automations.total}`, 'workflows', false], ['Waiting for approval', st.automations.waiting, 'runs', 'approvals', st.automations.waiting > 0],
            ['Failed in 7 days', st.automations.failed_7d, 'runs', 'history', st.automations.failed_7d > 0], ['Webhooks on', st.webhooks.on, `of ${st.webhooks.total}`, 'webhooks', st.webhooks.failing > 0]] as [string, number, string, Tab, boolean][]).map(([l, n, sub, t, warn]) => (
            <Pressable key={l} onPress={() => go(t)} style={s.tile}><Text style={[s.big, warn && { color: AMBER }]}>{n}</Text><Text style={s.bodyBold}>{l}</Text><Text style={s.small}>{sub}</Text></Pressable>
          ))}
        </View>
      )}
      {!owner && <View style={s.card}><Text style={s.muted}>You can see what is connected. Only the owner can change workflows, approvals and webhooks.</Text></View>}
      <Group icon="chatbubbles-outline" title="Messaging" onPress={links.onOpenConnect} action="Connect apps" rows={[m('whatsapp', 'WhatsApp'), m('instagram', 'Instagram messages'), m('facebook', 'Facebook Messenger'), m('email', 'Email')]} />
      <Group icon="share-social-outline" title="Social media" onPress={links.onOpenSocial} action="Social posts" rows={[soc('facebook', 'Facebook pages'), soc('instagram', 'Instagram'), soc('tiktok', 'TikTok'), soc('linkedin', 'LinkedIn')]} />
      <Group icon="globe-outline" title="Websites and online stores" onPress={links.onOpenWebsites} action="Websites" rows={st.websites.length ? st.websites.map(w => ({
        name: `${w.name || w.url} (${w.platform === 'custom' ? 'own website' : w.platform})`, ok: w.status === 'active' && !w.last_error ? true : w.status === 'active' ? null : false,
        detail: `${w.method === 'api' ? 'API key' : w.method === 'webhook' ? 'Webhooks' : w.method} · ${w.events} event${w.events === 1 ? '' : 's'} received${w.last_event_at ? `, last ${ago(w.last_event_at)}` : ''}${w.last_error ? ` · last error: ${w.last_error}` : ''}`,
      })) : [{ name: 'WordPress, WooCommerce, Shopify, Wix or your own site', ok: false, detail: 'Not connected' }]} />
      <Group icon="qr-code-outline" title="AI shop link" onPress={links.onOpenShop} action="Shop settings" rows={[{ name: shop ? `Shop link /${shop.slug}` : 'Shop link', ok: shop ? shop.enabled : false, detail: shop ? `${shop.enabled ? 'Live' : 'Switched off'} · ${shop.views} visits · ${shop.orders} orders` : 'Not set up yet' }]} />
      <Group icon="card-outline" title="Payments" onPress={links.onOpenShop} action="Payment settings" rows={[
        { name: 'Paystack (card, transfer, USSD)', ok: st.payments.paystack, detail: st.payments.paystack ? `Connected · ${st.payments.paystack_mode === 'test' ? 'test mode (no real money)' : 'live'}` : 'Not connected' },
        { name: 'Payment link', ok: st.payments.pay_link, detail: st.payments.pay_link ? 'Added to your shop' : 'Not added' },
        { name: 'Bank transfer details', ok: st.payments.bank, detail: st.payments.bank ? 'Shown to customers' : 'Not added' },
        { name: 'Pay on delivery', ok: st.payments.pay_on_delivery, detail: st.payments.pay_on_delivery ? 'On' : 'Off' },
      ]} />
      <Group icon="call-outline" title="Phone calls" onPress={links.onOpenReception} action="Calls and chats" rows={[{ name: st.telephony.provider === 'twilio' ? 'Twilio' : st.telephony.provider === 'africastalking' ? "Africa's Talking" : "Africa's Talking or Twilio", ok: st.telephony.on && !!st.telephony.provider,
        detail: st.telephony.on && st.telephony.provider ? `Nexora answers ${st.telephony.number || 'your number'} · ${st.telephony.calls_30d} calls in 30 days` : 'Not switched on' }]} />
      <Group icon="bar-chart-outline" title="Analytics" rows={[
        { name: 'Google Analytics 4 on your shop link', ok: !!st.analytics.ga_id, detail: st.analytics.ga_id || 'Not added' },
        { name: 'Meta Pixel on your shop link', ok: !!st.analytics.meta_pixel_id, detail: st.analytics.meta_pixel_id || 'Not added' },
        { name: 'Nexora website stats', ok: st.websites.length > 0, detail: st.websites.length ? `${st.analytics.site_views_30d} page view${st.analytics.site_views_30d === 1 ? '' : 's'} in 30 days` : 'Connect a website to count its visits' },
      ]}>
        {owner && !!shop && (
          <View>
            <Field label="Google Analytics measurement ID" value={ga} onChangeText={v => setGa(v.toUpperCase())} placeholder="G-XXXXXXXXXX" autoCapitalize="characters" />
            <Field label="Meta Pixel ID" value={px} onChangeText={v => setPx(v.replace(/\D/g, ''))} placeholder="Numbers only" keyboardType="number-pad" />
            <View style={s.wrap}><Btn label="Save analytics" busy={busy} onPress={async () => { setBusy(true); try { await saveAnalytics(ga, px); flash('Analytics saved'); await reload(); } catch (e: any) { flash(e?.message); } setBusy(false); }} /></View>
          </View>
        )}
      </Group>
      <Group icon="code-slash-outline" title="Webhooks and API" onPress={owner ? () => go('webhooks') : undefined} action="Webhooks" rows={[
        { name: 'Outgoing webhooks', ok: st.webhooks.on > 0 ? (st.webhooks.failing ? null : true) : false, detail: st.webhooks.total ? `${st.webhooks.on} on of ${st.webhooks.total}${st.webhooks.failing ? `, ${st.webhooks.failing} with errors` : ''}` : 'Send new orders, payments and leads to your own systems' },
        { name: 'API keys for your website', ok: st.websites.some(w => w.method === 'api'), detail: st.websites.some(w => w.method === 'api') ? 'In use' : 'Your website or app can send orders and enquiries to Nexora' },
      ]} />
    </View>
  );
}

// ---------- Workflows ----------
const blank = (): WorkflowForm => ({ name: '', description: '', trigger: 'order_new', trigger_days: 1, steps: [{ type: 'notify' }], max_retries: 3 });
function Workflows({ list, paused, me, flash, reload, links }: { list: Workflow[] | null; paused: boolean; links: Links } & P) {
  const [edit, setEdit] = useState<{ id?: string; f: WorkflowForm } | null>(null);
  return (
    <View>
      <Text style={s.muted}>Nexora checks every 2 minutes and handles each order, lead or enquiry once per workflow. A failing step is tried again; a workflow that fails 5 times in a row switches itself off.</Text>
      <View style={s.wrap}>
        <Btn label="New workflow" icon="add" onPress={() => setEdit({ f: blank() })} />
        {!paused && <Btn label="Pause all" kind="outline" icon="pause-circle-outline" onPress={() => setPaused(true).then(() => { flash('All workflows paused'); reload(); }, (e: any) => flash(e?.message))} />}
      </View>
      {list === null ? <ActivityIndicator color={BLUE} style={{ marginTop: 20 }} /> : !list.length ? <View style={s.card}><Text style={s.muted}>No workflows yet. Start from one below.</Text></View> : list.map(w => (
        <View key={w.id} style={s.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={[s.bodyBold, { flex: 1 }]}>{w.name}</Text>
            <Switch value={w.enabled} onValueChange={v => setWorkflowOn(w.id, v).then(() => { flash(v ? 'Workflow on' : 'Workflow off'); reload(); }, (e: any) => flash(e?.message))} accessibilityLabel={`${w.name} on`} />
          </View>
          <Text style={s.small}>WHEN {triggerLabel(w.trigger)}{TRIGGERS.find(t => t.k === w.trigger)?.days ? ` ${w.trigger_days} days` : ''}</Text>
          {stepsOf(w).map((st, i) => <Text key={i} style={s.body}>{i + 1}. {describeStep(st).replace(/^./, c => c.toUpperCase())}{st.approval || stepInfo(st.type)?.risky ? ' (asks you first)' : ''}</Text>)}
          {!!w.paused_reason && <Text style={[s.small, { color: RED }]}>{w.paused_reason}</Text>}
          {!w.paused_reason && w.failures > 0 && <Text style={[s.small, { color: AMBER }]}>{w.failures} failed runs in a row. Last error: {w.last_error}</Text>}
          <Text style={s.small}>{w.runs} runs{w.last_run_at ? ` · checked ${ago(w.last_run_at)}` : ''}</Text>
          <View style={s.wrap}>
            <Btn label="Edit" kind="outline" onPress={() => setEdit({ id: w.id, f: { name: w.name, description: w.description, trigger: w.trigger, trigger_days: w.trigger_days, steps: stepsOf(w), max_retries: w.max_retries } })} />
            <Btn label="Delete" kind="danger" onPress={() => deleteWorkflow(w.id).then(() => { flash('Workflow deleted'); reload(); }, (e: any) => flash(e?.message))} />
          </View>
        </View>
      ))}
      <Text style={[s.label, { marginTop: 16 }]}>START FROM A TEMPLATE</Text>
      {TEMPLATES.map(t => <Pressable key={t.name} onPress={() => setEdit({ f: { ...t, steps: t.steps.map(x => ({ ...x })) } })} style={s.card}><Text style={s.bodyBold}>{t.name}</Text><Text style={s.small}>{t.description}</Text></Pressable>)}
      <Pressable onPress={links.onOpenTeam} style={{ marginTop: 10 }}><Text style={s.link}>Team task workflows are in Team workspace → Workflows ›</Text></Pressable>
      {edit && <Editor init={edit.f} isNew={!edit.id} onClose={() => setEdit(null)} onSave={async f => { await saveWorkflow(me, f, edit.id); flash(edit.id ? 'Workflow saved' : 'Workflow on'); setEdit(null); await reload(); }} />}
    </View>
  );
}
function Editor({ init, isNew, onClose, onSave }: { init: WorkflowForm; isNew: boolean; onClose: () => void; onSave: (f: WorkflowForm) => Promise<void> }) {
  const [f, setF] = useState<WorkflowForm>(init);
  const [ownRoles, setOwnRoles] = useState<string[]>([]);
  useEffect(() => { loadRoles().then(r => setOwnRoles(r.map(x => x.name)), () => {}); }, []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const record = TRIGGERS.find(t => t.k === f.trigger)?.record;
  const setStep = (i: number, p: Partial<Step>) => setF({ ...f, steps: f.steps.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const move = (i: number, d: number) => { const a = [...f.steps]; const [x] = a.splice(i, 1); a.splice(i + d, 0, x); setF({ ...f, steps: a }); };
  const fits = (k: StepType) => { const n = stepInfo(k)?.needs; return !n || n === record || (n === 'customer' && (record === 'order' || record === 'enquiry')); };
  return (
    <Sheet title={isNew ? 'New workflow' : `Workflow: ${init.name}`} onClose={onClose}>
      <Field label="Name" value={f.name} onChangeText={v => setF({ ...f, name: v })} maxLength={120} />
      <Field label="What it's for (optional)" value={f.description} onChangeText={v => setF({ ...f, description: v })} maxLength={300} />
      <Text style={[s.label, { marginTop: 12 }]}>When</Text>
      <View style={s.wrap}>{TRIGGERS.map(t => <Chip key={t.k} on={f.trigger === t.k} label={t.label} onPress={() => setF({ ...f, trigger: t.k, trigger_days: t.k === 'customer_inactive' ? 60 : t.k === 'order_unpaid' ? 2 : f.trigger_days })} />)}</View>
      {TRIGGERS.find(t => t.k === f.trigger)?.days && <Field label="After how many days?" value={String(f.trigger_days)} keyboardType="number-pad" onChangeText={v => setF({ ...f, trigger_days: Math.min(365, Math.max(1, Number(v.replace(/\D/g, '')) || 1)) })} />}
      <Text style={[s.label, { marginTop: 12 }]}>Then, in order</Text>
      {f.steps.map((st, i) => {
        const info = stepInfo(st.type);
        return (
          <View key={i} style={[s.card, { backgroundColor: '#F7F9FC' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={[s.bodyBold, { flex: 1 }]}>Step {i + 1}: {info?.label}</Text>
              <Pressable disabled={i === 0} onPress={() => move(i, -1)} accessibilityLabel="Move up" hitSlop={6}><Ionicons name="arrow-up" size={18} color={i === 0 ? '#C0C8D2' : MUTED} /></Pressable>
              <Pressable disabled={i === f.steps.length - 1} onPress={() => move(i, 1)} accessibilityLabel="Move down" hitSlop={6}><Ionicons name="arrow-down" size={18} color={i === f.steps.length - 1 ? '#C0C8D2' : MUTED} /></Pressable>
              <Pressable onPress={() => setF({ ...f, steps: f.steps.filter((_, j) => j !== i) })} accessibilityLabel="Remove step" hitSlop={6}><Ionicons name="trash-outline" size={18} color={RED} /></Pressable>
            </View>
            <View style={s.wrap}>{STEPS.map(x => <Chip key={x.k} on={st.type === x.k} label={x.label} disabled={!fits(x.k)} onPress={() => setStep(i, { type: x.k, approval: false })} />)}</View>
            <Text style={s.small}>{info?.hint}</Text>
            {info?.role && <View style={s.wrap}>{TEAM_ROLES.map(r => <Chip key={r} on={st.role === r} label={r === 'owner' ? 'The owner' : `${r.charAt(0).toUpperCase()}${r.slice(1)}`} onPress={() => setStep(i, { role: r })} />)}{ownRoles.map(r => <Chip key={`own-${r}`} on={st.role === r} label={r} onPress={() => setStep(i, { role: r })} />)}</View>}
            {info?.segment && <View style={s.wrap}>{SEGMENTS.map(g => <Chip key={g} on={st.segment === g} label={g === 'All' ? 'All customers' : g} onPress={() => setStep(i, { segment: g })} />)}</View>}
            {info?.days && <Field label={info.days} value={String(st.days ?? 0)} keyboardType="number-pad" onChangeText={v => setStep(i, { days: Math.min(90, Number(v.replace(/\D/g, '')) || 0) })} />}
            {info?.text && <Field label={info.text} value={st.text ?? ''} onChangeText={v => setStep(i, { text: v })} multiline={st.type === 'draft_message' || st.type === 'bulk_message'} maxLength={1000} />}
            <View style={[s.row, { borderTopWidth: 0 }]}>
              <Text style={[s.body, { flex: 1 }]}>Ask me before this step{info?.risky ? ' (always, higher risk)' : st.type === 'draft_message' ? ' (always: you send it)' : ''}</Text>
              <Switch value={!!info?.risky || !!st.approval || st.type === 'draft_message'} disabled={!!info?.risky || st.type === 'draft_message'} onValueChange={v => setStep(i, { approval: v })} accessibilityLabel="Ask me before this step" />
            </View>
          </View>
        );
      })}
      {f.steps.length < 8 && <View style={s.wrap}><Btn label="Add a step" kind="outline" icon="add" onPress={() => setF({ ...f, steps: [...f.steps, { type: fits('notify_team') ? 'notify_team' : 'notify', role: 'sales' }] })} /></View>}
      <Text style={[s.label, { marginTop: 12 }]}>If a step fails, try again</Text>
      <View style={s.wrap}>{[0, 1, 2, 3, 4, 5].map(n => <Chip key={n} on={f.max_retries === n} label={`${n} time${n === 1 ? '' : 's'}`} onPress={() => setF({ ...f, max_retries: n })} />)}</View>
      <View style={[s.card, { backgroundColor: '#EAF1FB' }]}><Text style={s.body}>{describeWorkflow({ ...f, action: 'notify', action_days: 0, action_text: '' })}</Text></View>
      {!!err && <Text style={[s.small, { color: RED }]}>{err}</Text>}
      <View style={s.wrap}><Btn label="Save and turn on" busy={busy} flex onPress={async () => { setBusy(true); setErr(''); try { await onSave(f); } catch (e: any) { setErr(e?.message); setBusy(false); } }} /></View>
    </Sheet>
  );
}

// ---------- Approvals ----------
function Approvals({ runs, workflows, flash, reload }: { runs: Run[]; workflows: Workflow[] } & P) {
  const [busy, setBusy] = useState('');
  const name = (id: string) => workflows.find(w => w.id === id)?.name ?? 'Workflow';
  const decide = async (r: Run, ok: boolean, msg: string) => { setBusy(r.id); try { await decideRun(r.id, ok); flash(msg); await reload(); } catch (e: any) { flash(e?.message); } setBusy(''); };
  return (
    <View>
      <Text style={s.muted}>Bulk messages, changes to many customers and drafted messages wait here. Approve and the rest of the workflow carries on; reject and nothing more is done.</Text>
      {!runs.length ? <View style={s.card}><Text style={s.muted}>Nothing is waiting for you.</Text></View> : runs.map(r => {
        const p = r.payload || {};
        const draft = p.kind === 'message' || (!p.kind && !!p.message);
            const w = workflows.find(x => x.id === r.automation_id);
            const nextStep = w ? stepsOf(w)[r.step_index] : undefined;
            const stepText = nextStep ? describeStep(nextStep).replace(/^./, c => c.toUpperCase()) : String(p.step || 'the next step');
        return (
          <View key={r.id} style={[s.card, { borderColor: '#FEDF89' }]}>
            <Text style={[s.small, { color: AMBER, fontWeight: '700' }]}>{name(r.automation_id)} · {ago(r.updated_at)}</Text>
            <Text style={s.bodyBold}>{r.title}</Text>
            <Text style={s.small}>{draft ? `Message to ${p.to || 'the customer'}` : `Next step: ${stepText}`}</Text>
            <View style={[s.card, { backgroundColor: '#F7F9FC' }]}><Text style={s.body}>{draft ? p.message : p.kind === 'mass_tag' ? `Add the tag “${p.tag}” to ${p.count} customers${p.segment && p.segment !== 'All' ? ` in ${p.segment}` : ''}.` : p.kind === 'bulk_message' ? `Prepare this message in Campaigns for ${p.count} customers${p.segment && p.segment !== 'All' ? ` in ${p.segment}` : ''}:\n\n${p.message}` : `Nexora will ${stepText.charAt(0).toLowerCase()}${stepText.slice(1)} once you approve.`}</Text></View>
            <View style={s.wrap}>
              {draft ? (['whatsapp', 'email'] as const).map(v => { const link = sendDraftLink(r, v); return link ? <Btn key={v} label={`Send on ${v === 'whatsapp' ? 'WhatsApp' : 'email'}`} busy={busy === r.id} onPress={() => { Linking.openURL(link).catch(() => {}); decide(r, true, 'Marked as sent. The rest of the workflow carries on.'); }} /> : null; })
                : <Btn label="Approve and run" busy={busy === r.id} onPress={() => decide(r, true, 'Approved. Nexora is doing it now.')} />}
              {draft && <Btn label="I sent it" kind="outline" onPress={() => decide(r, true, 'Marked as sent')} />}
              <Btn label="Reject" kind="danger" onPress={() => decide(r, false, 'Rejected. Nothing more was done.')} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ---------- History ----------
type Filter = 'all' | 'awaiting_approval' | 'failed' | 'retrying' | 'done';
function History({ runs, workflows, flash, reload }: { runs: Run[] | null; workflows: Workflow[] } & P) {
  const [f, setF] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const name = (id: string) => workflows.find(w => w.id === id)?.name ?? 'Deleted workflow';
  const all = runs ?? [];
  const match = (r: Run, k: Filter) => k === 'all' || r.status === k || (k === 'done' && ['approved', 'dismissed', 'rejected'].includes(r.status) && !r.resumable);
  const list = all.filter(r => match(r, f) && (!q || `${r.title} ${r.detail} ${name(r.automation_id)}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <View>
      <View style={[s.wrap, { marginTop: 0 }]}>{([['all', 'All'], ['awaiting_approval', 'Waiting'], ['failed', 'Failed'], ['retrying', 'Will try again'], ['done', 'Done']] as [Filter, string][]).map(([k, l]) => <Chip key={k} on={f === k} label={`${l} (${all.filter(r => match(r, k)).length})`} onPress={() => setF(k)} />)}</View>
      <Field label="Search the history" value={q} onChangeText={setQ} placeholder="Name, customer, order…" />
      {runs === null ? <ActivityIndicator color={BLUE} style={{ marginTop: 20 }} /> : !list.length ? <View style={s.card}><Text style={s.muted}>Nothing here yet.</Text></View> : list.map(r => {
        const stt = RUN_STATUS[r.status] ?? RUN_STATUS.done;
        const isOpen = open === r.id;
        return (
          <Pressable key={r.id} onPress={() => setOpen(isOpen ? null : r.id)} style={s.card} accessibilityState={{ expanded: isOpen }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={[s.badge, r.status === 'failed' ? { color: RED, backgroundColor: '#FDECEC' } : r.status === 'done' ? { color: GREEN, backgroundColor: '#E7F6EE' } : { color: AMBER, backgroundColor: '#FFFAEB' }]}>{stt.label}</Text>
              <Text style={[s.small, { flex: 1 }]}>{name(r.automation_id)} · {ago(r.created_at)}</Text>
              <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={MUTED} />
            </View>
            <Text style={s.bodyBold}>{r.title}</Text>
            {!!r.error && (r.status === 'failed' || r.status === 'retrying') && <Text style={[s.small, { color: RED }]}>{r.error}{r.status === 'retrying' && r.next_retry_at ? ` · next try ${ago(r.next_retry_at)}` : ''}</Text>}
            {isOpen && (
              <View style={{ marginTop: 6, borderLeftWidth: 2, borderLeftColor: LINE, paddingLeft: 10 }}>
                {(r.log?.length ? r.log : [{ at: r.created_at, step: 0, status: r.status, detail: r.detail }]).map((l, i) => (
                  <Text key={i} style={[s.small, { marginTop: 4 }]}><Text style={{ fontWeight: '700', color: l.status === 'failed' ? RED : l.status === 'waiting' ? AMBER : GREEN }}>Step {Number(l.step) + 1} · {l.status}</Text> {ago(l.at)}{'\n'}{l.detail}</Text>
                ))}
                {r.status === 'failed' && r.resumable && <View style={s.wrap}><Btn label="Try again" kind="outline" icon="refresh" onPress={() => retryRun(r.id).then(() => { flash('Trying again now'); setTimeout(reload, 4000); }, (e: any) => flash(e?.message))} /></View>}
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------- Webhooks ----------
function Webhooks({ data, flash, reload, links }: { data: { hooks: Webhook[]; deliveries: Delivery[] } | null; links: Links } & P) {
  const [adding, setAdding] = useState<null | { id?: string; name: string; url: string; events: WebhookEvent[] }>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!data) return <ActivityIndicator color={BLUE} style={{ marginTop: 20 }} />;
  const hookName = (id: string) => { const h = data.hooks.find(x => x.id === id); return h ? h.name || h.url : 'Deleted webhook'; };
  const save = async () => {
    if (!adding) return;
    setBusy(true);
    try {
      if (adding.id) { await updateWebhook(adding.id, { name: adding.name, url: adding.url, events: adding.events }); flash('Webhook saved'); setAdding(null); }
      else { const sec = await createWebhook(adding.name, adding.url, adding.events); setAdding(null); setSecret(sec); }
      await reload();
    } catch (e: any) { flash(e?.message); }
    setBusy(false);
  };
  return (
    <View>
      <Text style={s.muted}>Nexora sends a signed POST with JSON to your address when something happens. Failed sends are tried again 1, 5, 30, 120 and 360 minutes later.</Text>
      <View style={s.wrap}><Btn label="Add webhook" icon="add" onPress={() => setAdding({ name: '', url: 'https://', events: ['order.created', 'order.paid', 'lead.created'] })} /></View>
      {!data.hooks.length ? <View style={s.card}><Text style={s.muted}>No webhooks yet.</Text></View> : data.hooks.map(h => (
        <View key={h.id} style={s.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}><Text style={s.bodyBold}>{h.name || 'Webhook'}</Text><Text style={s.small}>{h.url}</Text></View>
            <Switch value={h.enabled} onValueChange={v => updateWebhook(h.id, { enabled: v }).then(() => { flash(v ? 'Webhook on' : 'Webhook off'); reload(); }, (e: any) => flash(e?.message))} accessibilityLabel={`${h.name || h.url} on`} />
          </View>
          <Text style={s.small}>{h.events.map(e => EVENTS.find(x => x.k === e)?.label ?? e).join(' · ')}</Text>
          <Text style={s.small}>{h.last_at ? `Last answer ${h.last_status ?? 'none'} · ${ago(h.last_at)}` : 'Nothing sent yet'} · secret ends …{h.secret_hint}</Text>
          {!!h.disabled_reason && <Text style={[s.small, { color: RED }]}>{h.disabled_reason}</Text>}
          <View style={s.wrap}>
            <Btn label="Send test" kind="outline" onPress={() => testWebhook(h.id).then(() => { flash('Test sent'); setTimeout(reload, 5000); }, (e: any) => flash(e?.message))} />
            <Btn label="Edit" kind="outline" onPress={() => setAdding({ id: h.id, name: h.name, url: h.url, events: h.events })} />
            <Btn label="New secret" kind="outline" icon="key-outline" onPress={() => rotateSecret(h.id).then(sec => { setSecret(sec); reload(); }, (e: any) => flash(e?.message))} />
            <Btn label="Delete" kind="danger" onPress={() => deleteWebhook(h.id).then(() => { flash('Webhook deleted'); reload(); }, (e: any) => flash(e?.message))} />
          </View>
        </View>
      ))}
      <Text style={[s.label, { marginTop: 16 }]}>RECENT SENDS</Text>
      {!data.deliveries.length ? <View style={s.card}><Text style={s.muted}>Nothing sent yet.</Text></View> : data.deliveries.slice(0, 40).map(d => (
        <View key={d.id} style={[s.card, { paddingVertical: 10 }]}>
          <Text style={s.bodyBold}>{EVENTS.find(e => e.k === d.event)?.label ?? (d.event === 'ping' ? 'Test' : d.event)} → {hookName(d.endpoint_id)}</Text>
          <Text style={[s.small, { color: d.status === 'delivered' ? GREEN : d.status === 'failed' ? RED : AMBER, fontWeight: '700' }]}>{d.status === 'delivered' ? 'Delivered' : d.status === 'failed' ? 'Failed' : d.status === 'retrying' ? `Will retry ${ago(d.next_attempt_at)}` : 'Sending'} · {d.attempts} tr{d.attempts === 1 ? 'y' : 'ies'}{d.response_code ? ` · answered ${d.response_code}` : ''} · {ago(d.created_at)}</Text>
          {!!d.error && <Text style={[s.small, { color: RED }]}>{d.error}</Text>}
          {(d.status === 'failed' || d.status === 'delivered') && <Pressable onPress={() => resendDelivery(d.id).then(() => { flash('Sending again'); setTimeout(reload, 5000); }, (e: any) => flash(e?.message))}><Text style={s.link}>Send again</Text></Pressable>}
        </View>
      ))}
      <View style={s.card}>
        <Text style={s.bodyBold}>Checking it came from Nexora</Text>
        <Text style={s.small}>Header X-Nexora-Signature: t=…,v1=… . Make an HMAC-SHA256 of t + "." + the body with your secret; it must equal v1. X-Nexora-Delivery identifies each send (ignore repeats).</Text>
        <Pressable onPress={links.onOpenWebsites} style={{ marginTop: 6 }}><Text style={s.link}>Sending into Nexora: API keys for your website are in AI shop link → Websites ›</Text></Pressable>
      </View>
      {adding && (
        <Sheet title={adding.id ? 'Edit webhook' : 'Add a webhook'} onClose={() => setAdding(null)}>
          <Field label="Name" value={adding.name} onChangeText={v => setAdding({ ...adding, name: v })} maxLength={60} placeholder="e.g. Accounting" />
          <Field label="Address (https://)" value={adding.url} onChangeText={v => setAdding({ ...adding, url: v.trim() })} autoCapitalize="none" keyboardType="url" maxLength={500} />
          <Text style={[s.label, { marginTop: 12 }]}>Send these events</Text>
          <View style={s.wrap}>{EVENTS.map(e => { const on = adding.events.includes(e.k); return <Chip key={e.k} on={on} label={e.label} onPress={() => setAdding({ ...adding, events: on ? adding.events.filter(x => x !== e.k) : [...adding.events, e.k] })} />; })}</View>
          <View style={s.wrap}><Btn label={adding.id ? 'Save' : 'Add webhook'} busy={busy} flex onPress={save} /></View>
        </Sheet>
      )}
      {secret && (
        <Sheet title="Your signing secret" onClose={() => setSecret(null)}>
          <Text style={s.muted}>Copy it now and keep it in your system. Nexora won’t show it again (you can always make a new one).</Text>
          <TextInput value={secret} editable={false} selectTextOnFocus multiline style={[s.input, { marginTop: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', minHeight: 60 }]} />
          <View style={s.wrap}><Btn label="Done" flex onPress={() => setSecret(null)} /></View>
        </Sheet>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: LINE },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: '#EAF1FB', maxWidth: 320 },
  chipText: { color: BLUE, fontWeight: '600', fontSize: 12.5 },
  btn: { minHeight: 40, maxWidth: 320, borderRadius: 20, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  btnText: { fontWeight: '700', fontSize: 13.5 },
  backdrop: { flex: 1, backgroundColor: 'rgba(11,18,32,0.45)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '92%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, width: '100%', maxWidth: 720, alignSelf: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: INK },
  muted: { color: MUTED, fontSize: 13, lineHeight: 18 },
  small: { color: MUTED, fontSize: 12, marginTop: 2 },
  body: { color: '#1F2937', fontSize: 13.5, lineHeight: 19, marginTop: 2 },
  bodyBold: { color: INK, fontSize: 14, fontWeight: '700' },
  big: { color: INK, fontSize: 22, fontWeight: '800' },
  label: { fontSize: 12, fontWeight: '700', color: MUTED },
  input: { marginTop: 6, minHeight: 44, borderWidth: 1, borderColor: '#D0D8E2', borderRadius: 12, paddingHorizontal: 12, fontSize: 14, color: INK, backgroundColor: '#FFFFFF' },
  card: { marginTop: 10, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: LINE, backgroundColor: '#FFFFFF' },
  tile: { flexGrow: 1, flexBasis: '45%', padding: 12, borderRadius: 14, borderWidth: 1, borderColor: LINE, backgroundColor: '#FFFFFF' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: LINE },
  icon: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#EAF1FB', alignItems: 'center', justifyContent: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  link: { color: BLUE, fontWeight: '700', fontSize: 13 },
  badge: { fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: 'hidden' },
});
