import { open, unlink } from 'node:fs/promises';
import { validateEnvironment, run, waitForDeploy, verifyRelease } from './deploy-lib.mjs';

let lock, stage='verificacion inicial';
try {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Se requiere Node.js 22 o superior.');
  const { timeoutMs } = validateEnvironment(process.env);
  run('git',['--version']);
  const sha = run('git',['rev-parse','HEAD'],{capture:true});
  if (run('git',['status','--porcelain'],{capture:true})) throw new Error('Hay cambios sin commit. Confirma y sube tus cambios antes de desplegar.');
  const branch = run('git',['branch','--show-current'],{capture:true});
  const remote = run('git',['remote','get-url','origin'],{capture:true}).replace(/\.git$/,'').replace(/\/$/,'');
  const remoteHead = run('git',['ls-remote','origin',`refs/heads/${branch}`],{capture:true}).split(/\s/)[0];
  if (sha !== remoteHead) throw new Error('Tu commit no coincide con GitHub. Ejecuta git push antes de desplegar.');
  try { lock = await open('.deploy.lock','wx'); await lock.writeFile(String(process.pid)); }
  catch { throw new Error('Existe .deploy.lock: otro despliegue esta en marcha. Si fue interrumpido, comprueba Render y elimina ese archivo.'); }
  const env=process.env;
  const backendUrl=env.BACKEND_URL.replace(/\/$/,''), frontendUrl=env.FRONTEND_PUBLIC_URL.replace(/\/$/,'');
  async function api(path, body) {
    const response = await fetch(`https://api.render.com/v1${path}`, { method:body?'POST':'GET', headers:{Authorization:`Bearer ${env.RENDER_API_KEY}`,'Content-Type':'application/json'}, ...(body?{body:JSON.stringify(body)}:{}), signal:AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Render API HTTP ${response.status}. Revisa la clave, los IDs y el panel de Render.`);
    return response.json();
  }
  console.log(`MineTrack · despliegue ${sha.slice(0,7)}`);
  stage='configuracion de servicios';
  const back = await api(`/services/${env.RENDER_BACKEND_SERVICE_ID}`);
  const front = await api(`/services/${env.RENDER_FRONTEND_SERVICE_ID}`);
  for(const [service,type,url] of [[back,'web_service',backendUrl],[front,'static_site',frontendUrl]]) {
    if(service.type!==type || service.branch!==branch || service.repo?.replace(/\.git$/,'').replace(/\/$/,'')!==remote || service.serviceDetails?.url?.replace(/\/$/,'')!==url) throw new Error('Un servicio no coincide con el repositorio, rama, tipo o URL configurados.');
    if(service.autoDeployTrigger ? service.autoDeployTrigger!=='off' : service.autoDeploy!=='no') throw new Error('Desactiva Auto-Deploy en ambos servicios para que el comando controle el despliegue.');
  }
  stage='instalacion reproducible'; console.log('1/6 Instalando dependencias con npm ci…'); run('npm',['ci']);
  stage='pruebas'; console.log('2/6 Ejecutando pruebas…'); run('npm',['test']);
  stage='construccion'; console.log('3/6 Construyendo frontend y backend…'); run('npm',['run','build'],{env:{...env,VITE_API_URL:backendUrl}});
  stage='migraciones'; console.log('4/6 Aplicando migraciones idempotentes…'); run('npm',['run','migrate']);
  stage='publicacion del backend'; console.log('5/6 Publicando backend…');
  const backendDeploy=await api(`/services/${back.id}/deploys`,{commitId:sha,clearCache:'do_not_clear'});
  await waitForDeploy({serviceId:back.id,deployId:backendDeploy.id,api,timeoutMs});
  stage='publicacion del frontend'; console.log('6/6 Publicando frontend…');
  const frontendDeploy=await api(`/services/${front.id}/deploys`,{commitId:sha,clearCache:'do_not_clear'});
  await waitForDeploy({serviceId:front.id,deployId:frontendDeploy.id,api,timeoutMs});
  stage='verificacion publica'; console.log('Comprobando HTTP, PostgreSQL, CORS y version publicada…');
  await verifyRelease({backendUrl,frontendUrl,sha});
  console.log(`DESPLIEGUE CORRECTO\nFrontend: ${frontendUrl}\nBackend: ${backendUrl}\nHealth: ${backendUrl}/health\nCommit: ${sha}`);
} catch(error) {
  console.error(`\nERROR [${stage}]: ${error.message}\nEl despliegue no se considera completo. No se revierten migraciones automaticamente.`);
  process.exitCode=1;
} finally {
  if(lock){await lock.close();await unlink('.deploy.lock').catch(()=>{});}
}
