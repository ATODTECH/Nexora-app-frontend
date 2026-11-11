import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, TextInput } from '../lib/inter';
import { AREAS, EXTRAS, loadTeam, roleLabel, withViews, type Access, type Perms, type TeamMember } from '../lib/team';
import {
  TRIGGERS, addNote, deleteRole, deleteTask, deleteWorkflow, loadNotes, loadRoles, loadTasks, loadWorkflows, markReviewed, memberRoles, myMentions,
  reviewInfo, saveRole, saveTask, saveWorkflow, setTaskDone, setWorkflowOn,
  type Note, type ReviewInfo, type Task, type TaskForm, type TaskPriority, type TeamRole, type Workflow, type WorkflowForm,
} from '../lib/workspace';

// Capability 2.14 in the app: the Team workspace. Same data and rules as the website's /team page:
// My work, Tasks (assigned, linked to orders and customers, with notes), Workflows (tasks handed out automatically),
// Roles and access review, and Admin (seats, billing, integrations, security). People and invites stay on Team & Access.
const BLUE = '#1E56A0', INK = '#0B1220', MUTED = '#5C6B7A', LINE = '#E3E8EF', RED = '#B42318', GREEN = '#127A4B';
type Tab = 'work' | 'tasks' | 'workflows' | 'roles' | 'admin';
type Links = { onOpenTeam: () => void; onOpenBilling: () => void; onOpenSecurity: () => void; onOpenActivity: () => void; onOpenApprovals: () => void; onOpenConnect: () => void; onOpenRecord: (t: { related_type: string | null; related_id: string | null }) => void };
const today = () => new Date().toISOString().slice(0, 10);
const fmt = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');
const ROLE_CHOICES = ['admin', 'manager', 'sales', 'support', 'inventory', 'marketing', 'analyst'];

function Btn({ label, onPress, kind = 'primary', busy, icon, flex, disabled }: { label: string; onPress: () => void; kind?: 'primary' | 'outline' | 'danger'; busy?: boolean; icon?: keyof typeof Ionicons.glyphMap; flex?: boolean; disabled?: boolean }) {
  const color = kind === 'primary' ? '#FFFFFF' : kind === 'danger' ? RED : BLUE;
  return (
    <Pressable disabled={busy || disabled} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={[s.btn, kind === 'primary' ? { backgroundColor: BLUE } : kind === 'danger' ? { borderWidth: 1, borderColor: '#F3B8B2', backgroundColor: '#FDECEC' } : { borderWidth: 1, borderColor: '#9DB8DD', backgroundColor: '#FFF' }, flex && { flex: 1 }, (busy || disabled) && { opacity: 0.55 }]}>
      {busy ? <ActivityIndicator color={color} /> : <>{!!icon && <Ionicons name={icon} size={16} color={color} />}<Text style={[s.btnText, { color }]}>{label}</Text></>}
    </Pressable>
  );
}
function Chip({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} accessibilityState={{ selected: on }} style={[s.chip, on && { backgroundColor: BLUE }]}><Text style={[s.chipText, on && { color: '#FFF' }]}>{label}</Text></Pressable>;
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
  <View style={{ marginTop: 10 }}><Text style={s.label}>{label}</Text><TextInput placeholderTextColor="#98A2B3" {...p} style={[s.input, p.multiline && { minHeight: 70, textAlignVertical: 'top', paddingTop: 10 }]} /></View>
);

export function TeamWorkspace({ businessId, me, access, flash, links, onBack, topInset = 0 }: { businessId: string; me: string; access: Access; flash: (t: string) => void; links: Links; onBack: () => void; topInset?: number }) {
  const manager = access.isOwner || access.can('team_manage');
  const [tab, setTab] = useState<Tab>('work');
  const [team, setTeam] = useState<TeamMember[]>([]);
  useEffect(() => { loadTeam().then(t => setTeam(t.filter(m => m.status === 'active')), () => {}); }, []);
  const nameOf = (id?: string | null) => (id ? (id === me ? 'You' : team.find(m => m.user_id === id)?.full_name || 'Team member') : 'Not assigned');
  const props = { businessId, me, manager, flash, team, nameOf, links, access };
  return (
    <View style={{ flex: 1, backgroundColor: '#F7F9FC' }}>
      <View style={[s.header, { paddingTop: topInset + 12 }]}>
        <Pressable onPress={onBack} hitSlop={8} accessibilityLabel="Back"><Ionicons name="chevron-back" size={24} color={INK} /></Pressable>
        <Text style={s.title}>Team workspace</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 48, width: '100%', maxWidth: 900, alignSelf: 'center' }}>
      <Text style={s.muted}>You are {roleLabel(access.role)}. Tasks, notes and who does what, for everyone on the team.</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 10 }}>
        {([['work', 'My work'], ['tasks', 'Tasks'], ['workflows', 'Workflows'], ...(manager ? [['roles', 'Roles and access'], ['admin', 'Admin']] : [])] as [Tab, string][]).map(([k, l]) => <Chip key={k} on={tab === k} label={l} onPress={() => setTab(k)} />)}
        <Chip on={false} label="People and invites ›" onPress={links.onOpenTeam} />
      </ScrollView>
      {tab === 'work' && <MyWork {...props} />}
      {tab === 'tasks' && <Tasks {...props} />}
      {tab === 'workflows' && <Workflows {...props} />}
      {tab === 'roles' && manager && <Roles {...props} />}
      {tab === 'admin' && manager && <Admin {...props} />}
      </ScrollView>
    </View>
  );
}
type P = { businessId: string; me: string; manager: boolean; flash: (t: string) => void; team: TeamMember[]; nameOf: (id?: string | null) => string; links: Links; access: Access };

function MyWork({ businessId, me, nameOf, links }: P) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [mentions, setMentions] = useState<Note[]>([]);
  useEffect(() => { loadTasks(businessId).then(setTasks, () => setTasks([])); myMentions(businessId, me).then(setMentions, () => {}); }, [businessId, me]);
  if (!tasks) return <ActivityIndicator color={BLUE} style={{ marginTop: 20 }} />;
  const open = tasks.filter(t => t.status === 'open');
  const mine = open.filter(t => t.assigned_to === me);
  const overdue = open.filter(t => t.due_date && t.due_date < today());
  const row = (t: Task) => (
    <Pressable key={t.id} onPress={() => links.onOpenRecord(t)} style={s.row}>
      <Text style={[s.body, { flex: 1 }]} numberOfLines={1}>{t.priority === 'high' ? '! ' : ''}{t.title}</Text>
      {!!t.due_date && <Text style={[s.small, t.due_date < today() && { color: RED, fontWeight: '700' }]}>{fmt(t.due_date)}</Text>}
    </Pressable>
  );
  return (
    <View>
      <View style={s.card}><Text style={s.h}>My tasks · {mine.length}</Text>{mine.length ? mine.slice(0, 8).map(row) : <Text style={s.muted}>Nothing given to you.</Text>}</View>
      <View style={s.card}><Text style={s.h}>Overdue across the team · {overdue.length}</Text>{overdue.length ? overdue.slice(0, 8).map(t => <View key={t.id} style={s.row}><Text style={[s.body, { flex: 1 }]} numberOfLines={1}>{t.title}</Text><Text style={s.small}>{nameOf(t.assigned_to)}</Text></View>) : <Text style={s.muted}>Nothing overdue.</Text>}</View>
      <View style={s.card}><Text style={s.h}>Mentions · {mentions.length}</Text>{mentions.length ? mentions.slice(0, 6).map(n => <Pressable key={n.id} onPress={() => links.onOpenRecord({ related_type: n.entity_type === 'task' ? null : n.entity_type, related_id: n.entity_id })} style={s.row}><Text style={[s.body, { flex: 1 }]} numberOfLines={2}>{n.body}</Text><Text style={s.small}>{nameOf(n.author)}</Text></Pressable>) : <Text style={s.muted}>Nobody mentioned you yet.</Text>}</View>
    </View>
  );
}

const blank = (me: string): TaskForm => ({ title: '', details: '', assigned_to: me, due_date: '', priority: 'normal' });
function Tasks({ businessId, me, manager, flash, team, nameOf, links }: P) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [who, setWho] = useState<'mine' | 'all'>('mine');
  const [done, setDone] = useState(false);
  const [edit, setEdit] = useState<{ id?: string; f: TaskForm; t?: Task } | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const reload = useCallback(() => loadTasks(businessId).then(setTasks, e => { flash(e?.message || "Couldn't load tasks."); setTasks([]); }), [businessId, flash]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { if (edit?.id) loadNotes(businessId, 'task', edit.id).then(setNotes, () => setNotes([])); else setNotes([]); }, [edit?.id, businessId]);
  const list = (tasks ?? []).filter(t => (done ? t.status === 'done' : t.status === 'open') && (who === 'all' || t.assigned_to === me));
  const save = async () => {
    if (!edit) return;
    setBusy('save');
    try { await saveTask(businessId, me, edit.f, edit.id); flash(edit.id ? 'Task saved' : `Task given to ${nameOf(edit.f.assigned_to)}`); setEdit(null); reload(); } catch (e: any) { flash(e?.message || "Couldn't save the task."); }
    setBusy('');
  };
  return (
    <View>
      <View style={s.wrap}>
        <Chip on={who === 'mine'} label="Mine" onPress={() => setWho('mine')} />
        <Chip on={who === 'all'} label="Everyone" onPress={() => setWho('all')} />
        <Chip on={done} label={done ? 'Showing done' : 'Show done'} onPress={() => setDone(!done)} />
      </View>
      <View style={s.wrap}><Btn label="New task" icon="add" onPress={() => setEdit({ f: blank(me) })} /></View>
      {tasks === null ? <ActivityIndicator color={BLUE} style={{ marginTop: 20 }} /> : !list.length ? <View style={s.card}><Text style={s.muted}>{done ? 'No finished tasks.' : 'No open tasks here.'}</Text></View> : list.map(t => {
        const late = t.status === 'open' && !!t.due_date && t.due_date < today();
        return (
          <View key={t.id} style={s.card}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <Pressable onPress={() => setTaskDone(t.id, t.status === 'open').then(reload, (e: any) => flash(e?.message))} hitSlop={8} accessibilityLabel={t.status === 'open' ? 'Mark done' : 'Mark not done'}>
                <Ionicons name={t.status === 'done' ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={BLUE} />
              </Pressable>
              <Pressable style={{ flex: 1 }} onPress={() => setEdit({ id: t.id, t, f: { title: t.title, details: t.details ?? '', assigned_to: t.assigned_to ?? '', due_date: t.due_date ?? '', priority: t.priority } })}>
                <Text style={[s.bodyBold, t.status === 'done' && { color: MUTED, textDecorationLine: 'line-through' }]}>{t.title}</Text>
                <Text style={[s.small, late && { color: RED, fontWeight: '700' }]}>{nameOf(t.assigned_to)}{t.due_date ? ` · ${late ? 'overdue, ' : ''}due ${fmt(t.due_date)}` : ''}{t.priority === 'high' ? ' · High' : ''}{t.source === 'workflow' ? ' · from a workflow' : ''}</Text>
              </Pressable>
            </View>
            {!!t.related_id && <Pressable onPress={() => links.onOpenRecord(t)} style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}><Ionicons name="link-outline" size={14} color={BLUE} /><Text style={s.link}>{t.related_label || 'Open the record'}</Text></Pressable>}
          </View>
        );
      })}
      {edit && (
        <Sheet title={edit.id ? 'Task' : 'New task'} onClose={() => setEdit(null)}>
          <Field label="What needs doing?" value={edit.f.title} onChangeText={v => setEdit({ ...edit, f: { ...edit.f, title: v } })} maxLength={200} />
          <Field label="Details" value={edit.f.details} onChangeText={v => setEdit({ ...edit, f: { ...edit.f, details: v } })} multiline />
          <Text style={[s.label, { marginTop: 10 }]}>Who</Text>
          <View style={s.wrap}>{team.map(m => <Chip key={m.user_id} on={edit.f.assigned_to === m.user_id} label={m.user_id === me ? 'Me' : m.full_name} onPress={() => setEdit({ ...edit, f: { ...edit.f, assigned_to: m.user_id } })} />)}</View>
          <Field label="Due (YYYY-MM-DD)" value={edit.f.due_date} onChangeText={v => setEdit({ ...edit, f: { ...edit.f, due_date: v.replace(/[^\d-]/g, '').slice(0, 10) } })} placeholder={today()} />
          <Text style={[s.label, { marginTop: 10 }]}>Priority</Text>
          <View style={s.wrap}>{(['normal', 'high', 'low'] as TaskPriority[]).map(p => <Chip key={p} on={edit.f.priority === p} label={p === 'normal' ? 'Normal' : p === 'high' ? 'High' : 'Low'} onPress={() => setEdit({ ...edit, f: { ...edit.f, priority: p } })} />)}</View>
          {!!edit.id && (
            <View style={[s.card, { backgroundColor: '#F7F9FC' }]}>
              <Text style={s.h}>Team notes</Text>
              {notes.map(n => <View key={n.id} style={{ marginTop: 6 }}><Text style={s.small}>{nameOf(n.author)}</Text><Text style={s.body}>{n.body}</Text></View>)}
              <Field label="Add a note" value={note} onChangeText={setNote} multiline />
              <View style={s.wrap}><Btn label="Add note" disabled={!note.trim()} busy={busy === 'note'} onPress={async () => { setBusy('note'); try { await addNote(businessId, 'task', edit.id!, note, []); setNote(''); setNotes(await loadNotes(businessId, 'task', edit.id!)); } catch (e: any) { flash(e?.message); } setBusy(''); }} /></View>
            </View>
          )}
          <View style={s.wrap}>
            {!!edit.id && (manager || edit.t?.created_by === me) && <Btn label="Delete" kind="danger" icon="trash-outline" onPress={() => deleteTask(edit.id!).then(() => { setEdit(null); flash('Task deleted'); reload(); }, (e: any) => flash(e?.message))} />}
            <Btn label={edit.id ? 'Save' : 'Give task'} busy={busy === 'save'} disabled={edit.f.title.trim().length < 2} onPress={save} flex />
          </View>
        </Sheet>
      )}
    </View>
  );
}

const TEMPLATES: WorkflowForm[] = [
  { name: 'Pack new orders', trigger: 'new_order', assign_mode: 'role', assign_to: null, assign_role: 'inventory', task_title: 'Pack order {record}', due_days: 1, priority: 'normal', assign_record: true, enabled: true },
  { name: 'Call new leads the same day', trigger: 'new_lead', assign_mode: 'role', assign_to: null, assign_role: 'sales', task_title: 'Call {record}', due_days: 0, priority: 'high', assign_record: true, enabled: true },
  { name: 'Thank paid customers', trigger: 'order_paid', assign_mode: 'role', assign_to: null, assign_role: 'support', task_title: 'Thank {record} and confirm delivery', due_days: 1, priority: 'normal', assign_record: true, enabled: true },
];
function Workflows({ businessId, manager, flash, team, nameOf }: P) {
  const [list, setList] = useState<Workflow[] | null>(null);
  const [edit, setEdit] = useState<{ id?: string; f: WorkflowForm } | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(() => loadWorkflows(businessId).then(setList, (e: any) => { flash(e?.message); setList([]); }), [businessId, flash]);
  useEffect(() => { reload(); }, [reload]);
  const who = (w: WorkflowForm) => (w.assign_mode === 'owner' ? 'the owner' : w.assign_mode === 'member' ? nameOf(w.assign_to) : `each ${roleLabel(w.assign_role)} in turn`);
  return (
    <View>
      <Text style={s.muted}>When something happens, Nexora gives the right person a task straight away. If nobody has the role yet, the owner gets it.</Text>
      {list === null ? <ActivityIndicator color={BLUE} style={{ marginTop: 20 }} /> : list.map(w => (
        <View key={w.id} style={s.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={[s.bodyBold, { flex: 1 }]}>{w.name}</Text>
            {manager && <Switch value={w.enabled} onValueChange={v => setWorkflowOn(w.id, v).then(reload, (e: any) => flash(e?.message))} accessibilityLabel={`${w.name} on`} />}
          </View>
          <Text style={s.small}>When {TRIGGERS.find(t => t.k === w.trigger)?.label.toLowerCase()}, give {who(w)} “{w.task_title}”. {w.runs ? `Ran ${w.runs} times.` : 'Not run yet.'}</Text>
          {manager && <View style={s.wrap}>
            <Btn label="Edit" kind="outline" onPress={() => setEdit({ id: w.id, f: { name: w.name, trigger: w.trigger, assign_mode: w.assign_mode, assign_to: w.assign_to, assign_role: w.assign_role, task_title: w.task_title, due_days: w.due_days, priority: w.priority, assign_record: w.assign_record, enabled: w.enabled } })} />
            <Btn label="Delete" kind="danger" onPress={() => deleteWorkflow(w.id).then(() => { flash('Workflow deleted'); reload(); }, (e: any) => flash(e?.message))} />
          </View>}
        </View>
      ))}
      {list && !list.length && <View style={s.card}><Text style={s.muted}>No team workflows yet.</Text></View>}
      {manager && <>
        <Text style={[s.label, { marginTop: 14 }]}>START FROM A TEMPLATE</Text>
        {TEMPLATES.map(t => <Pressable key={t.name} onPress={() => setEdit({ f: t })} style={s.card}><Text style={s.bodyBold}>{t.name}</Text><Text style={s.small}>“{t.task_title}”</Text></Pressable>)}
      </>}
      {edit && (
        <Sheet title={edit.id ? 'Edit workflow' : 'New workflow'} onClose={() => setEdit(null)}>
          <Field label="Name" value={edit.f.name} onChangeText={v => setEdit({ ...edit, f: { ...edit.f, name: v } })} maxLength={80} />
          <Text style={[s.label, { marginTop: 10 }]}>When</Text>
          <View style={s.wrap}>{TRIGGERS.map(t => <Chip key={t.k} on={edit.f.trigger === t.k} label={t.label} onPress={() => setEdit({ ...edit, f: { ...edit.f, trigger: t.k } })} />)}</View>
          <Field label="Task ({record} = order number or customer name)" value={edit.f.task_title} onChangeText={v => setEdit({ ...edit, f: { ...edit.f, task_title: v } })} maxLength={160} />
          <Text style={[s.label, { marginTop: 10 }]}>Give it to</Text>
          <View style={s.wrap}>{([['role', 'A role, in turn'], ['member', 'One person'], ['owner', 'The owner']] as const).map(([k, l]) => <Chip key={k} on={edit.f.assign_mode === k} label={l} onPress={() => setEdit({ ...edit, f: { ...edit.f, assign_mode: k } })} />)}</View>
          {edit.f.assign_mode === 'role' && <View style={s.wrap}>{ROLE_CHOICES.map(r => <Chip key={r} on={edit.f.assign_role === r} label={roleLabel(r)} onPress={() => setEdit({ ...edit, f: { ...edit.f, assign_role: r } })} />)}</View>}
          {edit.f.assign_mode === 'member' && <View style={s.wrap}>{team.map(m => <Chip key={m.user_id} on={edit.f.assign_to === m.user_id} label={m.full_name} onPress={() => setEdit({ ...edit, f: { ...edit.f, assign_to: m.user_id } })} />)}</View>}
          <Text style={[s.label, { marginTop: 10 }]}>Due</Text>
          <View style={s.wrap}>{[0, 1, 2, 3, 7].map(n => <Chip key={n} on={edit.f.due_days === n} label={n === 0 ? 'Same day' : `In ${n} day${n === 1 ? '' : 's'}`} onPress={() => setEdit({ ...edit, f: { ...edit.f, due_days: n } })} />)}</View>
          <View style={s.wrap}><Btn label="Save workflow" busy={busy} onPress={async () => { setBusy(true); try { await saveWorkflow(businessId, edit.f, edit.id); flash('Workflow saved'); setEdit(null); reload(); } catch (e: any) { flash(e?.message); } setBusy(false); }} flex /></View>
        </Sheet>
      )}
    </View>
  );
}

type Level = 'none' | 'see' | 'manage';
const levelOf = (p: Perms, a: string): Level => (p[`${a}_manage` as keyof Perms] ? 'manage' : p[`${a}_view` as keyof Perms] ? 'see' : 'none');
function Roles({ flash, access }: P) {
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [roles, setRoles] = useState<TeamRole[]>([]);
  const [named, setNamed] = useState<Record<string, string>>({});
  const [info, setInfo] = useState<ReviewInfo | null>(null);
  const [edit, setEdit] = useState<{ id?: string; name: string; description: string; perms: Perms } | null>(null);
  const [busy, setBusy] = useState('');
  const reload = useCallback(() => { loadTeam().then(setTeam, () => setTeam([])); loadRoles().then(setRoles, () => {}); memberRoles().then(setNamed, () => {}); reviewInfo().then(setInfo, () => {}); }, []);
  useEffect(() => { reload(); }, [reload]);
  const staff = (team ?? []).filter(m => m.role !== 'owner');
  return (
    <View>
      <View style={s.card}>
        <Text style={s.h}>Access review</Text>
        <Text style={s.muted}>Check who can do what at least every 3 months. {info?.reviewed_at ? `Last reviewed ${new Date(info.reviewed_at).toLocaleDateString()}${info.reviewed_by ? ` by ${info.reviewed_by}` : ''}.` : 'Not reviewed yet.'}</Text>
        {team === null ? <ActivityIndicator color={BLUE} /> : staff.map(m => {
          const p = withViews(m.permissions ?? {});
          const areas = AREAS.map(a => { const l = levelOf(p, a.key); return l === 'none' ? null : `${a.label.split(' ')[0]}: ${l === 'see' ? 'see' : 'manage'}`; }).filter(Boolean).join(' · ');
          const quiet = !m.last_active_at || Date.now() - new Date(m.last_active_at).getTime() > 30 * 86400000;
          return (
            <View key={m.member_id} style={[s.row, { alignItems: 'flex-start' }]}>
              <View style={{ flex: 1 }}>
                <Text style={s.bodyBold}>{m.full_name} · {named[m.member_id] ?? roleLabel(m.job_role)}</Text>
                <Text style={s.small}>{areas || 'No areas'}{p.own_customers_only ? ' · own customers only' : ''}{p.team_manage ? ' · manages the team' : ''}</Text>
                {(quiet || m.status === 'suspended') && <Text style={[s.small, { color: RED }]}>{m.status === 'suspended' ? 'Suspended' : 'Not active for 30+ days'}</Text>}
              </View>
            </View>
          );
        })}
        {team && !staff.length && <Text style={s.muted}>Only you so far.</Text>}
        <View style={s.wrap}><Btn label="Mark as reviewed" busy={busy === 'rev'} onPress={async () => { setBusy('rev'); try { await markReviewed(); flash('Review saved in the activity log'); reload(); } catch (e: any) { flash(e?.message); } setBusy(''); }} flex /></View>
      </View>
      <View style={s.card}>
        <Text style={s.h}>Your own roles</Text>
        <Text style={s.muted}>Make roles like “Delivery rider”, then give them to people in Team & Access. Changing a role changes everyone who has it.</Text>
        {roles.map(r => (
          <View key={r.id} style={s.row}>
            <View style={{ flex: 1 }}><Text style={s.bodyBold}>{r.name}</Text><Text style={s.small}>{r.description || 'No description'} · {Object.values(named).filter(n => n === r.name).length} people</Text></View>
            <Pressable onPress={() => setEdit({ id: r.id, name: r.name, description: r.description, perms: r.permissions })} hitSlop={8}><Text style={s.link}>Edit</Text></Pressable>
            <Pressable onPress={() => deleteRole(r.id).then(() => { flash('Role deleted'); reload(); }, (e: any) => flash(e?.message))} hitSlop={8} accessibilityLabel={`Delete ${r.name}`}><Ionicons name="trash-outline" size={18} color={RED} /></Pressable>
          </View>
        ))}
        <View style={s.wrap}><Btn label="New role" icon="add" onPress={() => setEdit({ name: '', description: '', perms: { orders_view: true } })} /></View>
      </View>
      {edit && (
        <Sheet title={edit.id ? `Edit “${edit.name}”` : 'New role'} onClose={() => setEdit(null)}>
          <Field label="Role name" value={edit.name} onChangeText={v => setEdit({ ...edit, name: v })} maxLength={40} placeholder="e.g. Delivery rider" />
          <Field label="What it's for" value={edit.description} onChangeText={v => setEdit({ ...edit, description: v })} maxLength={200} />
          {AREAS.map(a => {
            const lv = levelOf(withViews(edit.perms), a.key);
            return (
              <View key={a.key} style={{ marginTop: 10 }}>
                <Text style={s.bodyBold}>{a.label}</Text>
                <View style={s.wrap}>{(['none', 'see', 'manage'] as Level[]).map(l => <Chip key={l} on={lv === l} label={l === 'none' ? 'None' : l === 'see' ? 'See' : 'Manage'} onPress={() => setEdit({ ...edit, perms: withViews({ ...edit.perms, [`${a.key}_view`]: l !== 'none', [`${a.key}_manage`]: l === 'manage' }) })} />)}</View>
              </View>
            );
          })}
          {EXTRAS.filter(x => access.isOwner || !x.ownerOnly).map(x => (
            <View key={x.key} style={[s.row, { marginTop: 8 }]}>
              <View style={{ flex: 1 }}><Text style={s.bodyBold}>{x.label}</Text><Text style={s.small}>{x.sub}</Text></View>
              <Switch value={!!edit.perms[x.key]} onValueChange={v => setEdit({ ...edit, perms: { ...edit.perms, [x.key]: v } })} accessibilityLabel={x.label} />
            </View>
          ))}
          <View style={s.wrap}><Btn label="Save role" busy={busy === 'role'} onPress={async () => { setBusy('role'); try { await saveRole({ id: edit.id, name: edit.name, description: edit.description, permissions: edit.perms }); flash(edit.id ? 'Role saved' : 'Role created'); setEdit(null); reload(); } catch (e: any) { flash(e?.message); } setBusy(''); }} flex /></View>
        </Sheet>
      )}
    </View>
  );
}

function Admin({ links, access }: P) {
  const [info, setInfo] = useState<ReviewInfo | null>(null);
  useEffect(() => { reviewInfo().then(setInfo, () => {}); }, []);
  const seats = info ? (info.seats === null ? 'Unlimited team members' : `${info.used + info.pending} of ${info.seats} team seats used${info.pending ? ` (${info.pending} invite${info.pending === 1 ? '' : 's'} waiting)` : ''}`) : '…';
  const item = (icon: keyof typeof Ionicons.glyphMap, title: string, sub: string, onPress: () => void, owner?: boolean) => (
    <Pressable key={title} onPress={onPress} style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]} accessibilityRole="button">
      <View style={s.icon}><Ionicons name={icon} size={20} color={BLUE} /></View>
      <View style={{ flex: 1 }}><Text style={s.bodyBold}>{title}{owner && !access.isOwner ? ' (owner only)' : ''}</Text><Text style={s.small}>{sub}</Text></View>
      <Ionicons name="chevron-forward" size={18} color={MUTED} />
    </Pressable>
  );
  return (
    <View>
      {item('person-add-outline', 'Invitations and seats', seats, links.onOpenTeam)}
      {item('card-outline', 'Billing and plan', 'Your plan, team seats and payments', links.onOpenBilling, true)}
      {item('link-outline', 'Integrations', 'WhatsApp and social accounts, websites, Paystack', links.onOpenConnect, true)}
      {item('shield-checkmark-outline', 'Security', 'Password, two-step sign-in and devices', links.onOpenSecurity)}
      {item('list-outline', 'Activity log', 'Who did what, and when', links.onOpenActivity)}
      {item('checkmark-done-outline', 'Approvals', 'Requests waiting for a decision', links.onOpenApprovals)}
      <Text style={[s.small, { marginTop: 10, color: GREEN }]}>Roles and the access review are in the Roles and access tab.</Text>
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
  h: { fontWeight: '700', color: INK, fontSize: 14, marginBottom: 4 },
  muted: { color: MUTED, fontSize: 13, lineHeight: 18 },
  small: { color: MUTED, fontSize: 12, marginTop: 2 },
  body: { color: '#1F2937', fontSize: 13.5, lineHeight: 19 },
  bodyBold: { color: INK, fontSize: 14, fontWeight: '700' },
  label: { fontSize: 12, fontWeight: '700', color: MUTED },
  input: { marginTop: 6, minHeight: 44, borderWidth: 1, borderColor: '#D0D8E2', borderRadius: 12, paddingHorizontal: 12, fontSize: 14, color: INK, backgroundColor: '#FFFFFF' },
  card: { marginTop: 10, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: LINE, backgroundColor: '#FFFFFF' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: LINE },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#EAF1FB', alignItems: 'center', justifyContent: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  link: { color: BLUE, fontWeight: '700', fontSize: 13 },
});
