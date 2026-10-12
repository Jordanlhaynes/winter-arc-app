// Web build: the Arc's local SQLite database is phone-only (Metro picks this file instead of client.ts).
// The web page only shows cloud-backed screens (notes, log), so nothing should reach this; fail loudly if it does.
export const db = new Proxy({} as typeof import('./client').db, {
  get() {
    throw new Error('The local Arc database is only available in the phone app.');
  },
});

export function migrate() {}
