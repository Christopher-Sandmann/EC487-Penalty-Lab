/** Keep dashboard installation files in sync with the numbered migrations. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
const dir=new URL('../supabase/',import.meta.url);
const read=name=>fs.readFileSync(new URL(name,dir),'utf8');
const files=['202610020101_game.sql','202610020102_clock.sql','202610020103_live.sql','202610020104_classroom_indexes.sql'];
const parts=files.map(name=>'-- ===== '+name+' =====\n'+read('migrations/'+name).replace(/^begin;\s*$/gm,'').replace(/^commit;\s*$/gm,''));
const installer=`-- PENALTY LAB v3 — FRESH, DEDICATED SUPABASE PROJECT ONLY.
-- Paste this entire file into the trusted Supabase SQL Editor and run once.
-- No student accounts, classroom observations or instructor passwords are created.
-- Existing v2 installation? Use UPGRADE-v2-to-v3.sql instead. Back up first.
begin;
do $$begin
 if to_regnamespace('penalty_private') is not null then
  raise exception 'An existing Penalty Lab schema was found. Stop: use the v2-to-v3 upgrade, not this fresh installer.';
 end if;
end $$;
`+parts.join('\n\n')+'\ncommit;\n';
const upgrade=`-- Existing Penalty Lab v2 ONLY. Back up/export and end or pause rooms first.
-- Does not delete players, results, teaching cards or change the four probabilities.
-- Requires BOTH the v2 game schema and its Cron clock already installed.
-- For an empty project use INSTALL.sql instead.
`+'begin;\n'+parts.slice(2).join('\n\n')+'\ncommit;\n';
for(const [name,text]of[['INSTALL.sql',installer],['UPGRADE-v2-to-v3.sql',upgrade]]){
 if(process.argv.includes('--check'))assert.equal(read(name),text,`${name} is stale; run node scripts/bundle-sql.mjs`);
 else fs.writeFileSync(new URL(name,dir),text);
}
console.log('Dashboard SQL bundles match the migrations.');
