import { useAppStore } from '../useAppStore';
import type { SqlDatabase } from '../../db/sqlDatabase';

const fakeDb = {} as SqlDatabase;

beforeEach(() => {
  useAppStore.setState({ db: null, dataVersion: 0 });
});

test('setDb stores the handle', () => {
  useAppStore.getState().setDb(fakeDb);
  expect(useAppStore.getState().db).toBe(fakeDb);
});

test('reload increments dataVersion', () => {
  expect(useAppStore.getState().dataVersion).toBe(0);
  useAppStore.getState().reload();
  useAppStore.getState().reload();
  expect(useAppStore.getState().dataVersion).toBe(2);
});
