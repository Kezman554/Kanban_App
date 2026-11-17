// Run: node src/renderer/utils/projectSort.test.mjs
// Sort order of the sidebar project list, and its per-browser storage.
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
};

// package.json says "type": "commonjs", so the renderer's ES-module .js
// files can't be imported by path; load the source as a module instead
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('./projectSort.js', import.meta.url), 'utf8');
const {
  sortProjects, getProjectSort, setProjectSort, getRecentProjects, markProjectOpened,
} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

let passed = 0;
let failed = 0;
const check = (name, cond, detail) => {
  if (cond) { console.log(`✅ PASSED: ${name}`); passed++; }
  else { console.log(`❌ FAILED: ${name}${detail ? ` — ${detail}` : ''}`); failed++; }
};
const names = list => list.map(p => p.name).join(',');

const projects = [
  { id: 1, name: 'zeta', created_at: '2026-01-01 10:00:00' },
  { id: 2, name: 'Alpha', created_at: '2026-03-01 10:00:00' },
  { id: 3, name: 'beta', created_at: '2026-02-01 10:00:00' },
  { id: 4, name: 'Gamma', created_at: '2026-03-01 10:00:00' }, // same second as Alpha
];

check('Default sort is newest', getProjectSort() === 'newest');
check('Newest first, id breaks a created_at tie',
  names(sortProjects(projects, 'newest')) === 'Gamma,Alpha,beta,zeta', names(sortProjects(projects, 'newest')));
check('A–Z is case-insensitive',
  names(sortProjects(projects, 'name')) === 'Alpha,beta,Gamma,zeta', names(sortProjects(projects, 'name')));
check('Recent with nothing opened falls back to newest',
  names(sortProjects(projects, 'recent', {})) === 'Gamma,Alpha,beta,zeta');

markProjectOpened(1, 1000);
markProjectOpened(3, 2000);
const recent = getRecentProjects();
check('Opened projects are recorded', recent[1] === 1000 && recent[3] === 2000, JSON.stringify(recent));
check('Recent: last opened first, never-opened at the bottom newest first',
  names(sortProjects(projects, 'recent', recent)) === 'beta,zeta,Gamma,Alpha',
  names(sortProjects(projects, 'recent', recent)));
markProjectOpened(1, 3000);
check('Re-opening moves a project to the top',
  names(sortProjects(projects, 'recent', getRecentProjects())).startsWith('zeta,beta'));
check('sortProjects does not mutate its input', names(projects) === 'zeta,Alpha,beta,Gamma');

setProjectSort('name');
check('Sort choice persists', getProjectSort() === 'name');
setProjectSort('newest');
check('Choosing the default clears the stored key', !store.has('kanban-project-sort') && getProjectSort() === 'newest');
store.set('kanban-project-sort', 'bogus');
check('An unknown stored value reads as newest', getProjectSort() === 'newest');
store.set('kanban-recent-projects', 'not json');
check('Corrupt recent record reads as empty', JSON.stringify(getRecentProjects()) === '{}');

globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
check('Blocked storage: sort reads newest', getProjectSort() === 'newest');
let threw = false;
try { setProjectSort('name'); markProjectOpened(2); } catch { threw = true; }
check('Blocked storage: writes do not throw', !threw);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
