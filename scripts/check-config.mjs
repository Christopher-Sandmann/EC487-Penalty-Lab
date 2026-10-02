import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';import assert from 'node:assert/strict';
const config=JSON.parse(fs.readFileSync(new URL('../content/game-config.json',import.meta.url),'utf8'));
const sql=fs.readFileSync(new URL('../supabase/migrations/202610020101_game.sql',import.meta.url),'utf8');
const seed=sql.match(/insert into penalty_private\.config\(value\) values \('([^']+)'\)/)?.[1];
assert.deepEqual(JSON.parse(seed),config,'SQL must match the shared configuration');
assert.ok(sql.includes('create function public.prepare_match'));
assert.ok(!/economist|goat|vote/i.test(sql));
console.log('Shared matrix, briefing/choice timing and Supabase seed match. No economist/vote fields.');

execFileSync(process.execPath,[fileURLToPath(new URL('./bundle-sql.mjs',import.meta.url)),'--check'],{stdio:'inherit'});
