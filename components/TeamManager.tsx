import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Share, StyleSheet, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ALL_ON, KINDS, loadRules, saveRules, type ApprovalKind, type ApprovalRules } from '../lib/approvals';
import { Text } from '../lib/inter';
import {
  AREAS, EXTRAS, ROLES, cancelInvite, createInvite, loadInvites, loadTeam, presetPerms, removeMember, roleLabel, setMemberAccess, setMemberStatus, withViews,
  type Access, type PendingInvite, type Perm, type Perms, type StaffRole, type TeamMember,
} from '../lib/team';

// Team & Access: who is on the team, their role, what they can see and do, suspend / reactivate / remove, invites.
// Same as the website's TeamManager. The owner manages everyone; members with "Manage the team" manage other staff.
type Props = { access: Access; flash: (t: string) => void; onOpenActivity: () => void; onOpenApprovals: () => void; onChanged?: () => void };
type Level = 'none' | 'see' | 'manage';

const lastSeen = (iso: string | null) => {
  if (!iso) return 'Hasn’t signed in yet';
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  // From the last sign-in (not every action), so it says so.
  return m < 2 ? 'Signed in just now' : m < 60 ? `Last signed in ${m} min ago` : m < 1440 ? `Last signed in ${Math.round(m / 60)} h ago` : `Last signed in ${Math.round(m / 1440)} d ago`;
};
const levelOf = (p: Perms, area: string): Level => (p[`${area}_manage` as Perm] ? 'manage' : p[`${area}_view` as Perm] ? 'see' : 'none');

export function TeamManager({ access: me, flash, onOpenActivity, onOpenApprovals, onChanged }: Props) {
  const manager = me.isOwner || me.can('team_manage');
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<TeamMember | null>(null);
  const [inviteRole, setInviteRole] = useState<StaffRole>('sales');
  const [picking, setPicking] = useState(false);
  const [invite, setInvite] = useState('');
  const [busy, setBusy] = useState(false);
  const reload = useCallback(() => {
    loadTeam().then(t => { setTeam(t); setError(''); }).catch(e => setError(e.message));
    if (me.isOwner) loadInvites().then(setInvites).catch(() => {});
    onChanged?.();
  }, [me.isOwner]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, [reload]);
  const canManage = (m: TeamMember) => manager && m.role !== 'owner' && !m.is_me && (me.isOwner || !m.permissions?.team_manage);

  const makeInvite = async () => {
    setBusy(true);
    try {
      const code = await createInvite(inviteRole);
      setInvite(code); reload();
      Share.share({ message: `Join ${me.businessName || 'our business'} on Nexora AI as ${roleLabel(inviteRole)}. Install the app, sign up, then open Plans & billing and enter this invite code: ${code}` }).catch(() => {});
    } catch (e) { flash((e as Error).message); }
    setBusy(false);
  };

  return (
    <View>
      <Text style={s.muted}>Who works with you on Nexora, and what each person can see and do. Nexora checks these on the server, so hidden really means no access.</Text>
      {manager && (
        <Pressable onPress={onOpenActivity} style={[s.card, s.row, { marginTop: 12, gap: 12 }]} accessibilityRole="button">
          <View style={s.iconBox}><Ionicons name="list-outline" size={18} color="#1E56A0" /></View>
          <View style={{ flex: 1 }}><Text style={s.title}>Activity log</Text><Text style={s.small}>Who did what, and when</Text></View>
          <Ionicons name="chevron-forward" size={16} color="#8A97A6" />
        </Pressable>
      )}
      {!me.suspended && (
        <Pressable onPress={onOpenApprovals} style={[s.card, s.row, { marginTop: 10, gap: 12, paddingVertical: 12 }]} accessibilityRole="button">
          <View style={s.iconBox}><Ionicons name="shield-checkmark-outline" size={18} color="#1E56A0" /></View>
          <View style={{ flex: 1 }}><Text style={s.title}>Approvals</Text><Text style={s.small}>{me.can('approvals_manage') ? 'Requests from your team waiting for a decision' : 'Requests you sent for approval'}</Text></View>
          <Ionicons name="chevron-forward" size={16} color="#8A97A6" style={{ marginRight: 12 }} />
        </Pressable>
      )}
      {me.isOwner && <ApprovalRulesCard flash={flash} />}

      <Text style={s.section}>Team members{team ? ` (${team.length})` : ''}</Text>
      {error ? <Text style={s.error}>{error}</Text> : !team ? <ActivityIndicator color="#1E56A0" /> : (
        <View style={s.card}>
          {team.map((m, i) => (
            <Pressable key={m.member_id} disabled={!canManage(m)} onPress={() => setOpen(m)} style={[s.row, s.member, i > 0 && s.divider]}>
              <Ionicons name="person-circle-outline" size={34} color="#8A97A6" />
              <View style={{ flex: 1 }}>
                <Text style={s.title} numberOfLines={1}>{m.full_name}{m.is_me ? ' (you)' : ''}</Text>
                <Text style={s.small} numberOfLines={1}>{[m.email, lastSeen(m.last_active_at)].filter(Boolean).join(' · ')}</Text>
              </View>
              {m.status === 'suspended' && <View style={[s.pill, { backgroundColor: '#FDECEC' }]}><Text style={[s.pillText, { color: '#B42318' }]}>Suspended</Text></View>}
              <View style={[s.pill, { backgroundColor: m.role === 'owner' ? '#0F2942' : '#EAF1FB' }]}><Text style={[s.pillText, { color: m.role === 'owner' ? '#FFF' : '#1E56A0' }]}>{roleLabel(m.role === 'owner' ? 'owner' : m.job_role)}</Text></View>
              {canManage(m) && <Ionicons name="chevron-forward" size={16} color="#8A97A6" />}
            </Pressable>
          ))}
        </View>
      )}

      {manager && (
        <View style={[s.card, { marginTop: 16, padding: 16 }]}>
          <Text style={s.title}>Invite someone</Text>
          <Text style={[s.small, { marginTop: 2 }]}>Pick their role first. They start with exactly that access, and you can change it any time.</Text>
          <Pressable onPress={() => setPicking(true)} style={[s.select, s.row]} accessibilityLabel="Role for the invite">
            <View style={{ flex: 1 }}><Text style={s.title}>{roleLabel(inviteRole)}</Text><Text style={s.small} numberOfLines={1}>{ROLES.find(r => r.key === inviteRole)?.blurb}</Text></View>
            <Ionicons name="chevron-down" size={16} color="#5C6B7A" />
          </Pressable>
          {invite ? (
            <View style={s.codeBox}>
              <Text style={s.small}>Invite code for a {roleLabel(inviteRole)}</Text>
              <Text selectable style={s.code}>{invite}</Text>
              <Text style={[s.small, { textAlign: 'center' }]}>They sign up on Nexora, open Plans & billing and enter this code. It expires in 7 days.</Text>
            </View>
          ) : (
            <Pressable disabled={busy} onPress={() => { makeInvite().catch(() => {}); }} style={[s.btn, s.btnOutline, { marginTop: 12 }]}>
              {busy ? <ActivityIndicator color="#1E56A0" /> : <><Ionicons name="add" size={18} color="#1E56A0" /><Text style={[s.btnText, { color: '#1E56A0' }]}>Create invite code</Text></>}
            </Pressable>
          )}
        </View>
      )}

      {me.isOwner && invites.length > 0 && (
        <>
          <Text style={s.section}>Pending invites ({invites.length})</Text>
          <Text style={[s.small, { marginBottom: 8 }]}>Each unused code holds a team seat until it’s used, cancelled or expires.</Text>
          <View style={s.card}>
            {invites.map((v, i) => (
              <View key={v.id} style={[s.row, s.member, i > 0 && s.divider]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.title, { letterSpacing: 2 }]}>{v.code}</Text>
                  <Text style={s.small}>{roleLabel(v.job_role)} · expires {new Date(v.expires_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</Text>
                </View>
                <Pressable onPress={() => cancelInvite(v.id).then(() => { flash('Invite cancelled'); reload(); }, e => flash((e as Error).message))} hitSlop={8}><Text style={[s.btnText, { color: '#B42318' }]}>Cancel</Text></Pressable>
              </View>
            ))}
          </View>
        </>
      )}
      {!manager && <Text style={[s.small, { marginTop: 16 }]}>Your role: <Text style={{ fontWeight: '700' }}>{roleLabel(me.role)}</Text>. Ask the owner if you need more access.</Text>}

      <Modal visible={picking} transparent animationType="fade" onRequestClose={() => setPicking(false)}>
        <Pressable style={s.backdrop} onPress={() => setPicking(false)}>
          <View style={s.sheet}>
            <Text style={[s.title, { fontSize: 17, marginBottom: 8 }]}>Choose a role</Text>
            {ROLES.filter(r => me.isOwner || r.key !== 'admin').map(r => (
              <Pressable key={r.key} onPress={() => { setInviteRole(r.key); setInvite(''); setPicking(false); }} style={[s.roleOpt, inviteRole === r.key && s.roleOn]}>
                <Text style={s.title}>{r.label}</Text><Text style={s.small}>{r.blurb}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
      {open && <MemberSheet member={open} ownerView={me.isOwner} onClose={() => setOpen(null)} flash={flash} onChanged={reload} />}
    </View>
  );
}

function MemberSheet({ member, ownerView, onClose, flash, onChanged }: { member: TeamMember; ownerView: boolean; onClose: () => void; flash: (t: string) => void; onChanged: () => void }) {
  const [role, setRole] = useState<StaffRole>(member.job_role === 'owner' ? 'custom' : member.job_role);
  const [custom, setCustom] = useState<Perms>(withViews(member.permissions ?? {}));
  const [busy, setBusy] = useState('');
  const perms = role === 'custom' ? custom : presetPerms(role);
  const changed = role !== member.job_role || (role === 'custom' && JSON.stringify(withViews(custom)) !== JSON.stringify(withViews(member.permissions ?? {})));
  const setLevel = (area: string, lv: Level) => setCustom(p => withViews({ ...p, [`${area}_view`]: lv !== 'none', [`${area}_manage`]: lv === 'manage' }));
  const run = async (key: string, fn: () => Promise<void>, ok: string, close = false) => {
    setBusy(key);
    try { await fn(); flash(ok); onChanged(); if (close) onClose(); } catch (e) { flash((e as Error).message); }
    setBusy('');
  };
  const ask = (title: string, text: string, action: string, go: () => void) => Alert.alert(title, text, [{ text: 'Cancel', style: 'cancel' }, { text: action, style: 'destructive', onPress: go }]);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={[s.sheet, { maxHeight: '92%' }]}>
          <View style={s.row}>
            <View style={{ flex: 1 }}><Text style={[s.title, { fontSize: 18 }]}>{member.full_name}</Text><Text style={s.small}>{member.email}{member.status === 'suspended' ? ' · Suspended' : ''}</Text></View>
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close"><Ionicons name="close" size={22} color="#5C6B7A" /></Pressable>
          </View>
          <ScrollView style={{ marginTop: 12 }}>
            <Text style={s.label}>Role</Text>
            {ROLES.filter(r => ownerView || r.key !== 'admin').map(r => (
              <Pressable key={r.key} onPress={() => setRole(r.key)} style={[s.roleOpt, role === r.key && s.roleOn]} accessibilityState={{ selected: role === r.key }}>
                <View style={[s.row, { gap: 6 }]}>{role === r.key && <Ionicons name="checkmark-circle" size={16} color="#1E56A0" />}<Text style={s.title}>{r.label}</Text></View>
                <Text style={s.small}>{r.blurb}</Text>
              </Pressable>
            ))}
            <Text style={[s.label, { marginTop: 14 }]}>{role === 'custom' ? 'Choose what they can do' : `What ${/^[AEIOU]/.test(roleLabel(role)) ? 'an' : 'a'} ${roleLabel(role)} can do`}</Text>
            <View style={[s.card, { borderWidth: 1, borderColor: '#E1E5EA' }]}>
              {AREAS.map((a, i) => {
                const lv = levelOf(perms, a.key);
                return (
                  <View key={a.key} style={[s.member, i > 0 && s.divider]}>
                    <Text style={s.title}>{a.label}</Text>
                    <Text style={s.small}>{lv === 'manage' ? a.manage : lv === 'see' ? a.see : 'No access'}</Text>
                    {role === 'custom'
                      ? <View style={s.segment}>{(['none', 'see', 'manage'] as Level[]).map(l => (
                        <Pressable key={l} onPress={() => setLevel(a.key, l)} style={[s.segBtn, lv === l && s.segOn]} accessibilityState={{ selected: lv === l }}>
                          <Text style={[s.segText, lv === l && { color: '#1E56A0' }]}>{l === 'none' ? 'None' : l === 'see' ? 'See' : 'Manage'}</Text>
                        </Pressable>))}</View>
                      : <Text style={[s.small, { marginTop: 4, color: lv === 'none' ? '#8A97A6' : '#1E9E6D', fontWeight: '600' }]}>{lv === 'none' ? 'None' : lv === 'see' ? 'See' : 'Manage'}</Text>}
                  </View>
                );
              })}
              {EXTRAS.filter(x => ownerView || !x.ownerOnly).map(x => (
                <View key={x.key} style={[s.row, s.member, s.divider]}>
                  <View style={{ flex: 1 }}><Text style={s.title}>{x.label}</Text><Text style={s.small}>{x.sub}</Text></View>
                  {role === 'custom'
                    ? <Switch value={!!custom[x.key]} onValueChange={v => setCustom(p => ({ ...p, [x.key]: v }))} trackColor={{ true: '#5381BB', false: '#D5DEE8' }} thumbColor="#FFFFFF" />
                    : <Text style={[s.small, { color: perms[x.key] ? '#1E9E6D' : '#8A97A6', fontWeight: '600' }]}>{perms[x.key] ? 'Yes' : 'No'}</Text>}
                </View>
              ))}
            </View>
            <Text style={[s.small, { marginTop: 8 }]}>Always owner-only: billing and plans, connecting channels, AI settings, Insights, Brain, and deleting orders, customers or products.</Text>
          </ScrollView>
          <Pressable disabled={!changed || !!busy} onPress={() => { run('save', () => setMemberAccess(member.member_id, role, custom), `${member.full_name} is now ${roleLabel(role)}`, true).catch(() => {}); }}
            style={[s.btn, s.btnPrimary, { marginTop: 12 }, (!changed || !!busy) && { opacity: 0.5 }]}>
            {busy === 'save' ? <ActivityIndicator color="#FFF" /> : <Text style={[s.btnText, { color: '#FFF' }]}>{changed ? 'Save access' : 'No changes'}</Text>}
          </Pressable>
          <View style={[s.row, { gap: 8, marginTop: 8 }]}>
            {member.status === 'suspended'
              ? <Pressable disabled={!!busy} onPress={() => { run('status', () => setMemberStatus(member.member_id, 'active'), `${member.full_name} can use Nexora again`, true).catch(() => {}); }} style={[s.btn, s.btnOutline, { flex: 1 }]}><Text style={[s.btnText, { color: '#1E56A0' }]}>Reactivate</Text></Pressable>
              : <Pressable disabled={!!busy} onPress={() => ask(`Suspend ${member.full_name}?`, 'They keep their place on the team but can’t see or change anything until you reactivate them.', 'Suspend',
                () => { run('status', () => setMemberStatus(member.member_id, 'suspended'), `${member.full_name} is suspended`, true).catch(() => {}); })} style={[s.btn, s.btnOutline, { flex: 1 }]}><Text style={[s.btnText, { color: '#1E56A0' }]}>Suspend</Text></Pressable>}
            <Pressable disabled={!!busy} onPress={() => ask(`Remove ${member.full_name}?`, 'They lose access to this business on Nexora. Their past activity stays in the log.', 'Remove',
              () => { run('remove', () => removeMember(member.member_id), `${member.full_name} was removed`, true).catch(() => {}); })} style={[s.btn, { flex: 1, backgroundColor: '#FDECEC' }]}><Text style={[s.btnText, { color: '#B42318' }]}>Remove</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Owner: which team actions need approval first (all on by default). The owner's own actions never do. */
function ApprovalRulesCard({ flash }: { flash: (t: string) => void }) {
  const [rules, setRules] = useState<ApprovalRules | null>(null);
  const [busy, setBusy] = useState<ApprovalKind | ''>('');
  useEffect(() => { loadRules().then(setRules).catch(() => setRules(ALL_ON)); }, []);
  const flip = async (k: ApprovalKind, on: boolean) => {
    if (!rules) return;
    setBusy(k);
    try { setRules(await saveRules({ ...rules, [k]: on })); flash(on ? 'Your team will ask first' : 'Your team can now do this without asking'); }
    catch (e) { flash((e as Error).message); }
    setBusy('');
  };
  return (
    <View>
      <Text style={s.section}>Needs your approval</Text>
      <Text style={[s.small, { marginTop: -4, marginBottom: 8 }]}>When a team member does one of these, it waits for you (or anyone you let approve requests). What you do yourself never waits.</Text>
      <View style={s.card}>
        {KINDS.map((k, i) => (
          <View key={k.key} style={[s.row, s.member, i > 0 && s.divider]}>
            <View style={{ flex: 1 }}><Text style={s.title}>{k.label}</Text><Text style={s.small}>{k.sub}</Text></View>
            {busy === k.key ? <ActivityIndicator color="#1E56A0" />
              : <Switch value={rules?.[k.key] ?? true} disabled={!rules} onValueChange={v => { flip(k.key, v).catch(() => {}); }} trackColor={{ true: '#5381BB', false: '#D5DEE8' }} thumbColor="#FFFFFF" accessibilityLabel={k.label} />}
          </View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16 },
  member: { padding: 12, gap: 10 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E1E5EA' },
  iconBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#EAF1FB', alignItems: 'center', justifyContent: 'center', marginLeft: 12 },
  title: { fontSize: 14, fontWeight: '600', color: '#0B1220' },
  small: { fontSize: 12, color: '#5C6B7A' },
  muted: { fontSize: 14, color: '#5C6B7A' },
  section: { marginTop: 20, marginBottom: 8, fontSize: 15, color: '#5C6B7A' },
  label: { fontSize: 14, fontWeight: '600', color: '#0B1220', marginBottom: 8 },
  error: { fontSize: 14, color: '#B42318' },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 11, fontWeight: '600' },
  select: { marginTop: 12, borderWidth: 1, borderColor: '#D5DEE8', borderRadius: 12, padding: 12, gap: 8 },
  codeBox: { marginTop: 12, backgroundColor: '#F5F6F8', borderRadius: 12, padding: 16, alignItems: 'center', gap: 4 },
  code: { fontSize: 24, fontWeight: '800', letterSpacing: 4, color: '#0B1220' },
  btn: { height: 46, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  btnPrimary: { backgroundColor: '#1E56A0' },
  btnOutline: { borderWidth: 1, borderColor: '#5381BB', backgroundColor: '#FFFFFF' },
  btnText: { fontSize: 14, fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: 'rgba(11,18,32,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32 },
  roleOpt: { borderWidth: 1, borderColor: '#E1E5EA', borderRadius: 12, padding: 12, marginBottom: 8 },
  roleOn: { borderColor: '#1E56A0', backgroundColor: '#EAF1FB' },
  segment: { flexDirection: 'row', backgroundColor: '#F5F6F8', borderRadius: 999, padding: 2, alignSelf: 'flex-start', marginTop: 4 },
  segBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999 },
  segOn: { backgroundColor: '#FFFFFF' },
  segText: { fontSize: 12, fontWeight: '600', color: '#5C6B7A' },
});
