import { spawnSync } from 'node:child_process';

export function validateEnvironment(env) {
  const required = ['DATABASE_URL','RENDER_API_KEY','RENDER_BACKEND_SERVICE_ID','RENDER_FRONTEND_SERVICE_ID','BACKEND_URL','FRONTEND_PUBLIC_URL'];
  const missing = required.filter(key => !env[key]?.trim());
  if (missing.length) throw new Error(`Faltan variables: ${missing.join(', ')}. Configura .env segun .env.example.`);
  for (const key of ['BACKEND_URL','FRONTEND_PUBLIC_URL']) {
    let url; try { url = new URL(env[key]); } catch { throw new Error(`${key} debe ser una URL HTTPS publica.`); }
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error(`${key} debe ser un origen HTTPS sin ruta ni credenciales.`);
  }
  if (new URL(env.BACKEND_URL).origin === new URL(env.FRONTEND_PUBLIC_URL).origin) throw new Error('Frontend y backend deben tener URLs diferentes.');
  for (const key of ['RENDER_BACKEND_SERVICE_ID','RENDER_FRONTEND_SERVICE_ID']) if (!/^srv-[a-z0-9]+$/.test(env[key])) throw new Error(`${key} debe ser un ID srv- de Render.`);
  if (env.RENDER_BACKEND_SERVICE_ID === env.RENDER_FRONTEND_SERVICE_ID) throw new Error('Los IDs de frontend y backend deben ser distintos.');
  let database; try { database = new URL(env.DATABASE_URL); } catch { throw new Error('DATABASE_URL no es una URL valida de PostgreSQL.'); }
  if (!['postgres:','postgresql:'].includes(database.protocol)) throw new Error('DATABASE_URL debe usar PostgreSQL.');
  const timeout = Number(env.DEPLOY_TIMEOUT_SECONDS || 1200);
  if (!Number.isInteger(timeout) || timeout < 10 || timeout > 3600) throw new Error('DEPLOY_TIMEOUT_SECONDS debe estar entre 10 y 3600.');
  return { timeoutMs: timeout * 1000 };
}
export function run(command, args, { capture = false, env = process.env } = {}) {
  // npm_execpath evita cmd /c y problemas con espacios en Windows.
  const isNpm = command === 'npm';
  const executable = isNpm ? process.execPath : command;
  const argv = isNpm ? [process.env.npm_execpath, ...args] : args;
  if (isNpm && !process.env.npm_execpath) throw new Error('Ejecuta el despliegue con npm run deploy.');
  const result = spawnSync(executable, argv, { env, encoding:'utf8', stdio:capture?['ignore','pipe','pipe']:'inherit', timeout:300000, windowsHide:true });
  if (result.error || result.status !== 0) throw new Error(`Fallo: ${command} ${args.slice(0,2).join(' ')} (codigo ${result.status ?? 'no disponible'}). Revisa la salida anterior.`);
  return result.stdout?.trim();
}
export async function waitForDeploy({ serviceId, deployId, api, timeoutMs, sleep = ms => new Promise(resolve => setTimeout(resolve,ms)), now = Date.now, log = console.log }) {
  const deadline = now() + timeoutMs;
  let previous;
  while (now() < deadline) {
    const deploy = await api(`/services/${serviceId}/deploys/${deployId}`);
    if (deploy.status !== previous) log(`  ${serviceId}: ${deploy.status}`);
    previous = deploy.status;
    if (deploy.status === 'live') return deploy;
    if (['build_failed','update_failed','pre_deploy_failed','canceled','deactivated'].includes(deploy.status)) throw new Error(`Despliegue ${deployId} fallo (${deploy.status}). Revisa los logs de Render.`);
    await sleep(5000);
  }
  throw new Error(`Tiempo agotado esperando ${deployId}. El despliegue puede seguir en Render; revisa su estado antes de reintentar.`);
}
export async function verifyRelease({ backendUrl, frontendUrl, sha, fetcher = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve,ms)), attempts = 12 }) {
  let reason = 'Los servicios aun no responden.';
  for (let attempt=0; attempt<attempts; attempt++) {
    try {
      const [health, page, version, equipment] = await Promise.all([
        fetcher(`${backendUrl}/health`, {signal:AbortSignal.timeout(15000),cache:'no-store'}),
        fetcher(frontendUrl, {signal:AbortSignal.timeout(15000),cache:'no-store'}),
        fetcher(`${frontendUrl}/version.json?t=${Date.now()}`, {signal:AbortSignal.timeout(15000),cache:'no-store'}),
        fetcher(`${backendUrl}/api/equipment`, {signal:AbortSignal.timeout(15000),headers:{Origin:frontendUrl},cache:'no-store'})
      ]);
      if (![health,page,version,equipment].every(r=>r.ok)) throw new Error('HTTP no exitoso en frontend, backend o API de equipos.');
      const [body, html, release, items] = await Promise.all([health.json(),page.text(),version.json(),equipment.json()]);
      if (body.status !== 'ok' || body.database !== 'ok') throw new Error('/health no confirma PostgreSQL.');
      if (body.revision !== sha || release.revision !== sha) throw new Error('La version publicada no coincide con el commit solicitado.');
      if (!html.includes('MineTrack') || !html.includes('id="app"')) throw new Error('El frontend no devuelve la aplicacion esperada.');
      if (!Array.isArray(items)) throw new Error('La API no devuelve una lista de equipos.');
      if (equipment.headers.get('access-control-allow-origin') !== frontendUrl) throw new Error('CORS no permite el origen del frontend.');
      return;
    } catch(error) { reason=error.message; if(attempt+1<attempts) await sleep(5000); }
  }
  throw new Error(`Verificacion final fallida: ${reason}`);
}
