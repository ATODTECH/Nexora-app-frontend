// Paystack's pop-up checkout (Paystack Inline v2) for the web: payment opens in a modal over the page instead of leaving it.
// The server starts the transaction (paystack-checkout 'start' returns access_code); this only shows it.
type Callbacks = { onSuccess: () => void; onCancel: () => void; onError: () => void };
type PaystackPopClass = new () => { resumeTransaction: (accessCode: string, callbacks: Callbacks) => void };
type WithPaystack = { PaystackPop?: PaystackPopClass };
let loading: Promise<PaystackPopClass> | null = null;

function loadPaystack(): Promise<PaystackPopClass> {
  const w = globalThis as WithPaystack;
  if (w.PaystackPop) return Promise.resolve(w.PaystackPop);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://js.paystack.co/v2/inline.js';
      s.async = true;
      s.onload = () => (w.PaystackPop ? resolve(w.PaystackPop) : reject(new Error('Paystack did not load')));
      s.onerror = () => { loading = null; reject(new Error('Paystack did not load')); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

/** Opens the Paystack payment modal. Resolves false if it couldn't open (the caller then uses Paystack's own page). */
export async function openPaystackPopup(accessCode: string, cb: Callbacks): Promise<boolean> {
  try {
    const Pop = await loadPaystack();
    new Pop().resumeTransaction(accessCode, { onSuccess: cb.onSuccess, onCancel: cb.onCancel, onError: cb.onError });
    return true;
  } catch {
    return false;
  }
}
