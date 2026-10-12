import * as journal from '../../sync/journal';
import { useJournalStore } from '../journalStore';

jest.mock('../../sync/journal', () => ({
  listNotes: jest.fn(),
  listLog: jest.fn(),
  subscribe: jest.fn(),
  createNote: jest.fn(),
  updateNote: jest.fn(),
  deleteRow: jest.fn(),
  addLogEntry: jest.fn(),
  NOTE_GONE: 'gone',
}));
jest.mock('../authStore', () => ({ useAuthStore: jest.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

async function flush() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

const note: journal.Note = { id: 'a', title: 'Private A', body: 'A only', created_at: '2026-01-01', updated_at: '2026-01-01' };
let stop: (() => void) | undefined;

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(journal.listNotes).mockResolvedValue([]);
  jest.mocked(journal.listLog).mockResolvedValue([]);
  jest.mocked(journal.subscribe).mockReturnValue(jest.fn());
});

afterEach(async () => {
  stop?.();
  stop = undefined;
  await flush();
});

it('discards a delayed note response after switching accounts', async () => {
  stop = useJournalStore.getState().start('A');
  await flush();
  const pending = deferred<journal.Note>();
  jest.mocked(journal.createNote).mockReturnValue(pending.promise);
  const save = useJournalStore.getState().saveNote(null, note.title, note.body);
  stop();
  stop = useJournalStore.getState().start('B');
  await flush();
  pending.resolve(note);
  await save;
  expect(useJournalStore.getState().notes).toEqual([]);
});

it('discards a delayed log response after signing out', async () => {
  stop = useJournalStore.getState().start('A');
  await flush();
  const pending = deferred<journal.LogEntry>();
  jest.mocked(journal.addLogEntry).mockReturnValue(pending.promise);
  const save = useJournalStore.getState().addLog('private');
  stop();
  stop = undefined;
  pending.resolve({ id: 'a', body: 'private', created_at: '2026-01-01' });
  await save;
  expect(useJournalStore.getState().log).toEqual([]);
});

it('does not expose an old account error in the next session', async () => {
  stop = useJournalStore.getState().start('A');
  await flush();
  const pending = deferred<journal.Note>();
  jest.mocked(journal.createNote).mockReturnValue(pending.promise);
  const save = useJournalStore.getState().saveNote(null, 'private', '');
  const outcome = save.catch(() => {});
  stop();
  stop = useJournalStore.getState().start('B');
  await flush();
  pending.reject(new Error('A-only failure'));
  await outcome;
  expect(useJournalStore.getState().error).toBeNull();
});

it('ignores late events from a removed subscription, including during a reload', async () => {
  stop = useJournalStore.getState().start('A');
  await flush();
  const callback = jest.mocked(journal.subscribe).mock.calls[0][1];
  stop();
  const pending = deferred<journal.Note[]>();
  jest.mocked(journal.listNotes).mockReturnValue(pending.promise);
  stop = useJournalStore.getState().start('B');
  callback({ eventType: 'INSERT', new: note } as journal.Change<journal.Note>);
  pending.resolve([]);
  await flush();
  expect(useJournalStore.getState().notes).toEqual([]);
});

it('still applies writes and streamed changes for the current account', async () => {
  stop = useJournalStore.getState().start('A');
  await flush();
  jest.mocked(journal.createNote).mockResolvedValue(note);
  await useJournalStore.getState().saveNote(null, note.title, note.body);
  expect(useJournalStore.getState().notes).toEqual([note]);
});
