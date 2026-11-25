import { db } from '../firebase';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';

const START_ORDER_NUMBER = 101;

const getLocalDateKey = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getLocalFallbackOrderNumber = (dateKey: string): number => {
  try {
    const storageKey = `easy_totem_order_seq_${dateKey}`;
    const current = parseInt(localStorage.getItem(storageKey) || '', 10);
    const next = isNaN(current) ? START_ORDER_NUMBER : current + 1;
    localStorage.setItem(storageKey, String(next));
    return next;
  } catch {
    return START_ORDER_NUMBER + Math.floor(Math.random() * 80);
  }
};

/**
 * Atomically generates a daily sequential order number starting at #101 (#101, #102, #103...)
 * via Firestore transaction on `contadores/daily_YYYY-MM-DD`.
 */
export async function generateNextDailyOrderNumber(): Promise<number> {
  const dateKey = getLocalDateKey();
  const counterRef = doc(db, 'contadores', `daily_${dateKey}`);

  try {
    const nextNumber = await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(counterRef);
      if (!snap.exists()) {
        transaction.set(counterRef, {
          dateKey,
          currentNumber: START_ORDER_NUMBER,
          updatedAt: serverTimestamp(),
        });
        return START_ORDER_NUMBER;
      }

      const prevNumber = Number(snap.data()?.currentNumber);
      const next = !isNaN(prevNumber) && prevNumber >= START_ORDER_NUMBER
        ? prevNumber + 1
        : START_ORDER_NUMBER;

      transaction.update(counterRef, {
        currentNumber: next,
        updatedAt: serverTimestamp(),
      });
      return next;
    });

    // Keep local fallback synced
    try {
      localStorage.setItem(`easy_totem_order_seq_${dateKey}`, String(nextNumber));
    } catch {
      // Ignore storage errors
    }

    return nextNumber;
  } catch (err) {
    console.warn('[OrderNumberService] Firestore transaction fallback activated:', err);
    return getLocalFallbackOrderNumber(dateKey);
  }
}
