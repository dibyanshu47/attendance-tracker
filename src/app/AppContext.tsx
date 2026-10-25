import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { disableAutoSelect, type GisDriveTokenProvider, type GoogleIdentity } from '../auth';
import type { AttendanceStore, Student } from '../store';

/** Everything signed-in screens share. Only rendered once identity is known, so
 *  `identity` is non-null here. The student directory is cached once and reused
 *  across screens rather than refetched per screen (§11.2). */
export interface AppContextValue {
  identity: GoogleIdentity;
  store: AttendanceStore;
  tokens: GisDriveTokenProvider;
  students: Student[];
  studentsLoaded: boolean;
  reloadStudents: () => Promise<Student[]>;
  logout: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within an AppProvider');
  return ctx;
}

export function AppProvider(props: {
  identity: GoogleIdentity;
  store: AttendanceStore;
  tokens: GisDriveTokenProvider;
  onLogout: () => void;
  children: ReactNode;
}): JSX.Element {
  const { identity, store, tokens, onLogout, children } = props;
  const [students, setStudents] = useState<Student[]>([]);
  const [studentsLoaded, setStudentsLoaded] = useState(false);

  const reloadStudents = useCallback(async () => {
    const list = await store.listStudents();
    setStudents(list);
    setStudentsLoaded(true);
    return list;
  }, [store]);

  const logout = useCallback(() => {
    try {
      tokens.revoke();
    } catch {
      // best-effort; proceed with local logout regardless
    }
    try {
      disableAutoSelect();
    } catch {
      // GIS may be unavailable; ignore
    }
    onLogout();
  }, [tokens, onLogout]);

  const value = useMemo<AppContextValue>(
    () => ({ identity, store, tokens, students, studentsLoaded, reloadStudents, logout }),
    [identity, store, tokens, students, studentsLoaded, reloadStudents, logout],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
