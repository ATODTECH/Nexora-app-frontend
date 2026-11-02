import React, { useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, TextInput } from '../lib/inter';

/**
 * "Ask for approval": what will happen, a reason box and Send. The caller sends the request (requestApproval) in onSend,
 * so each screen keeps its own fields. Closes when the request is sent. Same as the website's AskApproval.
 */
export function AskApproval({ title, what, reasonLabel, reasonPlaceholder, reasonRequired = true, children, onSend, onClose }: {
  title: string; what: string; reasonLabel: string; reasonPlaceholder?: string; reasonRequired?: boolean; children?: ReactNode;
  onSend: (reason: string) => Promise<void>; onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const send = async () => {
    if (reasonRequired && !reason.trim()) { setErr('Add a short reason so the approver knows why.'); return; }
    setBusy(true); setErr('');
    try { await onSend(reason); onClose(); } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.backdrop}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
        <View style={s.sheet}>
          <View style={s.row}>
            <Ionicons name="shield-checkmark-outline" size={22} color="#1E56A0" />
            <Text style={s.title}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close"><Ionicons name="close" size={22} color="#5C6B7A" /></Pressable>
          </View>
          <Text style={s.what}>{what}</Text>
          <Text style={s.hint}>Your request goes to the owner and anyone who approves team requests. It runs as soon as it's approved, and you'll get a notification either way.</Text>
          {children}
          <Text style={s.label}>{reasonLabel}{!reasonRequired && <Text style={{ fontWeight: '400', color: '#5C6B7A' }}> (optional)</Text>}</Text>
          <TextInput value={reason} onChangeText={setReason} maxLength={300} multiline placeholder={reasonPlaceholder} placeholderTextColor="#A5AFBB" style={s.input} />
          {!!err && <Text style={s.error} accessibilityRole="alert">{err}</Text>}
          <Pressable disabled={busy} onPress={() => { send().catch(() => {}); }} style={[s.btn, busy && { opacity: 0.7 }]} accessibilityRole="button">
            {busy ? <ActivityIndicator color="#FFF" /> : <Text style={s.btnText}>Send for approval</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(11,18,32,0.45)' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 32 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1, fontSize: 17, fontWeight: '700', color: '#0B1220' },
  what: { marginTop: 10, fontSize: 14, color: '#5C6B7A', lineHeight: 20 },
  hint: { marginTop: 4, fontSize: 12, color: '#8A97A6', lineHeight: 17 },
  label: { marginTop: 14, fontSize: 13, fontWeight: '600', color: '#0B1220' },
  input: { marginTop: 6, minHeight: 72, borderWidth: 1, borderColor: '#D5DEE8', borderRadius: 12, padding: 12, fontSize: 14, color: '#0B1220', textAlignVertical: 'top' },
  error: { marginTop: 8, fontSize: 13, color: '#B42318' },
  btn: { marginTop: 16, height: 48, borderRadius: 999, backgroundColor: '#1E56A0', alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
