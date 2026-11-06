import test from 'node:test';
import assert from 'node:assert/strict';
import { createPool } from '../backend/src/db.js';
import { migrate } from '../backend/src/migrate.js';
import { createApp } from '../backend/src/app.js';

test('PostgreSQL real: migraciones repetidas, CRUD, historial, concurrencia y salud',{skip:!process.env.TEST_DATABASE_URL},async t=>{
  const pool=createPool(process.env.TEST_DATABASE_URL);
  let server;
  const ids=[];
  try{
    await migrate(pool);await migrate(pool);
    server=createApp(pool,{frontendUrl:'http://localhost:5173',revision:'test'}).listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const base=`http://127.0.0.1:${server.address().port}`;
    async function request(path,method='GET',body){const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return{status:response.status,data:response.status===204?null:await response.json()};}
    await t.test('health depende de la base y expone revision',async()=>{const r=await request('/health');assert.equal(r.status,200);assert.equal(r.data.revision,'test');});
    let equipment;
    await t.test('crea equipo en el limite y rechaza duplicados',async()=>{
      const body={code:`T-${Date.now()}`,type:'camion',hourmeter:250};const r=await request('/api/equipment','POST',body);
      assert.equal(r.status,201);equipment=r.data;ids.push(equipment.id);assert.equal(equipment.requiresMaintenance,true);
      assert.equal((await request('/api/equipment','POST',body)).status,409);
      assert.equal((await request('/api/equipment','POST',{...body,hourmeter:-2})).status,400);
    });
    await t.test('dos mantenimientos simultaneos registran un unico cierre de ciclo',async()=>{
      const results=await Promise.all([request(`/api/equipment/${equipment.id}/maintenance`,'POST',{notes:'Cambio de aceite'}),request(`/api/equipment/${equipment.id}/maintenance`,'POST',{notes:'Duplicado'})]);
      assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
      const history=await request(`/api/equipment/${equipment.id}/maintenance`);
      assert.equal(history.data.length,1);assert.equal(history.data[0].cycleHours,250);assert.equal(history.data[0].hourmeter,250);
      const items=await request('/api/equipment');const current=items.data.find(e=>e.id===equipment.id);
      assert.equal(current.cycleHours,0);assert.equal(current.requiresMaintenance,false);assert.equal(current.hourmeter,250);
    });
    await t.test('edita, impide disminuir horometro y conserva el siguiente ciclo',async()=>{
      const updated={code:equipment.code,type:'camion',hourmeter:500};
      const r=await request(`/api/equipment/${equipment.id}`,'PUT',updated);assert.equal(r.status,200);assert.equal(r.data.requiresMaintenance,true);
      assert.equal((await request(`/api/equipment/${equipment.id}`,'PUT',{...updated,hourmeter:400})).status,409);
      assert.equal((await request(`/api/equipment/${equipment.id}/maintenance`,'POST',{notes:'Segundo ciclo'})).status,201);
      assert.equal((await request(`/api/equipment/${equipment.id}/maintenance`)).data.length,2);
    });
    await t.test('elimina equipo e historial, valida UUID y rutas inexistentes',async()=>{
      assert.equal((await request(`/api/equipment/${equipment.id}`,'DELETE')).status,204);
      assert.equal((await pool.query('SELECT * FROM maintenance WHERE equipment_id=$1',[equipment.id])).rowCount,0);
      assert.equal((await request(`/api/equipment/${equipment.id}`,'DELETE')).status,404);
      assert.equal((await request('/api/equipment/invalid','DELETE')).status,400);
      assert.equal((await request('/missing')).status,404);
    });
  }finally{
    for(const id of ids)await pool.query('DELETE FROM equipment WHERE id=$1',[id]);
    if(server)await new Promise(resolve=>server.close(resolve));
    await pool.end();
  }
});
