import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, TextInput } from '../lib/inter';
import { supabase } from '../lib/supabase';
import {
  ALL_PARTS, LEARNING_KIND, PLAN_STEPS, UPDATE_DEFAULT, createPlan, deletePlan, draftPrompt, loadPlan, loadPlans, loadSnapshot, newLearningId, partDef,
  patchPlan, planMarkdown, progress, snapshotText, updatePrompt, withPart, writePartPatient,
  type Learning, type Plan, type PlanKind, type PlanVersion, type Snapshot, type StepDef,
} from '../lib/plans';

// Business Idea Development and Planning (blueprint 2.2), the app's screen. Same steps, prompts and data as the
// website's /plans: idea → customers and market → plans → offer and launch → learn and update.
const TITLE = 'Business Idea Development and Planning';
const STEP_ICON: Record<string, string> = { idea: 'bulb-outline', concept: 'people-outline', plans: 'document-text-outline', launch: 'rocket-outline', learn: 'trending-up-outline' };
const LEARN_STEP: StepDef = { key: 'learn', n: 5, title: 'Learn and update', sub: 'Write down what customers and results show, and update the plan', parts: [] };
const STEPS = [...PLAN_STEPS, LEARN_STEP];
const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
type GoalKind = 'revenue' | 'orders' | 'customers' | 'custom';
type GoalPeriod = 'week' | 'month' | 'quarter' | 'year' | 'date';

export function BusinessPlanner({ userId, onBack, flash, callFn, topInset = 0, wide = false }: {
  userId: string; onBack: () => void; flash: (t: string) => void; callFn: (name: string, body: Record<string, unknown>) => Promise<any>; topInset?: number; wide?: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <View style={s.screen}>
      <View style={[s.header, { paddingTop: topInset + 12 }]}>
        <Pressable onPress={() => (openId ? setOpenId(null) : onBack())} hitSlop={8} accessibilityLabel="Back"><Ionicons name="chevron-back" size={24} color="#0B1220" /></Pressable>
        <Text style={s.headerTitle} numberOfLines={1}>{TITLE}</Text>
        <View style={{ width: 24 }} />
      </View>
      {openId
        ? <PlanView key={openId} id={openId} userId={userId} flash={flash} callFn={callFn} wide={wide} onClose={() => setOpenId(null)} />
        : <PlanList flash={flash} wide={wide} onOpen={setOpenId} />}
    </View>
  );
}

// ---------- All plans + start from an idea ----------
function PlanList({ onOpen, flash, wide }: { onOpen: (id: string) => void; flash: (t: string) => void; wide: boolean }) {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [f, setF] = useState<{ title: string; idea: string; kind: PlanKind }>({ title: '', idea: '', kind: 'new' });
  const [busy, setBusy] = useState(false);
  // Load once: flash is not a stable function, so it must not re-run this.
  useEffect(() => { loadPlans().then(setPlans, e => { flash((e as Error).message); setPlans([]); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const start = async () => {
    setBusy(true);
    try { const p = await createPlan(f); onOpen(p.id); } catch (e) { flash((e as Error).message); }
    setBusy(false);
  };
  return (
    <ScrollView contentContainerStyle={[s.body, wide && s.wide]} keyboardShouldPersistTaps="handled">
      <Text style={s.muted}>From an early idea to a concept, plans and a launch, then keep the plan up to date as you learn.</Text>
      <View style={s.card}>
        <Head icon="bulb-outline" title="Start from an idea" sub="A sentence or two is enough. Nexora turns it into a concept and a plan, step by step." />
        <View style={[s.row, { marginTop: 14 }]}>
          {([['new', 'A new business idea'], ['existing', 'Grow my current business']] as const).map(([k, t]) => (
            <Pressable key={k} onPress={() => setF({ ...f, kind: k })} accessibilityRole="radio" accessibilityState={{ checked: f.kind === k }} style={[s.toggle, f.kind === k && s.toggleOn]}>
              <Text style={[s.toggleText, f.kind === k && { color: '#FFF' }]}>{t}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={s.label}>Your idea</Text>
        <TextInput value={f.idea} onChangeText={t => setF({ ...f, idea: t })} multiline maxLength={4000} placeholderTextColor="#A5AFBB" style={[s.input, s.area]}
          placeholder={f.kind === 'new' ? 'e.g. A delivery service for home-cooked lunches for office workers in Lekki' : 'e.g. Start selling our phone accessories to schools and offices in bulk'} />
        <Text style={s.label}>Name (optional)</Text>
        <TextInput value={f.title} onChangeText={t => setF({ ...f, title: t })} maxLength={120} placeholder="e.g. Lekki Lunch Box" placeholderTextColor="#A5AFBB" style={s.input} />
        <Btn label={busy ? 'Starting…' : 'Start my plan'} icon="sparkles" disabled={busy || !f.idea.trim()} onPress={start} />
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>How it works</Text>
        {STEPS.map(st => (
          <View key={st.key} style={[s.row, { marginTop: 12, alignItems: 'flex-start' }]}>
            <View style={s.icon}><Ionicons name={STEP_ICON[st.key] as any} size={18} color="#1E56A0" /></View>
            <View style={{ flex: 1 }}><Text style={s.bold}>{st.n}. {st.title}</Text><Text style={s.small}>{st.sub}</Text></View>
          </View>
        ))}
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>My plans</Text>
        {plans === null ? <ActivityIndicator style={{ marginTop: 16 }} color="#1E56A0" /> : !plans.length ? (
          <View style={s.empty}><Text style={s.muted}>No plans yet. Describe an idea above to start your first one.</Text></View>
        ) : plans.map(p => {
          const pr = progress(p);
          return (
            <Pressable key={p.id} onPress={() => onOpen(p.id)} accessibilityRole="button" style={s.listRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.bold} numberOfLines={1}>{p.title}</Text>
                <Text style={s.small} numberOfLines={1}>{p.idea}</Text>
                <View style={[s.row, { marginTop: 6 }]}>
                  <View style={s.bar}><View style={[s.barFill, { width: `${(pr.done / pr.total) * 100}%` }]} /></View>
                  <Text style={s.tiny}>{pr.done} of {pr.total} parts · {p.kind === 'new' ? 'New idea' : 'Grow the business'}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#8A97A6" />
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ---------- One plan ----------
function PlanView({ id, userId, flash, callFn, wide, onClose }: {
  id: string; userId: string; flash: (t: string) => void; callFn: (name: string, body: Record<string, unknown>) => Promise<any>; wide: boolean; onClose: () => void;
}) {
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined);
  const ref = useRef<Plan | null>(null);
  const [step, setStep] = useState(0);
  const [work, setWork] = useState<string | null>(null);
  const stopRef = useRef(false);
  const [edit, setEdit] = useState<{ key: string; text: string } | null>(null);
  const [about, setAbout] = useState<{ title: string; idea: string; kind: PlanKind } | null>(null);
  const [versions, setVersions] = useState<string | null>(null);
  const [goal, setGoal] = useState<{ kind: GoalKind; target: string; period: GoalPeriod; deadline: string; title: string; unit: string } | null>(null);
  const [del, setDel] = useState(false);
  const scroll = useRef<any>(null);

  useEffect(() => {
    loadPlan(id).then(p => {
      ref.current = p; setPlan(p);
      if (p) { const i = PLAN_STEPS.findIndex(st => st.parts.some(d => !p.sections[d.key]?.text)); setStep(i < 0 ? 4 : i); }
    }, e => { flash((e as Error).message); setPlan(null); });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps -- load when the plan changes, not when flash changes

  const apply = useCallback(async (fn: (p: Plan) => Parameters<typeof patchPlan>[1]) => {
    const cur = ref.current; if (!cur) return;
    const next = await patchPlan(cur.id, fn(cur));
    ref.current = next; setPlan(next);
  }, []);
  const draft = async (keys: string[]) => {
    stopRef.current = false;
    for (const [i, key] of keys.entries()) {
      if (stopRef.current) break;
      setWork(keys.length > 1 ? `Writing ${partDef(key)!.label} (${i + 1} of ${keys.length})…` : `Writing ${partDef(key)!.label}…`);
      const note = keys.length > 1 ? `Writing ${partDef(key)!.label} (${i + 1} of ${keys.length})…` : `Writing ${partDef(key)!.label}…`;
      try {
        const text = await writePartPatient(draftPrompt(ref.current!, key), secs => setWork(`${note} The AI’s free per-minute limit was reached; trying again in ${secs} s.`), () => stopRef.current);
        await apply(p => withPart(p, key, text, 'ai', 'Replaced by a new draft from Nexora'));
      }
      catch (e) { flash((e as Error).message); break; }
    }
    setWork(null);
  };

  if (plan === undefined) return <ActivityIndicator style={{ marginTop: 40 }} color="#1E56A0" />;
  if (plan === null) return <View style={[s.body, { alignItems: 'center' }]}><Text style={s.bold}>This plan was not found</Text><Btn label="All plans" onPress={onClose} /></View>;

  const pr = progress(plan);
  const cur = STEPS[step];
  const missing = cur.parts.filter(d => !plan.sections[d.key]?.text).map(d => d.key);
  const share = (t: string) => { Share.share({ message: t }).catch(() => {}); };
  const saveToLibrary = async () => {
    const { error } = await supabase.from('ai_saved_items').insert({ user_id: userId, kind: 'plan', title: plan.title.slice(0, 200), content: planMarkdown(plan).slice(0, 20000), tags: ['business plan'] });
    flash(error ? error.message : 'Saved to Saved work');
  };
  const go = (i: number) => { setStep(i); scroll.current?.scrollTo({ y: 0, animated: true }); };

  return (
    <>
      <ScrollView ref={scroll} contentContainerStyle={[s.body, wide && s.wide]} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <Text style={s.eyebrow}>{plan.kind === 'new' ? 'NEW BUSINESS IDEA' : 'PLAN TO GROW THE BUSINESS'}</Text>
          <Text style={s.planTitle}>{plan.title}</Text>
          <Text style={[s.muted, { marginTop: 4 }]}>{plan.idea}</Text>
          <View style={[s.row, { marginTop: 10 }]}>
            <View style={[s.bar, { width: 140 }]}><View style={[s.barFill, { width: `${(pr.done / pr.total) * 100}%` }]} /></View>
            <Text style={s.tiny}>{pr.done} of {pr.total} parts written</Text>
          </View>
          <View style={[s.row, { flexWrap: 'wrap', marginTop: 12 }]}>
            <Small icon="create-outline" label="Edit idea" onPress={() => setAbout({ title: plan.title, idea: plan.idea, kind: plan.kind })} />
            <Small icon="share-outline" label="Share" disabled={!pr.done} onPress={() => share(planMarkdown(plan))} />
            <Small icon="bookmark-outline" label="Save" disabled={!pr.done} onPress={saveToLibrary} />
            <Small icon="trash-outline" label="Delete" danger onPress={() => setDel(true)} />
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {STEPS.map((st, i) => {
            const done = st.key === 'learn' ? plan.learnings.length : st.parts.filter(d => plan.sections[d.key]?.text).length;
            const full = st.key !== 'learn' && done === st.parts.length;
            return (
              <Pressable key={st.key} onPress={() => go(i)} accessibilityRole="tab" accessibilityState={{ selected: i === step }} style={[s.stepChip, i === step && s.stepChipOn]}>
                <Ionicons name={(full ? 'checkmark-circle' : STEP_ICON[st.key]) as any} size={16} color={full ? '#1A8F5A' : '#1E56A0'} />
                <View><Text style={s.stepChipText}>{st.n}. {st.title}</Text>
                  <Text style={s.tiny}>{st.key === 'learn' ? `${done} lesson${done === 1 ? '' : 's'}` : `${done} of ${st.parts.length} written`}</Text></View>
              </Pressable>
            );
          })}
        </ScrollView>

        <View>
          <Text style={s.stepTitle}>{cur.n}. {cur.title}</Text>
          <Text style={s.muted}>{cur.sub}</Text>
          {cur.key !== 'learn' && (work ? <Btn soft label="Stop after this part" icon="stop-circle-outline" onPress={() => { stopRef.current = true; }} />
            : missing.length > 1 ? <Btn label={`Draft the ${missing.length} missing parts`} icon="sparkles" onPress={() => draft(missing)} /> : null)}
          {!!work && <View style={s.working}><ActivityIndicator size="small" color="#1E56A0" /><Text style={s.workingText}>{work}{work.includes('trying again') ? '' : ' This can take up to a minute.'}</Text></View>}
        </View>

        {cur.key !== 'learn' ? cur.parts.map(d => {
          const part = plan.sections[d.key];
          const old = plan.history.filter(h => h.key === d.key).length;
          return (
            <View key={d.key} style={s.card}>
              <Text style={s.partTitle}>{d.label}</Text>
              <Text style={s.small}>{d.sub} · Method: {d.method}</Text>
              {part?.text ? (
                <>
                  <View style={{ marginTop: 10 }}><Md text={part.text} /></View>
                  <Text style={[s.tiny, { marginTop: 10 }]}>{part.by === 'ai' ? 'Written by Nexora' : part.by === 'update' ? 'Updated from what you learned' : 'Edited by you'} · {when(part.updated_at)}{old ? ` · ${old} earlier version${old === 1 ? '' : 's'}` : ''}</Text>
                  <View style={[s.row, { flexWrap: 'wrap', marginTop: 10 }]}>
                    <Small icon="refresh-outline" label="Redraft" disabled={!!work} onPress={() => draft([d.key])} />
                    <Small icon="create-outline" label="Edit" disabled={!!work} onPress={() => setEdit({ key: d.key, text: part.text })} />
                    <Small icon="share-outline" label="Share" onPress={() => share(`${d.label}\n\n${part.text}`)} />
                    {old > 0 && <Small icon="time-outline" label="Earlier versions" onPress={() => setVersions(d.key)} />}
                    {d.key === 'goals' && <Small icon="flag-outline" label="Track a goal" onPress={() => setGoal({ kind: 'revenue', target: '', period: 'month', deadline: '', title: '', unit: '' })} />}
                  </View>
                </>
              ) : (
                <View style={[s.row, { flexWrap: 'wrap' }]}>
                  <Btn label={work ? 'Please wait…' : 'Draft with Nexora'} icon="sparkles" disabled={!!work} onPress={() => draft([d.key])} />
                  <Pressable disabled={!!work} onPress={() => setEdit({ key: d.key, text: '' })} style={{ marginTop: 12, padding: 10 }}><Text style={s.link}>Write it myself</Text></Pressable>
                </View>
              )}
            </View>
          );
        }) : <LearnStep plan={plan} current={() => ref.current} apply={apply} busy={!!work} setWork={setWork} stopRef={stopRef} flash={flash} openVersions={setVersions} />}

        {step < STEPS.length - 1 && (
          <Pressable onPress={() => go(step + 1)} style={[s.row, { paddingVertical: 8 }]} accessibilityRole="button">
            <Text style={s.link}>Next: {STEPS[step + 1].title}</Text><Ionicons name="chevron-forward" size={16} color="#1E56A0" />
          </Pressable>
        )}
      </ScrollView>

      <Sheet visible={!!edit} title={edit ? `${plan.sections[edit.key]?.text ? 'Edit' : 'Write'} ${partDef(edit.key)!.label.toLowerCase()}` : ''} onClose={() => setEdit(null)}>
        <TextInput value={edit?.text ?? ''} onChangeText={t => setEdit(e => e && { ...e, text: t })} multiline maxLength={20000} style={[s.input, { height: 320, textAlignVertical: 'top', paddingTop: 10, marginTop: 12 }]} />
        <Text style={s.tiny}>Use # for headings, - for bullet points and **bold**.</Text>
        <Btn label="Save" disabled={!edit?.text.trim()} onPress={async () => {
          if (!edit) return;
          try { await apply(p => withPart(p, edit.key, edit.text.trim(), 'you', 'Replaced when you edited it')); setEdit(null); flash('Saved'); } catch (e) { flash((e as Error).message); }
        }} />
      </Sheet>

      <Sheet visible={!!about} title="Edit the idea" onClose={() => setAbout(null)}>
        <Text style={s.label}>Name</Text>
        <TextInput value={about?.title ?? ''} onChangeText={t => setAbout(a => a && { ...a, title: t })} maxLength={120} style={s.input} />
        <Text style={s.label}>The idea</Text>
        <TextInput value={about?.idea ?? ''} onChangeText={t => setAbout(a => a && { ...a, idea: t })} multiline maxLength={4000} style={[s.input, s.area]} />
        <View style={[s.row, { marginTop: 12 }]}>
          {([['new', 'A new business idea'], ['existing', 'Grow my current business']] as const).map(([k, t]) => (
            <Pressable key={k} onPress={() => setAbout(a => a && { ...a, kind: k })} style={[s.toggle, about?.kind === k && s.toggleOn]}><Text style={[s.toggleText, about?.kind === k && { color: '#FFF' }]}>{t}</Text></Pressable>
          ))}
        </View>
        <Btn label="Save" disabled={!about?.title.trim() || !about?.idea.trim()} onPress={async () => {
          if (!about) return;
          try { await apply(() => ({ title: about.title.trim(), idea: about.idea.trim(), kind: about.kind })); setAbout(null); flash('Saved'); } catch (e) { flash((e as Error).message); }
        }} />
      </Sheet>

      <Versions plan={plan} partKey={versions} onClose={() => setVersions(null)}
        onRestore={async v => { try { await apply(p => withPart(p, v.key, v.text, 'you', 'Replaced when you restored an earlier version')); setVersions(null); flash('Earlier version restored'); } catch (e) { flash((e as Error).message); } }} />

      <Sheet visible={!!goal} title="Track a goal" onClose={() => setGoal(null)}>
        {goal && (
          <>
            <Text style={s.small}>Nexora tracks it against your real orders in Insights and in Brain’s answers.</Text>
            <Text style={s.label}>What to track</Text>
            <View style={[s.row, { flexWrap: 'wrap' }]}>
              {([['revenue', 'Sales'], ['orders', 'Orders'], ['customers', 'New customers'], ['custom', 'Other']] as const).map(([k, t]) => (
                <Pressable key={k} onPress={() => setGoal({ ...goal, kind: k })} style={[s.toggle, goal.kind === k && s.toggleOn]}><Text style={[s.toggleText, goal.kind === k && { color: '#FFF' }]}>{t}</Text></Pressable>
              ))}
            </View>
            <Text style={s.label}>Target</Text>
            <TextInput value={goal.target} onChangeText={t => setGoal({ ...goal, target: t })} keyboardType="decimal-pad" placeholder="e.g. 500000" placeholderTextColor="#A5AFBB" style={s.input} />
            {goal.kind === 'custom' && <><Text style={s.label}>Unit</Text><TextInput value={goal.unit} onChangeText={t => setGoal({ ...goal, unit: t })} maxLength={24} placeholder="e.g. sign-ups" placeholderTextColor="#A5AFBB" style={s.input} /></>}
            <Text style={s.label}>By when</Text>
            <View style={[s.row, { flexWrap: 'wrap' }]}>
              {([['week', 'This week'], ['month', 'This month'], ['quarter', 'This quarter'], ['year', 'This year'], ['date', 'A date']] as const).map(([k, t]) => (
                <Pressable key={k} onPress={() => setGoal({ ...goal, period: k })} style={[s.toggle, goal.period === k && s.toggleOn]}><Text style={[s.toggleText, goal.period === k && { color: '#FFF' }]}>{t}</Text></Pressable>
              ))}
            </View>
            {goal.period === 'date' && <><Text style={s.label}>Date (YYYY-MM-DD)</Text><TextInput value={goal.deadline} onChangeText={t => setGoal({ ...goal, deadline: t })} placeholder="2026-12-31" placeholderTextColor="#A5AFBB" style={s.input} /></>}
            <Text style={s.label}>Name (optional)</Text>
            <TextInput value={goal.title} onChangeText={t => setGoal({ ...goal, title: t })} maxLength={120} placeholder="Nexora names it if you leave this empty" placeholderTextColor="#A5AFBB" style={s.input} />
            <Btn label="Add goal" onPress={async () => {
              const target = Number(goal.target.replace(/[^0-9.]/g, ''));
              if (!target) { flash('Enter a target above zero'); return; }
              if (goal.period === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(goal.deadline.trim())) { flash('Enter the date like 2026-12-31'); return; }
              const amount = target.toLocaleString();
              const word = { week: 'this week', month: 'this month', quarter: 'this quarter', year: 'this year', date: 'by the date' }[goal.period];
              const auto = goal.kind === 'revenue' ? `Reach ${amount} in sales ${word}` : goal.kind === 'orders' ? `Get ${amount} orders ${word}`
                : goal.kind === 'customers' ? `Win ${amount} new customers ${word}` : `Reach ${amount} ${goal.unit.trim()}`.trim();
              try {
                await callFn('nexora-insights', { action: 'goal_save', kind: goal.kind, title: goal.title.trim() || auto, target, period: goal.period,
                  deadline: goal.period === 'date' ? goal.deadline.trim() : null, why: `From the plan "${plan.title}"`.slice(0, 400), unit: goal.unit.trim(), progress: null, tz_offset_min: -new Date().getTimezoneOffset() });
                setGoal(null); flash('Goal added. Track it in Insights.');
              } catch (e) { flash((e as Error).message || "Couldn't save the goal."); }
            }} />
          </>
        )}
      </Sheet>

      <Modal visible={del} transparent animationType="fade" onRequestClose={() => setDel(false)} statusBarTranslucent>
        <View style={s.overlay}>
          <View style={[s.dialog, { alignItems: 'center' }]}>
            <Text style={s.cardTitle}>Delete “{plan.title}”?</Text>
            <Text style={[s.muted, { textAlign: 'center', marginTop: 4 }]}>The whole plan and its history are removed. Copies you saved in Saved work stay.</Text>
            <Pressable onPress={async () => { try { await deletePlan(plan.id); setDel(false); onClose(); } catch (e) { flash((e as Error).message); setDel(false); } }}
              accessibilityRole="button" style={[s.primary, { backgroundColor: '#D64545', alignSelf: 'stretch' }]}><Text style={s.primaryText}>Delete plan</Text></Pressable>
            <Pressable onPress={() => setDel(false)} style={{ paddingVertical: 12 }}><Text style={s.link}>Cancel</Text></Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

// ---------- Step 5: learn and update ----------
function LearnStep({ plan, current, apply, busy, setWork, stopRef, flash, openVersions }: {
  plan: Plan; current: () => Plan | null; apply: (fn: (p: Plan) => Parameters<typeof patchPlan>[1]) => Promise<void>; busy: boolean;
  setWork: (w: string | null) => void; stopRef: { current: boolean }; flash: (t: string) => void; openVersions: (k: string) => void;
}) {
  const [snap, setSnap] = useState<Snapshot | undefined>(undefined);
  const [kind, setKind] = useState<Learning['kind']>('customer');
  const [text, setText] = useState('');
  const written = ALL_PARTS.filter(d => plan.sections[d.key]?.text);
  const [pick, setPick] = useState<Set<string>>(() => new Set(written.filter(d => UPDATE_DEFAULT.includes(d.key)).map(d => d.key)));
  const fetchSnap = useCallback(() => loadSnapshot().then(setSnap, () => setSnap(null)), []);
  useEffect(() => { fetchSnap(); }, [fetchSnap]);

  const add = async () => {
    if (!text.trim()) return;
    try { await apply(p => ({ learnings: [...p.learnings, { id: newLearningId(), at: new Date().toISOString(), kind, text: text.trim().slice(0, 1000) }].slice(-100) })); setText(''); flash('Lesson added'); }
    catch (e) { flash((e as Error).message); }
  };
  const update = async () => {
    const keys = written.map(d => d.key).filter(k => pick.has(k));
    stopRef.current = false;
    const sn = snap ?? await loadSnapshot().catch(() => null);
    let n = 0;
    for (const [i, key] of keys.entries()) {
      if (stopRef.current) break;
      setWork(`Updating ${partDef(key)!.label} (${i + 1} of ${keys.length})…`);
      try {
        const out = await writePartPatient(updatePrompt(current() ?? plan, key, sn ?? null),
          secs => setWork(`Updating ${partDef(key)!.label} (${i + 1} of ${keys.length})… The AI’s free per-minute limit was reached; trying again in ${secs} s.`), () => stopRef.current);
        await apply(p => withPart(p, key, out, 'update', 'Replaced by the update from what you learned'));
        n++;
      } catch (e) { flash((e as Error).message); break; }
    }
    setWork(null);
    if (n) flash(`${n} part${n === 1 ? '' : 's'} updated. Earlier versions are kept.`);
  };
  const changes = [...plan.history].reverse().slice(0, 12);

  return (
    <>
      <View style={s.card}>
        <View style={s.row}><Text style={[s.partTitle, { flex: 1 }]}>Latest results</Text>
          <Pressable onPress={() => { setSnap(undefined); fetchSnap(); }} hitSlop={8} accessibilityLabel="Refresh results"><Ionicons name="refresh-outline" size={20} color="#5C6B7A" /></Pressable></View>
        {snap === undefined ? <ActivityIndicator style={{ marginTop: 10 }} color="#1E56A0" /> : <Text style={[s.body2, { marginTop: 6 }]}>{snapshotText(snap)}</Text>}
        <Text style={[s.tiny, { marginTop: 6 }]}>From your orders in Nexora (cancelled orders and refunds left out). Updates also use your goals and business knowledge.</Text>
      </View>

      <View style={s.card}>
        <Text style={s.partTitle}>What we have learned</Text>
        <Text style={s.small}>Note what customers say and what the numbers show. Updates use these lessons.</Text>
        <View style={[s.row, { flexWrap: 'wrap', marginTop: 10 }]}>
          {(Object.keys(LEARNING_KIND) as Learning['kind'][]).map(k => (
            <Pressable key={k} onPress={() => setKind(k)} style={[s.toggle, kind === k && s.toggleOn]}><Text style={[s.toggleText, kind === k && { color: '#FFF' }]}>{LEARNING_KIND[k]}</Text></Pressable>
          ))}
        </View>
        <TextInput value={text} onChangeText={setText} multiline maxLength={1000} accessibilityLabel="What did you learn?" placeholderTextColor="#A5AFBB"
          placeholder="e.g. Customers say the price is fine but delivery takes too long" style={[s.input, { height: 80, textAlignVertical: 'top', paddingTop: 10, marginTop: 10 }]} />
        <Btn soft label="Add lesson" icon="add" disabled={!text.trim()} onPress={add} />
        {[...plan.learnings].reverse().map(l => (
          <View key={l.id} style={s.listRow}>
            <View style={{ flex: 1 }}><Text style={s.body2}><Text style={s.tag}>{LEARNING_KIND[l.kind]}  </Text>{l.text}</Text><Text style={s.tiny}>{when(l.at)}</Text></View>
            <Pressable onPress={() => apply(p => ({ learnings: p.learnings.filter(x => x.id !== l.id) })).catch(e => flash((e as Error).message))} hitSlop={8} accessibilityLabel="Remove lesson">
              <Ionicons name="trash-outline" size={18} color="#8A97A6" /></Pressable>
          </View>
        ))}
      </View>

      <View style={s.card}>
        <Text style={s.partTitle}>Update my plan</Text>
        {!written.length ? <Text style={s.small}>Write some parts of the plan first (steps 1 to 4), then come back to update them.</Text> : (
          <>
            <Text style={s.small}>Nexora rewrites the parts you tick using your lessons and latest results, and says what changed. Earlier versions are kept.</Text>
            <View style={[s.row, { flexWrap: 'wrap', marginTop: 10 }]}>
              {written.map(d => {
                const on = pick.has(d.key);
                return <Pressable key={d.key} onPress={() => { const nx = new Set(pick); if (on) nx.delete(d.key); else nx.add(d.key); setPick(nx); }}
                  accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={[s.pick, on && s.pickOn]}><Text style={[s.toggleText, on && { color: '#1E56A0' }]}>{on ? '✓ ' : ''}{d.label}</Text></Pressable>;
              })}
            </View>
            {!plan.learnings.length && <Text style={[s.tiny, { color: '#B26A00', marginTop: 8 }]}>Tip: add at least one lesson first, so the update has something to learn from.</Text>}
            <Btn label={`Update ${pick.size} part${pick.size === 1 ? '' : 's'}`} icon="sparkles" disabled={busy || !pick.size} onPress={update} />
          </>
        )}
      </View>

      {!!changes.length && (
        <View style={s.card}>
          <Text style={s.partTitle}>Change history</Text>
          {changes.map((h, i) => (
            <View key={`${h.key}${h.at}${i}`} style={s.listRow}>
              <View style={{ flex: 1 }}><Text style={s.body2}><Text style={s.bold}>{partDef(h.key)?.label}</Text> · version from {when(h.at)}</Text><Text style={s.tiny}>{h.why}</Text></View>
              <Pressable onPress={() => openVersions(h.key)}><Text style={s.link}>View</Text></Pressable>
            </View>
          ))}
        </View>
      )}
    </>
  );
}

function Versions({ plan, partKey, onClose, onRestore }: { plan: Plan; partKey: string | null; onClose: () => void; onRestore: (v: PlanVersion) => void }) {
  const list = partKey ? plan.history.filter(h => h.key === partKey).reverse() : [];
  const [i, setI] = useState(0);
  const v = list[Math.min(i, list.length - 1)];
  return (
    <Sheet visible={!!partKey} title={`Earlier versions: ${partKey ? partDef(partKey)?.label : ''}`} onClose={() => { setI(0); onClose(); }}>
      {!v ? <Text style={s.small}>No earlier versions.</Text> : (
        <>
          <ScrollView horizontal contentContainerStyle={{ gap: 8, marginTop: 10 }}>
            {list.map((h, j) => <Pressable key={j} onPress={() => setI(j)} style={[s.toggle, i === j && s.toggleOn]}><Text style={[s.toggleText, i === j && { color: '#FFF' }]}>{when(h.at)}</Text></Pressable>)}
          </ScrollView>
          <ScrollView style={{ maxHeight: 360, marginTop: 10, backgroundColor: '#F7F9FC', borderRadius: 12, padding: 12 }}><Md text={v.text} /></ScrollView>
          <Btn label="Use this version" onPress={() => { setI(0); onRestore(v); }} />
        </>
      )}
    </Sheet>
  );
}

// ---------- Small building blocks ----------
function Head({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <View style={[s.row, { alignItems: 'center', gap: 12 }]}>
      <View style={s.icon}><Ionicons name={icon as any} size={20} color="#1E56A0" /></View>
      <View style={{ flex: 1 }}><Text style={s.cardTitle}>{title}</Text><Text style={s.small}>{sub}</Text></View>
    </View>
  );
}
function Btn({ label, icon, onPress, disabled, soft }: { label: string; icon?: string; onPress: () => void; disabled?: boolean; soft?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={[s.primary, soft && { backgroundColor: '#EAF1FB' }, disabled && { opacity: 0.5 }]}>
      {icon && <Ionicons name={icon as any} size={16} color={soft ? '#1E56A0' : '#FFF'} />}<Text style={[s.primaryText, soft && { color: '#1E56A0' }]}>{label}</Text>
    </Pressable>
  );
}
function Small({ icon, label, onPress, disabled, danger }: { icon: string; label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} style={[s.small2, disabled && { opacity: 0.4 }]}>
      <Ionicons name={icon as any} size={15} color={danger ? '#D64545' : '#1E56A0'} /><Text style={[s.small2Text, danger && { color: '#D64545' }]}>{label}</Text>
    </Pressable>
  );
}
function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.overlay}>
        <View style={s.dialog}>
          <View style={s.row}><Text style={[s.cardTitle, { flex: 1 }]}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close"><Ionicons name="close" size={22} color="#5C6B7A" /></Pressable></View>
          <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** A light Markdown view for plan parts: headings, bullets, numbered lists, tick boxes, tables and **bold**. */
function Md({ text }: { text: string }) {
  const inline = (t: string) => t.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <Text key={i} style={{ fontWeight: '700' }}>{p.slice(2, -2)}</Text> : p));
  const out: React.ReactNode[] = [];
  let table: string[][] = [];
  const flush = () => {
    if (!table.length) return;
    const rows = table; table = [];
    out.push(
      <ScrollView key={`t${out.length}`} horizontal style={{ marginVertical: 6 }}>
        <View style={{ borderWidth: 1, borderColor: '#E1E8F0', borderRadius: 8 }}>
          {rows.map((r, ri) => (
            <View key={ri} style={{ flexDirection: 'row', backgroundColor: ri === 0 ? '#EEF3FB' : '#FFF', borderTopWidth: ri ? 1 : 0, borderTopColor: '#E1E8F0' }}>
              {r.map((c, ci) => <Text key={ci} style={{ width: 130, padding: 6, fontSize: 12.5, lineHeight: 17, color: '#1F2A37', fontWeight: ri === 0 ? '700' : '400' }}>{inline(c)}</Text>)}
            </View>
          ))}
        </View>
      </ScrollView>,
    );
  };
  text.replace(/\r/g, '').split('\n').forEach((raw, i) => {
    const l = raw.trimEnd();
    if (/^\s*\|/.test(l)) { if (!/^\s*\|?\s*:?-{2,}/.test(l)) table.push(l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())); return; }
    flush();
    const h = l.match(/^(#{1,4})\s+(.*)/);
    const b = l.match(/^\s*[-*•]\s+(?:\[( |x)\]\s*)?(.*)/i);
    const n = l.match(/^\s*(\d+)[.)]\s+(.*)/);
    if (h) out.push(<Text key={i} style={{ marginTop: 10, marginBottom: 2, fontSize: h[1].length <= 2 ? 16 : 14.5, fontWeight: '700', color: '#0B1220' }}>{inline(h[2])}</Text>);
    else if (b) out.push(<View key={i} style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}><Text style={s.body2}>{b[1] !== undefined ? (b[1].toLowerCase() === 'x' ? '☑' : '☐') : '•'}</Text><Text style={[s.body2, { flex: 1 }]}>{inline(b[2])}</Text></View>);
    else if (n) out.push(<View key={i} style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}><Text style={[s.body2, { fontWeight: '700' }]}>{n[1]}.</Text><Text style={[s.body2, { flex: 1 }]}>{inline(n[2])}</Text></View>);
    else if (l.trim()) out.push(<Text key={i} style={[s.body2, { marginTop: 6 }]}>{inline(l)}</Text>);
  });
  flush();
  return <View>{out}</View>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F7FB' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E6ECF3' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: '#0B1220' },
  body: { padding: 16, paddingBottom: 48, gap: 14 },
  wide: { width: '100%', maxWidth: 1000, alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  muted: { fontSize: 13, color: '#5C6B7A', lineHeight: 19 },
  small: { fontSize: 12.5, color: '#5C6B7A', lineHeight: 18 },
  tiny: { fontSize: 11.5, color: '#8A97A6' },
  bold: { fontSize: 14, fontWeight: '700', color: '#0B1220' },
  body2: { fontSize: 14, lineHeight: 21, color: '#1F2A37' },
  tag: { fontSize: 11.5, fontWeight: '700', color: '#5C6B7A' },
  link: { fontSize: 14, fontWeight: '700', color: '#1E56A0' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E6ECF3', padding: 16, width: '100%' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#0B1220' },
  eyebrow: { fontSize: 11.5, fontWeight: '700', color: '#8A97A6', letterSpacing: 0.5 },
  planTitle: { fontSize: 20, fontWeight: '700', color: '#0B1220', marginTop: 2 },
  stepTitle: { fontSize: 18, fontWeight: '700', color: '#0B1220' },
  partTitle: { fontSize: 15.5, fontWeight: '700', color: '#0B1220' },
  icon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#EAF1FB', alignItems: 'center', justifyContent: 'center' },
  label: { marginTop: 12, marginBottom: 4, fontSize: 12, fontWeight: '600', color: '#5C6B7A' },
  input: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: '#D5DEE8', paddingHorizontal: 12, fontSize: 14, color: '#0B1220', backgroundColor: '#FFF' },
  area: { height: 100, textAlignVertical: 'top', paddingTop: 10 },
  toggle: { height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: '#F1F5F9', justifyContent: 'center' },
  toggleOn: { backgroundColor: '#0F2942' },
  toggleText: { fontSize: 12.5, fontWeight: '600', color: '#1F2A37' },
  pick: { height: 32, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: '#E1E8F0', justifyContent: 'center' },
  pickOn: { borderColor: '#1E56A0', backgroundColor: '#EAF1FB' },
  primary: { marginTop: 14, height: 46, borderRadius: 23, backgroundColor: '#1E56A0', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18, alignSelf: 'flex-start' },
  primaryText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  small2: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 32, paddingHorizontal: 11, borderRadius: 16, borderWidth: 1, borderColor: '#E1E8F0' },
  small2Text: { fontSize: 12.5, fontWeight: '600', color: '#1E56A0' },
  stepChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: 1, borderColor: '#E1E8F0', backgroundColor: '#FFF' },
  stepChipOn: { borderColor: '#1E56A0', backgroundColor: '#EAF1FB' },
  stepChipText: { fontSize: 13, fontWeight: '700', color: '#0B1220' },
  working: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, padding: 10, borderRadius: 12, backgroundColor: '#EAF1FB' },
  workingText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#1E56A0' },
  bar: { height: 6, width: 110, borderRadius: 3, backgroundColor: '#E6ECF3', overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: '#1E56A0' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  empty: { marginTop: 12, backgroundColor: '#F4F7FB', borderRadius: 12, padding: 12 },
  overlay: { flex: 1, backgroundColor: 'rgba(11,18,32,0.45)', justifyContent: 'center', padding: 16 },
  dialog: { backgroundColor: '#FFF', borderRadius: 20, padding: 18, width: '100%', maxWidth: 560, alignSelf: 'center', maxHeight: '90%' },
});
