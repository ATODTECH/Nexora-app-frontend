import { supabase } from './supabase';

// Reports app crashes to Nexora's health check (system_events), which emails the support inbox when the same problem
// keeps happening. At most 5 reports per app session; only the error text is sent.
let sent = 0;
export function reportAppError(message: string, where = 'app') {
  if (sent >= 5 || !message) return;
  sent++;
  supabase.auth.getSession().then(({ data }) => {
    if (!data.session) return;
    supabase.from('system_events').insert({ source: where.slice(0, 60), kind: 'client_error', detail: message.slice(0, 500) }).then(() => {}, () => {});
  }, () => {});
}
let installed = false;
/** Catches crashes anywhere in the app (keeps the normal crash behaviour, just reports first). */
export function installErrorReporter() {
  if (installed) return;
  installed = true;
  const g = globalThis as any;
  const eu = g.ErrorUtils;
  if (eu?.getGlobalHandler && eu?.setGlobalHandler) {
    const prev = eu.getGlobalHandler();
    eu.setGlobalHandler((error: Error, isFatal?: boolean) => {
      reportAppError(`${isFatal ? 'Fatal: ' : ''}${error?.message ?? String(error)}`, 'app');
      prev?.(error, isFatal);
    });
  }
}
