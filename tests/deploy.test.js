import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEnvironment,waitForDeploy,verifyRelease,run } from '../scripts/deploy-lib.mjs';
const valid={DATABASE_URL:'postgresql://local/test',RENDER_API_KEY:'test',RENDER_BACKEND_SERVICE_ID:'srv-back',RENDER_FRONTEND_SERVICE_ID:'srv-front',BACKEND_URL:'https://back.example.com',FRONTEND_PUBLIC_URL:'https://front.example.com'};
test('preflight falla con variables faltantes y configuraciones ambiguas',()=>{
  assert.throws(()=>validateEnvironment({}),/Faltan variables/);
  assert.throws(()=>validateEnvironment({...valid,BACKEND_URL:'http://localhost:3000'}),/HTTPS/);
  assert.throws(()=>validateEnvironment({...valid,FRONTEND_PUBLIC_URL:valid.BACKEND_URL}),/diferentes/);
  assert.throws(()=>validateEnvironment({...valid,DEPLOY_TIMEOUT_SECONDS:'NaN'}),/TIMEOUT/);
  assert.equal(validateEnvironment(valid).timeoutMs,1200000);
});
test('build fallido detiene el despliegue sin esperar al timeout',async()=>{
  await assert.rejects(waitForDeploy({serviceId:'srv-back',deployId:'dep-1',api:async()=>({status:'build_failed'}),timeoutMs:100,log:()=>{}}),/build_failed/);
});
test('timeout termina con error claro',async()=>{
  let now=0;
  await assert.rejects(waitForDeploy({serviceId:'srv-back',deployId:'dep-1',api:async()=>({status:'build_in_progress'}),timeoutMs:10,now:()=>now,sleep:async()=>{now+=5;},log:()=>{}}),/Tiempo agotado/);
});
test('espera a live antes de continuar',async()=>{
  const statuses=['build_in_progress','update_in_progress','live'];
  assert.equal((await waitForDeploy({serviceId:'srv-back',deployId:'dep-1',api:async()=>({status:statuses.shift()}),timeoutMs:1000,sleep:async()=>{},log:()=>{}})).status,'live');
});
function responses({revision='sha',cors=true,health=true}={}){return async url=>{
  if(url.includes('/health'))return Response.json({status:health?'ok':'error',database:'ok',revision});
  if(url.includes('version.json'))return Response.json({revision});
  if(url.includes('/api/equipment'))return Response.json([],{headers:cors?{'access-control-allow-origin':valid.FRONTEND_PUBLIC_URL}:{}});
  return new Response('<title>MineTrack</title><div id="app"></div>');
};}
const verification={backendUrl:valid.BACKEND_URL,frontendUrl:valid.FRONTEND_PUBLIC_URL,sha:'sha',attempts:1};
test('verifica servicios, revision y CORS; rechaza una version antigua',async()=>{
  await verifyRelease({...verification,fetcher:responses()});
  await assert.rejects(verifyRelease({...verification,fetcher:responses({revision:'old'})}),/commit/);
  await assert.rejects(verifyRelease({...verification,fetcher:responses({cors:false})}),/CORS/);
  await assert.rejects(verifyRelease({...verification,fetcher:responses({health:false})}),/PostgreSQL/);
});
test('un comando externo fallido produce error',()=>{
  assert.throws(()=>run(process.execPath,['-e','process.exit(7)'],{capture:true}),/codigo 7/);
});
