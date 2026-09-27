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
const overlay3 = JSON.parse(fs.readFileSync(path.join(root,'content/round3_additions.json'),'utf8'));
const overlay4 = JSON.parse(fs.readFileSync(path.join(root,'content/round4_additions.json'),'utf8'));
const sourceIds = new Set([...html.matchAll(/id="([a-zA-Z0-9_-]+)"/g)].map(x=>x[1]));
const scriptIds = js.match(/\['stage'.+?\]\.map\(/s)[0].match(/'[^']+'/g).map(x=>x.slice(1,-1));
scriptIds.forEach(x=>assert(sourceIds.has(x),'JS expects missing DOM ID '+x));
assert(story.lines.length>25,'original script is absent');
assert(overlay.lines.some(x=>x.id==='BR01'),'first bridge text must exist');
assert(overlay2.lines.some(x=>x.id==='W00B')&&overlay2.lines.some(x=>x.id==='F10B'),'second-round additions missing');
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
// v0.9：桥接状态可切换。SIM_ONLY=主测试路径；VISION_AVAILABLE=真实识别测试段。
let apiMode='SIM_ONLY', eventsFeed=[];
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
 VisionProtocol:require('../vision_adapter.js'),
 fetch:async(url,opts)=>{
    if(url==='content/story.json')return {json:async()=>story};
    if(url==='content/round1_additions.json')return {json:async()=>overlay};
    if(url==='content/round2_additions.json')return {json:async()=>overlay2};
    if(url==='content/round3_additions.json')return {json:async()=>overlay3};
    if(url==='content/round4_additions.json')return {json:async()=>overlay4};
    if(url==='/api/info')return {json:async()=>({mode:apiMode})};
    if(url==='/api/vision/start')return {json:async()=>({ok:true,start_seq:0,camera_available:true})};
    if(url.startsWith('/api/events')){const out=eventsFeed.splice(0);return {json:async()=>({vision_configured:apiMode==='VISION_AVAILABLE',latest_seq:out.length?out[out.length-1].seq:0,events:out,worker_active:apiMode==='VISION_AVAILABLE',stream_fresh:apiMode==='VISION_AVAILABLE'})};}
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
async function flush(){for(let i=0;i<40;i++)await Promise.resolve()}
function key(name){doc.onkeydown({target:{tagName:'BODY'},key:name.toLowerCase()})}
function next(){assert.equal(el('nextBtn').classList.contains('hidden'),false,'Next unexpectedly hidden');el('nextBtn').onclick();}
function jump(scene){el('sceneJump').value=scene;el('sceneJump').onchange()}
(async()=>{
 await flush();
 assert(el('startBtn').onclick,'Boot event handlers absent');
 el('startBtn').onclick();next();key('p');
 // v0.6: PALM 验证之后先进入「安静教学」——挥手被水面拒绝，静止才被听见。
 assert.equal(el('stage').dataset.scene,'CALIBRATE');
 assert(el('caption').textContent.includes('挥挥手'),'quiet teaching must open after palm');
 advance(500);key('w');
 assert(el('caption').textContent.includes('太吵了'),'waving must disturb the water');
 key('s');advance(1950);
 assert(el('caption').textContent.includes('听见了安静'),'stillness must be heard');
 advance(2400);
 assert.equal(el('stage').dataset.scene,'WARD');
 assert(el('caption').textContent.includes('学着用手势'),'opening should state old communication');
 advance(2250);assert(el('caption').textContent.includes('听不见'),'deafness must be clear in opening');
 advance(2500);assert(el('caption').textContent.includes('开口'),'loss of speech must be clear');
 advance(800);assert(el('caption').textContent.includes('全部的力气'),'caretaking must be revealed as his armor');
 advance(2830);
 assert(el('dialogueBadge').textContent.includes('手势'),'sister initial hello must read as visual gesture');
 assert.equal(el('actionIcon').textContent,'✋');
 advance(2250);
 assert(!el('playerGesture').classList.contains('hidden'),'player palm cue must follow sister action');
 key('p');advance(560);
 assert(el('caption').textContent.includes('我看见啦'),'sister reply missing');
 advance(1850);key('g');
 assert(el('caption').textContent.includes('安心'),'optional encouragement failed');
 jump('SEA');advance(500);key('w');advance(800);key('s');advance(3700);
 assert(el('caption').textContent.includes('请勿喧哗'),'sea must gather only after stillness');
 advance(3600);assert(el('caption').textContent.includes('他也一样'),'the sea must be revealed as the brother inner world');
 advance(1230);key('w');advance(400);key('s');advance(3700);
 assert(el('goal').textContent.includes('重新试过了'),'sea repeat must be reversible');
 jump('RETURN_WARD');
 assert(el('noteText').textContent.includes('等她出院'));
 next();assert(el('noteText').textContent.includes('不再需要'));
 advance(850);assert(el('wardNote').classList.contains('crossed'),'erased note animation absent');
 advance(400);next();assert(el('caption').textContent.includes('把害怕'),'fear disguised as care must surface');
 next();assert(el('noteText').textContent.includes('帮她准备好'));
 next();assert(!el('nurseCue').classList.contains('hidden'),'visual nurse clue absent');
 advance(2040);next();assert(!el('wardTickets').classList.contains('hidden'),'tickets should be an offered prop');
 assert(el('dialogueBadge').textContent.includes('手势'),'ticket line must be marked as sister gesture');
 next();assert(!el('playerGesture').classList.contains('hidden'));
 next();assert(el('caption').textContent.includes('我应该高兴的'),'hospital window narrative bridge missing');
 advance(2100);assert.equal(el('stage').dataset.scene,'RETURN_WARD','the window reflection must stay in the hospital');
 assert(el('caption').textContent.includes('还能说什么'),'window reflection reuses original M01');
 advance(3550);assert.equal(el('stage').dataset.scene,'FINAL_DOOR','no standalone mirror scene in main story');
 assert(el('mirrorTech').classList.contains('hidden'),'technology line interrupts story');
 advance(3050);assert(el('actionInfo').textContent.includes('放下双手'));
 key('s');advance(2150);assert(!el('reaching').classList.contains('hidden'),'sister must reach first');
 assert.equal(el('glassLayer').style.opacity,'1','glass disappeared before reaching');
 advance(2950);assert.equal(el('glassLayer').style.opacity,'0','glass should fade AFTER sister reaches');
 assert(el('caption').textContent.includes('已经能听见'));
 assert(el('dialogueBadge').textContent.includes('手势'));
 next();assert(el('caption').textContent.includes('我怕你不再需要我'));
 next();assert(el('caption').textContent.includes('没有用了'),'brother must voice value fear');
 next();assert(el('caption').textContent.includes('不是要你一直照顾我'));
 next();assert(el('caption').textContent.includes('需要被看见'),'brother must admit his disguise');
 next();assert(el('caption').textContent.includes('和你一起'),'brother must choose to face himself');
 next();assert(el('caption').textContent.includes('换我等你'),'sister must have her own initiative');
 next();assert(el('goal').textContent.includes('回应她'));
 advance(520);key('p');assert(el('goal').textContent.includes('给出了自己的回应'));
 advance(3750);assert.equal(el('stage').dataset.scene,'AQUARIUM');
 // v0.6 hidden reply: putting the hand away (fresh NO_HAND, healthy camera) is also an answer.
 jump('FINAL_DOOR');advance(3100);key('s');advance(2200);
 assert(!el('reaching').classList.contains('hidden'),'sister must reach first in the easter egg run');
 advance(3000);
 next();next();next();next();next();next(); // F10 -> F10B -> F02 -> F13 -> F14 -> F11
 next(); // F12 -> final_reply
 assert(el('goal').textContent.includes('回应她'),'final reply must ask for palm first');
 key('n');advance(1700);
 assert(el('goal').textContent.includes('什么都没有做'),'letting go must be accepted as an answer');
 advance(6100);
 assert.equal(el('stage').dataset.scene,'AQUARIUM','hidden reply must also reach the aquarium');
 // ---- v0.9：技术透视模式（T 键）+ 真实识别驱动剧情衔接（不点「继续」按钮） ----
 apiMode='VISION_AVAILABLE';eventsFeed=[];
 advance(200);await flush(); // poll 拾取真实模式 → consent 提供「同意并启动摄像头」
 el('quitBtn').onclick();
 el('startBtn').onclick();
 assert(el('nextBtn').textContent.includes('同意并启动摄像头'),'real mode must offer camera consent');
 next();await flush();
 assert(el('modeTag').textContent.includes('真实识别'),'consent must switch to real vision mode');
 assert.equal(el('stage').dataset.scene,'CALIBRATE');
 key('t');
 assert(!el('techHud').classList.contains('hidden'),'T key must open the tech HUD');
 key('t');assert(el('techHud').classList.contains('hidden'),'T key must close it again');
 key('t');
 // AQUARIUM 的「听完，继续」不再需要鼠标：真实识别到张掌即推进。
 jump('AQUARIUM');advance(60);
 eventsFeed=[{seq:11,data:{v:1,type:'GESTURE',gesture:'PALM',confidence:.95}}];
 advance(130);await flush();
 assert.equal(el('stage').dataset.scene,'END','a recognised palm must advance the story without clicking');
 // STILL→MOVING 状态切换同样是明确的推进信号。
 jump('AQUARIUM');advance(60);
 eventsFeed=[{seq:12,data:{v:1,type:'SILENCE_STATE',state:'STILL',still_ms:500,motion:.02}}];
 advance(130);await flush();
 eventsFeed=[{seq:13,data:{v:1,type:'SILENCE_STATE',state:'MOVING',still_ms:0,motion:.8}}];
 advance(130);await flush();
 assert.equal(el('stage').dataset.scene,'END','STILL→MOVING must also advance the story');
 // 深海：挥手 → HUD 显示 WAVE / 0.82 / MOVING；停下 → HOLD 逐秒上涨 → 鱼真的回来 → SILENCE_REACHED 点亮。
 jump('SEA');advance(600);await flush(); // 等场景防误触期结束，并让轮询挂起的微任务完成、重新排期
 eventsFeed=[{seq:14,data:{v:1,type:'GESTURE',gesture:'NONE',confidence:.9}},
            {seq:15,data:{v:1,type:'WAVE'}},
            {seq:16,data:{v:1,type:'SILENCE_STATE',state:'MOVING',still_ms:0,motion:.82}}];
 advance(130);await flush();advance(40); // 事件在微任务中消费，再渲染一帧刷新 HUD
 assert.equal(el('thHand').textContent,'TRACKED','HUD must show a tracked hand');
 assert.equal(el('thGesture').textContent,'WAVE','HUD must name the recognised gesture');
 assert.equal(el('thMotion').textContent,'0.82','HUD must show the live motion value');
 assert.equal(el('thState').textContent,'MOVING','HUD must show MOVING during the wave');
 const stillEvt=(seq,stillMs)=>({seq,data:{v:1,type:'SILENCE_STATE',state:'STILL',still_ms:stillMs,motion:.01}});
 for(let i=0;i<12;i++){eventsFeed=[stillEvt(17+i,600+i*150)];advance(200);await flush();}
 assert.equal(el('thState').textContent,'STILL','HUD must show STILL after the hand stops');
 assert(el('thHold').textContent.includes('s')&&!el('thHold').textContent.includes('—'),'HUD must count the hold upward');
 assert(el('goal').textContent.includes('鱼正在靠近'),'the fish must really come back while the hand is still');
 eventsFeed=[{seq:30,data:{v:1,type:'SILENCE_REACHED'}}];
 advance(130);await flush();advance(40); // 再渲染一帧刷新 HUD 事件行
 assert(el('thEvent').textContent.includes('SILENCE_REACHED'),'HUD must light up the silence event');
 assert(el('techHud').classList.contains('lit'),'HUD must glow on the event');
 key('t');
 assert(el('techHud').classList.contains('hidden'),'T key must close the tech HUD');
 // v0.9 错位修正验证：深海的「再次挥手验证」是搅水交互，绝不能推进剧情跳过轻捧；张掌才是推进信号。
 advance(6400);await flush(); // 越过 6.2s，「跳过轻捧，继续剧情」衔接出现
 eventsFeed=[{seq:31,data:{v:1,type:'WAVE'}}];
 advance(130);await flush();advance(40);
 assert.equal(el('stage').dataset.scene,'SEA','a verification wave in the deep sea must NOT advance the story');
 assert(el('goal').textContent.includes('水流又出现了'),'the wave must still stir the water as before');
 eventsFeed=[{seq:32,data:{v:1,type:'GESTURE',gesture:'PALM',confidence:.95}}];
 advance(130);await flush();
 advance(900);await flush(); // transition 530ms 后切场景
 assert.equal(el('stage').dataset.scene,'RETURN_WARD','a palm in the deep sea must still advance the story');
 console.log('PASS: v0.7 character arc (disguise -> inner sea -> facing himself) + v0.6 surprises + whole v0.5 story');
})().catch(e=>{console.error(e);process.exitCode=1});
