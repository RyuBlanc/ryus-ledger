const fs=require('fs'),vm=require('vm'),assert=require('assert');
const calls=[],classes=new Set();
const ctx={window:{RyuNative:{request:(...a)=>calls.push(a)}},document:{body:{classList:{add:x=>classes.add(x)}}},Uint8Array,Map,Promise,Error,btoa:s=>Buffer.from(s,'binary').toString('base64')};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(require('path').join(__dirname,'../app/src/main/assets/ui/android-bridge.js'),'utf8'),ctx);
(async()=>{
 assert(classes.has('compact'));assert(Object.isFrozen(ctx.window.desktop));
 const p=ctx.window.desktop.login({email:'test@example.invalid',password:'not-a-real-password'});const a=calls.shift();assert.equal(a[1],'login');assert.equal(JSON.parse(a[2]).email,'test@example.invalid');ctx.window.__ryuNativeResult(a[0],{ok:true,value:{name:'Test'}});assert.equal((await p).name,'Test');
 const q=ctx.window.desktop.save({revision:'old',data:{}});const b=calls.shift();ctx.window.__ryuNativeResult(b[0],{ok:false,error:'Revision conflict'});await assert.rejects(q,/Revision conflict/);
 const t=ctx.window.desktop.saveFile({name:'test.json',ext:'json',bytes:new Uint8Array([0,127,255])});const c=calls.shift();assert.equal(JSON.parse(c[2]).base64,'AH//');ctx.window.__ryuNativeResult(c[0],{ok:true,value:false});assert.equal(await t,false);
 await assert.rejects(ctx.window.desktop.saveFile({bytes:[]}),/Invalid export/);
 console.log('PASS: mobile default, frozen API, login dispatch, native error propagation, export byte encoding, cancellation, invalid export rejection.');
})().catch(e=>{console.error(e);process.exitCode=1;});
