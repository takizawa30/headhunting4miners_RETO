import './style.css';

const API = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');
const revision = import.meta.env.VITE_REVISION || 'local';
const labels = { camion: 'Camión', excavadora: 'Excavadora', perforadora: 'Perforadora' };
const icons = {
  mountain: '<path d="m3 20 8-15 5 9 3-5 6 11H3Z"/><path d="m8 11 3 3 3-3"/>',
  fleet: '<rect x="3" y="4" width="7" height="7" rx="1.5"/><rect x="14" y="4" width="7" height="7" rx="1.5"/><rect x="3" y="15" width="7" height="7" rx="1.5"/><rect x="14" y="15" width="7" height="7" rx="1.5"/>',
  truck: '<path d="M3 6h11v11H3zM14 10h4l3 4v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  tool: '<path d="m14 6 4 4M3 21l11-11M14 6l4-3 4 4-4 3M3 21l-1-4 3 1"/>',
  arrow: '<path d="M7 17 17 7M7 7h10v10"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  edit: '<path d="m15 4 5 5M4 16 16 4a2 2 0 0 1 4 4L8 20H4v-4Z"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  history: '<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2"/>'
};
const icon = (name, cls='') => `<svg class="icon ${cls}" viewBox="0 0 ${name==='mountain' ? '28 24' : '24 24'}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.truck}</svg>`;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = n => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 }).format(n);
let equipment = [], types = [], query = '', filter = 'all', typeFilter = '', loading = true, loadError = '', online = false;
let currentModal = null;
let loadSequence = 0, submitting = false;
const app = document.querySelector('#app');
app.innerHTML = `
  <aside class="sidebar"><a class="brand" href="/">${icon('mountain')}<span>MineTrack</span></a>
    <div class="workspace"><span class="workspace-mark">M</span><div>Operación minera<small>Gestión de activos</small></div><span class="workspace-chevron">⌄</span></div>
    <p class="nav-caption">ESPACIO DE TRABAJO</p>
    <nav><a class="nav-item active" href="#equipos">${icon('fleet')}<span>Equipos</span><span id="nav-count" class="nav-count">0</span></a><a class="nav-item" href="#intervalos">${icon('clock')}<span>Intervalos</span></a></nav>
    <div class="sidebar-bottom"><div class="sidebar-note">Cada hora cuenta.<p>Una flota al día empieza con un buen registro.</p>${icon('mountain')}</div><div class="profile"><span>OP</span><div>Panel de operaciones<small>Registro de equipos mineros</small></div></div></div>
  </aside>
  <main><header class="topbar"><div>Operaciones <span>/</span> <strong>Control de flota</strong></div><span class="connection" id="connection"><i></i> Conectando API</span></header>
  <section class="content" id="equipos"><div class="page-heading"><div><div class="eyebrow">CONTROL DE FLOTA <span>•</span> MANTENIMIENTO PREVENTIVO</div><h1>Tu flota, bajo control<span>.</span></h1><p>Cada equipo listo. Cada turno bajo control.</p></div><button class="primary" id="new-equipment">${icon('plus')} Nuevo equipo</button></div>
  <div class="stats" id="stats"></div>
  <section class="fleet-panel"><div class="panel-heading"><div><h2>Registro de equipos <span id="total-badge">0</span></h2><p>El estado de tu operación, en un solo lugar.</p></div><button class="text-button" id="refresh">${icon('history')} Actualizar</button></div>
    <div class="toolbar"><div class="tabs" role="group" aria-label="Filtrar por estado"><button data-filter="all" class="selected">Todos los equipos</button><button data-filter="due">Requieren atención <span id="due-count">0</span></button></div><div class="table-filters"><label class="search">${icon('search')}<input id="search" placeholder="Buscar por código…" aria-label="Buscar por código" /></label><select id="type-filter" aria-label="Filtrar por tipo"><option value="">Todos los tipos</option><option value="camion">Camión</option><option value="excavadora">Excavadora</option><option value="perforadora">Perforadora</option></select></div></div>
    <div class="table-scroll"><table><thead><tr><th>EQUIPO / CÓDIGO</th><th>HORÓMETRO TOTAL</th><th>CICLO DE MANTENIMIENTO</th><th>ESTADO</th><th class="align-right">ACCIONES</th></tr></thead><tbody id="rows"></tbody></table></div><div class="table-footer"><span id="result-count"></span><span>${icon('clock')} Horas registradas en h</span></div>
  </section>
  <section class="intervals" id="intervalos"><div><span class="small-icon">${icon('tool')}</span><div><h3>El mantenimiento empieza a tiempo</h3><p>Cada tipo de equipo tiene su propio intervalo. Al alcanzarlo, te avisamos.</p></div></div><div class="interval-pills" id="interval-pills"></div></section>
  <footer>MineTrack <span>Registro de equipos mineros</span><span>Versión <code>${escape(revision.slice(0,7))}</code></span></footer>
  </section></main><dialog id="modal"></dialog><div id="toast" role="status" aria-live="polite"></div>`;

async function request(path, options = {}) {
  let response;
  try { response = await fetch(`${API}${path}`, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }, signal: AbortSignal.timeout(90000) }); }
  catch { throw new Error('No se pudo conectar con la API. Espera un momento y vuelve a intentar.'); }
  if (response.status === 204) return;
  const data = await response.json().catch(() => ({ error: 'El servicio está iniciando o no está disponible. Intenta nuevamente.' }));
  if (!response.ok) throw new Error(data.details?.length ? `${data.error} ${data.details[0].message}` : data.error || `Error HTTP ${response.status}`);
  return data;
}
function toast(message) { const box=document.querySelector('#toast'); box.textContent=message; box.classList.add('visible'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>box.classList.remove('visible'),4500); }
function render() {
  const due = equipment.filter(e => e.requiresMaintenance).length;
  document.querySelector('#stats').innerHTML = [
    ['truck','Equipos registrados',equipment.length,'Tu flota en un vistazo',''],
    ['check','Dentro del intervalo',equipment.length-due,'Ciclo de mantenimiento al día','green'],
    ['tool','Requieren mantenimiento',due,'Planifica su próxima intervención','amber']
  ].map(([i,title,value,note,color])=>`<article class="stat ${color}"><div><span>${title}</span><span class="stat-icon">${icon(i)}</span></div><strong>${loading?'—':value.toString().padStart(2,'0')}</strong><p><i></i>${note}</p></article>`).join('');
  document.querySelector('#nav-count').textContent=equipment.length;
  document.querySelector('#total-badge').textContent=equipment.length;
  document.querySelector('#due-count').textContent=due;
  const connection=document.querySelector('#connection'); connection.classList.toggle('online',online); connection.innerHTML=`<i></i> ${online?'API conectada':loading?'Conectando API':'Sin conexión'}`;
  const filtered=equipment.filter(e=>(filter!=='due'||e.requiresMaintenance)&&(!typeFilter||e.type===typeFilter)&&e.code.toLowerCase().includes(query.trim().toLowerCase()));
  document.querySelector('#rows').innerHTML=loading ? '<tr><td colspan="5" class="empty">Conectando con la operación… <small>El servicio gratuito puede tardar un minuto en despertar.</small></td></tr>' : loadError ? `<tr><td colspan="5" class="empty error">No pudimos cargar la flota.<small>${escape(loadError)} Usa Actualizar para reintentar.</small></td></tr>` : !filtered.length ? `<tr><td colspan="5" class="empty">${equipment.length?'No hay equipos con estos filtros.':'Tu operación comienza aquí.'}<small>${equipment.length?'Prueba otro código o tipo de equipo.':'Registra tu primer equipo para controlar su mantenimiento.'}</small>${!equipment.length?'<button class="secondary" data-action="new">Registrar primer equipo</button>':''}</td></tr>` : filtered.map(e=>`<tr><td><div class="equipment-name"><span class="equipment-icon ${e.type}">${icon(e.type==='camion'?'truck':'tool')}</span><div><strong>${escape(e.code)}</strong><small>${labels[e.type]}</small></div></div></td><td><span class="hour-value">${number(e.hourmeter)}</span> <span class="unit">h</span></td><td><div class="cycle-label"><span>${number(e.cycleHours)} <small>/ ${number(e.intervalHours)} h</small></span><small>${e.requiresMaintenance?'Intervalo alcanzado':`${number(e.remainingHours)} h restantes`}</small></div><div class="progress ${e.requiresMaintenance?'due':''}"><i style="width:${Math.min(100,e.cycleHours/e.intervalHours*100)}%"></i></div></td><td><span class="status ${e.requiresMaintenance?'due':'ok'}"><i></i>${e.requiresMaintenance?'Requiere mantenimiento':'Al día'}</span></td><td><div class="actions"><button class="action" data-action="maintenance" ${e.cycleHours <= 0 ? 'disabled' : ''} data-id="${e.id}" aria-label="Registrar mantenimiento de ${escape(e.code)}" title="Registrar mantenimiento">${icon('tool')}<span>Mantener</span></button><button class="action" data-action="history" data-id="${e.id}" aria-label="Ver historial de ${escape(e.code)}" title="Historial">${icon('history')}<span>Historial</span></button><button class="action" data-action="edit" data-id="${e.id}" aria-label="Editar ${escape(e.code)}" title="Editar">${icon('edit')}<span>Editar</span></button><button class="action delete" data-action="delete" data-id="${e.id}" aria-label="Eliminar ${escape(e.code)}" title="Eliminar">${icon('trash')}<span>Eliminar</span></button></div></td></tr>`).join('');
  document.querySelector('#result-count').textContent=`${filtered.length} de ${equipment.length} equipos`;
  document.querySelector('#interval-pills').innerHTML=types.map(t=>`<span>${escape(t.label)} <strong>${number(t.intervalHours)} h</strong></span>`).join('');
}
async function load() {
  const sequence = ++loadSequence;
  loading=true; loadError=''; document.querySelector('#refresh').disabled=true; render();
  try { const [items, configuredTypes, health] = await Promise.all([request('/api/equipment'),request('/api/types'),request('/health')]); if(sequence!==loadSequence)return; equipment=items; types=configuredTypes; online=health.status==='ok'; }
  catch(error) { if(sequence===loadSequence){loadError=error.message; online=false;} }
  finally { if(sequence===loadSequence){loading=false; document.querySelector('#refresh').disabled=false; render();} }
}
const modal=document.querySelector('#modal');
function showModal(title, subtitle, body, submitLabel, handler) {
  currentModal=handler;
  modal.innerHTML=`<form id="modal-form"><div class="modal-heading"><div><span class="eyebrow">MINE TRACK / OPERACIONES</span><h2>${title}</h2></div><button type="button" class="action" data-close aria-label="Cerrar">${icon('close')}</button></div><p class="modal-subtitle">${subtitle}</p>${body}<p class="form-error" role="alert" id="form-error"></p><div class="modal-footer"><button type="button" class="secondary" data-close>Cerrar</button>${submitLabel?`<button type="submit" class="primary">${submitLabel}</button>`:''}</div></form>`;
  modal.showModal();
}
function equipmentModal(e) {
  showModal(e?'Editar equipo':'Nuevo equipo', 'Registra sus datos y el horómetro total de uso.', `<label class="field">Código del equipo<input name="code" required minlength="2" maxlength="30" pattern="[A-Za-z0-9][A-Za-z0-9_\\-]{1,29}" placeholder="Ej. CAM-001" value="${escape(e?.code||'')}" autocomplete="off" /></label><div class="form-grid"><label class="field">Tipo<select name="type">${Object.entries(labels).map(([value,label])=>`<option value="${value}" ${e?.type===value?'selected':''}>${label}</option>`).join('')}</select></label><label class="field">Horómetro total (h)<input type="number" name="hourmeter" min="${e?.hourmeter||0}" max="9999999" step="0.1" required value="${e?.hourmeter??0}" /></label></div><div class="form-note">${icon('clock')} ${e?'El horómetro es acumulado y no puede disminuir.':'El primer ciclo se calcula desde 0 h. Si el equipo ya recibió mantenimiento, regístralo después de crearlo.'}</div>`,e?'Guardar cambios':'Crear equipo',async form=>{
    const values=new FormData(form); await request(`/api/equipment${e?`/${e.id}`:''}`,{method:e?'PUT':'POST',body:JSON.stringify({code:values.get('code'),type:values.get('type'),hourmeter:Number(values.get('hourmeter'))})}); toast(e?'Equipo actualizado.':'Equipo registrado.');
  });
}
document.querySelector('#new-equipment').onclick=()=>equipmentModal();
document.querySelector('#refresh').onclick=load;
document.querySelector('#search').oninput=e=>{query=e.target.value;render();};
document.querySelector('#type-filter').onchange=e=>{typeFilter=e.target.value;render();};
document.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('selected',b===button));render();});
document.querySelector('#rows').onclick=async event=>{
  const button=event.target.closest('[data-action]'); if(!button)return;
  const action=button.dataset.action, e=equipment.find(e=>e.id===button.dataset.id);
  if(action==='new')return equipmentModal();
  if(!e)return;
  if(action==='edit')return equipmentModal(e);
  if(action==='maintenance')return showModal(`Mantenimiento · ${escape(e.code)}`, 'Cierra el ciclo actual y conserva el horómetro total.', `<div class="maintenance-summary"><div><small>Horómetro total</small><strong>${number(e.hourmeter)} h</strong></div><div><small>Ciclo a cerrar</small><strong>${number(e.cycleHours)} h</strong></div></div><label class="field">Detalle del mantenimiento<textarea name="notes" maxlength="1000" rows="4" placeholder="Ej. Cambio de aceite y revisión de filtros"></textarea></label><div class="form-note">${icon('history')} El registro quedará en el historial. El próximo ciclo comienza en ${number(e.hourmeter)} h.</div>`, 'Registrar mantenimiento',async form=>{await request(`/api/equipment/${e.id}/maintenance`,{method:'POST',body:JSON.stringify({notes:new FormData(form).get('notes')})});toast('Mantenimiento registrado. Ciclo reiniciado.');});
  if(action==='delete')return showModal(`Eliminar ${escape(e.code)}`, 'Esta acción elimina el equipo y su historial de mantenimiento.', '<div class="delete-notice">Confirma que deseas eliminar este equipo. Esta operación no se puede deshacer.</div>', 'Eliminar equipo',async()=>{await request(`/api/equipment/${e.id}`,{method:'DELETE'});toast('Equipo eliminado.');});
  if(action==='history'){
    button.disabled=true;
    try {const history=await request(`/api/equipment/${e.id}/maintenance`); showModal(`Historial · ${escape(e.code)}`,`${labels[e.type]} · ${number(e.hourmeter)} h acumuladas`,history.length?`<div class="history-list">${history.map(m=>`<article><span class="history-dot">${icon('check')}</span><div><strong>${new Date(m.performedAt).toLocaleString('es-PE',{dateStyle:'medium',timeStyle:'short'})}</strong><small>${number(m.hourmeter)} h totales · Ciclo de ${number(m.cycleHours)} h</small><p>${escape(m.notes||'Sin observaciones.')}</p></div></article>`).join('')}</div>`:'<div class="empty">Aún no hay mantenimientos.<small>Los registros aparecerán aquí al cerrar un ciclo.</small></div>',null,null);}
    catch(error){toast(error.message);} finally{button.disabled=false;}
  }
};
modal.addEventListener('cancel',event=>{if(submitting)event.preventDefault();});
modal.addEventListener('click',event=>{if(!submitting && (event.target===modal || event.target.closest('[data-close]')))modal.close();});
modal.addEventListener('submit',async event=>{
  event.preventDefault(); if(submitting || !currentModal)return; submitting=true;
  const submit=event.submitter || modal.querySelector('[type=submit]');
  const controls=[...modal.querySelectorAll('button')]; controls.forEach(button=>button.disabled=true);
  const originalLabel=submit.textContent; submit.textContent='Guardando…';
  document.querySelector('#form-error').textContent='';
  try {await currentModal(event.target);modal.close();await load();}
  catch(error){document.querySelector('#form-error').textContent=error.message;}
  finally{submitting=false; controls.forEach(button=>button.disabled=false);submit.textContent=originalLabel;}
});
load();

const updateNavigation = () => document.querySelectorAll('.nav-item').forEach(link => link.classList.toggle('active', link.hash === (location.hash || '#equipos')));
window.addEventListener('hashchange', updateNavigation);
updateNavigation();
