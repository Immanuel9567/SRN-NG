// Syntax-checks every inline <script> block and every js/*.js file.
// Client-rendered pages fail silently in a browser, so parse them here instead.
import { readFileSync, readdirSync } from 'fs';
import vm from 'vm';
let bad = 0, checked = 0;
for (const file of readdirSync('.').filter(f => f.endsWith('.html'))) {
  const html = readFileSync(file, 'utf8');
  const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  blocks.forEach((m, i) => {
    checked++;
    try { new vm.Script(m[1], { filename: `${file}#inline${i}` }); }
    catch (e) { bad++; console.log(`FAIL ${file} inline block ${i}: ${e.message}`); }
  });
}
for (const file of readdirSync('js')) {
  checked++;
  try { new vm.Script(readFileSync(`js/${file}`, 'utf8'), { filename: `js/${file}` }); }
  catch (e) { bad++; console.log(`FAIL js/${file}: ${e.message}`); }
}
console.log(`${bad ? 'FAIL' : 'PASS'}  parsed ${checked} script blocks, ${bad} syntax error(s)`);
process.exit(bad ? 1 : 0);
