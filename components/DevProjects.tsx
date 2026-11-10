import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, TextInput } from '../lib/inter';
import { ReportSheet } from './PartnerHub';
import {
  DEV_KINDS, DOCS, MAINT_PLANS, MILESTONE_LABEL, STATUS_LABEL, acceptTerms, agreementText, blankRequirements, createProject, decideChange, deleteProject,
  devKindLabel, draftUpdate, getProject, listProjects, myRequests, partnerOptions, postAsRequest, postMessage, progress, proposeChange, reviewDeliverable,
  saveDoc, saveMilestones, setMilestoneStatus, setProvider, suggestMilestones, suggestRequirements, sumMilestones, termsGaps, updateProject, withdrawChange, writeDoc,
  type DevKind, type DevProject, type DocKey, type Milestone, type MilestoneDraft, type PartnerOption, type ProjectFull, type Requirements,
} from '../lib/devProjects';

// Capability 2.13 in the app (Find partners → Digital projects): software development and digital services.
// Same data and rules as the website's /digital page: requirements, AI documents, developer from an accepted introduction,
// written agreement (milestones, total, payment terms) both sides accept, work and deliverables, change requests,
// onboarding and maintenance.
const BLUE = '#1E56A0', INK = '#0B1220', MUTED = '#5C6B7A', LINE = '#E3E8EF', GREEN = '#127A4B', RED = '#B42318';
const KIND_ICON: Record<DevKind, keyof typeof Ionicons.glyphMap> = { website: 'globe-outline', mobile_app: 'phone-portrait-outline', automation: 'sync-outline', other: 'apps-outline' };
const lines = (t: string) => t.split('\n').map(x => x.replace(/^[-•*\d.)\s]+/, '').trim()).filter(Boolean);
const SYM: Record<string, string> = { NGN: '₦', USD: '$', EUR: '€', GBP: '£', GHS: 'GH₵', KES: 'KSh ', ZAR: 'R' };
const money = (n: number, c?: string) => `${SYM[c || ''] ?? (c ? `${c} ` : '₦')}${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const ago = (iso: string) => { const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); return m < 1 ? 'now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
const TERMS_PRESETS = ['30% deposit before work starts, then the rest split across the milestones as each is approved.', 'Each milestone is paid within 3 days after the client approves it.', '50% deposit, 50% on launch and handover.'];

function Btn({ label, onPress, kind = 'primary', busy, icon, flex, disabled }: { label: string; onPress: () => void; kind?: 'primary' | 'outline' | 'soft' | 'danger'; busy?: boolean; icon?: keyof typeof Ionicons.glyphMap; flex?: boolean; disabled?: boolean }) {
  const st = kind === 'primary' ? s.btnPrimary : kind === 'soft' ? s.btnSoft : kind === 'danger' ? s.btnDanger : s.btnOutline;
  const color = kind === 'primary' ? '#FFFFFF' : kind === 'danger' ? RED : BLUE;
  return (
    <Pressable disabled={busy || disabled} onPress={onPress} style={[s.btn, st, flex && { flex: 1 }, (busy || disabled) && { opacity: 0.55 }]} accessibilityRole="button" accessibilityLabel={label}>
      {busy ? <ActivityIndicator color={color} /> : <>{!!icon && <Ionicons name={icon} size={16} color={color} />}<Text style={[s.btnText, { color }]}>{label}</Text></>}
    </Pressable>
  );
}
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
  <View style={{ marginTop: 10 }}><Text style={s.label}>{label}</Text><TextInput placeholderTextColor="#98A2B3" {...p} style={[s.input, p.multiline && { minHeight: 76, textAlignVertical: 'top', paddingTop: 10 }]} /></View>
);
function Chip({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} accessibilityState={{ selected: on }} style={[s.chip, on && s.chipOn]}><Text style={[s.chipText, on && { color: '#FFFFFF' }]}>{label}</Text></Pressable>;
}
const Badge = ({ text, tone = 'blue' }: { text: string; tone?: 'blue' | 'green' | 'red' | 'grey' }) => (
  <View style={[s.badge, tone === 'green' && { backgroundColor: '#E7F6EE' }, tone === 'red' && { backgroundColor: '#FDECEC' }, tone === 'grey' && { backgroundColor: '#F2F4F7' }]}>
    <Text style={{ fontSize: 11.5, fontWeight: '700', color: tone === 'green' ? GREEN : tone === 'red' ? RED : tone === 'grey' ? MUTED : BLUE }}>{text}</Text>
  </View>
);
/** A very small markdown view for AI documents: headings, bullets and paragraphs. */
const DocText = ({ text, max }: { text: string; max?: number }) => {
  const rows = text.replace(/\r/g, '').split('\n').slice(0, max ?? 999);
  return <View>{rows.map((l, i) => {
    const t = l.replace(/\*\*/g, '');
    if (/^#{1,4}\s/.test(t)) return <Text key={i} style={[s.h, { marginTop: i ? 10 : 0 }]}>{t.replace(/^#+\s/, '')}</Text>;
    if (/^\s*([-*•]|\d+[.)])\s/.test(t)) return <Text key={i} style={s.body}>{'•  '}{t.replace(/^\s*([-*•]|\d+[.)])\s/, '')}</Text>;
    return t.trim() ? <Text key={i} style={s.body}>{t}</Text> : null;
  })}</View>;
};

// ---------- List and new project ----------
export function DigitalProjects({ me, business, flash, startNew, onStarted }: { me: string; business: string; flash: (s: string) => void; startNew?: boolean; onStarted?: () => void }) {
  const [list, setList] = useState<DevProject[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'client' | 'provider'>('all');
  const [wizard, setWizard] = useState(false);
  const load = useCallback(() => { setError(''); listProjects().then(setList, e => { setList([]); setError(e?.message || "Couldn't load projects."); }); }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (startNew) { setWizard(true); onStarted?.(); } }, [startNew]); // eslint-disable-line react-hooks/exhaustive-deps

  if (open) return <ProjectView id={open} me={me} business={business} flash={flash} onBack={() => { setOpen(null); load(); }} />;
  const shown = (list ?? []).filter(p => filter === 'all' || (filter === 'client' ? p.client_id === me : p.provider_id === me));
  const asClient = (list ?? []).filter(p => p.client_id === me).length;
  return (
    <View>
      <View style={[s.card, { backgroundColor: '#0B1F3A', borderColor: '#0B1F3A' }]}>
        <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 16 }}>Get a website, app or automation built</Text>
        <Text style={{ color: '#C9D4E3', fontSize: 13, lineHeight: 18, marginTop: 4 }}>Describe what you need. Nexora writes the brief, scope of work, technical requirements, proposal and milestone plan, and keeps the agreement, milestone payments, changes and maintenance in one place.</Text>
        <Pressable onPress={() => setWizard(true)} style={[s.btn, { backgroundColor: '#FFFFFF', marginTop: 12, alignSelf: 'flex-start', maxWidth: 320 }]} accessibilityRole="button">
          <Ionicons name="add" size={16} color="#0B1F3A" /><Text style={[s.btnText, { color: '#0B1F3A' }]}>New digital project</Text>
        </Pressable>
      </View>
      <View style={s.wrap}>
        <Chip on={filter === 'all'} label={`All (${(list ?? []).length})`} onPress={() => setFilter('all')} />
        <Chip on={filter === 'client'} label={`My projects (${asClient})`} onPress={() => setFilter('client')} />
        <Chip on={filter === 'provider'} label={`Client work (${(list ?? []).length - asClient})`} onPress={() => setFilter('provider')} />
      </View>
      {!!error && <Text style={[s.muted, { color: RED, marginTop: 8 }]}>{error}</Text>}
      {list === null ? <ActivityIndicator color={BLUE} style={{ marginTop: 20 }} /> : !shown.length ? (
        <View style={s.card}><Text style={s.muted}>{filter === 'provider' ? 'When a client adds you as their developer, the project shows here.' : 'No digital projects yet. Tap New digital project to start.'}</Text></View>
      ) : shown.map(p => {
        const mine = p.client_id === me;
        return (
          <Pressable key={p.id} onPress={() => setOpen(p.id)} style={s.card} accessibilityRole="button" accessibilityLabel={`Open ${p.title}`}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={s.icon}><Ionicons name={KIND_ICON[p.kind]} size={20} color={BLUE} /></View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: INK }} numberOfLines={1}>{p.title}</Text>
                <Text style={s.muted}>{devKindLabel(p.kind)} · {mine ? (p.provider_name ? `Developer: ${p.provider_name}` : 'No developer yet') : `Client: ${p.client_name}`}</Text>
              </View>
            </View>
            <View style={[s.wrap, { marginTop: 8 }]}>
              <Badge text={STATUS_LABEL[p.status]} tone={p.status === 'active' ? 'green' : p.status === 'cancelled' ? 'red' : 'blue'} />
              <Badge text={mine ? 'You are the client' : 'You are the developer'} tone="grey" />
            </View>
            <Text style={[s.muted, { marginTop: 6 }]}>{p.total_amount ? `Total ${money(p.total_amount, p.currency)}` : 'Price not set yet'}{p.agreed_at ? ' · Terms agreed' : p.client_accepted_at || p.provider_accepted_at ? ' · One side accepted' : ''}</Text>
          </Pressable>
        );
      })}
      {wizard && <NewProject me={me} business={business} flash={flash} onClose={() => setWizard(false)} onCreated={id => { setWizard(false); setOpen(id); }} />}
    </View>
  );
}

function NewProject({ me, business, flash, onClose, onCreated }: { me: string; business: string; flash: (s: string) => void; onClose: () => void; onCreated: (id: string) => void }) {
  const [step, setStep] = useState(1);
  const [kind, setKind] = useState<DevKind>('website');
  const [idea, setIdea] = useState('');
  const [title, setTitle] = useState('');
  const [req, setReq] = useState<Requirements>(blankRequirements());
  const [features, setFeatures] = useState('');
  const [integrations, setIntegrations] = useState('');
  const [currency, setCurrency] = useState('NGN');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [requests, setRequests] = useState<Awaited<ReturnType<typeof myRequests>>>([]);
  const [busy, setBusy] = useState('');
  useEffect(() => { myRequests(me).then(setRequests, () => {}); }, [me]);
  const write = async () => {
    if (idea.trim().length < 8) { flash('Describe what you need in a sentence or two'); return; }
    setBusy('ai');
    try { const r = await suggestRequirements(idea, kind, business); setTitle(r.title); setReq(r.requirements); setFeatures(r.requirements.features.join('\n')); setIntegrations(r.requirements.integrations.join('\n')); setStep(3); }
    catch (e: any) { flash(e?.message || 'Nexora could not write this right now.'); }
    setBusy('');
  };
  const create = async () => {
    setBusy('save');
    try { const id = await createProject({ title, kind, currency, request_id: requestId, requirements: { ...req, features: lines(features), integrations: lines(integrations) } }); flash('Project created'); onCreated(id); }
    catch (e: any) { flash(e?.message || "Couldn't create the project."); setBusy(''); }
  };
  const set = (k: keyof Requirements) => (v: string) => setReq({ ...req, [k]: v });
  return (
    <Sheet title={step === 1 ? 'What do you want built?' : step === 2 ? `Describe your ${devKindLabel(kind).toLowerCase()}` : 'Project requirements'} onClose={onClose}>
      {step === 1 && DEV_KINDS.map(k => (
        <Pressable key={k.k} onPress={() => { setKind(k.k); setStep(2); }} style={[s.card, { flexDirection: 'row', gap: 10 }]} accessibilityRole="button">
          <View style={s.icon}><Ionicons name={KIND_ICON[k.k]} size={20} color={BLUE} /></View>
          <View style={{ flex: 1 }}><Text style={{ fontWeight: '700', color: INK }}>{k.label}</Text><Text style={s.muted}>{k.hint}</Text></View>
        </Pressable>
      ))}
      {step === 2 && (
        <>
          <Text style={s.muted}>In your own words: what it should do, who will use it, and any budget or deadline. Nexora turns it into clear requirements you can edit.</Text>
          <Field label="What you need" value={idea} onChangeText={setIdea} multiline maxLength={1500} placeholder="e.g. A booking website for my salon. Customers pick a time, pay a deposit with Paystack and get a WhatsApp reminder. Budget about ₦400,000, ready in 6 weeks." />
          <View style={[s.wrap, { marginTop: 12 }]}>
            <Btn label="Fill it in myself" kind="outline" onPress={() => setStep(3)} flex />
            <Btn label="Write it for me" icon="sparkles" busy={busy === 'ai'} onPress={write} flex />
          </View>
          {!!requests.length && <>
            <Text style={[s.label, { marginTop: 16 }]}>Or start from a project you posted</Text>
            <View style={s.wrap}>{requests.slice(0, 6).map(r => <Chip key={r.id} on={false} label={r.title} onPress={() => { setRequestId(r.id); setTitle(r.title); setReq({ ...blankRequirements(), goal: r.description, budget: r.budget, deadline: r.timeline }); setFeatures(r.requirements.join('\n')); setStep(3); }} />)}</View>
          </>}
          <Pressable onPress={() => setStep(1)} style={{ marginTop: 14 }}><Text style={s.link}>← Choose another type</Text></Pressable>
        </>
      )}
      {step === 3 && (
        <>
          <Field label="Project name" value={title} onChangeText={setTitle} maxLength={120} placeholder="e.g. Salon booking website" />
          <Field label="Currency" value={currency} onChangeText={v => setCurrency(v.toUpperCase().slice(0, 3))} />
          <Field label="Goal: what should it achieve?" value={req.goal} onChangeText={set('goal')} multiline />
          <Field label="Who will use it?" value={req.users} onChangeText={set('users')} />
          <Field label="Must-have features (one per line)" value={features} onChangeText={setFeatures} multiline />
          <Field label="Must work with (one per line)" value={integrations} onChangeText={setIntegrations} multiline placeholder={'Paystack\nWhatsApp'} />
          <Field label="Platforms" value={req.platforms} onChangeText={set('platforms')} placeholder="e.g. Web, works on phones" />
          <Field label="What exists today" value={req.existing} onChangeText={set('existing')} />
          <Field label="Budget" value={req.budget} onChangeText={set('budget')} />
          <Field label="Deadline" value={req.deadline} onChangeText={set('deadline')} />
          <Field label="Content and branding" value={req.content} onChangeText={set('content')} />
          {!!requestId && <Text style={[s.muted, { marginTop: 10 }]}>Linked to your posted project.</Text>}
          <View style={[s.wrap, { marginTop: 14 }]}><Btn label="Back" kind="outline" onPress={() => setStep(2)} flex /><Btn label="Create project" busy={busy === 'save'} onPress={create} flex /></View>
        </>
      )}
    </Sheet>
  );
}

// ---------- One project ----------
type Tab = 'overview' | 'docs' | 'agreement' | 'work' | 'changes' | 'support';
function ProjectView({ id, me, business, flash, onBack }: { id: string; me: string; business: string; flash: (s: string) => void; onBack: () => void }) {
  const [p, setP] = useState<ProjectFull | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [busy, setBusy] = useState('');
  const [report, setReport] = useState(false);
  const reload = useCallback(() => getProject(id).then(x => { setP(x); setError(''); }, e => setError(e?.message || "Couldn't open the project.")), [id]);
  useEffect(() => { reload(); }, [reload]);
  const run = async (key: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    try { await fn(); if (done) flash(done); await reload(); } catch (e: any) { flash(e?.message || 'Something went wrong.'); }
    setBusy('');
  };
  const back = <Pressable onPress={onBack} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }} accessibilityRole="button"><Ionicons name="chevron-back" size={18} color={BLUE} /><Text style={s.link}>All digital projects</Text></Pressable>;
  if (!p) return <View>{back}{error ? <Text style={[s.muted, { color: RED, marginTop: 10 }]}>{error}</Text> : <ActivityIndicator color={BLUE} style={{ marginTop: 20 }} />}</View>;
  const isClient = p.client_id === me, isProvider = p.provider_id === me, agreed = !!p.agreed_at;
  const other = isClient ? p.provider_name || '' : p.client_name || '';
  const pr = progress(p.milestones);
  const pending = p.changes.filter(c => c.status === 'proposed').length;
  const toReview = p.messages.filter(m => m.kind === 'deliverable' && m.status === 'submitted' && m.sender !== me).length + p.milestones.filter(m => isClient && m.status === 'submitted').length;
  const props = { p, me, isClient, isProvider, agreed, business, busy, run, flash, setTab };
  return (
    <View>
      {back}
      <View style={s.card}>
        <Text style={s.title}>{p.title}</Text>
        <View style={s.wrap}><Badge text={STATUS_LABEL[p.status]} tone={p.status === 'active' ? 'green' : p.status === 'cancelled' ? 'red' : 'blue'} /><Badge text={isClient ? 'You are the client' : 'You are the developer'} tone="grey" /></View>
        <Text style={s.body}><Text style={{ fontWeight: '700' }}>{isClient ? 'Developer' : 'Client'}: </Text>{other || 'not added yet'}</Text>
        <Text style={s.body}><Text style={{ fontWeight: '700' }}>Total: </Text>{p.total_amount ? money(p.total_amount, p.currency) : 'not set'}</Text>
        <Text style={s.body}><Text style={{ fontWeight: '700' }}>Milestones: </Text>{pr.total ? `${pr.done} of ${pr.total} approved, ${money(pr.paidAmount, p.currency)} paid` : 'none yet'}</Text>
        <Text style={s.body}><Text style={{ fontWeight: '700' }}>Agreement: </Text>{agreed ? `agreed ${new Date(p.agreed_at!).toLocaleDateString()} (version ${p.scope_version})` : p.client_accepted_at || p.provider_accepted_at ? `${p.client_accepted_at ? 'client' : 'developer'} accepted, waiting for the other side` : 'not agreed yet'}</Text>
        {!!other && <Pressable onPress={() => setReport(true)} style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}><Ionicons name="flag-outline" size={14} color={MUTED} /><Text style={{ color: MUTED, fontSize: 12.5, fontWeight: '600' }}>Report a problem</Text></Pressable>}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 10 }}>
        {([['overview', 'Overview'], ['docs', 'Documents'], ['agreement', 'Agreement'], ['work', `Work${toReview ? ` (${toReview})` : ''}`], ['changes', `Changes${pending ? ` (${pending})` : ''}`], ['support', 'Onboarding and support']] as [Tab, string][]).map(([k, l]) => <Chip key={k} on={tab === k} label={l} onPress={() => setTab(k)} />)}
      </ScrollView>
      {tab === 'overview' && <Overview {...props} />}
      {tab === 'docs' && <Documents {...props} />}
      {tab === 'agreement' && <Agreement {...props} />}
      {tab === 'work' && <Work {...props} />}
      {tab === 'changes' && <Changes {...props} />}
      {tab === 'support' && <Support {...props} onDeleted={onBack} />}
      {report && <ReportSheet target={(isClient ? p.provider_id : p.client_id)!} name={other} me={me} requestId={p.request_id ?? undefined} flash={flash} onClose={() => setReport(false)} />}
    </View>
  );
}
type P = { p: ProjectFull; me: string; isClient: boolean; isProvider: boolean; agreed: boolean; business: string; busy: string; run: (key: string, fn: () => Promise<unknown>, done?: string) => Promise<void>; flash: (s: string) => void; setTab: (t: Tab) => void };

function Overview({ p, isClient, agreed, busy, run, setTab }: P) {
  const [edit, setEdit] = useState(false);
  const [r, setR] = useState<Requirements>(p.requirements);
  const [title, setTitle] = useState(p.title);
  const [features, setFeatures] = useState(p.requirements.features.join('\n'));
  const [integrations, setIntegrations] = useState(p.requirements.integrations.join('\n'));
  const [people, setPeople] = useState<PartnerOption[] | null>(null);
  useEffect(() => { if (isClient && !agreed && !p.provider_id) partnerOptions().then(setPeople, () => setPeople([])); }, [isClient, agreed, p.provider_id]);
  const gaps = termsGaps(p, p.milestones);
  const set = (k: keyof Requirements) => (v: string) => setR({ ...r, [k]: v });
  const row = (k: string, v?: string | string[]) => (Array.isArray(v) ? v.length : v) ? <View style={{ marginTop: 8 }}><Text style={s.label}>{k}</Text><Text style={s.body}>{Array.isArray(v) ? v.map(x => `•  ${x}`).join('\n') : v}</Text></View> : null;
  const current = p.milestones.find(x => x.status !== 'paid' && x.status !== 'approved');
  const next = !p.provider_id ? (isClient ? 'Add the developer or service partner who will do the work.' : 'Waiting for the client.')
    : !agreed ? (gaps.length ? `Before both sides can accept the terms: ${gaps.join('; ')}.` : (isClient ? p.client_accepted_at : p.provider_accepted_at) ? `You accepted. Waiting for ${isClient ? 'the developer' : 'the client'}.` : 'Everything is ready. Review the agreement and accept the terms.')
    : p.status === 'active' ? (current ? `Current milestone: ${current.title} (${MILESTONE_LABEL[current.status].toLowerCase()}).` : 'All milestones are approved. Set up maintenance in Onboarding and support.') : STATUS_LABEL[p.status];
  return (
    <View>
      <View style={s.card}>
        <Text style={s.h}>Next step</Text><Text style={s.body}>{next}</Text>
        <View style={s.wrap}>
          {!p.docs.scope?.text && <Btn label="Write the documents" kind="soft" icon="document-text-outline" onPress={() => setTab('docs')} />}
          <Btn label={agreed ? 'Open the work' : 'Open the agreement'} kind="outline" onPress={() => setTab(agreed ? 'work' : 'agreement')} />
        </View>
      </View>
      <View style={s.card}>
        <Text style={s.h}>{isClient ? 'Developer or service partner' : 'Client'}</Text>
        {isClient ? (p.provider_id ? (
          <>
            <Text style={s.body}><Text style={{ fontWeight: '700' }}>{p.provider_name}</Text> works on this project.</Text>
            {!agreed && <Pressable onPress={() => run('prov', () => setProvider(p.id, null), 'Developer removed')} style={{ marginTop: 8 }}><Text style={[s.link, { color: MUTED }]}>Remove and choose someone else</Text></Pressable>}
          </>
        ) : (
          <>
            <Text style={s.muted}>Choose someone you have an accepted introduction with.</Text>
            {people === null ? <ActivityIndicator color={BLUE} style={{ marginTop: 10 }} /> : people.length ? (
              <View style={s.wrap}>{people.map(x => <Btn key={x.user_id} label={`Add ${x.display_name}`} kind="outline" busy={busy === `prov-${x.user_id}`} onPress={() => run(`prov-${x.user_id}`, () => setProvider(p.id, x.user_id), 'Developer added. They can now see the project.')} />)}</View>
            ) : <Text style={[s.muted, { marginTop: 8 }]}>No accepted introductions yet. Find a developer in the Directory, or post the project so developers can reply.</Text>}
            {!p.request_id && <View style={s.wrap}><Btn label="Post it so developers can reply" kind="soft" busy={busy === 'post'} onPress={() => run('post', () => postAsRequest(p), 'Posted to Projects. Developers can now reply.')} /></View>}
          </>
        )) : <Text style={s.body}><Text style={{ fontWeight: '700' }}>{p.client_name}</Text> added you as the developer.</Text>}
      </View>
      <View style={s.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={[s.h, { flex: 1 }]}>Requirements</Text>{!edit && <Pressable onPress={() => setEdit(true)}><Text style={s.link}>Edit</Text></Pressable>}</View>
        {!edit ? (
          <>
            {row('Goal', p.requirements.goal)}{row('Who will use it', p.requirements.users)}{row('Must-have features', p.requirements.features)}{row('Must work with', p.requirements.integrations)}
            {row('Platforms', p.requirements.platforms)}{row('Content and branding', p.requirements.content)}{row('What exists today', p.requirements.existing)}{row('Budget', p.requirements.budget)}{row('Deadline', p.requirements.deadline)}{row('Notes', p.requirements.notes)}
          </>
        ) : (
          <>
            <Field label="Project name" value={title} onChangeText={setTitle} />
            <Field label="Goal" value={r.goal} onChangeText={set('goal')} multiline />
            <Field label="Who will use it" value={r.users} onChangeText={set('users')} />
            <Field label="Must-have features (one per line)" value={features} onChangeText={setFeatures} multiline />
            <Field label="Must work with (one per line)" value={integrations} onChangeText={setIntegrations} multiline />
            <Field label="Platforms" value={r.platforms} onChangeText={set('platforms')} />
            <Field label="Budget" value={r.budget} onChangeText={set('budget')} />
            <Field label="Deadline" value={r.deadline} onChangeText={set('deadline')} />
            <Field label="Notes" value={r.notes} onChangeText={set('notes')} multiline />
            <View style={s.wrap}><Btn label="Cancel" kind="outline" onPress={() => setEdit(false)} flex /><Btn label="Save" busy={busy === 'req'} onPress={() => run('req', () => updateProject(p.id, { title, requirements: { ...r, features: lines(features), integrations: lines(integrations) } }).then(() => setEdit(false)), 'Requirements saved')} flex /></View>
          </>
        )}
      </View>
    </View>
  );
}

function Documents({ p, agreed, business, busy, run }: P) {
  const [editing, setEditing] = useState<DocKey | null>(null);
  const [view, setView] = useState<DocKey | null>(null);
  const [text, setText] = useState('');
  return (
    <View>
      <Text style={s.muted}>Nexora writes each document from the requirements. Both sides can read and edit them. After agreement the scope of work changes only through a change request.</Text>
      {DOCS.map(d => {
        const doc = p.docs[d.k], locked = agreed && d.k === 'scope';
        return (
          <View key={d.k} style={s.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Text style={[s.h, { marginTop: 0, flex: 1 }]}>{d.label}</Text>{locked && <Ionicons name="lock-closed" size={14} color={MUTED} />}{!!doc?.at && <Text style={{ fontSize: 11.5, color: MUTED }}>v{doc.version ?? 1} · {ago(doc.at)}</Text>}</View>
            <Text style={s.muted}>{d.what}</Text>
            {doc?.text ? <View style={{ marginTop: 6, maxHeight: 120, overflow: 'hidden' }}><DocText text={doc.text} max={10} /></View> : <Text style={[s.muted, { marginTop: 6 }]}>Not written yet.</Text>}
            <View style={s.wrap}>
              {!!doc?.text && <Btn label="Read" kind="outline" onPress={() => setView(d.k)} />}
              {!locked && <Btn label="Edit" kind="outline" onPress={() => { setEditing(d.k); setText(doc?.text ?? ''); }} />}
              {!locked && <Btn label={doc?.text ? 'Rewrite with Nexora' : 'Write with Nexora'} kind="soft" icon="sparkles" busy={busy === `doc-${d.k}`} onPress={() => run(`doc-${d.k}`, async () => { const t = await writeDoc(p, d.k, business); await saveDoc(p, d.k, t); }, 'Written. Read it and edit anything that is not right.')} />}
            </View>
          </View>
        );
      })}
      {view && !!p.docs[view]?.text && <Sheet title={DOCS.find(d => d.k === view)!.label} onClose={() => setView(null)}><DocText text={p.docs[view]!.text} /></Sheet>}
      {editing && (
        <Sheet title={`Edit: ${DOCS.find(d => d.k === editing)!.label}`} onClose={() => setEditing(null)}>
          <TextInput value={text} onChangeText={setText} multiline style={[s.input, { minHeight: 320, textAlignVertical: 'top', paddingTop: 10 }]} />
          <View style={s.wrap}><Btn label="Cancel" kind="outline" onPress={() => setEditing(null)} flex /><Btn label="Save" busy={busy === 'save-doc'} onPress={() => run('save-doc', () => saveDoc(p, editing, text).then(() => setEditing(null)), 'Saved')} flex /></View>
        </Sheet>
      )}
    </View>
  );
}

function Agreement({ p, isClient, agreed, busy, run, flash }: P) {
  const toDraft = (m: Milestone[]): MilestoneDraft[] => m.map(x => ({ id: x.id, title: x.title, description: x.description, amount: x.amount, due_date: x.due_date ?? '' }));
  const [ms, setMs] = useState<MilestoneDraft[]>(toDraft(p.milestones));
  const [total, setTotal] = useState(p.total_amount ? String(p.total_amount) : '');
  const [terms, setTerms] = useState(p.payment_terms);
  const [show, setShow] = useState(false);
  useEffect(() => { setMs(toDraft(p.milestones)); setTotal(p.total_amount ? String(p.total_amount) : ''); setTerms(p.payment_terms); }, [p]);
  const sum = sumMilestones(ms);
  const dirtyMs = JSON.stringify(ms) !== JSON.stringify(toDraft(p.milestones));
  const dirtyTerms = Number(total || 0) !== p.total_amount || terms !== p.payment_terms;
  const gaps = termsGaps(p, p.milestones);
  const iAccepted = isClient ? !!p.client_accepted_at : !!p.provider_accepted_at;
  const setM = (i: number, k: keyof MilestoneDraft, v: string) => setMs(ms.map((m, j) => (j === i ? { ...m, [k]: v } : m)));
  return (
    <View>
      <View style={s.card}>
        <Text style={[s.h, { marginTop: 0 }]}>Price and payment terms {agreed ? '🔒' : ''}</Text>
        <Field label={`Project total (${p.currency})`} editable={!agreed} value={total} onChangeText={v => setTotal(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" placeholder="e.g. 450000" />
        <Field label="Payment terms" editable={!agreed} value={terms} onChangeText={setTerms} multiline placeholder="How and when each milestone is paid" />
        {!agreed && <View style={s.wrap}>{TERMS_PRESETS.map(t => <Chip key={t} on={terms === t} label={t} onPress={() => setTerms(t)} />)}</View>}
        {!agreed && <View style={s.wrap}><Btn label="Save terms" disabled={!dirtyTerms} busy={busy === 'terms'} onPress={() => run('terms', () => updateProject(p.id, { total_amount: Number(total || 0), payment_terms: terms }), 'Saved')} /></View>}
      </View>
      <View style={s.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={[s.h, { marginTop: 0, flex: 1 }]}>Milestones {agreed ? '🔒' : ''}</Text>
          {!agreed && <Pressable disabled={busy === 'ms-ai'} onPress={() => run('ms-ai', async () => { const t = Number(total || 0) || Number((p.requirements.budget.match(/[\d,.]+/)?.[0] || '0').replace(/,/g, '')) || 0; setMs(await suggestMilestones(p, t)); if (!Number(total || 0) && t) setTotal(String(t)); }, 'Milestones suggested. Check them, then Save milestones.')} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>{busy === 'ms-ai' ? <ActivityIndicator color={BLUE} /> : <Ionicons name="sparkles" size={14} color={BLUE} />}<Text style={s.link}>Suggest</Text></Pressable>}</View>
        <Text style={s.muted}>{agreed ? 'These were agreed. Use Changes to change them.' : 'Each milestone has a deliverable, a due date and a payment. They must add up to the total.'}</Text>
        {ms.map((m, i) => agreed ? (
          <View key={m.id ?? i} style={[s.inner, { marginTop: 8 }]}>
            <View style={{ flexDirection: 'row' }}><Text style={{ flex: 1, fontWeight: '700', color: INK }}>{i + 1}. {m.title}</Text><Text style={{ fontWeight: '700', color: INK }}>{money(Number(m.amount), p.currency)}</Text></View>
            {!!m.description && <Text style={s.muted}>{m.description}</Text>}{!!m.due_date && <Text style={s.muted}>Due {m.due_date}</Text>}
          </View>
        ) : (
          <View key={m.id ?? `n${i}`} style={[s.inner, { marginTop: 8 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput value={m.title} onChangeText={v => setM(i, 'title', v)} placeholder={`Milestone ${i + 1}`} placeholderTextColor="#98A2B3" style={[s.input, { flex: 1, marginTop: 0 }]} />
              <Pressable onPress={() => setMs(ms.filter((_, j) => j !== i))} accessibilityLabel="Remove milestone" hitSlop={8}><Ionicons name="trash-outline" size={18} color={RED} /></Pressable>
            </View>
            <TextInput value={m.description} onChangeText={v => setM(i, 'description', v)} placeholder="What is delivered and how you check it" placeholderTextColor="#98A2B3" multiline style={[s.input, { minHeight: 56, textAlignVertical: 'top', paddingTop: 8 }]} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput value={String(m.amount)} onChangeText={v => setM(i, 'amount', v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" placeholder={`Amount (${p.currency})`} placeholderTextColor="#98A2B3" style={[s.input, { flex: 1 }]} />
              <TextInput value={m.due_date} onChangeText={v => setM(i, 'due_date', v.replace(/[^\d-]/g, '').slice(0, 10))} placeholder="Due YYYY-MM-DD" placeholderTextColor="#98A2B3" style={[s.input, { flex: 1 }]} />
            </View>
          </View>
        ))}
        <Text style={[s.muted, { marginTop: 8 }, Number(total || 0) > 0 && sum !== Number(total) && { color: RED, fontWeight: '700' }]}>Milestones add up to {money(sum, p.currency)}{Number(total || 0) ? ` · total ${money(Number(total), p.currency)}` : ''}</Text>
        {!agreed && <View style={s.wrap}>
          <Btn label="Add milestone" kind="outline" icon="add" onPress={() => setMs([...ms, { title: '', description: '', amount: '', due_date: '' }])} />
          {Number(total || 0) > 0 && sum !== Number(total) && !!ms.length && <Btn label="Make them match" kind="outline" onPress={() => { const d = Math.round((Number(total) - sum) * 100) / 100; setMs(ms.map((m, j) => (j === ms.length - 1 ? { ...m, amount: Math.max(0, Number(m.amount || 0) + d) } : m))); }} />}
          <Btn label="Save milestones" disabled={!dirtyMs} busy={busy === 'ms'} onPress={() => run('ms', () => saveMilestones(p.id, ms, p.milestones), 'Milestones saved')} />
        </View>}
      </View>
      <View style={s.card}>
        <Text style={[s.h, { marginTop: 0 }]}>Agreement</Text>
        <Text style={s.muted}>Both sides accept the same scope of work, milestones, total and payment terms. Changing any of them before agreement clears the acceptances.</Text>
        <Text style={s.body}>{p.client_accepted_at ? '✅' : '⚪'} Client{p.client_name ? ` (${p.client_name})` : ''}: {p.client_accepted_at ? `accepted ${new Date(p.client_accepted_at).toLocaleString()}` : 'not yet'}</Text>
        <Text style={s.body}>{p.provider_accepted_at ? '✅' : '⚪'} Developer{p.provider_name ? ` (${p.provider_name})` : ''}: {p.provider_accepted_at ? `accepted ${new Date(p.provider_accepted_at).toLocaleString()}` : 'not yet'}</Text>
        {!agreed && !!gaps.length && <View style={[s.inner, { marginTop: 8 }]}>{gaps.map(g => <Text key={g} style={s.muted}>•  {g}</Text>)}</View>}
        {(dirtyMs || dirtyTerms) && !agreed && <Text style={[s.muted, { color: RED, fontWeight: '700', marginTop: 6 }]}>Save your changes first.</Text>}
        {agreed && <Text style={[s.body, { color: GREEN, fontWeight: '700' }]}>Agreed on {new Date(p.agreed_at!).toLocaleString()} · scope version {p.scope_version}</Text>}
        <View style={s.wrap}>
          <Btn label="See the agreement" kind="outline" icon="document-text-outline" onPress={() => setShow(true)} />
          {!agreed && !iAccepted && <Btn label="Accept the terms" disabled={!!gaps.length || dirtyMs || dirtyTerms} busy={busy === 'accept'} onPress={() => run('accept', async () => { const r = await acceptTerms(p.id); flash(r === 'agreed' ? 'Both sides accepted. Work can start.' : 'You accepted the terms. Waiting for the other side.'); })} />}
        </View>
        {!agreed && iAccepted && <Text style={[s.muted, { marginTop: 8 }]}>You accepted. Waiting for the other side.</Text>}
      </View>
      {show && <Sheet title="Agreement" onClose={() => setShow(false)}>
        <Text selectable style={[s.body, { fontSize: 13 }]}>{agreementText(p)}</Text>
        <View style={s.wrap}><Btn label="Share" icon="share-outline" onPress={() => Linking.openURL(`mailto:?subject=${encodeURIComponent(`${p.title} agreement`)}&body=${encodeURIComponent(agreementText(p).slice(0, 6000))}`).catch(() => {})} /></View>
      </Sheet>}
    </View>
  );
}

function Work({ p, me, isClient, isProvider, agreed, busy, run }: P) {
  const [kind, setKind] = useState<'message' | 'update' | 'deliverable'>('message');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [ms, setMs] = useState('');
  const who = (x: string | null) => (x === me ? 'You' : x === p.client_id ? p.client_name : p.provider_name) || 'Nexora';
  const step = (m: Milestone) => {
    const b = (st: Milestone['status'], l: string, k: 'primary' | 'outline' = 'outline') => <Btn key={st} label={l} kind={k} busy={busy === m.id} onPress={() => run(m.id, () => setMilestoneStatus(m.id, st), `Milestone: ${MILESTONE_LABEL[st].toLowerCase()}`)} />;
    if (!agreed) return null;
    if (isProvider && m.status === 'planned') return [b('in_progress', 'Start work')];
    if (isProvider && m.status === 'in_progress') return [b('submitted', 'Ready for review', 'primary')];
    if (isClient && m.status === 'submitted') return [b('in_progress', 'Ask for changes'), b('approved', 'Approve', 'primary')];
    if (isClient && m.status === 'approved') return [b('paid', 'Mark as paid', 'primary')];
    return null;
  };
  return (
    <View>
      <View style={s.card}>
        <Text style={[s.h, { marginTop: 0 }]}>Milestones</Text>
        {!agreed && <Text style={s.muted}>Work starts once both sides accept the terms in Agreement.</Text>}
        {p.milestones.map((m, i) => (
          <View key={m.id} style={[s.inner, { marginTop: 8 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <View style={{ flex: 1 }}><Text style={{ fontWeight: '700', color: INK }}>{i + 1}. {m.title}</Text><Text style={s.muted}>{money(m.amount, p.currency)}{m.due_date ? ` · due ${m.due_date}` : ''}</Text></View>
              <Badge text={MILESTONE_LABEL[m.status]} tone={m.status === 'paid' || m.status === 'approved' ? 'green' : m.status === 'planned' ? 'grey' : 'blue'} />
            </View>
            {!!step(m) && <View style={s.wrap}>{step(m)}</View>}
          </View>
        ))}
        {!p.milestones.length && <Text style={s.muted}>No milestones yet.</Text>}
      </View>
      <View style={s.card}>
        <Text style={[s.h, { marginTop: 0 }]}>Deliverables</Text>
        {p.messages.filter(m => m.kind === 'deliverable').map(d => (
          <View key={d.id} style={[s.inner, { marginTop: 8 }]}>
            <View style={{ flexDirection: 'row', gap: 8 }}><Text style={[s.body, { flex: 1, marginTop: 0 }]}>{d.body || 'Deliverable'}</Text><Badge text={d.status === 'accepted' ? 'Accepted' : d.status === 'changes_requested' ? 'Changes asked' : 'Waiting for review'} tone={d.status === 'accepted' ? 'green' : d.status === 'changes_requested' ? 'red' : 'blue'} /></View>
            {!!d.link && <Pressable onPress={() => Linking.openURL(d.link).catch(() => {})}><Text style={[s.link, { marginTop: 4 }]}>Open link</Text></Pressable>}
            <Text style={[s.muted, { fontSize: 12 }]}>{who(d.sender)} · {ago(d.created_at)}</Text>
            {d.sender !== me && d.status === 'submitted' && <View style={s.wrap}>
              <Btn label="Ask for changes" kind="outline" busy={busy === d.id} onPress={() => run(d.id, () => reviewDeliverable(d.id, 'changes_requested'), 'Changes requested')} flex />
              <Btn label="Accept" busy={busy === d.id} onPress={() => run(d.id, () => reviewDeliverable(d.id, 'accepted'), 'Deliverable accepted')} flex />
            </View>}
          </View>
        ))}
        {!p.messages.some(m => m.kind === 'deliverable') && <Text style={s.muted}>Nothing sent yet.</Text>}
      </View>
      <View style={s.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={[s.h, { marginTop: 0, flex: 1 }]}>Messages and updates</Text>
          {isProvider && <Pressable disabled={busy === 'draft'} onPress={() => run('draft', async () => { setBody(await draftUpdate(p)); setKind('update'); })} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>{busy === 'draft' ? <ActivityIndicator color={BLUE} /> : <Ionicons name="sparkles" size={14} color={BLUE} />}<Text style={s.link}>Draft an update</Text></Pressable>}</View>
        {p.messages.slice(-60).map(m => m.kind === 'system'
          ? <Text key={m.id} style={{ textAlign: 'center', color: MUTED, fontSize: 12, marginTop: 8 }}>{m.body} · {ago(m.created_at)}</Text>
          : <View key={m.id} style={[s.bubble, m.sender === me && { alignSelf: 'flex-end', backgroundColor: '#EAF1FB' }]}>
              <Text style={{ fontSize: 11.5, fontWeight: '700', color: MUTED }}>{who(m.sender)}{m.kind === 'update' ? ' · Progress update' : m.kind === 'deliverable' ? ' · Deliverable' : ''} · {ago(m.created_at)}</Text>
              <Text style={[s.body, { marginTop: 2 }]}>{m.body}</Text>
            </View>)}
        <View style={[s.wrap, { marginTop: 12 }]}>
          <Chip on={kind === 'message'} label="Message" onPress={() => setKind('message')} />
          <Chip on={kind === 'update'} label="Progress update" onPress={() => setKind('update')} />
          {isProvider && <Chip on={kind === 'deliverable'} label="Deliverable" onPress={() => setKind('deliverable')} />}
        </View>
        <Field label={kind === 'deliverable' ? 'What is ready and what to check' : 'Message'} value={body} onChangeText={setBody} multiline maxLength={4000} />
        {kind !== 'message' && <>
          <Field label="Link (test site, design, file)" value={link} onChangeText={setLink} autoCapitalize="none" />
          <Text style={[s.label, { marginTop: 10 }]}>For which milestone?</Text>
          <View style={s.wrap}>{p.milestones.map(m => <Chip key={m.id} on={ms === m.id} label={m.title} onPress={() => setMs(ms === m.id ? '' : m.id)} />)}</View>
        </>}
        <View style={s.wrap}><Btn label="Send" busy={busy === 'msg'} onPress={() => run('msg', async () => { await postMessage(me, p.id, { kind, body, link, milestone_id: ms || null }); setBody(''); setLink(''); setMs(''); }, kind === 'deliverable' ? 'Deliverable sent for review' : 'Sent')} flex /></View>
      </View>
    </View>
  );
}

function Changes({ p, me, agreed, busy, run }: P) {
  const [f, setF] = useState({ title: '', description: '', cost_delta: '', days_delta: '' });
  const who = (x: string) => (x === me ? 'You' : x === p.client_id ? p.client_name : p.provider_name);
  return (
    <View>
      <View style={s.card}>
        <Text style={[s.h, { marginTop: 0 }]}>Ask for a change</Text>
        <Text style={s.muted}>After agreement, anything new or different goes through a written change request with its cost and time. The other side approves or rejects it. An approved change updates the scope and the total, and adds a milestone for extra cost.</Text>
        {!agreed ? <Text style={[s.muted, { marginTop: 8 }]}>Before agreement you can edit the requirements, documents and milestones directly.</Text> : <>
          <Field label="What should change?" value={f.title} onChangeText={v => setF({ ...f, title: v })} placeholder="e.g. Add a payments page" />
          <Field label="Details" value={f.description} onChangeText={v => setF({ ...f, description: v })} multiline />
          <Field label={`Extra cost (${p.currency}, minus to reduce)`} value={f.cost_delta} onChangeText={v => setF({ ...f, cost_delta: v.replace(/[^\d.-]/g, '') })} keyboardType="numbers-and-punctuation" />
          <Field label="Extra days" value={f.days_delta} onChangeText={v => setF({ ...f, days_delta: v.replace(/[^\d-]/g, '') })} keyboardType="numbers-and-punctuation" />
          <View style={s.wrap}><Btn label="Send change request" busy={busy === 'chg'} onPress={() => run('chg', () => proposeChange(p.id, f).then(() => setF({ title: '', description: '', cost_delta: '', days_delta: '' })), 'Change request sent')} flex /></View>
        </>}
      </View>
      {p.changes.map(c => (
        <View key={c.id} style={s.card}>
          <View style={{ flexDirection: 'row', gap: 8 }}><Text style={{ flex: 1, fontWeight: '700', color: INK }}>{c.title}</Text><Badge text={c.status === 'proposed' ? 'Waiting for a decision' : c.status[0].toUpperCase() + c.status.slice(1)} tone={c.status === 'approved' ? 'green' : c.status === 'proposed' ? 'blue' : 'grey'} /></View>
          {!!c.description && <Text style={s.body}>{c.description}</Text>}
          <Text style={[s.muted, { fontSize: 12, marginTop: 4 }]}>{who(c.requested_by)} · {ago(c.created_at)} · {c.cost_delta ? `${c.cost_delta > 0 ? '+' : ''}${money(c.cost_delta, p.currency)}` : 'no cost change'}{c.days_delta ? ` · ${c.days_delta > 0 ? '+' : ''}${c.days_delta} days` : ''}</Text>
          {c.status === 'proposed' && <View style={s.wrap}>{c.requested_by === me
            ? <Btn label="Withdraw" kind="outline" busy={busy === c.id} onPress={() => run(c.id, () => withdrawChange(c.id), 'Withdrawn')} />
            : <><Btn label="Reject" kind="outline" busy={busy === c.id} onPress={() => run(c.id, () => decideChange(c.id, false), 'Change rejected')} flex /><Btn label="Approve" busy={busy === c.id} onPress={() => run(c.id, () => decideChange(c.id, true), 'Change approved. Scope, total and milestones updated.')} flex /></>}</View>}
        </View>
      ))}
    </View>
  );
}

function Support({ p, isClient, agreed, busy, run, onDeleted }: P & { onDeleted: () => void }) {
  const [items, setItems] = useState(p.onboarding);
  const [add, setAdd] = useState('');
  const [mt, setMt] = useState(p.maintenance);
  const [ask, setAsk] = useState<'' | 'delete' | 'cancel'>('');
  useEffect(() => { setItems(p.onboarding); setMt(p.maintenance); }, [p]);
  const saveItems = (next: typeof items) => { setItems(next); run('ob', () => updateProject(p.id, { onboarding: next })); };
  return (
    <View>
      <View style={s.card}>
        <Text style={[s.h, { marginTop: 0 }]}>Client onboarding · {items.filter(i => i.done).length} of {items.length} done</Text>
        <Text style={s.muted}>What each side needs to hand over or set up so the work can start and go live smoothly.</Text>
        {items.map((it, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <Switch value={it.done} onValueChange={() => saveItems(items.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))} accessibilityLabel={it.label} />
            <Text style={[s.body, { flex: 1, marginTop: 0 }, it.done && { color: MUTED, textDecorationLine: 'line-through' }]}>{it.label}</Text>
            <Badge text={it.who === 'client' ? 'Client' : 'Developer'} tone="grey" />
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <TextInput value={add} onChangeText={setAdd} placeholder="Add a step" placeholderTextColor="#98A2B3" style={[s.input, { flex: 1, marginTop: 0 }]} />
          <Btn label="Add" kind="outline" disabled={!add.trim()} onPress={() => { saveItems([...items, { label: add.trim().slice(0, 200), done: false, who: isClient ? 'client' : 'provider' }]); setAdd(''); }} />
        </View>
      </View>
      <View style={s.card}>
        <Text style={[s.h, { marginTop: 0 }]}>Maintenance and support plan</Text>
        <Text style={s.muted}>What happens after launch: updates, fixes, backups, renewals and how fast the developer responds.</Text>
        <View style={s.wrap}>{MAINT_PLANS.map(m => <Chip key={m.k} on={mt.plan === m.k} label={m.label} onPress={() => setMt({ ...mt, plan: m.k })} />)}</View>
        {mt.plan !== 'none' && <>
          <Field label={`Fee (${p.currency})`} value={mt.fee} onChangeText={v => setMt({ ...mt, fee: v.slice(0, 40) })} />
          <Field label="Starts (YYYY-MM-DD)" value={mt.starts} onChangeText={v => setMt({ ...mt, starts: v.replace(/[^\d-]/g, '').slice(0, 10) })} />
          <Field label="What it includes" value={mt.includes} onChangeText={v => setMt({ ...mt, includes: v.slice(0, 1000) })} multiline />
          <Field label="Response time and how to reach support" value={mt.support} onChangeText={v => setMt({ ...mt, support: v.slice(0, 200) })} />
        </>}
        <View style={s.wrap}><Btn label="Save plan" disabled={JSON.stringify(mt) === JSON.stringify(p.maintenance)} busy={busy === 'mt'} onPress={() => run('mt', () => updateProject(p.id, { maintenance: mt }), 'Maintenance plan saved')} flex /></View>
      </View>
      <View style={s.card}>
        <Text style={[s.h, { marginTop: 0 }]}>Project status: {STATUS_LABEL[p.status]}</Text>
        <View style={s.wrap}>
          {agreed && p.status === 'active' && <Btn label="Move to maintenance" kind="outline" busy={busy === 'st'} onPress={() => run('st', () => updateProject(p.id, { status: 'maintenance' }), 'Moved to maintenance')} />}
          {agreed && (p.status === 'active' || p.status === 'maintenance') && <Btn label="Mark completed" busy={busy === 'st'} onPress={() => run('st', () => updateProject(p.id, { status: 'completed' }), 'Marked completed')} />}
          {agreed && p.status === 'completed' && <Btn label="Start maintenance" kind="outline" busy={busy === 'st'} onPress={() => run('st', () => updateProject(p.id, { status: 'maintenance' }), 'Back on maintenance')} />}
          {!agreed && p.status !== 'cancelled' && <Btn label="Cancel project" kind="outline" onPress={() => setAsk('cancel')} />}
          {!agreed && isClient && <Btn label="Delete" kind="danger" icon="trash-outline" onPress={() => setAsk('delete')} />}
        </View>
        {!!ask && <View style={[s.inner, { marginTop: 10 }]}>
          <Text style={s.body}>{ask === 'delete' ? "Delete this project for both sides? This can't be undone." : 'Cancel this project? Both sides will see it as cancelled.'}</Text>
          <View style={s.wrap}><Btn label="Keep it" kind="outline" onPress={() => setAsk('')} flex />
            <Btn label={ask === 'delete' ? 'Delete project' : 'Cancel project'} kind="danger" onPress={async () => { const a = ask; setAsk(''); if (a === 'delete') { await run('del', () => deleteProject(p.id), 'Project deleted'); onDeleted(); } else await run('st', () => updateProject(p.id, { status: 'cancelled' }), 'Project cancelled'); }} flex /></View>
        </View>}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: '#EAF1FB', maxWidth: 320 },
  chipOn: { backgroundColor: BLUE },
  chipText: { color: BLUE, fontWeight: '600', fontSize: 12.5 },
  btn: { minHeight: 40, maxWidth: 320, borderRadius: 20, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  btnPrimary: { backgroundColor: BLUE }, btnOutline: { borderWidth: 1, borderColor: '#9DB8DD', backgroundColor: '#FFFFFF' }, btnSoft: { backgroundColor: '#EAF1FB' }, btnDanger: { borderWidth: 1, borderColor: '#F3B8B2', backgroundColor: '#FDECEC' },
  btnText: { fontWeight: '700', fontSize: 13.5 },
  backdrop: { flex: 1, backgroundColor: 'rgba(11,18,32,0.45)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '92%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, width: '100%', maxWidth: 720, alignSelf: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: INK },
  h: { marginTop: 12, marginBottom: 2, fontWeight: '700', color: INK, fontSize: 14 },
  muted: { color: MUTED, fontSize: 13, lineHeight: 18 },
  body: { color: '#1F2937', fontSize: 13.5, lineHeight: 19, marginTop: 6 },
  label: { fontSize: 12, fontWeight: '700', color: MUTED },
  input: { marginTop: 6, minHeight: 44, borderWidth: 1, borderColor: '#D0D8E2', borderRadius: 12, paddingHorizontal: 12, fontSize: 14, color: INK, backgroundColor: '#FFFFFF' },
  card: { marginTop: 10, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: LINE, backgroundColor: '#FFFFFF' },
  inner: { padding: 10, borderRadius: 12, backgroundColor: '#F7F9FC' },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#EAF1FB', alignItems: 'center', justifyContent: 'center' },
  badge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10, backgroundColor: '#EAF1FB' },
  bubble: { marginTop: 8, padding: 10, borderRadius: 14, backgroundColor: '#F2F4F7', maxWidth: '88%', alignSelf: 'flex-start' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  link: { color: BLUE, fontWeight: '700', fontSize: 13 },
});
