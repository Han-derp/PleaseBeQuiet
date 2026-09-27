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
const debugButtons=['PALM','GOOD','WAVE','MOVING','STILL','NO_HAND','CUP'].map(name=>{
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
 await flush();
 assert(el('startBtn').onclick,'Boot event handlers absent');
 el('startBtn').onclick();next();key('p');
 assert.equal(el('stage').dataset.scene,'WARD');
 advance(1800);
 assert(el('dialogueBadge').textContent.includes('手势'),'sister initial hello must read as visual gesture');
 assert.equal(el('actionIcon').textContent,'✋');
 advance(2550);
 assert(!el('playerGesture').classList.contains('hidden'),'player palm cue must follow sister action');
 key('p');advance(560);
 assert(el('caption').textContent.includes('我看见啦'),'sister reply missing');
 advance(1850);key('g');
 assert(el('caption').textContent.includes('安心'),'optional encouragement failed');
 jump('SEA');advance(500);key('w');advance(800);key('s');advance(3700);
 assert(el('caption').textContent.includes('请勿喧哗'),'sea must gather only after stillness');
 key('w');advance(400);key('s');advance(3700);
 assert(el('goal').textContent.includes('重新试过了'),'sea repeat must be reversible');
 jump('RETURN_WARD');
 assert(el('noteText').textContent.includes('等她出院'));
 next();assert(el('noteText').textContent.includes('不再需要'));
 advance(850);assert(el('wardNote').classList.contains('crossed'),'erased note animation absent');
 advance(400);next();assert(el('noteText').textContent.includes('帮她准备好'));
 next();assert(!el('nurseCue').classList.contains('hidden'),'visual nurse clue absent');
 next();assert(!el('wardTickets').classList.contains('hidden'),'tickets should be an offered prop');
 assert(el('dialogueBadge').textContent.includes('手势'),'ticket line must be marked as sister gesture');
 next();assert(!el('playerGesture').classList.contains('hidden'));
 next();assert(el('caption').textContent.includes('我应该高兴的'),'mirror narrative bridge missing');
 advance(3850);assert.equal(el('stage').dataset.scene,'MIRROR');
 assert(el('stage').classList.contains('is-mirror'));
 assert(el('caption').textContent.includes('看向镜子'));
 assert(el('mirrorTech').classList.contains('hidden'),'technical statement should not interrupt drama');
 next();assert(el('caption').textContent.includes('还能说什么'));
 advance(2960);assert(!el('nextBtn').classList.contains('hidden'));
 next();advance(2100);assert.equal(el('stage').dataset.scene,'FINAL_DOOR');
 advance(2900);assert(el('actionInfo').textContent.includes('放下双手'));
 key('s');advance(2150);assert(!el('reaching').classList.contains('hidden'),'sister must reach first');
 assert.equal(el('glassLayer').style.opacity,'1','glass disappeared before reaching');
 advance(2950);assert.equal(el('glassLayer').style.opacity,'0','glass should fade AFTER sister reaches');
 assert(el('caption').textContent.includes('已经能听见'));
 assert(el('dialogueBadge').textContent.includes('手势'));
 next();assert(el('caption').textContent.includes('我怕你不再需要我'));
 next();assert(el('caption').textContent.includes('不是要你一直照顾我'));
 next();assert(el('goal').textContent.includes('回应她'));
 advance(520);key('p');assert(el('goal').textContent.includes('给出了自己的回应'));
 advance(3750);assert.equal(el('stage').dataset.scene,'AQUARIUM');
 console.log('PASS: v0.3 whole simulated story: sister visual gestures, palm/GOOD, reversible fish, note/nurse/tickets, bridge to hospital-window mirror, sister-first finale');
})().catch(e=>{console.error(e);process.exitCode=1});
