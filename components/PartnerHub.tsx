import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, TextInput } from '../lib/inter';
import {
  CATEGORIES, DIGITAL, KINDS, REPORT_REASONS, addReferral, addReview, blankRequest, deleteRequest, kindLabel, loadDirectory, loadMyRequests,
  loadOpenRequests, loadRatings, loadReviews, rankForRequest, replyToRequest, reportProblem, saveRequest, setRequestStatus, writeBrief,
  type Extras, type Kind, type Partner, type PortfolioItem, type ProjectRequest, type Rating, type RequestForm, type Review,
} from '../lib/network';

// Capability 2.12 in the app's Find partners screen: Directory, Projects, partner details and portfolio on My profile,
// and the trust tools on introductions (reviews, referrals, problem reports). Same data as the website.
const BLUE = '#1E56A0', INK = '#0B1220', MUTED = '#5C6B7A', LINE = '#E3E8EF';
const place = (x: { city?: string; country?: string }) => [x.city, x.country].filter(Boolean).join(', ');
const when = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function Chip({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} accessibilityState={{ selected: on }} style={[s.chip, on && s.chipOn]}><Text style={[s.chipText, on && { color: '#FFFFFF' }]}>{label}</Text></Pressable>;
}
function Btn({ label, onPress, kind = 'primary', busy, icon, flex }: { label: string; onPress: () => void; kind?: 'primary' | 'outline' | 'soft'; busy?: boolean; icon?: keyof typeof Ionicons.glyphMap; flex?: boolean }) {
  const st = kind === 'primary' ? s.btnPrimary : kind === 'soft' ? s.btnSoft : s.btnOutline;
  const color = kind === 'primary' ? '#FFFFFF' : BLUE;
  return (
    <Pressable disabled={busy} onPress={onPress} style={[s.btn, st, flex && { flex: 1 }, busy && { opacity: 0.6 }]} accessibilityRole="button">
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
export const Verified = () => <View style={s.verified}><Ionicons name="shield-checkmark" size={11} color={BLUE} /><Text style={{ color: BLUE, fontSize: 11, fontWeight: '700' }}>Verified</Text></View>;
export const Stars = ({ r }: { r?: Rating }) => !r?.count
  ? <Text style={{ fontSize: 11.5, color: '#98A2B3' }}>No reviews yet</Text>
  : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}><Ionicons name="star" size={12} color="#E8A317" /><Text style={{ fontSize: 12, fontWeight: '700', color: INK }}>{r.avg.toFixed(1)}</Text><Text style={{ fontSize: 12, color: MUTED }}>({r.count})</Text></View>;

export function ReferSheet({ p, me, onClose, flash }: { p: Partner; me: string; onClose: () => void; flash: (s: string) => void }) {
  const [to, setTo] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);
  const go = async (share: boolean) => {
    setBusy(true);
    try {
      await addReferral(me, p.user_id, to, note);
      if (share) Linking.openURL(`https://wa.me/?text=${encodeURIComponent(`I recommend ${p.display_name}${p.offers ? ` (${p.offers.slice(0, 120)})` : ''}. You can find them on Nexora AI: Find partners.${note.trim() ? ` ${note.trim()}` : ''}`)}`).catch(() => {});
      flash('Recommendation saved'); onClose();
    } catch (e: any) { flash(e?.message || "Couldn't save that."); }
    setBusy(false);
  };
  return (
    <Sheet title={`Recommend ${p.display_name}`} onClose={onClose}>
      <Text style={s.muted}>Recommend them to someone who needs this. Nexora keeps a record of who referred whom (for referral rewards later).</Text>
      <Field label="Who are you recommending them to? (optional)" value={to} onChangeText={setTo} maxLength={120} />
      <Field label="A note (optional)" value={note} onChangeText={setNote} maxLength={500} multiline />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}><Btn label="Save only" kind="outline" flex busy={busy} onPress={() => go(false)} /><Btn label="Share on WhatsApp" flex busy={busy} onPress={() => go(true)} /></View>
    </Sheet>
  );
}
export function ReportSheet({ target, name, me, connectionId, requestId, onClose, flash }: { target: string; name: string; me: string; connectionId?: string; requestId?: string; onClose: () => void; flash: (s: string) => void }) {
  const [reason, setReason] = useState(''); const [details, setDetails] = useState(''); const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!reason) { flash('Choose what went wrong'); return; }
    setBusy(true);
    try { await reportProblem(me, { target, reason, details, connection_id: connectionId, request_id: requestId }); flash('Report sent. The Nexora team will look into it.'); onClose(); }
    catch (e: any) { flash(e?.message || "Couldn't send the report."); }
    setBusy(false);
  };
  return (
    <Sheet title={`Report a problem with ${name}`} onClose={onClose}>
      <Text style={s.muted}>For disputes, no-shows, payment problems or fake profiles. The Nexora team reviews every report; {name} isn't told who sent it.</Text>
      <View style={s.wrap}>{REPORT_REASONS.map(r => <Chip key={r.k} on={reason === r.k} label={r.label} onPress={() => setReason(r.k)} />)}</View>
      <Field label="What happened?" value={details} onChangeText={setDetails} maxLength={2000} multiline />
      <View style={{ marginTop: 14 }}><Btn label="Send report" busy={busy} onPress={send} /></View>
    </Sheet>
  );
}
export function ReviewSheet({ me, connectionId, reviewee, name, onClose, onDone, flash }: { me: string; connectionId: string; reviewee: string; name: string; onClose: () => void; onDone: () => void; flash: (s: string) => void }) {
  const [rating, setRating] = useState(0); const [comment, setComment] = useState(''); const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try { await addReview(me, connectionId, reviewee, rating, comment); flash(`Thanks, your review of ${name} is saved`); onDone(); onClose(); }
    catch (e: any) { flash(e?.message || "Couldn't save the review."); }
    setBusy(false);
  };
  return (
    <Sheet title={`Review ${name}`} onClose={onClose}>
      <Text style={s.muted}>How was working with them? Reviews help other businesses choose well.</Text>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 12 }}>{[1, 2, 3, 4, 5].map(n => <Pressable key={n} onPress={() => setRating(n)} accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`} hitSlop={6}><Ionicons name={n <= rating ? 'star' : 'star-outline'} size={32} color={n <= rating ? '#E8A317' : '#C9D2DD'} /></Pressable>)}</View>
      <Field label="A few words (optional)" value={comment} onChangeText={setComment} maxLength={1000} multiline />
      <View style={{ marginTop: 14 }}><Btn label="Save review" busy={busy} onPress={() => (rating ? send() : flash('Choose 1 to 5 stars'))} /></View>
    </Sheet>
  );
}

function PartnerSheet({ p, rating, me, onClose, onIntroduce, flash }: { p: Partner; rating?: Rating; me: string; onClose: () => void; onIntroduce: () => void; flash: (s: string) => void }) {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [refer, setRefer] = useState(false); const [report, setReport] = useState(false);
  useEffect(() => { loadReviews(p.user_id).then(setReviews, () => setReviews([])); }, [p.user_id]);
  return (
    <Sheet title={p.display_name} onClose={onClose}>
      <Text style={s.muted}>{[kindLabel(p.kind), p.industry, place(p)].filter(Boolean).join(' · ')}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>{p.verified && <Verified />}<Stars r={rating} /></View>
      {!!p.bio && <Text style={s.body}>{p.bio}</Text>}
      {!!p.offers && <Text style={s.body}><Text style={{ fontWeight: '700' }}>Offers: </Text>{p.offers}</Text>}
      {!!p.needs && <Text style={s.body}><Text style={{ fontWeight: '700' }}>Looking for: </Text>{p.needs}</Text>}
      {!!p.rate && <Text style={s.body}><Text style={{ fontWeight: '700' }}>Rates: </Text>{p.rate}</Text>}
      {(p.categories.length > 0 || p.skills.length > 0) && <View style={s.wrap}>{[...p.categories, ...p.skills].map(t => <View key={t} style={s.tag}><Text style={{ fontSize: 12, color: BLUE }}>{t}</Text></View>)}</View>}
      <Text style={s.h}>Portfolio</Text>
      {!p.portfolio.length ? <Text style={s.muted}>No work added yet.</Text> : p.portfolio.map((w, i) => (
        <View key={i} style={s.card}>
          {!!w.image && <Image source={{ uri: w.image }} style={{ height: 120, borderRadius: 10, marginBottom: 8, backgroundColor: '#F2F4F7' }} resizeMode="cover" />}
          <Text style={{ fontWeight: '700', color: INK }}>{w.title}</Text>
          {!!w.description && <Text style={s.muted}>{w.description}</Text>}
          {!!w.url && <Pressable onPress={() => Linking.openURL(w.url).catch(() => {})}><Text style={{ color: BLUE, fontWeight: '700', marginTop: 4 }}>See the work</Text></Pressable>}
        </View>
      ))}
      <Text style={s.h}>Reviews</Text>
      {reviews === null ? <ActivityIndicator color={BLUE} /> : !reviews.length ? <Text style={s.muted}>No reviews yet. Businesses can review each other after an accepted introduction.</Text> : reviews.map(r => (
        <View key={r.id} style={s.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>{Array.from({ length: 5 }, (_, i) => <Ionicons key={i} name={i < r.rating ? 'star' : 'star-outline'} size={13} color={i < r.rating ? '#E8A317' : '#C9D2DD'} />)}<Text style={{ marginLeft: 6, fontWeight: '700', color: INK, flex: 1 }}>{r.reviewer_name}</Text><Text style={{ fontSize: 11.5, color: '#98A2B3' }}>{when(r.created_at)}</Text></View>
          {!!r.comment && <Text style={[s.body, { marginTop: 4 }]}>{r.comment}</Text>}
        </View>
      ))}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}><Btn label="Introduce me" flex onPress={onIntroduce} /><Btn label="Recommend" kind="outline" icon="share-social-outline" flex onPress={() => setRefer(true)} /></View>
      <Pressable onPress={() => setReport(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 14, alignSelf: 'center' }}><Ionicons name="flag-outline" size={14} color="#D64545" /><Text style={{ color: '#D64545', fontWeight: '700', fontSize: 13 }}>Report a problem</Text></Pressable>
      {refer && <ReferSheet p={p} me={me} flash={flash} onClose={() => setRefer(false)} />}
      {report && <ReportSheet target={p.user_id} name={p.display_name} me={me} flash={flash} onClose={() => setReport(false)} />}
    </Sheet>
  );
}

/** Browse partners, service providers, freelancers, collaborators and developers on the network. */
export function PartnerDirectory({ me, startKind = '', onIntroduce, flash }: { me: string; startKind?: Kind | ''; onIntroduce: (p: Partner) => void; flash: (s: string) => void }) {
  const [kind, setKind] = useState<Kind | ''>(startKind);
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<Partner[] | null>(null);
  const [ratings, setRatings] = useState<Record<string, Rating>>({});
  const [open, setOpen] = useState<Partner | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true; setPeople(null); setErr('');
    loadDirectory(me, { kind, category, q }).then(async p => { if (!live) return; setPeople(p); setRatings(await loadRatings(p.map(x => x.user_id))); }, e => { if (live) { setPeople([]); setErr(e?.message || "Couldn't load the directory."); } });
    return () => { live = false; };
  }, [me, kind, category, q]);
  return (
    <View>
      <TextInput value={q} onChangeText={setQ} placeholder="Search skills, services, places…" placeholderTextColor="#98A2B3" style={[s.input, { borderRadius: 22 }]} accessibilityLabel="Search the directory" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 10 }}>
        <Chip on={!kind} label="Everyone" onPress={() => setKind('')} />
        {KINDS.map(k => <Chip key={k.k} on={kind === k.k} label={k.plural} onPress={() => setKind(k.k)} />)}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 6 }}>
        <Chip on={!category} label="All categories" onPress={() => setCategory('')} />
        {CATEGORIES.map(c => <Chip key={c} on={category === c} label={c} onPress={() => setCategory(category === c ? '' : c)} />)}
      </ScrollView>
      {!!err && <Text style={[s.muted, { color: '#C2760C' }]}>{err}</Text>}
      {people === null ? <ActivityIndicator color={BLUE} style={{ marginTop: 16 }} /> : !people.length ? <Text style={[s.card, s.muted]}>No one in this group yet. As businesses publish profiles they appear here. You can also post a project and let providers come to you.</Text>
        : people.map(p => (
          <View key={p.user_id} style={s.card}>
            <Pressable onPress={() => setOpen(p)} style={{ flexDirection: 'row', gap: 10 }}>
              <View style={s.avatar}><Text style={{ color: BLUE, fontWeight: '800' }}>{p.display_name.slice(0, 2).toUpperCase()}</Text></View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}><Text style={{ fontWeight: '700', color: INK, fontSize: 15 }}>{p.display_name}</Text>{p.verified && <Verified />}</View>
                <Text style={s.muted}>{[kindLabel(p.kind), p.industry, place(p)].filter(Boolean).join(' · ')}</Text>
                <Stars r={ratings[p.user_id]} />
              </View>
            </Pressable>
            {!!p.offers && <Text style={s.body} numberOfLines={2}><Text style={{ fontWeight: '700' }}>Offers: </Text>{p.offers}</Text>}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}><Btn label="View profile" kind="outline" flex onPress={() => setOpen(p)} /><Btn label="Introduce me" flex onPress={() => onIntroduce(p)} /></View>
          </View>
        ))}
      {open && <PartnerSheet p={open} rating={ratings[open.user_id]} me={me} flash={flash} onClose={() => setOpen(null)} onIntroduce={() => { onIntroduce(open); setOpen(null); }} />}
    </View>
  );
}

function RequestEditor({ business, start, onClose, onSaved, flash }: { business: string; start: { form: RequestForm; id?: string; digital?: boolean }; onClose: () => void; onSaved: (f: RequestForm) => void; flash: (s: string) => void }) {
  const [f, setF] = useState<RequestForm>(start.form);
  const [idea, setIdea] = useState('');
  const [busy, setBusy] = useState('');
  const set = (p: Partial<RequestForm>) => setF(x => ({ ...x, ...p }));
  const ai = async () => {
    if (idea.trim().length < 8) { flash('Describe what you need in a sentence'); return; }
    setBusy('ai');
    try { set(await writeBrief(idea, business)); flash('Nexora wrote the brief. Check it, then post.'); } catch (e: any) { flash(e?.message || "Couldn't write the brief."); }
    setBusy('');
  };
  const save = async () => {
    setBusy('save');
    try { await saveRequest(f, start.id); onSaved(f); onClose(); } catch (e: any) { flash(e?.message || "Couldn't save the project."); }
    setBusy('');
  };
  return (
    <Sheet title={start.id ? 'Edit project' : start.digital ? 'Get software built' : 'Post a project'} onClose={onClose}>
      {!start.id && (
        <View style={{ backgroundColor: '#EAF6F8', borderRadius: 12, padding: 12 }}>
          <Text style={{ color: '#0E7490', fontWeight: '700', fontSize: 13 }}>{start.digital ? 'Need a website, app or automation? Say it in your own words.' : 'Say what you need in your own words'}</Text>
          <TextInput value={idea} onChangeText={setIdea} placeholder={start.digital ? 'e.g. An app where customers book and pay for haircuts' : 'e.g. A photographer for 20 product photos'} placeholderTextColor="#98A2B3" style={[s.input, { marginTop: 8 }]} />
          <View style={{ marginTop: 8 }}><Btn label="Write the brief" kind="soft" icon="sparkles" busy={busy === 'ai'} onPress={ai} /></View>
        </View>
      )}
      <Field label="Project title" value={f.title} onChangeText={t => set({ title: t })} maxLength={120} />
      <Text style={[s.label, { marginTop: 10 }]}>Category</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 6 }}>{CATEGORIES.map(c => <Chip key={c} on={f.category === c} label={c} onPress={() => set({ category: c })} />)}</ScrollView>
      <Text style={[s.label, { marginTop: 6 }]}>Who you need</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 6 }}>
        <Chip on={f.kind_needed === 'any'} label="Anyone" onPress={() => set({ kind_needed: 'any' })} />
        {KINDS.filter(k => k.k !== 'business').map(k => <Chip key={k.k} on={f.kind_needed === k.k} label={k.label} onPress={() => set({ kind_needed: k.k })} />)}
      </ScrollView>
      <Field label="What it's for" value={f.description} onChangeText={t => set({ description: t })} maxLength={4000} multiline />
      <Field label="Requirements (one per line)" value={f.requirements} onChangeText={t => set({ requirements: t })} multiline placeholder={'Customers can book online\nPayments with Paystack'} />
      <Field label="Budget" value={f.budget} onChangeText={t => set({ budget: t })} maxLength={80} placeholder="e.g. ₦300,000–₦500,000" />
      <Field label="Timeline" value={f.timeline} onChangeText={t => set({ timeline: t })} maxLength={80} placeholder="e.g. 4–6 weeks" />
      <Field label="Location" value={f.location} onChangeText={t => set({ location: t })} maxLength={80} placeholder="e.g. Lagos" />
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}><Text style={{ flex: 1, color: INK }}>Remote work is fine</Text><Switch value={f.remote_ok} onValueChange={v => set({ remote_ok: v })} /></View>
      <Text style={[s.muted, { marginTop: 8 }]}>Your project is visible to businesses on Nexora. Your phone and email stay private until you accept someone's reply.</Text>
      <View style={{ marginTop: 14 }}><Btn label={start.id ? 'Save changes' : 'Post project'} busy={busy === 'save'} onPress={save} /></View>
    </Sheet>
  );
}

/** Project requests: post what you need or get software built, browse other businesses' projects and reply. */
export function PartnerProjects({ me, business, startDigital, onChanged, flash }: { me: string; business: string; startDigital?: boolean; onChanged: () => void; flash: (s: string) => void }) {
  const [view, setView] = useState<'open' | 'mine'>('open');
  const [open, setOpen] = useState<ProjectRequest[] | null>(null);
  const [mine, setMine] = useState<ProjectRequest[] | null>(null);
  const [edit, setEdit] = useState<{ form: RequestForm; id?: string; digital?: boolean } | null>(startDigital ? { form: blankRequest(true), digital: true } : null);
  const [reply, setReply] = useState<ProjectRequest | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [report, setReport] = useState<ProjectRequest | null>(null);
  const [fits, setFits] = useState<{ title: string; people: Partner[] } | null>(null);
  const [err, setErr] = useState('');
  const reload = useCallback(() => {
    setErr('');
    loadOpenRequests(me).then(setOpen, (e: any) => { setOpen([]); setErr(e?.message || "Couldn't load projects."); });
    loadMyRequests(me).then(setMine, () => setMine([]));
  }, [me]);
  useEffect(() => { reload(); }, [reload]);
  const saved = async (f: RequestForm) => {
    flash(edit?.id ? 'Project updated' : 'Project posted'); setView('mine'); reload(); onChanged();
    if (!edit?.id) { try { setFits({ title: f.title, people: rankForRequest({ ...f, requirements: f.requirements.split('\n').filter(Boolean) }, await loadDirectory(me)) }); } catch { /* optional */ } }
  };
  const sendReply = async () => {
    if (!reply) return;
    if (msg.trim().length < 10) { flash('Say briefly how you would do it, your price or timeline'); return; }
    setBusy('reply');
    try { await replyToRequest(me, reply, msg); flash(`Offer sent to ${reply.poster}`); setReply(null); setMsg(''); onChanged(); }
    catch (e: any) { flash(e?.message || "Couldn't send the offer."); }
    setBusy('');
  };
  const list = view === 'open' ? open : mine;
  return (
    <View>
      <Pressable onPress={() => setEdit({ form: blankRequest(true), digital: true })} style={[s.card, { backgroundColor: '#0F2942', borderColor: '#0F2942', flexDirection: 'row', gap: 12, alignItems: 'center' }]}>
        <Ionicons name="code-slash-outline" size={24} color="#FFFFFF" /><View style={{ flex: 1 }}><Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Get software built</Text><Text style={{ color: '#C9D2DD', fontSize: 12.5 }}>A website, app or automation: Nexora writes the brief and finds developers</Text></View>
      </Pressable>
      <Pressable onPress={() => setEdit({ form: blankRequest(false) })} style={[s.card, { flexDirection: 'row', gap: 12, alignItems: 'center' }]}>
        <Ionicons name="add-circle-outline" size={24} color={BLUE} /><View style={{ flex: 1 }}><Text style={{ color: INK, fontWeight: '700' }}>Post a project</Text><Text style={s.muted}>Any service: design, delivery, accounting, photos…</Text></View>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}><Chip on={view === 'open'} label={`Open projects (${open?.length ?? 0})`} onPress={() => setView('open')} /><Chip on={view === 'mine'} label={`My projects (${mine?.length ?? 0})`} onPress={() => setView('mine')} /></View>
      {!!err && <Text style={[s.muted, { color: '#C2760C', marginTop: 8 }]}>{err}</Text>}
      {list === null ? <ActivityIndicator color={BLUE} style={{ marginTop: 16 }} /> : !list.length ? <Text style={[s.card, s.muted]}>{view === 'open' ? 'No open projects from other businesses right now.' : "You haven't posted a project yet."}</Text>
        : list.map(r => (
          <View key={r.id} style={s.card}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Ionicons name={DIGITAL.includes(r.category) ? 'code-slash-outline' : 'briefcase-outline'} size={22} color={BLUE} />
              <View style={{ flex: 1 }}><Text style={{ fontWeight: '700', color: INK }}>{r.title}</Text><Text style={s.muted}>{[view === 'mine' ? (r.status === 'open' ? 'Open' : 'Closed') : r.poster, r.category, r.kind_needed !== 'any' ? `Needs: ${kindLabel(r.kind_needed)}` : null].filter(Boolean).join(' · ')}</Text></View>
            </View>
            {!!r.description && <Text style={s.body} numberOfLines={3}>{r.description}</Text>}
            {r.requirements.slice(0, 5).map(x => <View key={x} style={{ flexDirection: 'row', gap: 6, marginTop: 3 }}><Ionicons name="checkmark-circle" size={14} color={BLUE} /><Text style={{ flex: 1, fontSize: 13, color: '#1F2937' }}>{x}</Text></View>)}
            <Text style={[s.muted, { marginTop: 6 }]}>{[r.budget && `Budget: ${r.budget}`, r.timeline && `Timeline: ${r.timeline}`, [r.location, r.remote_ok ? 'remote OK' : ''].filter(Boolean).join(' · '), `Posted ${when(r.created_at)}`].filter(Boolean).join('  ·  ')}</Text>
            {view === 'open' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
                <Pressable onPress={() => setReport(r)} hitSlop={8} style={{ flexDirection: 'row', gap: 4, alignItems: 'center', flex: 1 }}><Ionicons name="flag-outline" size={13} color={MUTED} /><Text style={{ color: MUTED, fontSize: 12, fontWeight: '700' }}>Report</Text></Pressable>
                <Btn label="Reply with an offer" onPress={() => { setReply(r); setMsg(''); }} />
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 10 }}>
                <Text style={[s.muted, { flex: 1 }]}>{r.replies ? `${r.replies} repl${r.replies === 1 ? 'y' : 'ies'}: see Introductions` : 'No replies yet'}</Text>
                <Pressable onPress={() => setEdit({ id: r.id, form: { ...r, requirements: r.requirements.join('\n') } })} hitSlop={8}><Text style={s.link}>Edit</Text></Pressable>
                <Pressable onPress={() => setRequestStatus(r.id, r.status === 'open' ? 'closed' : 'open').then(reload, (e: any) => flash(e?.message || "Couldn't update."))} hitSlop={8}><Text style={s.link}>{r.status === 'open' ? 'Close' : 'Reopen'}</Text></Pressable>
                <Pressable onPress={() => deleteRequest(r.id).then(() => { flash('Project deleted'); reload(); }, (e: any) => flash(e?.message || "Couldn't delete."))} hitSlop={8} accessibilityLabel="Delete project"><Ionicons name="trash-outline" size={17} color="#D64545" /></Pressable>
              </View>
            )}
          </View>
        ))}
      {edit && <RequestEditor business={business} start={edit} flash={flash} onClose={() => setEdit(null)} onSaved={saved} />}
      {reply && (
        <Sheet title={`Reply to “${reply.title}”`} onClose={() => setReply(null)}>
          <Text style={s.muted}>Say how you would do it, your price and timeline. {reply.poster} sees your profile; contacts are shared only if they accept.</Text>
          <Field label="Your offer" value={msg} onChangeText={setMsg} maxLength={500} multiline placeholder="e.g. We built 3 booking apps for salons. 5 weeks, ₦450,000." />
          <View style={{ marginTop: 14 }}><Btn label="Send offer" busy={busy === 'reply'} onPress={sendReply} /></View>
        </Sheet>
      )}
      {fits && (
        <Sheet title="Who on Nexora fits this project" onClose={() => setFits(null)}>
          <Text style={s.muted}>“{fits.title}” is posted. {fits.people.length ? 'These providers look like a good fit. Open Directory to introduce yourself, or wait for replies.' : 'No provider on Nexora fits yet. Your project stays open, and providers who join can reply.'}</Text>
          {fits.people.map(p => <View key={p.user_id} style={s.card}><Text style={{ fontWeight: '700', color: INK }}>{p.display_name}</Text><Text style={s.muted}>{kindLabel(p.kind)}{p.offers ? ` · ${p.offers.slice(0, 80)}` : ''}</Text></View>)}
        </Sheet>
      )}
      {report && <ReportSheet target={report.user_id} name={report.poster || 'this business'} me={me} requestId={report.id} flash={flash} onClose={() => setReport(null)} />}
    </View>
  );
}

/** Partner details on My profile: what kind of partner, categories, skills, rates and a portfolio. */
export function PartnerExtrasForm({ x, onChange }: { x: Extras; onChange: (x: Extras) => void }) {
  const [skills, setSkills] = useState(x.skills.join(', '));
  useEffect(() => { setSkills(x.skills.join(', ')); }, [x.skills]);
  const item = (i: number, p: Partial<PortfolioItem>) => onChange({ ...x, portfolio: x.portfolio.map((w, j) => (j === i ? { ...w, ...p } : w)) });
  return (
    <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text style={{ fontWeight: '700', color: INK, fontSize: 15 }}>Partner details</Text>{x.verified && <Verified />}</View>
      <Text style={[s.label, { marginTop: 10 }]}>You are a</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 6 }}>{KINDS.map(k => <Chip key={k.k} on={x.kind === k.k} label={k.label} onPress={() => onChange({ ...x, kind: k.k })} />)}</ScrollView>
      <Text style={[s.label, { marginTop: 6 }]}>Categories (up to 5)</Text>
      <View style={s.wrap}>{CATEGORIES.map(c => { const on = x.categories.includes(c); return <Chip key={c} on={on} label={c} onPress={() => onChange({ ...x, categories: on ? x.categories.filter(y => y !== c) : x.categories.length >= 5 ? x.categories : [...x.categories, c] })} />; })}</View>
      <Field label="Skills (comma separated)" value={skills} onChangeText={setSkills} onBlur={() => onChange({ ...x, skills: skills.split(',').map(t => t.trim()).filter(Boolean) })} placeholder="e.g. React, Flutter, logo design" />
      <Field label="Rates (optional)" value={x.rate} onChangeText={t => onChange({ ...x, rate: t })} maxLength={80} placeholder="e.g. From ₦150,000 per website" />
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }}><Text style={{ flex: 1, fontWeight: '700', color: INK }}>Portfolio</Text>
        {x.portfolio.length < 12 && <Pressable onPress={() => onChange({ ...x, portfolio: [...x.portfolio, { title: '', description: '', url: '', image: '' }] })} hitSlop={8}><Text style={s.link}>+ Add work</Text></Pressable>}</View>
      {!x.portfolio.length && <Text style={s.muted}>Add a project, a client or a link to show what you do.</Text>}
      {x.portfolio.map((w, i) => (
        <View key={i} style={s.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={[s.label, { flex: 1 }]}>Work {i + 1}</Text><Pressable onPress={() => onChange({ ...x, portfolio: x.portfolio.filter((_, j) => j !== i) })} hitSlop={8} accessibilityLabel="Remove this work"><Ionicons name="trash-outline" size={16} color="#D64545" /></Pressable></View>
          <Field label="Title" value={w.title} onChangeText={t => item(i, { title: t })} maxLength={80} placeholder="e.g. Booking app for Glow Salon" />
          <Field label="What you did and the result" value={w.description} onChangeText={t => item(i, { description: t })} maxLength={400} multiline />
          <Field label="Link (optional)" value={w.url} onChangeText={t => item(i, { url: t })} autoCapitalize="none" />
          <Field label="Picture link (optional)" value={w.image} onChangeText={t => item(i, { image: t })} autoCapitalize="none" />
        </View>
      ))}
    </View>
  );
}

/** Under an accepted introduction: leave a review, or report a problem (disputes). */
export function IntroTrust({ me, connectionId, other, otherName, reviewed, project, onReviewed, flash }: { me: string; connectionId: string; other: string; otherName: string; reviewed: boolean; project?: string; onReviewed: () => void; flash: (s: string) => void }) {
  const [review, setReview] = useState(false); const [report, setReport] = useState(false);
  return (
    <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 8 }}>
      {!!project && <Text style={{ fontSize: 12, fontWeight: '700', color: BLUE, marginBottom: 6 }}>Project: {project}</Text>}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {reviewed ? <Text style={[s.muted, { flex: 1 }]}>You reviewed them</Text>
          : <Pressable onPress={() => setReview(true)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}><Ionicons name="star-outline" size={15} color={BLUE} /><Text style={s.link}>Leave a review</Text></Pressable>}
        <Pressable onPress={() => setReport(true)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Ionicons name="flag-outline" size={13} color={MUTED} /><Text style={{ color: MUTED, fontSize: 12, fontWeight: '700' }}>Report a problem</Text></Pressable>
      </View>
      {review && <ReviewSheet me={me} connectionId={connectionId} reviewee={other} name={otherName} flash={flash} onDone={onReviewed} onClose={() => setReview(false)} />}
      {report && <ReportSheet target={other} name={otherName} me={me} connectionId={connectionId} flash={flash} onClose={() => setReport(false)} />}
    </View>
  );
}

const s = StyleSheet.create({
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: '#EAF1FB' },
  chipOn: { backgroundColor: BLUE },
  chipText: { color: BLUE, fontWeight: '600', fontSize: 12.5 },
  btn: { minHeight: 40, borderRadius: 20, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  btnPrimary: { backgroundColor: BLUE }, btnOutline: { borderWidth: 1, borderColor: '#9DB8DD', backgroundColor: '#FFFFFF' }, btnSoft: { backgroundColor: '#EAF1FB' },
  btnText: { fontWeight: '700', fontSize: 13.5 },
  backdrop: { flex: 1, backgroundColor: 'rgba(11,18,32,0.45)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '92%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, width: '100%', maxWidth: 720, alignSelf: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: INK },
  h: { marginTop: 16, marginBottom: 4, fontWeight: '700', color: INK, fontSize: 14 },
  muted: { color: MUTED, fontSize: 13, lineHeight: 18 },
  body: { color: '#1F2937', fontSize: 13.5, lineHeight: 19, marginTop: 6 },
  label: { fontSize: 12, fontWeight: '700', color: MUTED },
  input: { marginTop: 4, minHeight: 44, borderWidth: 1, borderColor: '#D0D8E2', borderRadius: 12, paddingHorizontal: 12, fontSize: 14, color: INK, backgroundColor: '#FFFFFF' },
  card: { marginTop: 10, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: LINE, backgroundColor: '#FFFFFF' },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#EAF1FB', alignItems: 'center', justifyContent: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  tag: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10, backgroundColor: '#EAF1FB' },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, backgroundColor: '#EAF1FB' },
  link: { color: BLUE, fontWeight: '700', fontSize: 13 },
});
