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
 patient_medications:[], patient_lab_results:[], patient_symptoms:[], patient_clinical_data:[],
};
// Synthetic longitudinal evidence exercises the real gateway and every details tab.
database.patient_medical_history.find(h=>h.id===HISTORY).diagnosis_date='2018-05-02';
database.patient_medical_history.find(h=>h.id===uid(21000)).diagnosis_date='2020-06-03';
database.patient_medical_history.find(h=>h.id===uid(20100)).diagnosis_date='2010-01-01';
database.patient_medical_history.push({...history(uid(21003),HIST_PEER,'Élément documenté 01'),diagnosis_date:'2012-01-01'});
const lab=(id,patient_id,test_name,value,unit,test_date,extra={})=>({id:uid(id),patient_id,test_name,value,unit,test_date,reference_min:null,reference_max:null,is_abnormal:null,...extra});
database.patient_lab_results=[
 lab(40001,SOURCE,'CRP',60,'mg/L','2025-02-01',{reference_min:0,reference_max:5,is_abnormal:true}),
 lab(40002,SOURCE,'CRP',30,'mg/L','2024-01-01',{reference_min:0,reference_max:5,is_abnormal:true}),
 lab(40003,HIST_PEER,'CRP',80,'mg/L','2025-02-03',{reference_min:0,reference_max:5,is_abnormal:true}),
 lab(40004,SOURCE,'Hémoglobine',13,'g/dL','2025-02-01'),lab(40005,HIST_PEER,'Hémoglobine',140,'g/L','2025-02-01'),
 lab(40006,SOURCE,'Résultat à compléter',120,'µmol/L','2024-01-01'),lab(40007,SOURCE,'Résultat à compléter',null,'µmol/L','2025-02-01'),
 lab(40008,HIST_PEER,'Résultat à compléter',120,'µmol/L','2025-02-01'),
 lab(40009,HIDDEN,'Secret invisible',999,'mg/L','2025-02-01'),
];
database.patient_clinical_data=[
 {id:uid(41001),patient_id:SOURCE,recorded_at:'2025-02-01T12:00:00Z',systolic_bp:132,diastolic_bp:82,heart_rate:72,spo2:97,weight_kg:80,bmi:26.1,pain_level:0},
 {id:uid(41002),patient_id:HIST_PEER,recorded_at:'2025-02-03T12:00:00Z',systolic_bp:140,diastolic_bp:88,heart_rate:78,spo2:95,weight_kg:85,bmi:27.4,pain_level:2},
 {id:uid(41003),patient_id:HIDDEN,recorded_at:'2025-02-03T12:00:00Z',weight_kg:999},
];
const medication=(id,patient_id,dosage,is_active)=>({id:uid(id),patient_id,medication_id:uid(90001),dosage,frequency:'1/j',start_date:'2023-03-04',end_date:null,is_active,medications:{name:'Traitement témoin',substance:'Substance témoin',atc_code:null}});
database.patient_medications=[medication(42001,SOURCE,'5 mg',false),medication(42002,HIST_PEER,'10 mg',true)];
database.patient_symptoms=[SOURCE,HIST_PEER].map((patient_id,i)=>({id:uid(43001+i),patient_id,symptom_id:uid(91001),symptoms:{name:'Fatigue documentée'},onset_date:'2015-01-01',severity:'modérée',frequency:'quotidienne',is_resolved:false}));
const sources=()=>({pathologies:database.pathologies.find(p=>p.id===A),patient_pathologies:database.patient_pathologies.filter(p=>p.patient_id===SOURCE).map(p=>({...p,pathologies:database.pathologies.find(d=>d.id===p.pathology_id)})),patient_medical_history:database.patient_medical_history.filter(p=>p.patient_id===SOURCE)});
const requests=[], errors=[], unexpected=[];let failRefresh=false,failClinical=false;
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
 requests.push({table,method:route.request().method(),query:Object.fromEntries(q)});
 if(table==='patient_clinical_data'&&failClinical)return route.fulfill({status:503,headers,body:JSON.stringify({message:'synthetic clinical data unavailable'})});
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
 await page.screenshot({path:join(artifactDir,'patient-pathology-options.png'),fullPage:true,animations:'disabled'});
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
 const evidenceCard=page.getByTestId('patient-match-card').filter({has:page.getByText('Patient HISTORY',{exact:true})});
 await evidenceCard.getByRole('tab',{name:'Dates et maladies',exact:true}).waitFor();
 assert.match(await evidenceCard.innerText(),/02\/05\/2018/);assert.match(await evidenceCard.innerText(),/03\/06\/2020/);
 const conditions=evidenceCard.getByRole('region',{name:'Dates des diagnostics et autres maladies'});
 assert.match(await conditions.innerText(),/01\/01\/2010/);assert.match(await conditions.innerText(),/01\/01\/2012/);
 assert.match(await conditions.innerText(),/jours avant le diagnostic comparé/);
 await evidenceCard.getByRole('tab',{name:'Bilans et variables',exact:true}).click();
 const labs=evidenceCard.getByRole('region',{name:'Valeurs des bilans biologiques'});
 const crp=labs.getByRole('row').filter({has:page.getByRole('rowheader',{name:'CRP',exact:true})});
 const crpText=await crp.innerText();
 for(const value of ['60 mg/L','80 mg/L','Écart : +20 mg/L','Proximité numérique : 75 %','Dates espacées de 2 jour(s)'])assert.ok(crpText.includes(value),value+': '+crpText);
 await crp.getByText('Tous les résultats (2)',{exact:true}).click();await crp.getByText('30 mg/L',{exact:true}).waitFor();
 await crp.getByText('Tous les résultats (2)',{exact:true}).click();
 const incompatible=labs.getByRole('row').filter({has:page.getByRole('rowheader',{name:'Hémoglobine',exact:true})});
 assert.match(await incompatible.innerText(),/Unités différentes/);
 const incomplete=labs.getByRole('row').filter({has:page.getByRole('rowheader',{name:'Résultat à compléter',exact:true})});
 assert.match(await incomplete.innerText(),/Valeur non renseignée ou inexploitable/);
 assert.ok(!(await incomplete.innerText()).includes('Proximité numérique'));
 const vitals=evidenceCard.getByRole('region',{name:'Valeurs des constantes cliniques'});
 assert.match(await vitals.innerText(),/0 \/10/);assert.match(await vitals.innerText(),/97 %/);assert.match(await vitals.innerText(),/95 %/);
 assert.ok(requests.some(r=>r.table==='patient_clinical_data'&&r.query.select.includes('spo2')));
 await evidenceCard.screenshot({path:join(artifactDir,'patient-comparison-biology.png'),animations:'disabled'});
 await evidenceCard.getByRole('tab',{name:'Traitements et symptômes',exact:true}).click();
 const treatmentText=await evidenceCard.innerText();
 for(const value of ['5 mg','10 mg','Inactif selon le dossier','Actif selon le dossier','01/01/2015','modérée'])assert.ok(treatmentText.includes(value),value);
 await evidenceCard.getByRole('tab',{name:'Logique du score',exact:true}).click();
 const methodText=await evidenceCard.innerText();
 assert.ok(methodText.includes('Couverture pondérée : 75 / 100.'));
 assert.ok(methodText.includes('11,25'),'the lab contribution must be 15 × 0.75, not 15');
 assert.ok(methodText.includes('choix heuristiques'));
 await evidenceCard.getByRole('tab',{name:'Pistes de recherche',exact:true}).click();
 const researchText=await evidenceCard.innerText();
 for(const value of ['Observation :','Question à explorer :','Vérifications et recherche documentaire :','60 mg/L','80 mg/L','Données à compléter'])assert.ok(researchText.includes(value),value);
 assert.ok(!researchText.includes('Secret invisible'));
 await evidenceCard.screenshot({path:join(artifactDir,'patient-comparison-research.png'),animations:'disabled'});
 console.log('PASS: real dates, all associated conditions, numerical labs, ranges, history, zero-valued vitals, treatments, symptoms, reproducible score and evidence-linked research questions');
 await page.setViewportSize({width:390,height:844});
 await evidenceCard.getByRole('tab',{name:'Bilans et variables',exact:true}).click();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'comparison mobile page overflow');
 assert.ok(await labs.evaluate(el=>el.scrollWidth>el.clientWidth),'tables remain readable by horizontal scrolling');
 await labs.evaluate(el=>{el.scrollLeft=el.scrollWidth;});
 await evidenceCard.screenshot({path:join(artifactDir,'patient-comparison-mobile.png'),animations:'disabled'});
 await evidenceCard.getByRole('tab',{name:'Logique du score',exact:true}).click();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'method mobile overflow');
 await page.setViewportSize({width:1280,height:900});
 console.log('PASS: detailed comparison tabs and wide tables remain usable at 390px');
 failClinical=true;await page.getByRole('button',{name:'Actualiser',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'Impossible de comparer'}).waitFor();
 assert.equal(await page.getByTestId('patient-match-card').count(),0,'failed evidence loads must not leave stale comparison data');
 failClinical=false;await page.getByRole('button',{name:'Actualiser',exact:true}).click();
 await page.getByText('4 dossiers correspondants accessibles',{exact:true}).waitFor();
 console.log('PASS: clinical evidence read failure is visible, stale results clear and retry recovers');

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
 assert.ok(requests.every(r=>r.method==='GET'),'comparison must remain read-only');
 assert.ok(requests.filter(r=>r.query.patient_id?.startsWith('in.')).every(r=>!r.query.patient_id.includes(HIDDEN)));
 console.log(JSON.stringify({passed:true,requests:requests.length,pageErrors:errors,unexpectedExternalRequests:unexpected}));
} catch (error) {
  await page.screenshot({path:join(artifactDir,'patient-pathology-failure.png'), fullPage:true}).catch(()=>{});
  console.error('Browser errors:', JSON.stringify(errors));
  throw error;
} finally { await browser.close(); vite.kill(); }
