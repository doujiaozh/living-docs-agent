// File watcher: polling-based with debounce, cross-platform and dependency-free.
// Tracks source files under the given roots plus optional extra files (README).

import fs from 'node:fs';
import { walkDir } from './utils.js';

/**
 * @param {{roots: string[], extensions: string[], extraFiles?: string[], intervalMs?: number, debounceMs?: number, onChange: (summary: {added: string[], changed: string[], removed: string[], first: boolean}) => void}} opts
 */
export function createWatcher({ roots, extensions, extraFiles = [], intervalMs = 400, debounceMs = 150, onChange }) {
  let current = snapshot();
  let timer = null;
  let debounceTimer = null;
  let pending = null;
  let first = true;

  function collectFiles() {
    const files = new Set(extraFiles.filter((f) => fs.existsSync(f)));
    for (const root of roots) {
      if (fs.existsSync(root) && fs.statSync(root).isFile()) {
        files.add(root);
      } else {
        for (const f of walkDir(root, { extensions })) files.add(f);
      }
    }
    return files;
  }

  function snapshot() {
    const map = new Map();
    for (const f of collectFiles()) {
      try {
        const st = fs.statSync(f);
        map.set(f, `${st.size}:${Math.floor(st.mtimeMs)}`);
      } catch {
        map.set(f, 'missing');
      }
    }
    return map;
  }

  function diff() {
    const next = snapshot();
    const added = [];
    const changed = [];
    const removed = [];
    for (const [f, sig] of next) {
      const prev = current.get(f);
      if (prev === undefined) added.push(f);
      else if (prev !== sig) changed.push(f);
    }
    for (const [f] of current) if (!next.has(f)) removed.push(f);
    current = next;
    return { added, changed, removed };
  }

  function flush() {
    debounceTimer = null;
    if (!pending) return;
    const summary = pending;
    pending = null;
    onChange(summary);
  }

  function tick() {
    const d = diff();
    if (d.added.length || d.changed.length || d.removed.length) {
      if (!pending) pending = { added: [], changed: [], removed: [], first };
      pending.added.push(...d.added);
      pending.changed.push(...d.changed);
      pending.removed.push(...d.removed);
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(flush, debounceMs);
    } else if (first) {
      // initial pass with no changes: still notify once so callers can generate
      pending = pending || { added: [], changed: [], removed: [], first: true };
      const s = pending;
      pending = null;
      onChange(s);
    }
    first = false;
  }

  return {
    /** Start polling. Returns the watcher for chaining. */
    start() {
      if (timer) return this;
      tick();
      timer = setInterval(tick, intervalMs);
      return this;
    },
    /** Stop polling and discard any pending debounce. */
    stop() {
      if (timer) { clearInterval(timer); timer = null; }
      if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
      pending = null;
      current = snapshot();
      return this;
    },
    /** Force a re-scan + notify (used before regenerating externally). */
    refresh() { tick(); return this; },
    /** Currently tracked files. */
    files() { return [...current.keys()]; },
  };
}
