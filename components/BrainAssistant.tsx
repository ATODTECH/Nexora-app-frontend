import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, TextInput } from '../lib/inter';
import {
  BRAIN_CAPABILITIES, BRAIN_WORKFLOWS, deletePrompt, knowledgeCoverage, loadPrompts, savePrompt, type BrainAction, type Coverage, type SavedPrompt,
} from '../lib/brainAssistant';

// AI Business Brain and Assistant (blueprint 2.1), the app's overview screen. Same content as the website's /assistant:
// every starter opens Brain itself (a question, or an AI tool's short form), so answers use the business's knowledge.
const CAT_LABEL: Record<string, string> = { products: 'Products', services: 'Services', faqs: 'FAQs', policies: 'Policies', operations: 'Operations' };

export function BrainAssistant({ userId, onBack, onAsk, onDraft, onTool, onAllTools, onNewChat, onSaved, onTrain, flash, topInset = 0, wide = false }: {
  userId: string; onBack: () => void; onAsk: (q: string) => void; onDraft: (q: string) => void; onTool: (key: string) => void; onAllTools: () => void;
  onNewChat: () => void; onSaved: () => void; onTrain: (cat: string) => void; flash: (t: string) => void; topInset?: number; wide?: boolean;
}) {
  const [ask, setAsk] = useState('');
  const [prompts, setPrompts] = useState<SavedPrompt[] | null>(null);
  const [cov, setCov] = useState<Coverage[] | null>(null);
  const [edit, setEdit] = useState<{ id?: string; title: string; content: string } | null>(null);
  const [del, setDel] = useState<SavedPrompt | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => { loadPrompts().then(setPrompts, () => setPrompts([])); }, []);
  useEffect(() => { reload(); knowledgeCoverage().then(setCov, () => setCov([])); }, [reload]);

  const run = (a: BrainAction) => { if (a.tool) onTool(a.tool); else if (a.ask?.endsWith(': ')) onDraft(a.ask); else if (a.ask) onAsk(a.ask); };
  const submit = () => { const q = ask.trim(); setAsk(''); if (q) onAsk(q); else onNewChat(); };
  const saveEdit = async () => {
    if (!edit) return;
    setBusy(true);
    try { await savePrompt(userId, edit); flash(edit.id ? 'Prompt updated' : 'Prompt saved'); setEdit(null); reload(); }
    catch (e) { flash((e as Error).message); }
    setBusy(false);
  };
  const ready = cov ? cov.reduce((n, c) => n + c.verified + c.review, 0) : 0;
  const head = (icon: string, title: string, sub: string, right?: React.ReactNode) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={s.capIcon}><Ionicons name={icon as any} size={20} color="#1E56A0" /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.cardTitle}>{title}</Text>
        {!!sub && <Text style={s.muted}>{sub}</Text>}
      </View>
      {right}
    </View>
  );
  const chip = (a: BrainAction) => (
    <Pressable key={a.label} onPress={() => run(a)} accessibilityRole="button" style={s.chip}><Text style={s.chipText}>{a.label}</Text></Pressable>
  );

  return (
    <View style={s.screen}>
      <View style={[s.header, { paddingTop: topInset + 12 }]}>
        <Pressable onPress={onBack} hitSlop={8} accessibilityLabel="Back"><Ionicons name="chevron-back" size={24} color="#0B1220" /></Pressable>
        <Text style={s.headerTitle} numberOfLines={1}>AI Business Brain and Assistant</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14, width: '100%', maxWidth: wide ? 1100 : undefined, alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        <Text style={s.muted}>Answers, documents, workflows and decisions, from your own business knowledge and globally proven methods.</Text>
        <View style={s.askBox}>
          <Ionicons name="sparkles" size={18} color="#D98BE8" />
          <TextInput value={ask} onChangeText={setAsk} onSubmitEditing={submit} returnKeyType="send" placeholder="Ask anything about your business…" placeholderTextColor="#8A97A6" accessibilityLabel="Ask Nexora" style={s.askInput} />
          <Pressable onPress={submit} accessibilityRole="button" accessibilityLabel="Ask Nexora" style={s.send}><Ionicons name="arrow-up" size={19} color="#FFF" /></Pressable>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
          {BRAIN_CAPABILITIES.map(c => (
            <View key={c.key} style={[s.card, wide && { flexBasis: '31%', flexGrow: 1 }]}>
              {head(c.icon, c.title, '')}
              <Text style={[s.muted, { marginTop: 8 }]}>{c.sub}</Text>
              <View style={s.chips}>{c.actions.map(chip)}</View>
            </View>
          ))}
          <View style={[s.card, wide && { flexBasis: '31%', flexGrow: 1 }]}>
            {head('grid-outline', 'All AI tools in one place', 'Every Nexora AI tool, your chats and saved answers.')}
            {[
              { icon: 'grid-outline', label: 'Open all AI tools', onPress: onAllTools },
              { icon: 'chatbubbles-outline', label: 'New chat with Nexora', onPress: onNewChat },
              { icon: 'bookmarks-outline', label: 'Saved work', onPress: onSaved },
            ].map(l => (
              <Pressable key={l.label} onPress={l.onPress} accessibilityRole="button" style={s.linkRow}>
                <Ionicons name={l.icon as any} size={18} color="#1E56A0" /><Text style={s.linkText}>{l.label}</Text><Ionicons name="chevron-forward" size={16} color="#A5AFBB" />
              </Pressable>
            ))}
          </View>
        </View>

        <View style={s.card}>
          {head('git-network-outline', 'AI workflows', 'Common jobs, step by step. Open each step in order.')}
          {BRAIN_WORKFLOWS.map(w => (
            <View key={w.title} style={s.flow}>
              <Text style={s.flowTitle}>{w.title} <Text style={s.mutedInline}>· {w.sub}</Text></Text>
              <View style={s.chips}>
                {w.steps.map((st, i) => (
                  <Pressable key={st.label} onPress={() => run(st)} accessibilityRole="button" accessibilityLabel={`Step ${i + 1}: ${st.label}`} style={s.step}>
                    <View style={s.stepNo}><Text style={s.stepNoText}>{i + 1}</Text></View><Text style={s.stepText}>{st.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </View>

        <View style={s.card}>
          {head('library-outline', 'My reusable prompts', 'Save questions you ask often and use them again in one tap.',
            <Pressable onPress={() => setEdit({ title: '', content: '' })} accessibilityRole="button" style={s.newBtn}><Ionicons name="add" size={16} color="#FFF" /><Text style={s.newBtnText}>New</Text></Pressable>)}
          {prompts === null ? <ActivityIndicator color="#1E56A0" style={{ marginTop: 16 }} /> : !prompts.length ? (
            <Text style={[s.muted, s.empty]}>No prompts yet. Tap New, or in a Brain chat tap the bookmark under any question you asked.</Text>
          ) : prompts.map(p => (
            <View key={p.id} style={s.promptRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.flowTitle} numberOfLines={1}>{p.title}</Text>
                <Text style={s.muted} numberOfLines={1}>{p.content}</Text>
              </View>
              <Pressable onPress={() => onDraft(p.content)} accessibilityRole="button" accessibilityLabel={`Use ${p.title}`} style={s.useBtn}><Ionicons name="play-outline" size={14} color="#1E56A0" /><Text style={s.useText}>Use</Text></Pressable>
              <Pressable onPress={() => setEdit({ id: p.id, title: p.title, content: p.content })} hitSlop={6} accessibilityLabel={`Edit ${p.title}`}><Ionicons name="create-outline" size={19} color="#5C6B7A" /></Pressable>
              <Pressable onPress={() => setDel(p)} hitSlop={6} accessibilityLabel={`Delete ${p.title}`}><Ionicons name="trash-outline" size={19} color="#B42318" /></Pressable>
            </View>
          ))}
        </View>

        <View style={s.card}>
          {head('school-outline', 'Your business knowledge', 'Approved knowledge = your own facts (Verified and Need review items; drafts are never used) plus globally proven business methods, adapted to your business.')}
          {cov === null ? <ActivityIndicator color="#1E56A0" style={{ marginTop: 16 }} /> : (
            <View style={[s.chips, { gap: 10 }]}>
              {cov.map(c => (
                <Pressable key={c.category} onPress={() => onTrain(c.category)} accessibilityRole="button" style={s.covTile}>
                  <Text style={s.flowTitle}>{CAT_LABEL[c.category]}</Text>
                  <Text style={s.covNum}>{c.verified + c.review}</Text>
                  <Text style={s.covSub}>{c.verified} verified · {c.review} to review{c.drafts ? ` · ${c.drafts} draft${c.drafts === 1 ? '' : 's'}` : ''}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {cov !== null && ready === 0 && <Text style={[s.muted, { color: '#B45309', marginTop: 10 }]}>Nexora has nothing about your business yet. Add products, FAQs and policies in Train AI.</Text>}
        </View>
      </ScrollView>

      <Modal visible={!!edit} transparent animationType="fade" onRequestClose={() => setEdit(null)} statusBarTranslucent>
        <View style={s.overlay}>
          <View style={s.dialog}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[s.cardTitle, { flex: 1 }]}>{edit?.id ? 'Edit prompt' : 'New prompt'}</Text>
              <Pressable onPress={() => setEdit(null)} hitSlop={8} accessibilityLabel="Close"><Ionicons name="close" size={22} color="#5C6B7A" /></Pressable>
            </View>
            <Text style={s.label}>Name</Text>
            <TextInput value={edit?.title ?? ''} onChangeText={t => setEdit(e => e && { ...e, title: t })} maxLength={200} placeholder="e.g. Monday sales check" placeholderTextColor="#A5AFBB" style={s.input} />
            <Text style={s.label}>Prompt</Text>
            <TextInput value={edit?.content ?? ''} onChangeText={t => setEdit(e => e && { ...e, content: t })} maxLength={20000} multiline placeholder="e.g. Compare my sales this week with last week and tell me which products to promote." placeholderTextColor="#A5AFBB" style={[s.input, { height: 110, textAlignVertical: 'top', paddingTop: 10 }]} />
            <Pressable disabled={busy} onPress={saveEdit} accessibilityRole="button" style={[s.primary, busy && { opacity: 0.6 }]}>
              {busy ? <ActivityIndicator color="#FFF" /> : <Text style={s.primaryText}>Save prompt</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal visible={!!del} transparent animationType="fade" onRequestClose={() => setDel(null)} statusBarTranslucent>
        <View style={s.overlay}>
          <View style={[s.dialog, { alignItems: 'center' }]}>
            <Text style={s.cardTitle}>Delete “{del?.title}”?</Text>
            <Text style={[s.muted, { textAlign: 'center', marginTop: 4 }]}>This removes the prompt. Answers you saved are not affected.</Text>
            <Pressable onPress={async () => { if (!del) return; try { await deletePrompt(del.id); flash('Prompt deleted'); reload(); } catch (e) { flash((e as Error).message); } setDel(null); }}
              accessibilityRole="button" style={[s.primary, { backgroundColor: '#D64545', alignSelf: 'stretch' }]}><Text style={s.primaryText}>Delete prompt</Text></Pressable>
            <Pressable onPress={() => setDel(null)} accessibilityRole="button" style={{ paddingVertical: 12 }}><Text style={{ color: '#1E56A0', fontWeight: '700' }}>Cancel</Text></Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F7FB' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E6ECF3' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#0B1220' },
  muted: { fontSize: 13, color: '#5C6B7A', lineHeight: 19 },
  mutedInline: { fontSize: 13, color: '#5C6B7A', fontWeight: '400' },
  askBox: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 54, borderRadius: 27, paddingLeft: 18, paddingRight: 7, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E8F0' },
  askInput: { flex: 1, minWidth: 0, fontSize: 15, color: '#0B1220', height: 52 },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#0F2942', alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E6ECF3', padding: 16, width: '100%' },
  capIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#EAF1FB', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#0B1220' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: '#EAF1FB', justifyContent: 'center' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#1E56A0' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  linkText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#0B1220' },
  flow: { paddingTop: 12, marginTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  flowTitle: { fontSize: 14, fontWeight: '700', color: '#0B1220' },
  step: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 10, borderRadius: 16, borderWidth: 1, borderColor: '#E1E8F0' },
  stepNo: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#0F2942', alignItems: 'center', justifyContent: 'center' },
  stepNoText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  stepText: { fontSize: 12.5, fontWeight: '600', color: '#0B1220' },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: '#1E56A0' },
  newBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  empty: { marginTop: 14, backgroundColor: '#F4F7FB', borderRadius: 12, padding: 12 },
  promptRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  useBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 30, paddingHorizontal: 10, borderRadius: 15, backgroundColor: '#EAF1FB' },
  useText: { fontSize: 12.5, fontWeight: '700', color: '#1E56A0' },
  covTile: { flexBasis: '30%', flexGrow: 1, minWidth: 140, padding: 12, borderRadius: 12, backgroundColor: '#F7F9FC' },
  covNum: { fontSize: 22, fontWeight: '700', color: '#0B1220', marginTop: 4 },
  covSub: { fontSize: 11.5, color: '#5C6B7A' },
  overlay: { flex: 1, backgroundColor: 'rgba(11,18,32,0.5)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  dialog: { width: '100%', maxWidth: 460, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20 },
  label: { fontSize: 12.5, fontWeight: '600', color: '#5C6B7A', marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#D5DEE8', borderRadius: 12, paddingHorizontal: 12, height: 46, fontSize: 15, color: '#0B1220' },
  primary: { marginTop: 16, height: 48, borderRadius: 24, backgroundColor: '#1E56A0', alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
});
