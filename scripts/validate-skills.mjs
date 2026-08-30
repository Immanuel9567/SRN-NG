// Validates skills/master_skill_compilation.json against its own declared invariants.
// Run with: npm run check:skills
// Exits non-zero on any failure so it can gate a commit.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, '..', 'skills', 'master_skill_compilation.json');

const failures = [];
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` -- ${detail}` : ''}`);
  if (!ok) failures.push(label);
};

const raw = readFileSync(target, 'utf8');
let doc;
try {
  doc = JSON.parse(raw);
  console.log('PASS  file parses as JSON');
} catch (err) {
  console.error(`FAIL  file does not parse: ${err.message}`);
  process.exit(1);
}

const c = doc.master_skill_compilation;
check('root key master_skill_compilation present', !!c);

const cats = Object.entries(c.categories);
check('six categories', cats.length === 6, `${cats.length} found`);

const names = [];
for (const [catName, cat] of cats) {
  const list = cat.skills.map((s) => s.name);
  names.push(...list);
  const indexMatches = JSON.stringify(list) === JSON.stringify(cat.skill_index);
  check(`category ${catName}: skill_index matches skills[]`, indexMatches, `${list.length} skills`);
  for (const s of cat.skills) {
    if (typeof s.description !== 'string' || !s.description.trim()) {
      check(`skill ${s.name}: has description`, false);
    }
    if (!Array.isArray(s.key_rules_summary) || s.key_rules_summary.length === 0) {
      check(`skill ${s.name}: has key_rules_summary`, false);
    }
  }
}

const declared = c.total_skills;
check('total_skills matches actual skill count', declared === names.length, `declared ${declared}, actual ${names.length}`);
check('verified_skill_count matches actual', c.verified_skill_count === names.length, `declared ${c.verified_skill_count}, actual ${names.length}`);

const dupes = names.filter((n, i) => names.indexOf(n) !== i);
check('no duplicate skill names', dupes.length === 0, dupes.join(', '));

const badNames = names.filter((n) => !/^[a-z0-9][a-z0-9-]*$/.test(n));
check('all names are kebab-case', badNames.length === 0, badNames.join(', '));

const entities = raw.match(/&gt;|&lt;|&amp;|&quot;|#39;/g);
check('no un-decoded HTML entities', !entities, entities ? [...new Set(entities)].join(' ') : '');

check('read_order present and non-empty', Array.isArray(c.read_order) && c.read_order.length > 0);
check('repo_context present', !!c.repo_context);
check('instruction_precedence present', Array.isArray(c.instruction_precedence) && c.instruction_precedence.length > 0);

// AGENTS.md must exist: it is the declared entry point.
const agents = resolve(here, '..', 'AGENTS.md');
let agentsOk = true;
try {
  readFileSync(agents, 'utf8');
} catch {
  agentsOk = false;
}
check('AGENTS.md exists (declared entry point)', agentsOk);

// The entry point must not tell agents to read a file that does not exist.
if (agentsOk) {
  const body = readFileSync(agents, 'utf8');
  check('AGENTS.md does not link to a deleted README.md', !/\]\((\.\.?\/)?README\.md\)/.test(body));
}

console.log('');
if (failures.length) {
  console.error(`${failures.length} check(s) failed: ${failures.join('; ')}`);
  process.exit(1);
}
console.log(`All checks passed. ${names.length} skills across ${cats.length} categories.`);
