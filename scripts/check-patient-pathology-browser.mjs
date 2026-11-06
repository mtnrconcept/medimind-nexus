import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
const modulePath = process.env.PLAYWRIGHT_MODULE_PATH || `${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright/index.mjs`;
const { chromium } = await import(pathToFileURL(modulePath).href);
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const artifactDir = process.env.PATHOLOGY_BROWSER_ARTIFACT_DIR || join(projectRoot, 'test-results', 'patient-pathology');
await mkdir(artifactDir, { recursive: true });
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4178', '--strictPort'], {cwd:projectRoot, env:{...process.env, VITE_SUPABASE_URL:'http://127.0.0.1:4179', VITE_SUPABASE_PUBLISHABLE_KEY:'synthetic-public-key'}, stdio:'pipe'});
let serverLog = '';
vite.stdout.on('data', chunk => { serverLog += chunk; });
vite.stderr.on('data', chunk => { serverLog += chunk; });
let ready = false;
for (let attempt=0; attempt<100; attempt++) {
  try { if ((await fetch('http://127.0.0.1:4178/tests/browser/patient-pathology.html')).ok) { ready=true; break; } } catch {}
  await new Promise(resolve => setTimeout(resolve,100));
}
if (!ready) { vite.kill(); throw new Error(`Vite failed to start: ${serverLog}`); }
const uid = n => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const SOURCE=uid(1), HIST_PEER=uid(2), CODE_PEER=uid(3), SECONDARY_PEER=uid(4), HIDDEN=uid(5), EXACT_PEER=uid(6), LATE_PEER=uid(500);
const A=uid(10001), B=uid(10002), C=uid(10003), D=uid(10004), HISTORY=uid(20001);
const patient = (id, code, pathology_id=null) => ({id,patient_id:code,age:44,pathology_id});
const history = (id,patient_id,name,type='disease') => ({id,patient_id,condition_name:name,condition_type:type,diagnosis_date:'2021-01-01'});
const database={
 patients:[patient(SOURCE,'SOURCE',A),patient(HIST_PEER,'HISTORY'),patient(CODE_PEER,'CODED',C),patient(SECONDARY_PEER,'SECONDARY'),patient(EXACT_PEER,'EXACT',A),patient(LATE_PEER,'LATE'),...Array.from({length:205},(_,i)=>patient(uid(100+i),`FILLER-${i}`))],
 pathologies:[{id:A,name:'Asthme'},{id:B,name:'Migraine'},{id:C,name:'Eczéma'},{id:D,name:'Asthme'}],
 patient_pathologies:[{id:uid(30001),patient_id:SOURCE,pathology_id:B},{id:uid(30002),patient_id:SECONDARY_PEER,pathology_id:C},{id:uid(30003),patient_id:uid(100),pathology_id:D}],
 patient_medical_history:[history(HISTORY,SOURCE,'Eczéma'),history(uid(20002),SOURCE,'Migraine suspectée'),...Array.from({length:17},(_,i)=>history(uid(20100+i),SOURCE,`Élément documenté ${String(i+1).padStart(2,'0')}${i===16 ? ' avec un libellé volontairement très long pour vérifier la lisibilité complète sur un petit écran et conserver les précisions du dossier' : ''}`)),history(uid(20200),SOURCE,'  ECZEMA  '),history(uid(20201),SOURCE,'Appendicectomie','surgery'),history(uid(21000),HIST_PEER,' eczema '),history(uid(21001),HIDDEN,'Eczéma'),history(uid(21002),LATE_PEER,'Eczéma')],
 patient_medications:[], patient_lab_results:[], patient_symptoms:[],
};
const sources=()=>({pathologies:database.pathologies.find(p=>p.id===A),patient_pathologies:database.patient_pathologies.filter(p=>p.patient_id===SOURCE).map(p=>({...p,pathologies:database.pathologies.find(d=>d.id===p.pathology_id)})),patient_medical_history:database.patient_medical_history.filter(p=>p.patient_id===SOURCE)});
const requests=[], errors=[], unexpected=[];let failRefresh=false;
let browser;
try { browser = await chromium.launch({headless:true}); } catch(error) { vite.kill(); throw error; }
const page=await browser.newPage({viewport:{width:1280,height:900}});
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('503'))errors.push(m.text());});
await page.addInitScript(seed=>{window.__pathologySeed=seed;},{patientId:SOURCE,userId:uid(99999),sources:sources()});
await page.route('**/*',async route=>{
 const url=new URL(route.request().url());
 if(url.origin==='http://127.0.0.1:4178')return route.continue();
 if(url.origin!=='http://127.0.0.1:4179'){unexpected.push(url.origin+url.pathname);return route.abort();}
 const headers={'content-type':'application/json','access-control-allow-origin':'*','access-control-allow-headers':'*'};
 if(route.request().method()==='OPTIONS')return route.fulfill({status:200,headers,body:''});
 if(url.pathname==='/auth/v1/user')return route.fulfill({status:200,headers,body:JSON.stringify({id:uid(99999),aud:'authenticated',role:'authenticated',email:'synthetic@example.invalid',app_metadata:{},user_metadata:{}})});
 const table=url.pathname.split('/').at(-1), q=url.searchParams;
 requests.push({table,query:Object.fromEntries(q)});
 if(table==='patients'&&q.get('select')?.includes('patient_medical_history(')){
  if(failRefresh)return route.fulfill({status:503,headers,body:JSON.stringify({message:'synthetic refresh unavailable'})});
  return route.fulfill({status:200,headers,body:JSON.stringify([sources()])});
 }
 let rows=(database[table]??[]).filter(row=>row.id!==HIDDEN&&row.patient_id!==HIDDEN);
 for(const [key,value]of q){
  if(value.startsWith('eq.'))rows=rows.filter(row=>String(row[key])===value.slice(3));
  if(value.startsWith('in.(')){const ids=value.slice(4,-1).split(',').map(x=>x.replace(/^"|"$/g,''));rows=rows.filter(row=>ids.includes(String(row[key])));}
 }
 rows=[...rows].sort((a,b)=>String(a.id??a.patient_id).localeCompare(String(b.id??b.patient_id)));
 rows=rows.slice(Number(q.get('offset')??0),Number(q.get('offset')??0)+Number(q.get('limit')??1000));
 return route.fulfill({status:200,headers,body:JSON.stringify(rows)});
});
try{
 await page.goto('http://127.0.0.1:4178/tests/browser/patient-pathology.html');
 const selector=page.getByRole('combobox',{name:'Choisir une pathologie du patient'});
 await selector.waitFor();
 assert.match(await page.locator('body').innerText(),/21 éléments du dossier disponibles/);
 await selector.click();
 assert.equal(await page.getByRole('option').count(),21);
 assert.equal(await page.getByRole('option',{name:'Appendicectomie',exact:true}).count(),0);
 await page.screenshot({path:join(artifactDir,'patient-pathology-options.png'),fullPage:true});
 await page.getByRole('option',{name:'Eczéma',exact:true}).click();
 await page.getByText('4 dossiers correspondants accessibles',{exact:true}).waitFor();
 const body=await page.locator('body').innerText();
 for(const code of ['HISTORY','CODED','SECONDARY','LATE'])assert.ok(body.includes(`Patient ${code}`));
 assert.ok(!body.includes('Patient SOURCE')&&!body.includes('Patient EXACT')&&!body.includes('HIDDEN'));
 assert.ok(body.includes('Un même libellé ne confirme pas à lui seul un diagnostic identique.'));
 assert.ok(requests.some(r=>r.table==='patients'&&Number(r.query.offset)>=200),'must scan beyond the first PostgREST page');
 const firstCohort=requests.findIndex(r=>r.table==='patients'&&r.query.select==='id,pathology_id'&&!r.query.id);
 const firstClinical=requests.findIndex(r=>r.table==='patient_medical_history'&&r.query.patient_id?.startsWith('in.'));
 assert.ok(firstCohort>=0&&firstClinical>firstCohort);
 assert.ok(requests.filter(r=>r.query.patient_id?.startsWith('in.')).every(r=>!r.query.patient_id.includes(HIDDEN)));
 console.log('PASS: complete selector, deduplication, all three diagnosis sources, RLS order, paginated candidate discovery');
 await selector.click();await page.getByRole('option',{name:'Asthme',exact:true}).click();
 await page.getByText('1 dossier correspondant accessible',{exact:true}).waitFor();
 assert.ok((await page.locator('body').innerText()).includes('Patient EXACT'));
 assert.ok(!(await page.locator('body').innerText()).includes('Patient FILLER-0'));
 console.log('PASS: canonical UUID matching does not merge same-label UUIDs');
 database.patient_medical_history.push(history(uid(22000),SOURCE,'Nouvelle maladie documentée'));
 await page.getByRole('button',{name:'Actualiser',exact:true}).click();
 await page.getByText('22 éléments du dossier disponibles.',{exact:true}).waitFor();
 await selector.click();await page.getByRole('option',{name:'Nouvelle maladie documentée',exact:true}).click();
 await page.getByText(/Aucun autre dossier accessible ne comporte ce même libellé/).waitFor();
 database.patient_medical_history=database.patient_medical_history.filter(h=>h.id!==uid(22000));
 await page.getByRole('button',{name:'Actualiser',exact:true}).click();
 await page.getByText('21 éléments du dossier disponibles.',{exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelector('[role="combobox"]')?.textContent.includes('Sélectionner une pathologie'));
 assert.equal(await page.getByText(/Aucun autre dossier accessible ne comporte/).count(),0);
 console.log('PASS: refresh loads additions and clears removed selections without page reload');
 failRefresh=true;await page.getByRole('button',{name:'Actualiser',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'Impossible d’actualiser'}).waitFor();
 failRefresh=false;await page.getByRole('button',{name:'Actualiser',exact:true}).click();
 await page.getByRole('alert').waitFor({state:'detached'});
 console.log('PASS: refresh failure is visible and retry recovers');
 await page.setViewportSize({width:390,height:844});await selector.click();
 const longOption=page.getByRole('option',{name:/Élément documenté 17/});await longOption.scrollIntoViewIfNeeded();
 const bounds=await page.getByRole('listbox').boundingBox();
 assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390,JSON.stringify(bounds));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'mobile page overflow');
 await longOption.click();await page.getByText(/Aucun autre dossier accessible ne comporte ce même libellé/).waitFor();
 assert.equal(await page.getByRole('button',{name:'Actualiser',exact:true}).isEnabled(),true,'the final screenshot must show a settled comparison');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'long selection mobile overflow');
 await page.screenshot({path:join(artifactDir,'patient-pathology-mobile.png'),fullPage:true});
 console.log('PASS: 390px dropdown, long labels, scrolling and selection remain usable');
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
 console.log(JSON.stringify({passed:true,requests:requests.length,pageErrors:errors,unexpectedExternalRequests:unexpected}));
} catch (error) {
  await page.screenshot({path:join(artifactDir,'patient-pathology-failure.png'), fullPage:true}).catch(()=>{});
  console.error('Browser errors:', JSON.stringify(errors));
  throw error;
} finally { await browser.close(); vite.kill(); }
