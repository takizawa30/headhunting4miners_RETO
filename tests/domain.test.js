import test from 'node:test';
import assert from 'node:assert/strict';
import { equipmentSchema, presentEquipment } from '../backend/src/domain.js';
test('el intervalo se alcanza exactamente en el limite y se reinicia por baseline',()=>{
  const row={id:'1',code:'CAM-1',type:'camion',hourmeter:'750',last_maintenance_hourmeter:'500',interval_hours:'250'};
  assert.equal(presentEquipment({...row,hourmeter:'749.9'}).requiresMaintenance,false);
  assert.equal(presentEquipment(row).requiresMaintenance,true);
  const reset=presentEquipment({...row,last_maintenance_hourmeter:'750'});
  assert.equal(reset.hourmeter,750);assert.equal(reset.cycleHours,0);assert.equal(reset.remainingHours,250);assert.equal(reset.requiresMaintenance,false);
});
test('normaliza codigo y rechaza negativos, tipos desconocidos y precision extra',()=>{
  assert.equal(equipmentSchema.parse({code:' cam-01 ',type:'camion',hourmeter:0}).code,'CAM-01');
  for(const values of [{hourmeter:-1},{hourmeter:1.25},{type:'tractor'},{code:'<script>'}]) assert.equal(equipmentSchema.safeParse({code:'CAM-01',type:'camion',hourmeter:100,...values}).success,false);
});
