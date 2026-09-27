/* 《请勿喧哗》网页 v0.3：剧情/镜子首轮演出，遵照 B 的正式 camera_worker.py JSONL v1 协议。
   摄像头只由 Python 打开；本网页接收归一化的动作/连续状态。
   CUP 双手轻捧只提供 P1 简易效果，不影响剧情通关。 */
(() => {
'use strict';
const SCENES = ['CONSENT','CALIBRATE','WARD','SEA','RETURN_WARD','MIRROR','FINAL_DOOR','AQUARIUM','END'];
const $ = (id) => document.getElementById(id);
const el = Object.fromEntries(['stage','modeTag','inputTag','cover','startBtn','wardBg','oceanBg','oceanTint','fishLayer','specialFish','waterRipple','mirrorLayer','mirrorTech','windowThought','glassLayer','wardGesture','actionIcon','actionInfo','playerGesture','playerIcon','playerInfo','wardNote','noteText','wardTickets','nurseCue','gestureMode','reaching','goal','caption','captionChannel','dialogueBadge','storyHud','sceneVeil','nextBtn','accessibleBtn','musicBtn','pauseBtn','helpBtn','quitBtn','modal','modalTitle','modalBody','closeModal','sceneJump','disableHints'].map(k=>[k,$(k)]));
const SCENELABELS = {CONSENT:'权限与隐私',CALIBRATE:'校准',WARD:'病房',SEA:'深海',RETURN_WARD:'重返病房',MIRROR:'镜子',FINAL_DOOR:'最终回应',AQUARIUM:'水族馆',END:'结束'};
let lines = new Map();
let current = 'CONSENT', phase = '', timers = [], nextAction = null, modalOpen = false, sceneToken = 0;
let simMode = true, simStill = false, usedSimulation = false, visionConfigured = false;
let latestSeq = 0, cameraHealthy = false, lastStateAt = 0, lastHandAt = 0, handState = 'NO_HAND';
let currentPalm = {x:.50,y:.50};
let water = 0, proximity=.24, specialProximity=.1, seaEverWaved=false, gatheredOnce=false, wavedAgain=false, confirmedRepeat=false;
let seaStillMs = 0, finalHoldMs = 0, finalWaitAt = 0, now = performance.now();
let delayGuardUntil=0, hintsEnabled=true;
let currentGesture='NONE', wardPalmArmed=true, finalPalmArmed=true, returnPalmArmed=true, cupPoseActive=false;
let cupTouched=false, cupTouchUntil=0, fishInvitationUntil=0, lastWaveAt=0;
let audioCtx=null, soundOn=true, ambient=null;
function unlockAudio(){
 if(!soundOn)return;
 try{if(!audioCtx)audioCtx=new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume();}
 catch(e){console.info('Web Audio unavailable',e)}
}
function theme(kind){
 if(!soundOn)return;unlockAudio();if(!audioCtx)return;
 const full=kind!=='BROTHER_INCOMPLETE';
 const notes=[261.63,329.63,392.00,523.25];
 notes.forEach((freq,i)=>{
  if(i===3&&!full)return;
  const start=audioCtx.currentTime+.025+i*.36;
  const osc=audioCtx.createOscillator(),env=audioCtx.createGain();
  osc.type=kind==='SISTER_FULL'?'sine':'triangle';osc.frequency.setValueAtTime(freq,start);
  const duration=i===3?.82:.29,level=kind==='BROTHER_INCOMPLETE'?.033:.048;
  env.gain.setValueAtTime(.0001,start);env.gain.exponentialRampToValueAtTime(level,start+.04);
  env.gain.exponentialRampToValueAtTime(.0001,start+duration);
  osc.connect(env);env.connect(audioCtx.destination);osc.start(start);osc.stop(start+duration+.01);
 });
}
const trackByScene={WARD:'ward.mp3',SEA:'sea.mp3',RETURN_WARD:'ward.mp3',MIRROR:'mirror.mp3',FINAL_DOOR:'final.mp3',AQUARIUM:'aquarium.mp3'};
function ambientForScene(scene){
 if(ambient){ambient.pause();ambient=null;}
 const file=trackByScene[scene];if(!file||!soundOn)return;
 ambient=new Audio('assets/audio/'+file);ambient.loop=true;ambient.volume=.15;
 ambient.play().catch(()=>{}); // 缺少正式配乐属于合法占位
 ambient.onerror=()=>{if(ambient){ambient.pause();ambient=null;}};
}

// The existing story.json is authoritative. These IDs only determine presentation:
// a dialogue bubble is a visual interpretation of the characters' gestures,
// NOT a depiction or teaching example of Chinese Sign Language.
const sisterLines = new Map([
 ['H01',['✋','她先抬手，向你打招呼']],
 ['H02',['✋','她用动作回应了你']],
 ['H04',['👐','她先示意你不用着急']],
 ['W03',['🎟️','她主动邀请你一起出门']],
 ['R04',['🎟️','她把两张票推向你']],
 ['R05',['✋','她停下来，等你回答']],
 ['F01',['🫱','她先伸出手，然后继续表达']],
 ['F02',['🫶','她仍想用熟悉的方式和你交流']],
 ['END00',['🐟','她和你并肩望向鱼群']]
]);
const brief = (str)=>{el.inputTag.textContent=str;};
const setGoal=(s)=>{el.goal.textContent=s||'';};
function showSisterAction(icon,meaning){
 if(!['WARD','RETURN_WARD','FINAL_DOOR'].includes(current))return;
 show(el.wardGesture,true);el.actionIcon.textContent=icon;el.actionInfo.textContent=meaning;
}
function showPlayerGesture(icon,meaning){
 show(el.playerGesture,true);el.playerIcon.textContent=icon;el.playerInfo.textContent=meaning;
}
function setCaption(text,channel='',badge=''){
 el.captionChannel.textContent=channel;el.caption.textContent=text||'';
 el.storyHud.classList.remove('sister-dialogue','inner-dialogue','instruction-dialogue');
 show(el.dialogueBadge,Boolean(badge));el.dialogueBadge.textContent=badge;
 if(badge.startsWith('✋'))el.storyHud.classList.add('sister-dialogue');
 else if(channel.includes('哥'))el.storyHud.classList.add('inner-dialogue');
 else if(channel.includes('屏'))el.storyHud.classList.add('instruction-dialogue');
}
function say(id){
 const l=lines.get(id);
 if(!l){setCaption(`[待导入 ${id}]`,'占位');return;}
 const info=sisterLines.get(id);
 if(info){
  const channel='小满 · 动作的剧情释义';
  setCaption(l.text,channel,'✋ 她正在用手势和你交流');
  if(!['FINAL_DOOR','AQUARIUM'].includes(current))showSisterAction(...info);
 }else{
  setCaption(l.text,l.channel);
  if(['H03','R01','W04','R02','R03','BR01','M00','M01'].includes(id))show(el.wardGesture,false);
 }
}
const show=(elem,yes)=>{if(elem)elem.classList.toggle('hidden',!yes)};
function setNext(label,action){nextAction=action;show(el.nextBtn,Boolean(action));el.nextBtn.textContent=label||'继续';}
function clearLater(){timers.forEach(clearTimeout);timers=[];}
function later(ms,fn){const token=sceneToken;const f=()=>{if(token!==sceneToken)return;if(modalOpen){timers.push(setTimeout(f,130));return}fn();};timers.push(setTimeout(f,ms));}
function updateMode(){el.modeTag.textContent=(simMode?'【模拟输入】':'【真实识别】')+(usedSimulation&&!simMode?'（有辅助操作）':'');}
function sceneLook(){
 const ward=['WARD','RETURN_WARD','MIRROR','FINAL_DOOR'].includes(current),ocean=['SEA','AQUARIUM'].includes(current);
 el.wardBg.style.opacity=ward?'1':'0';el.oceanBg.style.opacity=ocean?'1':'0';
 el.oceanTint.style.opacity=current==='SEA'? String(.43 - proximity*.21):'0';
 el.fishLayer.style.opacity=ocean?'1':'0';
 el.mirrorLayer.style.opacity=current==='MIRROR'?'1':'0';
 el.mirrorLayer.classList.remove('trying-to-speak');
 el.glassLayer.style.opacity=current==='FINAL_DOOR'?'1':'0';
 el.stage.classList.remove('is-ward','is-mirror','is-final','is-bridge');
 if(current==='WARD'||current==='RETURN_WARD')el.stage.classList.add('is-ward');
 if(current==='MIRROR')el.stage.classList.add('is-mirror');
 if(current==='FINAL_DOOR')el.stage.classList.add('is-final');
 el.stage.dataset.scene=current;
 [el.reaching,el.wardGesture,el.playerGesture,el.wardNote,el.wardTickets,el.nurseCue,el.mirrorTech,el.windowThought].forEach(x=>show(x,false));
 el.wardGesture.classList.remove('sister-lowers');el.wardNote.classList.remove('crossed');
 show(el.gestureMode,['WARD','RETURN_WARD','FINAL_DOOR'].includes(current));
 el.gestureMode.innerHTML='✋ <b>无声交流</b><small>小满的动作将以剧情字幕释义</small>';
 el.wardBg.style.transform='';
}
function enterScene(id){
 if(!SCENES.includes(id)) return;
 sceneToken++;clearLater();current=id;phase='intro';modalOpen=false;show(el.modal,false);
 simStill=false;if(simMode)handState='NO_HAND';
 cupPoseActive=false;cupTouched=false;cupTouchUntil=0;fishInvitationUntil=0;
 if(id==='WARD')wardPalmArmed=currentGesture!=='PALM';
 if(id==='RETURN_WARD')returnPalmArmed=currentGesture!=='PALM';
 finalHoldMs=0;finalWaitAt=0;delayGuardUntil=Date.now()+420;
 setNext(null,null);setGoal('');setCaption('');sceneLook();ambientForScene(id);
 if(id==='CONSENT'){
  phase='consent';setCaption('游戏只读取动作事件，网页不直接打开摄像头。本地 Python 视觉程序仅在你同意后启动。','隐私与输入');
  setGoal('可使用真实摄像头，或选择辅助/模拟模式。');
  if(visionConfigured) setNext('同意并启动摄像头',async ()=>{
    const result=await fetch('/api/vision/start',{method:'POST'}).then(r=>r.json()).catch(e=>({ok:false,error:String(e)}));
    if(result.ok){latestSeq=Math.max(latestSeq,result.start_seq??0);simMode=false;updateMode();enterScene('CALIBRATE');
       if(result.camera_available===true)handleInput({type:'CAMERA_STATUS',healthy:true},'VISION');}
    else {setCaption('视觉程序启动失败，可进入模拟模式：'+(result.error||'未知错误'),'连接失败');}
  });
  else setNext('继续：无视觉模块（模拟）',()=>{simMode=true;updateMode();enterScene('CALIBRATE')});
  el.accessibleBtn.textContent='使用模拟输入继续';
 } else if(id==='CALIBRATE'){
  phase='calibrate';delayGuardUntil=0;setCaption('把一只手放在镜头中间，向镜头张开手掌。','床旁沟通屏');
  setGoal(simMode?'按 P 或下方模拟张掌按钮继续；这不是实时摄像头识别。':'请在摄像头前做出 PALM（张开手掌）。');
  el.accessibleBtn.textContent='使用辅助方式继续';
 } else if(id==='WARD') wardStart();
 else if(id==='SEA') seaStart();
 else if(id==='RETURN_WARD') returnWard();
 else if(id==='MIRROR') mirrorStart();
 else if(id==='FINAL_DOOR') finalStart();
 else if(id==='AQUARIUM') {
  phase='aquarium';water=.06;proximity=.95;specialProximity=.88;say('END00');setGoal('她和你并肩望着鱼群。');
  setNext('听完，继续',()=>enterScene('END'));
 } else if(id==='END'){
  phase='end';say('END01');setGoal('');later(2800,()=>say('END02'));
  setNext('重新体验',()=>enterScene('CONSENT'));
 }
}
function showWardNote(text,cross=false){
 el.noteText.textContent=text;el.wardNote.classList.remove('crossed');show(el.wardNote,true);
 if(cross)later(450,()=>el.wardNote.classList.add('crossed'));
}
function wardStart(){
 phase='ward_intro';say('W01');showWardNote('今天也要照顾好她。');setGoal('');
 later(1800,()=>{
  say('H01');theme('SISTER_FULL');
  // A separate moving actor graphic indicates whose hands are communicating.
  showSisterAction('✋','她先向你做出问候动作');
 });
 later(3700,()=>{
  say('W02');phase='ward_wait_palm';
  setGoal(wardPalmArmed?'她已经向你打招呼，轮到你回应。':'先放松手，再张掌回应她。');
  showPlayerGesture('✋','把张开的手掌放进镜头');
  delayGuardUntil=Date.now()+550;
 });
}
function wardPalmDone(){
 if(phase!=='ward_wait_palm')return;
 phase='ward_after_palm';show(el.playerGesture,false);show(el.wardNote,false);
 setCaption('','');setGoal('你的动作已经传达过去了。');
 later(540,()=>say('H02'));
 later(1760,()=>{
  phase='ward_optional_good';setGoal('可选：竖大拇指，给小满一个鼓励；也可以直接继续。');
  show(el.wardGesture,false);showPlayerGesture('👍','你想告诉她：放心，我在');
  setNext('跳过鼓励，继续',wardEnding);delayGuardUntil=Date.now()+550;
  later(6500,()=>{if(phase==='ward_optional_good')wardEnding()});
 });
}
function wardEnding(){
 if(phase!=='ward_optional_good')return;
 phase='ward_ending';setNext(null,null);show(el.wardGesture,false);show(el.playerGesture,false);setGoal('');
 say('H03');theme('BROTHER_INCOMPLETE');
 el.mirrorLayer.style.opacity='.14';
 later(2300,()=>{el.mirrorLayer.style.opacity='0';say('H04')});
 later(4500,()=>{say('W03');show(el.wardTickets,true);theme('SISTER_FULL')});
 later(8000,()=>transition('SEA'));
}
function seaStart(){
 phase='sea_play';proximity=.27;specialProximity=.14;seaEverWaved=false;gatheredOnce=false;wavedAgain=false;confirmedRepeat=false;seaStillMs=0;water=.09;cupTouched=false;fishInvitationUntil=0;lastWaveAt=0;
 say('S01');setGoal('试着靠近那条小鱼。');setNext(null,null);
 later(12000,()=>{if(phase==='sea_play'&&!gatheredOnce&&hintsEnabled) say('S02')});
 el.accessibleBtn.textContent='辅助操作';
}
function seaGathered(){
 if(!gatheredOnce){gatheredOnce=true;fishInvitationUntil=Date.now()+3500;say('SEA01');setGoal('你可以重新挥手，看看它是否还会回来。');
  later(2700,()=>{if(current==='SEA'&&gatheredOnce)say('S03')});
  later(5600,()=>{if(current==='SEA'&&gatheredOnce) setNext('继续剧情',()=>transition('RETURN_WARD'))});
 } else if(wavedAgain&&!confirmedRepeat){confirmedRepeat=true;setGoal('你重新试过了：它真的会回应你的等待。');}
}
function returnWard(){
 phase='return_lines';const queue=['R01','W04','R02','R03','R04','R05'];let ix=0;
 function advance(){
  if(current!=='RETURN_WARD'||phase==='return_bridge')return;
  if(ix>=queue.length){startMirrorBridge();return;}
  const id=queue[ix++];say(id);
  if(id==='R01'){
    showWardNote('等她出院……');setGoal('');
  }else if(id==='W04'){
    showWardNote('如果她不再需要我呢？',true);
    setGoal('一句念头浮上来，他立刻想把它划掉。');
  }else if(id==='R02'){
    showWardNote('我得帮她准备好。');setGoal('');
  }else if(id==='R03'){
    show(el.wardNote,false);show(el.nurseCue,true);
    setGoal('她似乎对视线之外的动静先有了反应。');
  }else if(id==='R04'){
    show(el.nurseCue,false);show(el.wardTickets,true);
    setGoal('这次是小满主动把两张票推过来。');
  }else if(id==='R05'){
    phase='return_reply';setGoal('小满在等你的回应。可张掌回应，也可以直接继续。');
    showPlayerGesture('✋','回应她的邀请（非强制）');
    delayGuardUntil=Date.now()+450;
    setNext('继续（可不使用手势）',startMirrorBridge);return;
  }
  if(id==='W04'){
    // The erased thought must be SEEN, not narrated away by an immediate click.
    setNext(null,null);
    later(1100,()=>setNext('继续',advance));
  }else setNext('继续',advance);
 }
 advance();el.accessibleBtn.textContent='辅助继续';
}
function startMirrorBridge(){
 if(current!=='RETURN_WARD'||phase==='return_bridge')return;
 phase='return_bridge';setNext(null,null);setGoal('');show(el.playerGesture,false);
 show(el.wardGesture,false);show(el.wardTickets,false);show(el.nurseCue,false);
 say('BR01');el.stage.classList.add('is-bridge');
 el.mirrorLayer.style.opacity='.22';
 later(1850,()=>{
  setCaption('','');el.windowThought.textContent='如果她不再需要我呢？';show(el.windowThought,true);
  later(1450,()=>transition('MIRROR'));
 });
}
function mirrorStart(){
 phase='mirror_intro';show(el.mirrorTech,false);show(el.gestureMode,false);
 say('M00');setGoal('窗上的倒影里，第一次只剩下你自己。');
 setNext('看清自己的倒影',()=>{
  if(current!=='MIRROR'||phase!=='mirror_intro')return;
  phase='mirror_observe';say('M01');setGoal('');setNext(null,null);
  el.mirrorLayer.classList.add('trying-to-speak');
  later(850,()=>{el.windowThought.textContent='如果她不再需要我呢？';show(el.windowThought,true)});
  later(2800,()=>{
   show(el.windowThought,false);el.mirrorLayer.classList.remove('trying-to-speak');
   phase='mirror_ready';setNext('转身看向小满',mirrorToFinal);
  });
 });
 el.accessibleBtn.textContent='跳过镜像演出';
}
function mirrorToFinal(){
 if(current!=='MIRROR'||phase==='transition'||phase==='mirror_turn')return;
 phase='mirror_turn';setNext(null,null);setCaption('','');setGoal('倒影渐淡，小满还在病床旁等你。');
 el.mirrorLayer.style.opacity='0';
 later(1300,()=>transition('FINAL_DOOR'));
}
function finalStart(){
 phase='final_old_gesture';say('F00');setGoal('你仍然想用熟悉的动作做点什么。');
 water=.04;show(el.reaching,false);
 later(3000,()=>{
  phase='final_wait';finalHoldMs=0;finalWaitAt=Date.now();
  say('F0A');setGoal('');el.glassLayer.style.opacity='1';
  showSisterAction('🙌','她先慢慢放下双手，抬头看着你。');
  el.wardGesture.classList.add('sister-lowers');
  el.gestureMode.innerHTML='✋ <b>她停下了手势</b><small>她没有催促你继续做动作</small>';
  later(15000,()=>{if(phase==='final_wait')say('F0B')});
 });
 el.accessibleBtn.textContent='辅助操作';
}
function finalSisterReaches(){
 if(phase!=='final_wait')return;
 phase='final_reach';show(el.wardGesture,false);show(el.reaching,true);setGoal('');setCaption('','');
 later(1350,()=>{el.glassLayer.style.opacity='0';});
 later(2600,()=>{
  show(el.reaching,true);say('F01');phase='final_dialog_0';
  const ids=['F10','F02','F12'];let i=0;
  function advance(){if(current!=='FINAL_DOOR')return;
   if(i<ids.length){const id=ids[i++];say(id);if(id==='F12'){
       phase='final_reply';finalPalmArmed=currentGesture!=='PALM';setGoal(finalPalmArmed?'张开手掌，回应她。':'先放松手，再次张掌回应她。');setNext(null,null);delayGuardUntil=Date.now()+400;
     } else setNext('继续',advance);
   }
  }
  setNext('继续',advance);
 });
}
function finishFinal(){
 if(phase!=='final_reply')return;
 phase='final_complete';theme('BROTHER_COMPLETE');setGoal('你终于给出了自己的回应。');
 setCaption('她等到了你的回答。','哥·心声');
 later(2900,()=>transition('AQUARIUM'));
}
function transition(to){
 if(phase==='transition')return;
 phase='transition';setNext(null,null);setGoal('');
 // A genuine visual crossfade replaces the old no-op el.stage?.classList.add.
 el.sceneVeil.classList.add('visible');
 const token=sceneToken;
 later(530,()=>{
  if(token!==sceneToken)return;
  enterScene(to);
  setTimeout(()=>el.sceneVeil.classList.remove('visible'),90);
 });
}
function validStill(){
 if(modalOpen)return false;
 if(simMode)return simStill;
 return cameraHealthy && handState==='STILL' && Date.now()-lastStateAt<900 && lastStateAt>=finalWaitAt;
}
function resetVisualState(reason=''){
 cameraHealthy=false;handState='NO_HAND';currentGesture='NONE';cupPoseActive=false;
 lastStateAt=0;lastHandAt=0;seaStillMs=0;finalHoldMs=0;cupTouchUntil=0;fishInvitationUntil=0;
 if(reason)brief(reason);
}
function cupTouch(){
 if(cupTouched || !gatheredOnce || Date.now()>=fishInvitationUntil || Date.now()-lastWaveAt<950)return;
 cupTouched=true;cupTouchUntil=Date.now()+2800;
 setGoal('它主动游进你捧起的双手，又轻轻游了出去。');
 // 正式小鱼动画替换 specialFish 的 DOM 图层即可；此处不增加主线依赖。
}
function handleInput(raw, source='VISION'){
 if(!raw)return;
 let typ=raw.type;
 // 视觉健康和坐标即使在暂停期间也需要接收，防止重用失效状态。
 if(typ==='CAMERA_STATUS'){
   cameraHealthy=!!raw.healthy;
   if(!cameraHealthy)resetVisualState('摄像头暂不可用，请检查识别程序；可使用辅助模式');
   else brief('摄像头已就绪，等待手势输入');
   return;
 }
 if(typ==='PALM_COORDS'){
   currentPalm.x=raw.x;currentPalm.y=raw.y;lastHandAt=Date.now();return;
 }
 if(typ==='GESTURE_LABEL'){
   currentGesture=raw.gesture;
   if(raw.gesture!=='PALM'){wardPalmArmed=true;returnPalmArmed=true;finalPalmArmed=true;}
   if(raw.gesture==='PALM' && !modalOpen){
     if(current==='CALIBRATE' || (current==='WARD'&&phase==='ward_wait_palm'&&wardPalmArmed)
        ||(current==='RETURN_WARD'&&phase==='return_reply'&&returnPalmArmed)
        ||(current==='FINAL_DOOR'&&phase==='final_reply'&&finalPalmArmed)){
       handleInput({type:'PALM'},source);
     }
   }else if(raw.gesture==='GOOD' && !modalOpen)handleInput({type:'GOOD'},source);
   return;
 }
 if(typ==='SILENCE_STATE'){
   handState=raw.state;lastStateAt=Date.now();
   if(!simMode && cameraHealthy)brief(raw.state==='NO_HAND'?'摄像头正常：请将手放入画面':
      raw.state==='STILL'?'正在检测静止 '+raw.still_ms+'ms':'已检测到手部移动');
   if(raw.state==='NO_HAND'){
     lastHandAt=0;seaStillMs=0;finalHoldMs=0;cupPoseActive=false;
     currentGesture='NONE';wardPalmArmed=true;returnPalmArmed=true;finalPalmArmed=true;
   }
   return;
 }
 if(typ==='CUP_EXIT'){cupPoseActive=false;return;}
 if(typ==='CUP'){cupPoseActive=true;}
 if(typ==='SILENCE_REACHED')return; // 终局从进入等待阶段后重新累计连续有效 STILL。
 if(modalOpen || current==='CONSENT'||phase==='transition')return;
 if(Date.now()<delayGuardUntil)return;
 if(current==='CALIBRATE'&&typ==='PALM'){
   if(!simMode && !cameraHealthy)return;
   enterScene('WARD');return;
 }
 if(current==='WARD'){
   if(phase==='ward_wait_palm'&&typ==='PALM'&&(source!=='VISION'||wardPalmArmed)){
      wardPalmArmed=false;wardPalmDone();return;
   }
   if(phase==='ward_optional_good'&&typ==='GOOD'){
     phase='ward_good_seen';setNext(null,null);show(el.wardGesture,false);
     show(el.playerGesture,false);showWardNote('这样，她就能安心了吧。');
     setCaption('这样，她就能安心了吧。','哥·便签（开场可选鼓励）');theme('BROTHER_INCOMPLETE');
     later(1550,()=>{phase='ward_optional_good';wardEnding()});return;
   }
 }
 if(current==='RETURN_WARD'&&phase==='return_reply'&&typ==='PALM'
     &&(source!=='VISION'||returnPalmArmed)){
   returnPalmArmed=false;startMirrorBridge();return;
 }
 if(current==='SEA'&&phase==='sea_play'){
   if(typ==='WAVE'){
     seaEverWaved=true;lastWaveAt=Date.now();fishInvitationUntil=0;
     water=1;seaStillMs=0;proximity=Math.min(proximity,.28);specialProximity=Math.min(specialProximity,.15);
     if(gatheredOnce){wavedAgain=true;setGoal('水流又出现了，小鱼再次退开。')}
     else setGoal('水流被你搅动了，小鱼避开了。');
   }
   if(typ==='CUP'){
     if(gatheredOnce&&Date.now()<fishInvitationUntil){cupTouch()}
     else if(gatheredOnce)setGoal('先让水流平静，等它愿意靠近，再轻轻捧起双手。');
   }
 }
 if(current==='FINAL_DOOR'&&phase==='final_reply'&&typ==='PALM'
      &&(source!=='VISION'||finalPalmArmed)){
   finalPalmArmed=false;finishFinal();
 }
 if(current==='FINAL_DOOR'&&phase==='final_old_gesture'&&['PALM','GOOD','WAVE'].includes(typ)){
   setGoal('动作被识别了，玻璃却没有因此改变。');
 }
}
function simInput(typ){
 usedSimulation=true; if(!simMode)brief('已使用辅助/模拟输入，本次测试不能算纯真实识别'); updateMode();
 if(typ==='STILL'){simStill=!simStill;handState=simStill?'STILL':'MOVING';lastStateAt=Date.now();if(!simStill){seaStillMs=0;finalHoldMs=0;}return}
 if(typ==='NO_HAND'){simStill=false;handState='NO_HAND';lastStateAt=Date.now();seaStillMs=0;finalHoldMs=0;return}
 if(typ==='MOVING'){simStill=false;handState='MOVING';lastStateAt=Date.now();seaStillMs=0;finalHoldMs=0;return}
 if(typ==='WAVE'){simStill=false;handState='MOVING';lastStateAt=Date.now();}
 if(typ==='PALM'||typ==='GOOD'||typ==='CUP'){simStill=false;handState='MOVING';lastStateAt=Date.now();}
 handleInput({type:typ},'SIM');
}
let previous=performance.now();
function frame(t){
 let dt=Math.min(45,Math.max(0,t-previous));previous=t;
 if(!modalOpen){
   // B 的 GESTURE 仅在类别变化时发送；若变化恰好落入场景防误触期，
   // 再结合新鲜 PALM 坐标补发，不必让玩家碰运气重复手势。
   if(!simMode && cameraHealthy && currentGesture==='PALM' && Date.now()-lastHandAt<700
       && Date.now()>=delayGuardUntil){
     if(current==='CALIBRATE' || (current==='WARD'&&phase==='ward_wait_palm'&&wardPalmArmed)
         || (current==='RETURN_WARD'&&phase==='return_reply'&&returnPalmArmed)
        || (current==='FINAL_DOOR'&&phase==='final_reply'&&finalPalmArmed)) {
       handleInput({type:'PALM'},'VISION');
     }
   }
   if(!simMode && cameraHealthy && currentGesture==='GOOD' && Date.now()-lastHandAt<700
      && current==='WARD' && phase==='ward_optional_good' && Date.now()>=delayGuardUntil){
       handleInput({type:'GOOD'},'VISION');
   }
   const fresh = simMode ? (handState!=='NO_HAND' || simStill) : cameraHealthy && Date.now()-lastStateAt<900;
   const still = fresh && handState==='STILL' && (simMode?simStill:true);
   if(current==='SEA'){
     if(!simMode && Date.now()-lastStateAt>1000){handState='NO_HAND';seaStillMs=0;}
     if(seaEverWaved && fresh && still && Date.now()>cupTouchUntil){
       seaStillMs+=dt;water+=(0-water)*Math.min(1,dt/550);
       const target=seaStillMs>2000?1:seaStillMs>500? .45 + (seaStillMs-500)/1500*.5 : .15;
       proximity+=(target-proximity)*Math.min(1,dt/650);
       specialProximity+=((seaStillMs>700?proximity*.98:.09)-specialProximity)*Math.min(1,dt/1050);
       if(!gatheredOnce && seaStillMs>2100 && proximity>.67)seaGathered();
       if(gatheredOnce && wavedAgain && !confirmedRepeat && seaStillMs>2050 && proximity>.64)seaGathered();
     } else if(Date.now()<cupTouchUntil){
       water+=(.02-water)*Math.min(1,dt/550);proximity+=(.86-proximity)*Math.min(1,dt/550);
       specialProximity+=(1-specialProximity)*Math.min(1,dt/350);
     } else if(seaEverWaved && fresh && handState==='MOVING'){
       seaStillMs=0;water+=(1-water)*Math.min(1,dt/260);
       proximity+=(.02-proximity)*Math.min(1,dt/330);
       specialProximity+=(.03-specialProximity)*Math.min(1,dt/390);
     } else {water+=((!seaEverWaved && fresh && handState==='MOVING'?.5:.05)-water)*Math.min(1,dt/900);}
     if(gatheredOnce && proximity>.73 && Date.now()-lastWaveAt>950){fishInvitationUntil=Date.now()+3300;}
     if(cupPoseActive && !cupTouched && gatheredOnce)cupTouch();
     el.oceanTint.style.opacity=String(.43 - proximity*.21);
     let wave=Math.sin(t/710)*4;
     document.querySelector('.school.left').style.transform=`translate(${(1-proximity)*-280}px,${wave}px)`;
     document.querySelector('.school.right').style.transform=`scaleX(-1) translate(${(1-proximity)*-280}px,${wave*-1}px)`;
     el.specialFish.style.left=Date.now()<cupTouchUntil ? (27 + currentPalm.x*46)+'%' : '45%';
     el.specialFish.style.top=Date.now()<cupTouchUntil ? (28+currentPalm.y*44)+'%' : '51%';
     el.specialFish.style.transform=`translate(${(1-specialProximity)*140}px,${wave*1.4}px) scale(${.83+.18*specialProximity})`;
     el.waterRipple.style.opacity=String(water*.67);
     el.waterRipple.style.left=(currentPalm.x*70+15)+'%';el.waterRipple.style.top=(currentPalm.y*48+25)+'%';
   } else if(current==='FINAL_DOOR'&&phase==='final_wait'){
      // 本场景重新累计，模拟亦必须手动按 S；真实模式只统计场景开启后的新鲜状态。
      if(still && (simMode?lastStateAt>=finalWaitAt:(lastStateAt>=finalWaitAt))){
        finalHoldMs+=dt;
        if(finalHoldMs>=2000)finalSisterReaches();
      } else finalHoldMs=0;
   }
 }
 requestAnimationFrame(frame);
}
async function poll(){
 try{
 const r=await fetch('/api/events?since='+latestSeq,{cache:'no-store'}).then(r=>r.json());
 visionConfigured=r.vision_configured;
 if(!simMode){
       if(!r.worker_active || !r.stream_fresh){
         resetVisualState(r.worker_error ? ('视觉程序错误：'+r.worker_error).slice(0,150)
           : '识别流中断，请检查 B 的程序或切换辅助操作');
       }
       if(r.worker_active && r.stream_fresh){
         for(const e of r.events){
           if(e.seq>latestSeq){for(const normalized of VisionProtocol.normalize(e.data))handleInput(normalized,'VISION');}
         }
       } }
 latestSeq=r.latest_seq;
 }catch(err){if(!simMode)brief('本地桥接连接失败：'+String(err).slice(0,60));}
 setTimeout(poll,85);
}
function openModal(kind){
 modalOpen=true;seaStillMs=0;finalHoldMs=0;
 el.modalTitle.textContent=kind==='help'?'操作帮助':'暂停';
 el.modalBody.textContent=kind==='help'
 ?'本作使用游戏自定义交流动作，并非正式手语教学。小满的手势有独立动态图示和「手势交流 · 剧情释义」字幕；哥哥的内心文字、环境碎片及系统提示采用不同样式。张掌回应、竖大拇指鼓励；挥手搅动水流。深海卡住时可让水面平静。真实静止要求手留在画面内，摄像头丢失不会算静止。镜像目前只有预制演出，未采集或分析面部动作，可跳过；捧鱼可选。静音仍保留全部剧情字幕。'
 :'游戏已暂停。所有剧情等待计时都在暂停时冻结；可以继续或退出。';
 show(el.modal,true);
}
function closeModal(){modalOpen=false;show(el.modal,false);seaStillMs=0;finalHoldMs=0;delayGuardUntil=Date.now()+300;
 if(current==='FINAL_DOOR'&&phase==='final_wait')finalWaitAt=Date.now();}
function accessibility(){
 usedSimulation=true;updateMode();
 if(current==='CONSENT'){simMode=true;updateMode();enterScene('CALIBRATE');return}
 if(current==='CALIBRATE'){enterScene('WARD');return}
 if(current==='WARD'&&phase==='ward_wait_palm'){wardPalmDone();return}
 if(current==='WARD'&&phase==='ward_optional_good'){wardEnding();return}
 if(current==='RETURN_WARD'&&phase==='return_reply'){startMirrorBridge();return}
 if(current==='SEA'&&phase==='sea_play'){
   if(!seaEverWaved){handleInput({type:'WAVE'},'ACCESSIBLE');return}
   simStill=true;lastStateAt=Date.now();handState='STILL';simMode=true;updateMode();
   brief('辅助静止已启动，可再次按 W 模拟反复验证');return;
 }
 if(current==='MIRROR'){if(phase==='mirror_turn')return;mirrorToFinal();return}
 if(current==='FINAL_DOOR'&&phase==='final_wait'){
   simStill=true;lastStateAt=Date.now();handState='STILL';simMode=true;updateMode();brief('辅助静止已启动');return;
 }
 if(current==='FINAL_DOOR'&&phase==='final_reply'){finishFinal();return}
 if(nextAction)nextAction();
}
function quit(){
 clearLater();sceneToken++;modalOpen=false;show(el.modal,false);show(el.cover,true);
 fetch('/api/vision/stop',{method:'POST'}).catch(()=>{});
 simStill=false;resetVisualState();simMode=true;updateMode();setNext(null,null);
}
async function boot(){
 try{
  const r=await fetch('content/story.json',{cache:'no-store'}).then(r=>r.json());
  lines=new Map(r.lines.map(o=>[o.id,o]));
  // Additive direction-only line; C's original story.json remains byte-for-byte unchanged.
  try{const extra=await fetch('content/round1_additions.json',{cache:'no-store'}).then(x=>x.json());
   for(const item of extra.lines||[])if(!lines.has(item.id))lines.set(item.id,item);
  }catch(err){console.warn('Optional round1 dialogue unavailable',err)}
  for(const scene of r.sceneOrder){const op=document.createElement('option');op.value=scene;op.textContent=SCENELABELS[scene];el.sceneJump.appendChild(op)}
 }catch(e){setCaption('无法加载 story.json：'+e,'启动错误');}
 try{const inf=await fetch('/api/info').then(r=>r.json());visionConfigured=inf.mode==='VISION_AVAILABLE';}
 catch(e){visionConfigured=false}
 updateMode();
 el.startBtn.onclick=()=>{unlockAudio();show(el.cover,false);enterScene('CONSENT')};
 el.musicBtn.onclick=()=>{soundOn=!soundOn;el.musicBtn.textContent='声音：'+(soundOn?'开':'关');if(!soundOn&&ambient){ambient.pause();ambient=null;}else if(soundOn){unlockAudio();ambientForScene(current)}};
 el.nextBtn.onclick=()=>{if(!modalOpen && nextAction){const f=nextAction;f()}};
 el.accessibleBtn.onclick=()=>accessibility();
 el.pauseBtn.onclick=()=>openModal('pause');el.helpBtn.onclick=()=>openModal('help');
 el.closeModal.onclick=()=>closeModal();el.quitBtn.onclick=()=>quit();
 document.querySelectorAll('#debug [data-input]').forEach(b=>b.onclick=()=>simInput(b.dataset.input));
 document.onkeydown=(event)=>{
  if(event.target.tagName==='SELECT'||modalOpen)return;
  const keys={p:'PALM',g:'GOOD',w:'WAVE',m:'MOVING',s:'STILL',n:'NO_HAND',c:'CUP'};
  if(keys[event.key.toLowerCase()]&&current!=='CONSENT'){simInput(keys[event.key.toLowerCase()]);}
 };
 el.disableHints.onchange=()=>{hintsEnabled=!el.disableHints.checked};
 window.addEventListener('pagehide',()=>{if(!simMode)navigator.sendBeacon('/api/vision/stop','');});
 el.sceneJump.onchange=()=>{if(el.sceneJump.value){usedSimulation=true;updateMode();show(el.cover,false);enterScene(el.sceneJump.value)}el.sceneJump.value=''};
 poll();requestAnimationFrame(frame);
}
boot();
})();
