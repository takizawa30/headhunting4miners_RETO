import EmbeddedPostgres from 'embedded-postgres';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
const testing=process.argv.includes('--test');
const directory=await mkdtemp(join(tmpdir(),'minetrack-pg-'));
const password=randomBytes(16).toString('hex');
const port=testing?55439:55438;
const database=new EmbeddedPostgres({databaseDir:directory,user:'minetrack',password,port,persistent:false,autoRehydrateSymlinks:true,onLog:()=>{},onError:()=>{}});
try{
  await database.initialise();await database.start();await database.createDatabase('minetrack');
  const connection=`postgresql://minetrack:${password}@127.0.0.1:${port}/minetrack`;
  if(testing){
    const child=spawn(process.execPath,['--test','tests/integration.test.js'],{stdio:'inherit',env:{...process.env,TEST_DATABASE_URL:connection},windowsHide:true});
    process.exitCode=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>resolve(code??1));});
  }else{
    const {createPool}=await import('../backend/src/db.js');const {migrate}=await import('../backend/src/migrate.js');const {createApp}=await import('../backend/src/app.js');
    const pool=createPool(connection);await migrate(pool);
    const server=createApp(pool,{frontendUrl:'http://localhost:5173'}).listen(3000,'127.0.0.1');
    console.log('PostgreSQL temporal y API listos en http://localhost:3000. Los datos se borran al detener.');
    await new Promise(resolve=>{const stop=()=>server.close(async()=>{await pool.end();resolve();});process.once('SIGINT',stop);process.once('SIGTERM',stop);});
  }
}catch(error){console.error(`PostgreSQL local: ${error.message}`);process.exitCode=1;}
finally{await database.stop().catch(()=>{});}
