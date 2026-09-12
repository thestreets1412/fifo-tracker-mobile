import { create } from 'zustand';
import type { SqlDatabase } from '../db/sqlDatabase';

interface AppState {
  db: SqlDatabase | null;
  /** Bumped on every mutation so subscribed lists re-query. */
  dataVersion: number;
  setDb: (db: SqlDatabase) => void;
  reload: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  db: null,
  dataVersion: 0,
  setDb: (db) => set({ db }),
  reload: () => set((state) => ({ dataVersion: state.dataVersion + 1 })),
}));
