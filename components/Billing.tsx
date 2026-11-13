import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, Share, StyleSheet, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../lib/inter';
import {
  cardLabel, changePlan, fmtDay, fmtMoney, loadAddons, loadPayments, payWithSavedCard, planEnded, planFit, quotePlan, removeCard, setAutoRenew,
  USAGE_LABELS, type Addon, type Billing, type FitIssue, type Payment, type Quote,
} from '../lib/billing';

// Capability 2.16 in the app: Plans, billing and Nexora One. Same data and rules as the website's Plans & billing page.
//  BillingNotices   a failed renewal (with Pay now), an ended plan, or a switch / cancellation waiting (with Keep)
//  BillingPayment   the saved card, automatic renewal, pay now with the card, remove the card
//  BillingMore      compare every plan and limit, add-ons (what they cost and when upgrading is better), payments and invoices
//  BillSheets       before paying: the price and dates (and extra days for unused time) with "Save my card";
//                   before switching or cancelling: what happens and when, and which limits the business would be over
//  planAction       what each plan card's button does
const BLUE = '#1E56A0', INK = '#0B1220', MUTED = '#5C6B7A', LINE = '#E3E8EF', RED = '#B42318', GREEN = '#127A4B', AMBER = '#B54708';

export type BPlan = {
  key: string; name: string; price_usd: number; price_ngn: number | null; price_usd_year: number | null; price_ngn_year: number | null;
  staff_seats: number | null; max_users: number | null; monthly_ai_messages: number | null; contact_sales: boolean;
  connected_accounts?: number | null; customer_records?: number | null; active_workflows?: number | null; knowledge_sources?: number | null;
  monthly_posts?: number | null; monthly_call_minutes?: number | null; storage_mb?: number | null;
};
export type BPayConfig = { ready: boolean; currency: string; test_mode: boolean; prices: Record<string, number | null>; prices_year?: Record<string, number | null>; addon_prices?: Record<string, number | null> };
export type BillSheet = { kind: 'buy'; plan?: BPlan; addon?: Addon } | { kind: 'change'; plan: BPlan };
const usersOf = (p?: BPlan) => (!p ? null : p.max_users ?? (p.staff_seats == null ? null : p.staff_seats + 1));
const planName = (plans: BPlan[], k?: string | null) => plans.find(p => p.key === k)?.name ?? (k ? `${k.charAt(0).toUpperCase()}${k.slice(1)}` : '');

/** What a plan card's button does: pay (upgrade, pay again, renew), switch at renewal, cancel at period end, or contact sales. */
export function planAction(p: BPlan, ctx: { current: string; bill: Billing | null; plans: BPlan[]; yearly: boolean }) {
  const cur = ctx.plans.find(x => x.key === ctx.current);
  const ended = planEnded(ctx.bill);
  const paidActive = ctx.current !== 'free' && !ended;
  const isCurrent = p.key === ctx.current, isFree = p.key === 'free';
  const cheaper = paidActive && !!cur && !p.contact_sales && (p.price_ngn ?? 0) < (cur.price_ngn ?? 0);
  const waiting = ctx.bill?.pending_plan === p.key || (isFree && !!ctx.bill?.cancel_at_period_end);
  if (p.contact_sales) return { kind: 'contact' as const, label: 'Contact sales', waiting: false };
  if (isFree) return paidActive ? { kind: 'cancel' as const, label: waiting ? 'Cancelled: moves here at period end' : 'Cancel plan (at period end)', waiting } : { kind: 'none' as const, label: '', waiting: false };
  if (isCurrent && paidActive) return { kind: 'buy' as const, label: `Pay for another ${ctx.yearly ? 'year' : 'month'}`, waiting: false };
  if (isCurrent && ended) return { kind: 'buy' as const, label: `Renew ${p.name}`, waiting: false };
  if (cheaper) return { kind: 'switch' as const, label: waiting ? 'Switching at renewal' : 'Switch at renewal', waiting };
  return { kind: 'buy' as const, label: ctx.current === 'free' || ended ? `Upgrade to ${p.name}` : `Upgrade to ${p.name} now`, waiting: false };
}

function Btn({ label, onPress, kind = 'primary', busy, disabled, icon }: { label: string; onPress: () => void; kind?: 'primary' | 'outline' | 'danger'; busy?: boolean; disabled?: boolean; icon?: keyof typeof Ionicons.glyphMap }) {
  const color = kind === 'primary' ? '#FFFFFF' : kind === 'danger' ? RED : BLUE;
  return (
    <Pressable disabled={busy || disabled} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={[s.btn, kind === 'primary' ? { backgroundColor: BLUE } : kind === 'danger' ? { borderWidth: 1, borderColor: '#F3B8B2', backgroundColor: '#FDECEC' } : { borderWidth: 1, borderColor: '#9DB8DD' }, (disabled && !busy) && { opacity: 0.45 }]}>
      {busy ? <ActivityIndicator color={color} /> : <>{!!icon && <Ionicons name={icon} size={16} color={color} />}<Text style={[s.btnText, { color }]}>{label}</Text></>}
    </Pressable>
  );
}
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
        <View style={s.sheet}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <Text style={[s.h, { flex: 1 }]}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close"><Ionicons name="close" size={24} color={MUTED} /></Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** Something needs the owner: a failed renewal, an ended plan, or a switch / cancellation waiting for the end of the period. */
export function BillingNotices({ bill, plans, flash, reload }: { bill: Billing | null; plans: BPlan[]; flash: (m: string) => void; reload: () => void }) {
  const [busy, setBusy] = useState('');
  if (!bill) return null;
  const ended = planEnded(bill);
  const payNow = async () => {
    setBusy('pay');
    try { const r = await payWithSavedCard(); flash(`Paid. ${r.plan_name || 'Your'} plan is active until ${fmtDay(r.current_period_end)}.`); } catch (e) { flash((e as Error).message); }
    setBusy(''); reload();
  };
  const keep = async () => {
    setBusy('keep');
    try { await changePlan(bill.plan); flash(`You're keeping ${planName(plans, bill.plan)}.`); } catch (e) { flash((e as Error).message); }
    setBusy(''); reload();
  };
  const left = Math.max(0, 3 - bill.payment_failures);
  return (
    <>
      {bill.in_grace && (
        <View style={[s.notice, { backgroundColor: '#FDECEC' }]}>
          <Text style={[s.noticeT, { color: RED }]}>Your renewal payment didn't go through</Text>
          <Text style={[s.noticeS, { color: '#7A271A' }]}>{bill.last_payment_error ? `${bill.last_payment_error}. ` : ''}Your {planName(plans, bill.plan)} plan keeps working while we try again{bill.next_charge_at ? ` on ${fmtDay(bill.next_charge_at)}` : ''} ({left} {left === 1 ? 'try' : 'tries'} left). Pay now with your saved card, or pay with another card below.</Text>
          {!!bill.card && <View style={{ marginTop: 10 }}><Btn label={`Pay now with ${cardLabel(bill.card)}`} busy={busy === 'pay'} onPress={payNow} /></View>}
        </View>
      )}
      {ended && (
        <View style={[s.notice, { backgroundColor: '#FDECEC' }]}>
          <Text style={[s.noticeT, { color: RED }]}>Your {planName(plans, bill.plan)} plan has ended</Text>
          <Text style={[s.noticeS, { color: '#7A271A' }]}>Your business is on the Free plan's limits until you renew. Your data is safe: renew below to get your full plan back.</Text>
          {!!bill.card && <View style={{ marginTop: 10 }}><Btn label={`Renew now with ${cardLabel(bill.card)}`} busy={busy === 'pay'} onPress={payNow} /></View>}
        </View>
      )}
      {!ended && bill.plan !== 'free' && (bill.cancel_at_period_end || !!bill.pending_plan) && (
        <View style={[s.notice, { backgroundColor: '#FFF6E5' }]}>
          <Text style={[s.noticeS, { color: '#92400E', marginTop: 0 }]}>{bill.cancel_at_period_end ? `You cancelled ${planName(plans, bill.plan)}. It ends on ${fmtDay(bill.period_end)}.` : `${planName(plans, bill.pending_plan)} starts on ${fmtDay(bill.period_end)}, when your ${planName(plans, bill.plan)} period ends.`}</Text>
          <View style={{ marginTop: 10 }}><Btn kind="outline" label={`Keep ${planName(plans, bill.plan)}`} busy={busy === 'keep'} onPress={keep} /></View>
        </View>
      )}
    </>
  );
}

/** The plan line under the business name: when it renews, ends or switches. */
export function renewalLine(bill: Billing | null, plans: BPlan[]) {
  if (!bill || bill.plan === 'free') return '';
  if (planEnded(bill)) return `Ended on ${fmtDay(bill.period_end)}.`;
  if (bill.cancel_at_period_end) return `Ends on ${fmtDay(bill.period_end)}, then your business moves to the Free plan's limits.`;
  if (bill.pending_plan) return `Switches to ${planName(plans, bill.pending_plan)} on ${fmtDay(bill.period_end)}.`;
  if (bill.auto_renew && bill.card) return `Renews automatically on ${fmtDay(bill.period_end)} with your ${cardLabel(bill.card)}.`;
  return bill.period_end ? `Paid until ${fmtDay(bill.period_end)}. Pay again to add another ${bill.interval === 'year' ? 'year' : 'month'}, or turn on automatic renewal.` : '';
}

/** The saved card and automatic renewal (paid plans). */
export function BillingPayment({ bill, flash, reload }: { bill: Billing | null; flash: (m: string) => void; reload: () => void }) {
  const [busy, setBusy] = useState('');
  const [askRemove, setAskRemove] = useState(false);
  if (!bill || bill.plan === 'free') return null;
  const ended = planEnded(bill);
  const toggle = async (on: boolean) => {
    setBusy('renew');
    try { await setAutoRenew(on); flash(on ? 'Automatic renewal is on.' : 'Automatic renewal is off. Your plan ends when the paid period does unless you pay again.'); } catch (e) { flash((e as Error).message); }
    setBusy(''); reload();
  };
  const payNow = async () => {
    setBusy('pay');
    try { const r = await payWithSavedCard(); flash(`Paid. ${r.plan_name || 'Your'} plan is active until ${fmtDay(r.current_period_end)}.`); } catch (e) { flash((e as Error).message); }
    setBusy(''); reload();
  };
  const remove = async () => {
    setBusy('remove');
    try { await removeCard(); flash('Card removed. Automatic renewal is off.'); } catch (e) { flash((e as Error).message); }
    setBusy(''); setAskRemove(false); reload();
  };
  return (
    <View style={s.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Ionicons name="card-outline" size={18} color={BLUE} /><Text style={s.h}>Payment method and renewal</Text></View>
      {bill.card ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <Text style={{ flex: 1, fontSize: 13.5, color: INK }}>{cardLabel(bill.card)}{bill.card.exp_month ? ` · expires ${bill.card.exp_month}/${String(bill.card.exp_year).slice(-2)}` : ''}{bill.card.bank ? ` · ${bill.card.bank}` : ''}</Text>
          <Pressable onPress={() => setAskRemove(true)} hitSlop={8} accessibilityRole="button"><Text style={{ color: RED, fontWeight: '700', fontSize: 13 }}>Remove card</Text></Pressable>
        </View>
      ) : <Text style={s.sub}>No card saved. When you pay for a plan, turn on "Save my card" to renew automatically. Paystack keeps the card: Nexora never sees the full number.</Text>}
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13.5, fontWeight: '700', color: INK }}>Renew automatically</Text>
          <Text style={[s.sub, { marginTop: 2 }]}>{bill.card ? `Charges your saved card on ${fmtDay(bill.period_end) || 'the renewal date'}. You get an email 3 days before.` : 'Save a card to turn this on.'}</Text>
        </View>
        {busy === 'renew' ? <ActivityIndicator color={BLUE} /> : (
          <Switch value={!!bill.auto_renew} onValueChange={toggle} disabled={!bill.card || bill.cancel_at_period_end} accessibilityLabel="Renew automatically" trackColor={{ true: BLUE, false: '#C7D2DE' }} thumbColor="#FFFFFF" />
        )}
      </View>
      {!!bill.card && !ended && !bill.in_grace && (
        <Pressable onPress={payNow} disabled={busy === 'pay'} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }} accessibilityRole="button">
          {busy === 'pay' ? <ActivityIndicator color={BLUE} /> : <Ionicons name="refresh-circle-outline" size={18} color={BLUE} />}
          <Text style={{ color: BLUE, fontWeight: '700', fontSize: 13 }}>Pay for the next {bill.interval === 'year' ? 'year' : 'month'} now with your card</Text>
        </Pressable>
      )}
      <Text style={[s.small, { marginTop: 10 }]}>To use a different card, pay for your plan with Paystack and turn on "Save my card": the new card replaces this one.</Text>
      {askRemove && (
        <Sheet title="Remove your saved card?" onClose={() => setAskRemove(false)}>
          <Text style={s.body}>Automatic renewal turns off. Your plan keeps working until the end of the paid period, and you can pay with a card at any time.</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <View style={{ flex: 1 }}><Btn kind="outline" label="Cancel" onPress={() => setAskRemove(false)} /></View>
            <View style={{ flex: 1 }}><Btn kind="danger" label="Remove card" busy={busy === 'remove'} onPress={remove} /></View>
          </View>
        </Sheet>
      )}
    </View>
  );
}

/** Compare every plan and limit, add-ons, payments and invoices. */
export function BillingMore({ bill, plans, current, yearly, showNgn, payConfig, siteUrl, refreshKey, onBuyAddon }: {
  bill: Billing | null; plans: BPlan[]; current: string; yearly: boolean; showNgn: boolean; payConfig: BPayConfig | null; siteUrl: string; refreshKey: number;
  onBuyAddon: (a: Addon) => void;
}) {
  const [compare, setCompare] = useState(false);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [invoice, setInvoice] = useState<Payment | null>(null);
  useEffect(() => {
    let live = true;
    loadAddons().then(a => { if (live) setAddons(a); }, () => { if (live) setAddons([]); });
    loadPayments().then(p => { if (live) setPayments(p); }, () => { if (live) setPayments([]); });
    return () => { live = false; };
  }, [refreshKey]);
  const currency = payConfig?.currency || (showNgn ? 'NGN' : 'USD');
  const addonAllowed = (a: Addon) => !!bill && a.plans.includes(bill.effective_plan);
  const shareInvoice = (p: Payment) => {
    const lines = [`Nexora AI invoice ${p.invoice_number ?? ''}`, `Paid ${fmtDay(p.paid_at)} · ${fmtMoney(p.amount, p.currency)}`, p.description, p.period_start ? `Period: ${fmtDay(p.period_start)} – ${fmtDay(p.period_end)}` : '', `Reference: ${p.reference}`].filter(Boolean);
    Share.share({ message: lines.join('\n') }).catch(() => {});
  };
  return (
    <>
      <Pressable onPress={() => setCompare(v => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, marginBottom: 8 }} accessibilityRole="button" accessibilityState={{ expanded: compare }}>
        <Ionicons name={compare ? 'chevron-up' : 'chevron-down'} size={16} color={BLUE} />
        <Text style={{ color: BLUE, fontWeight: '700', fontSize: 13 }}>{compare ? 'Hide the comparison' : 'Compare every plan and limit'}</Text>
      </Pressable>
      {compare && <CompareTable plans={plans} current={current} yearly={yearly} showNgn={showNgn} />}

      {!!addons.length && (
        <>
          <Text style={s.label}>ADD-ONS</Text>
          {addons.map(a => {
            const price = payConfig?.addon_prices?.[a.key] ?? (showNgn ? a.price_ngn : a.price_usd);
            const allowed = addonAllowed(a);
            return (
              <View key={a.key} style={[s.card, !a.active && { opacity: 0.7 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                  <Text style={[s.h, { flex: 1, fontSize: 15 }]}>{a.name}</Text>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: INK }}>{a.active && price != null ? fmtMoney(price, currency) : 'Not on sale yet'}</Text>
                </View>
                <Text style={[s.body, { marginTop: 4 }]}>{a.description}</Text>
                <Text style={[s.sub, { color: '#334155' }]}><Text style={{ fontWeight: '700', color: '#334155' }}>Why: </Text>{a.value_note}</Text>
                <Text style={s.sub}><Text style={{ fontWeight: '700', color: MUTED }}>Cost: </Text>{a.cost_note}</Text>
                {a.active && (
                  <View style={{ marginTop: 10 }}>
                    <Btn label={allowed ? `Buy for ${price != null ? fmtMoney(price, currency) : ''}` : `For ${a.plans.map(k => planName(plans, k)).join(', ')} plans`} disabled={!allowed || (!!payConfig && !payConfig.ready)} onPress={() => onBuyAddon(a)} />
                  </View>
                )}
              </View>
            );
          })}
        </>
      )}

      <Text style={s.label}>PAYMENTS AND INVOICES</Text>
      <View style={[s.card, { paddingVertical: 4 }]}>
        {payments === null ? <ActivityIndicator style={{ marginVertical: 14 }} color={BLUE} /> : payments.length === 0 ? <Text style={[s.sub, { marginVertical: 10 }]}>No payments yet. Every payment you make shows here with its invoice.</Text> : payments.map((p, i) => (
          <View key={p.id} style={[{ paddingVertical: 10 }, i > 0 && { borderTopWidth: 1, borderTopColor: LINE }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '700', color: INK }} numberOfLines={1}>{p.description}</Text>
              <Text style={{ fontSize: 13.5, fontWeight: '700', color: INK }}>{fmtMoney(p.amount, p.currency)}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
              <Text style={[s.small, { flex: 1 }]} numberOfLines={2}>{fmtDay(p.paid_at || p.created_at)}{p.card_last4 ? ` · ${cardLabel({ brand: p.card_brand, last4: p.card_last4 })}` : p.channel ? ` · ${p.channel}` : ''}{p.status === 'failed' && p.failure_reason ? ` · ${p.failure_reason}` : ''}</Text>
              <Text style={[s.tag, p.status === 'success' ? { backgroundColor: '#E7F6EE', color: GREEN } : { backgroundColor: '#FDECEC', color: RED }]}>{p.status === 'success' ? 'Paid' : 'Failed'}</Text>
              {p.status === 'success' && <Pressable onPress={() => setInvoice(p)} hitSlop={8} accessibilityRole="button"><Text style={{ color: BLUE, fontWeight: '700', fontSize: 13 }}>Invoice</Text></Pressable>}
            </View>
          </View>
        ))}
      </View>

      {invoice && (
        <Sheet title="Invoice" onClose={() => setInvoice(null)}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: INK }}>Invoice</Text>
              <Text style={s.sub}>{invoice.invoice_number}</Text>
            </View>
            <Text style={[s.tag, { backgroundColor: '#E7F6EE', color: GREEN }]}>PAID</Text>
          </View>
          <Text style={[s.small, { marginTop: 12 }]}>FROM</Text>
          <Text style={s.body}>Nexora AI · www.nexorabusinessai.com</Text>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
            <View style={{ flex: 1 }}><Text style={s.small}>DATE PAID</Text><Text style={s.body}>{fmtDay(invoice.paid_at)}</Text></View>
            <View style={{ flex: 1 }}><Text style={s.small}>PAID WITH</Text><Text style={s.body}>{invoice.card_last4 ? cardLabel({ brand: invoice.card_brand, last4: invoice.card_last4 }) : invoice.channel ? `Paystack (${invoice.channel})` : 'Paystack'}</Text></View>
          </View>
          <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 10 }}>
            <Text style={[s.body, { fontWeight: '700' }]}>{invoice.description}</Text>
            {!!invoice.credit_note && <Text style={s.sub}>{invoice.credit_note}</Text>}
            {!!invoice.period_start && <Text style={s.sub}>{fmtDay(invoice.period_start)} – {fmtDay(invoice.period_end)}</Text>}
            <View style={{ flexDirection: 'row', marginTop: 10 }}><Text style={[s.body, { flex: 1, fontWeight: '700' }]}>Total paid</Text><Text style={{ fontSize: 17, fontWeight: '800', color: INK }}>{fmtMoney(invoice.amount, invoice.currency)}</Text></View>
          </View>
          <Text style={[s.small, { marginTop: 10 }]}>Reference {invoice.reference}. Payment processed by Paystack.</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <View style={{ flex: 1 }}><Btn kind="outline" icon="share-outline" label="Share" onPress={() => shareInvoice(invoice)} /></View>
            <View style={{ flex: 1 }}><Btn icon="print-outline" label="Printable copy" onPress={() => { Linking.openURL(`${siteUrl}/billing/invoice?id=${invoice.id}`).catch(() => {}); }} /></View>
          </View>
          <Text style={[s.small, { marginTop: 8 }]}>The printable copy opens on the Nexora website (sign in with the same account), where you can save it as a PDF.</Text>
        </Sheet>
      )}
    </>
  );
}

/** Every plan's price, limits and team features side by side (2.16: transparent feature and usage limits). */
function CompareTable({ plans, current, yearly, showNgn }: { plans: BPlan[]; current: string; yearly: boolean; showNgn: boolean }) {
  const n = (v: number | null | undefined) => (v === null || v === undefined ? 'Custom' : v === 0 ? '—' : v.toLocaleString());
  const tracked = (v: number | null | undefined, p: BPlan) => (p.contact_sales ? 'Custom' : v === null || v === undefined ? 'Tracked' : v.toLocaleString());
  const usd = (x: number) => (Number.isInteger(x) ? x.toLocaleString() : x.toFixed(2));
  const price = (p: BPlan) => p.key === 'free' ? 'Free' : p.contact_sales ? `From $${p.price_usd.toLocaleString()}` : showNgn
    ? `₦${((yearly ? p.price_ngn_year : p.price_ngn) ?? 0).toLocaleString()}` : `$${usd((yearly ? p.price_usd_year : p.price_usd) ?? 0)}`;
  const team = (p: BPlan) => { const u = usersOf(p); return u === null || u > 1; };
  const rows: [string, (p: BPlan) => string | boolean][] = [
    [yearly ? 'Price a year' : 'Price a month', price],
    ['Users (including you)', p => n(usersOf(p))],
    ['AI tasks a month', p => n(p.monthly_ai_messages)],
    ['Connected accounts', p => n(p.connected_accounts)],
    ['Customer records', p => n(p.customer_records)],
    ['Active automations', p => n(p.active_workflows)],
    ['Knowledge documents', p => (p.knowledge_sources == null && !p.contact_sales ? 'No limit' : n(p.knowledge_sources))],
    ['Posts published a month', p => tracked(p.monthly_posts, p)],
    ['Receptionist call minutes', p => tracked(p.monthly_call_minutes, p)],
    ['Storage', p => tracked(p.storage_mb, p)],
    ['Team roles and permissions', team],
    ['Admin controls and audit log', team],
    ['Shared tasks, notes, saved views', team],
    ['Dashboards each person arranges', () => true],
    ['Add-ons', p => p.key !== 'free' && !p.contact_sales],
  ];
  const W = 92;
  return (
    <View style={[s.card, { padding: 0, overflow: 'hidden' }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          <View style={[s.trow, { backgroundColor: '#F4F6F9' }]}>
            <Text style={[s.tcell, s.thead, { width: 150 }]}>Plan</Text>
            {plans.map(p => <Text key={p.key} style={[s.tcell, s.thead, { width: W, color: p.key === current ? BLUE : INK }]}>{p.name}{p.key === current ? ' · yours' : ''}</Text>)}
          </View>
          {rows.map(([label, f]) => (
            <View key={label} style={s.trow}>
              <Text style={[s.tcell, { width: 150, color: MUTED }]}>{label}</Text>
              {plans.map(p => {
                const v = f(p);
                return (
                  <View key={p.key} style={[s.tcellBox, { width: W }, p.key === current && { backgroundColor: '#F2F6FD' }]}>
                    {v === true ? <Ionicons name="checkmark-circle" size={16} color={BLUE} accessibilityLabel="Included" /> : v === false ? <Text style={{ color: '#A5AFBB' }}>—</Text> : <Text style={{ fontSize: 12.5, color: INK }}>{v}</Text>}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
      <Text style={[s.small, { padding: 12 }]}>"Tracked" means Nexora counts it and shows it in your usage, but your plan doesn't stop you. If a limit is ever added, it will be shown here first.</Text>
    </View>
  );
}

/** Before paying (price, dates, extra days, Save my card) and before switching or cancelling (what happens and when). */
export function BillSheets({ sheet, onClose, bill, plans, yearly, payConfig, showNgn, flash, reload, onPay }: {
  sheet: BillSheet | null; onClose: () => void; bill: Billing | null; plans: BPlan[]; yearly: boolean; payConfig: BPayConfig | null; showNgn: boolean;
  flash: (m: string) => void; reload: () => void; onPay: (item: { plan?: BPlan; addon?: Addon; saveCard: boolean }) => void;
}) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState('');
  const [saveCard, setSaveCard] = useState(true);
  const [over, setOver] = useState<FitIssue[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    setQuote(null); setError(''); setOver(null); setBusy(false);
    if (!sheet) return;
    if (sheet.kind === 'buy') {
      setSaveCard(!!sheet.plan && !bill?.card);
      if (sheet.plan) quotePlan(sheet.plan.key, yearly ? 'year' : 'month').then(q => { if (live) setQuote(q); }, e => { if (live) setError((e as Error).message); });
    } else {
      planFit(sheet.plan.key).then(o => { if (live) setOver(o); }, () => { if (live) setOver([]); });
    }
    return () => { live = false; };
  }, [sheet]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!sheet) return null;
  const currency = payConfig?.currency || (showNgn ? 'NGN' : 'USD');

  if (sheet.kind === 'buy') {
    const { plan, addon } = sheet;
    const addonPrice = addon ? (payConfig?.addon_prices?.[addon.key] ?? (showNgn ? addon.price_ngn : addon.price_usd)) : null;
    const canPay = addon ? addonPrice != null : !!quote && quote.kind !== 'downgrade';
    return (
      <Sheet title={plan ? `${plan.name} · ${yearly ? 'yearly' : 'monthly'}` : addon!.name} onClose={onClose}>
        {plan ? (error ? <Text style={[s.body, { color: RED }]}>{error}</Text> : !quote ? <ActivityIndicator color={BLUE} style={{ marginVertical: 16 }} /> : <Text style={s.body}>{quote.text}</Text>)
          : <><Text style={s.body}>{addon!.description}</Text><Text style={[s.sub, { marginTop: 8 }]}>{addon!.cost_note}</Text></>}
        {canPay && (
          <>
            <View style={[s.row, { borderTopWidth: 0, marginTop: 14 }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13.5, fontWeight: '700', color: INK }}>Save my card and renew my plan automatically</Text>
                <Text style={[s.sub, { marginTop: 2 }]}>Paystack keeps the card. You get an email 3 days before each renewal and can turn this off any time.</Text>
              </View>
              <Switch value={saveCard} onValueChange={setSaveCard} accessibilityLabel="Save my card" trackColor={{ true: BLUE, false: '#C7D2DE' }} thumbColor="#FFFFFF" />
            </View>
            <View style={{ marginTop: 14 }}>
              <Btn label={`Pay ${plan ? fmtMoney(quote!.amount, quote!.currency) : fmtMoney(addonPrice!, currency)} with Paystack`} onPress={() => { onPay({ plan, addon, saveCard }); onClose(); }} />
            </View>
          </>
        )}
      </Sheet>
    );
  }

  const p = sheet.plan;
  const curName = planName(plans, bill?.plan);
  const end = fmtDay(bill?.period_end);
  const year = bill?.interval === 'year';
  const renewPrice = (() => {
    const v = (year ? payConfig?.prices_year : payConfig?.prices)?.[p.key] ?? (currency === 'USD' ? (year ? p.price_usd_year : p.price_usd) : (year ? p.price_ngn_year : p.price_ngn));
    return v == null ? '' : `${fmtMoney(v, currency)} a ${year ? 'year' : 'month'}`;
  })();
  const fit = over?.length ? over.map(o => `${USAGE_LABELS[o.kind] ?? o.kind}: ${o.used.toLocaleString()} (the plan allows ${o.limit.toLocaleString()})`).join('; ') : '';
  const cancel = p.key === 'free';
  const text = cancel
    ? `Your ${curName} plan keeps working until ${end}. Then your business moves to the Free plan's limits and keeps all its data. Automatic renewal turns off.`
    : `You keep ${curName} until ${end}, then ${p.name} starts${bill?.auto_renew && renewPrice ? ` and your card is charged ${renewPrice}` : ''}.`;
  const go = async () => {
    setBusy(true);
    try { const r = await changePlan(p.key); flash(r.action === 'cancel' ? `Cancelled. Your plan ends on ${fmtDay(r.on)}.` : `${p.name} starts on ${fmtDay(r.on)}.`); onClose(); reload(); }
    catch (e) { flash((e as Error).message); setBusy(false); }
  };
  return (
    <Sheet title={cancel ? 'Cancel your plan?' : `Switch to ${p.name} at renewal?`} onClose={onClose}>
      <Text style={s.body}>{text}</Text>
      {over === null ? <ActivityIndicator color={BLUE} style={{ marginTop: 10 }} /> : !!fit && (
        <Text style={[s.sub, { color: AMBER }]}>Over {cancel ? 'the Free' : `${p.name}'s`} limits today: {fit}. Nothing is deleted, but you won't be able to add more until you're under the limit.</Text>
      )}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
        <View style={{ flex: 1 }}><Btn kind="outline" label="Not now" onPress={onClose} /></View>
        <View style={{ flex: 1 }}><Btn kind={cancel ? 'danger' : 'primary'} label={cancel ? 'Cancel at period end' : `Switch to ${p.name}`} busy={busy} disabled={over === null} onPress={go} /></View>
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: LINE },
  h: { fontSize: 15.5, fontWeight: '700', color: INK },
  body: { fontSize: 14, color: INK, lineHeight: 20 },
  sub: { fontSize: 12.5, color: MUTED, marginTop: 6, lineHeight: 18 },
  small: { fontSize: 11.5, color: '#8A97A6', lineHeight: 16 },
  label: { fontSize: 12, fontWeight: '700', color: '#8A97A6', marginTop: 16, marginBottom: 8, letterSpacing: 0.4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: LINE },
  notice: { marginTop: 12, padding: 12, borderRadius: 14 },
  noticeT: { fontWeight: '700', fontSize: 14 },
  noticeS: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  btn: { minHeight: 44, borderRadius: 999, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  btnText: { fontSize: 14.5, fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: 'rgba(11,18,32,0.45)' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32, maxHeight: '88%' },
  tag: { fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  trow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: LINE },
  tcell: { paddingHorizontal: 10, paddingVertical: 9, fontSize: 12.5 },
  thead: { fontWeight: '700', fontSize: 12.5 },
  tcellBox: { paddingHorizontal: 10, paddingVertical: 9, justifyContent: 'center' },
});
