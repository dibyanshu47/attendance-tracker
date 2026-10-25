import { useEffect, useState } from 'react';
import { useApp } from './AppContext';
import { describeError } from './errors';
import type { ClassInfo } from '../store';

export type ClassLoad =
  | { status: 'loading' }
  | { status: 'ready'; cls: ClassInfo }
  | { status: 'missing' }
  | { status: 'error'; error: string };

/** Load a single class by id via listClasses (§11.2). Returns the load state
 *  and a `reload` to refetch (e.g. after a membership change). */
export function useClassInfo(id: string): { state: ClassLoad; reload: () => void } {
  const { store } = useApp();
  const [state, setState] = useState<ClassLoad>({ status: 'loading' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setState({ status: 'loading' });
      try {
        const list = await store.listClasses();
        const found = list.find((c) => c.classId === id);
        if (cancelled) return;
        setState(found ? { status: 'ready', cls: found } : { status: 'missing' });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', error: describeError(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store, id, nonce]);

  return { state, reload: () => setNonce((n) => n + 1) };
}
