/**
 * Plugin Registry — Phase 3
 *
 * Central in-memory store for all loaded commands.
 * Supports canonical names, aliases, and category grouping.
 *
 * Entry shape:
 *   { meta, handler, file, loadedAt }
 *
 * meta shape (minimum):
 *   { name, description, category, aliases?, cooldown?, owner?, premium?, group? }
 */

// ── Core stores ───────────────────────────────────────────────────────────────

/** Map<canonicalName, entry> */
export const commands = new Map();

/** Map<alias, canonicalName> */
export const aliases = new Map();

/** Map<category, Set<canonicalName>> */
export const categories = new Map();

/** Map<filePath, Error> — load failures for diagnostics */
export const loadErrors = new Map();

/**
 * Backward-compat alias — Phase 2 command.js imports { plugins }.
 * This is the same Map object; changes to one are reflected in the other.
 */
export const plugins = commands;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Register a command entry (insert or replace — hot-reload safe).
 */
export function registerCommand(name, entry) {
  const canonical = name.toLowerCase().trim();

  // Clean up stale entries if overwriting (hot-reload)
  if (commands.has(canonical)) {
    const old = commands.get(canonical);
    for (const alias of old.meta?.aliases ?? []) {
      aliases.delete(alias.toLowerCase());
    }
    const oldCat = (old.meta?.category ?? 'general').toLowerCase();
    categories.get(oldCat)?.delete(canonical);
  }

  commands.set(canonical, { ...entry, loadedAt: Date.now() });

  // Register aliases
  for (const alias of entry.meta?.aliases ?? []) {
    const ak = alias.toLowerCase().trim();
    if (ak && ak !== canonical) aliases.set(ak, canonical);
  }

  // Register category
  const cat = (entry.meta?.category ?? 'general').toLowerCase();
  if (!categories.has(cat)) categories.set(cat, new Set());
  categories.get(cat).add(canonical);
}

/**
 * Unregister a command by canonical name.
 * Removes all its aliases and category membership.
 * Returns true if it existed.
 */
export function unregisterCommand(name) {
  const canonical = name.toLowerCase().trim();
  const entry = commands.get(canonical);
  if (!entry) return false;

  for (const alias of entry.meta?.aliases ?? []) {
    aliases.delete(alias.toLowerCase());
  }

  const cat = (entry.meta?.category ?? 'general').toLowerCase();
  categories.get(cat)?.delete(canonical);

  commands.delete(canonical);
  return true;
}

/**
 * Look up a command by its canonical name OR any registered alias.
 * Returns entry | null.
 */
export function findCommand(nameOrAlias) {
  const key = (nameOrAlias ?? '').toLowerCase().trim();
  if (!key) return null;
  if (commands.has(key)) return commands.get(key);
  const canonical = aliases.get(key);
  return canonical ? (commands.get(canonical) ?? null) : null;
}

/**
 * Get all entries for a given category, or ALL entries if category is omitted.
 */
export function getByCategory(category) {
  if (!category) return [...commands.values()];
  const names = categories.get(category.toLowerCase());
  if (!names) return [];
  return [...names].map(n => commands.get(n)).filter(Boolean);
}

/** Sorted list of all category names that have at least one command. */
export function getCategoryNames() {
  return [...categories.keys()]
    .filter(c => (categories.get(c)?.size ?? 0) > 0)
    .sort();
}

/** Total number of registered commands (not counting aliases). */
export function getCommandCount() {
  return commands.size;
}
