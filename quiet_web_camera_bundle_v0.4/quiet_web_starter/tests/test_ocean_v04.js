/* Deterministic DOM-free game-flow regression: no browser, no webcam, no network.
   Exercises the actual app.js against a minimal mock stage with a virtual clock. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname,'..');
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
const js = fs.readFileSync(path.join(root,'app.js'),'utf8');
const story = JSON.parse(fs.readFileSync(path.join(root,'content/story.json'),'utf8'));
const overlay = JSON.parse(fs.readFileSync(path.join(root,'content/round1_additions.json'),'utf8'));
const overlay2 = JSON.parse(fs.readFileSync(path.join(root,'content/round2_additions.json'),'utf8'));
const sourceIds = new Set([...html.matchAll(/id="([a-zA-Z0-9_-]+)"/g)].map(x=>x[1]));
const scriptIds = js.match(/\['stage'.+?\]\.map\(/s)[0].match(/'[^']+'/g).map(x=>x.slice(1,-1));
scriptIds.forEach(x=>assert(sourceIds.has(x),'JS expects missing DOM ID '+x));
assert(story.lines.length>25,'original script is absent');
assert(overlay.lines.some(x=>x.id==='BR01'),'the additive bridge text must exist');
class MockElement {
  constructor(id='') {
    this.id=id;this.textContent='';this.innerHTML='';this.style={};this.dataset={};
    this.className='';this.options=[];this.value='';this.checked=false;
    this.classList={
      set:new Set(),
      add:(...c)=>c.forEach(x=>this.classList.set.add(x)),
      remove:(...c)=>c.forEach(x=>this.classList.set.delete(x)),
      contains:(c)=>this.classList.set.has(c),
      toggle:(c,force)=>{const next=force===undefined?!this.classList.set.has(c):force;if(next)this.classList.set.add(c);else this.classList.set.delete(c);return next;}
    };
  }
  appendChild(x){this.options.push(x)}
}
const ids=new Map();
for(const id of sourceIds) ids.set(id,new MockElement(id));
const debugButtons=['PALM','GOOD','WAVE','MOVING','STILL','NO_HAND','CUP','CUP_EXIT'].map(name=>{
 const elem=new MockElement();elem.dataset.input=name;return elem;
});
const doc={
  getElementById(id){return ids.get(id)||null},
  createElement(tag){return new MockElement(tag)},
  querySelector(sel){if(sel==='.school.left')return schoolLeft;if(sel==='.school.right')return schoolRight;throw Error('unhandled '+sel)},
  querySelectorAll(sel){assert(sel==='#debug [data-input]');return debugButtons;}
};
const schoolLeft=new MockElement('school-left'),schoolRight=new MockElement('school-right');
let clock=10000, raf=null, taskId=0;
const pending=new Map();
const task=(fn,ms=0)=>{const id=++taskId;pending.set(id,{fn,at:clock+ms});return id};
const fakeDate={now:()=>clock};
const ctx={
 document:doc,
 window:{addEventListener(){},AudioContext:null,webkitAudioContext:null},
 location:{search:''},
 Audio:function(){this.pause=()=>{};this.play=()=>Promise.resolve();this.volume=0;this.loop=false;},
 navigator:{sendBeacon(){return true}},
 console:{info(){},warn(){},error:console.error},
 Date:fakeDate,performance:{now:()=>clock},
 setTimeout:task,clearTimeout:(id)=>pending.delete(id),
 requestAnimationFrame:(f)=>{raf=f},
 fetch:async(url,opts)=>{
    if(url==='content/story.json')return {json:async()=>story};
    if(url==='content/round1_additions.json')return {json:async()=>overlay};
    if(url==='content/round2_additions.json')return {json:async()=>overlay2};
    if(url==='/api/info')return {json:async()=>({mode:'SIM_ONLY'})};
    if(url.startsWith('/api/events'))return {json:async()=>({vision_configured:false,latest_seq:0,events:[],worker_active:false,stream_fresh:false})};
    if(url==='/api/vision/stop')return {json:async()=>({ok:true})};
    throw Error('unexpected mock request '+url);
 }
};
ctx.globalThis=ctx;
vm.runInNewContext(js,ctx,{filename:'app.js'});
const el=(id)=>ids.get(id);
const advance=(ms)=>{
 let end=clock+ms;
 while(clock<end){
  clock=Math.min(end,clock+20);
  const due=[...pending].filter(([id,v])=>v.at<=clock).sort((a,b)=>a[1].at-b[1].at);
  for(const [id,v] of due){if(pending.has(id)){pending.delete(id);v.fn()}}
  if(raf){const fn=raf;raf=null;fn(clock)}
 }
};
async function flush(){for(let i=0;i<24;i++)await Promise.resolve()}
function key(name){doc.onkeydown({target:{tagName:'BODY'},key:name.toLowerCase()})}
function next(){assert.equal(el('nextBtn').classList.contains('hidden'),false,'Next unexpectedly hidden');el('nextBtn').onclick();}
function jump(scene){el('sceneJump').value=scene;el('sceneJump').onchange()}
(async()=>{
 await flush();el('startBtn').onclick();
 const jump=scene=>{el('sceneJump').value=scene;el('sceneJump').onchange()};
 jump('SEA');advance(450);
 const near=()=>Number((schoolLeft.style.transform.match(/translate\((-?[\d.]+)%/)||[])[1]);
 key('w');advance(850);key('s');advance(3850);
 assert(el('caption').textContent.includes('请勿喧哗'),'first true STILL must gather fish');
 const before=near();
 // Repositioning hands for CUP after successful gather must not send fish away.
 key('m');advance(850);
 assert(near()>-10,`ordinary MOVING scattered already-gathered fish: ${near()}`);
 // 玩家仍可主动反复验证鱼群的因果关系，不把第二次静止作为强制关卡。
 key('x');advance(1700);
 assert.equal(el('stage').dataset.scene,'SEA','spurious CUP_EXIT (NONE) must never count as a cup');
 key('w');advance(500);
 assert(near()<-12,'fresh WAVE should still scatter fish BEFORE accepting CUP');
 key('s');advance(3700);
 assert(near()>-11,'second STILL should gather fish again');
 key('m');advance(450);
 key('c');advance(1900);
 assert(el('goal').textContent.includes('主动停在'),'CUP should let fish approach after MOVING');
 assert(el('specialFish').style.transform.includes('scale('));
 assert(Number(el('specialFish').style.transform.match(/scale\(([\d.]+)\)/)[1])>1.4,'front-facing fish should grow toward viewer');
 // Now CUP is a successful cutscene: do not fake a catch, let the fish approach and return to the ward.
 key('x');key('w');advance(200);
 assert.equal(el('stage').dataset.scene,'SEA','WAVE during successful cup should not interrupt');
 advance(3300);
 assert.equal(el('stage').dataset.scene,'RETURN_WARD','successful cup should automatically transition once');
 console.log('PASS: v0.5 schools reversible before CUP; repositioning safe; independent fish approaches; CUP auto-returns to ward');
})().catch(e=>{console.error(e);process.exitCode=1});
