/** External rehearsal checks: not a security boundary. */
import fs from 'node:fs';
const checks=JSON.parse(fs.readFileSync('docs/release-checklist.json','utf8'));
const failures=Object.entries(checks).filter(([key,value])=>key!=='evidence'&&value!==true).map(([key])=>key);
if(failures.length){console.error('CLASSROOM RELEASE BLOCKED\n'+failures.map(x=>' - '+x).join('\n'));process.exitCode=1;}
else console.log('Recorded classroom checks passed. Keep the supporting evidence with this release.');
