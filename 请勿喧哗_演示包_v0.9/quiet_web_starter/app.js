/* 《请勿喧哗》v0.5：剧情信息前置、窗户倒影衔接、深海演示增强。
   尊重 B 的 camera_worker.py JSONL v1 协议，不改变识别代码。
   原 story.json 保留；只通过增量对白文件添加剧情。 */
(() => {
'use strict';
const SCENES = ['CONSENT','CALIBRATE','WARD','SEA','RETURN_WARD','MIRROR','FINAL_DOOR','AQUARIUM','END'];
const $ = (id) => document.getElementById(id);
const el = Object.fromEntries(['stage','modeTag','inputTag','cover','startBtn','wardBg','oceanBg','oceanTint','fishLayer','specialFish','fishHalo','waterRipple','mirrorLayer','mirrorTech','windowThought','glassLayer','wardGesture','actionIcon','actionInfo','playerGesture','playerIcon','playerInfo','wardNote','noteText','wardTickets','nurseCue','gestureMode','reaching','goal','caption','captionChannel','dialogueBadge','storyHud','sceneVeil','nextBtn','accessibleBtn','musicBtn','pauseBtn','helpBtn','quitBtn','testBtn','debug','modal','modalTitle','modalBody','closeModal','sceneJump','disableHints','fishAssistBtn','cupPrompt','sisterGreetingAsset','sisterReachAsset','nurseAsset','handShadow','endingArt','techHud','thHand','thGesture','thMotion','thState','thHold','thEvent','endingLine','endingTitle'].map(k=>[k,$(k)]));
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
// Cup is a bonus scene, never a main-story lock. Visual worker and its thresholds stay untouched.
let cupSeenUntil=0, cupProtectionUntil=0, waitingForStillAfterWave=false;
let fishApproachMode='idle', fishApproachProgress=0, fishHoldUntil=0;
let fishTargetX=50, fishTargetY=62, gatheredAt=0;
let calmArmed=false, quietMs=0, finalNoHandMs=0; // v0.6：开场安静教学与终局「放下手」隐藏回应
// v0.9 技术透视模式：T 键开关；实时显示识别状态，证明交互全部来自摄像头。
let techHudOn=false, latestMotion=null, lastStillMs=0, lastMotionState='', techEventAt=0, lastPalmX=.5, lastPalmY=.5, waveSeenAt=0;
const artReady={greeting:false,reach:false,nurse:false,ending:false};
const USE_SYNTH_MOTIF=false; // 正式治愈系 BGM 不强制套用旧的四音试听。
let audioCtx=null, soundOn=true, ambient=null;
function unlockAudio(){
 if(!soundOn)return;
 try{if(!audioCtx)audioCtx=new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume();}
 catch(e){console.info('Web Audio unavailable',e)}
}
function theme(kind){
 if(!USE_SYNTH_MOTIF || !soundOn)return;unlockAudio();if(!audioCtx)return;
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
// v0.8：病房（WARD/RETURN_WARD）播放 bgm1.mp3，深海（SEA）播放 bgm2.mp3；其余仍为占位插槽。
const trackByScene={WARD:'bgm1.mp3',RETURN_WARD:'bgm1.mp3',SEA:'bgm2.mp3',MIRROR:'mirror.mp3',FINAL_DOOR:'final.mp3',AQUARIUM:'aquarium.mp3'};
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
 ['F11',['🤲','她在等待你的回应']],
 ['END00',['🐟','她和你并肩望向鱼群']]
]);
const brief = (str)=>{el.inputTag.textContent=str;};
const setGoal=(s)=>{el.goal.textContent=s||'';};
function showSisterAction(icon,meaning){
 if(!['WARD','RETURN_WARD','FINAL_DOOR'].includes(current))return;
 show(el.wardGesture,true);el.actionIcon.textContent=icon;el.actionInfo.textContent=meaning;
 // 素材未交付时：保留可见、可用的原动态手势卡；有素材后自动叠加局部手势特写。
 show(el.sisterGreetingAsset,current==='WARD' && artReady.greeting && ['ward_intro','ward_wait_palm'].includes(phase));
}
function setupOptionalArt(){
 if(typeof Image==='undefined')return;
 const defs=[
  ['greeting','sisterGreetingAsset','assets/ui/sister_greeting.png'],
  ['reach','sisterReachAsset','assets/ui/sister_reach.png'],
  ['nurse','nurseAsset','assets/ui/nurse_silhouette.png'],
  ['ending','endingArt','assets/结尾图.png'] // v0.8：结尾画面；素材缺席时保持纯字幕结尾。
 ];
 defs.forEach(([kind,id,src])=>{
  const probe=new Image();
  probe.onload=()=>{artReady[kind]=true;el[id].src=src;};
  probe.onerror=()=>{artReady[kind]=false;show(el[id],false)};
  probe.src=src;
 });
 // 可选美术材质；无文件时现有 CSS 组件就是完整的降级展示。
 [['wardGesture','assets/ui/bedside_panel.png'],['wardNote','assets/ui/note_texture.png']].forEach(([id,src])=>{
  const probe=new Image();probe.onload=()=>{el[id].style.backgroundImage=`url('${src}')`};probe.src=src;
 });
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
 else if(channel.includes('屏')||channel.includes('境'))el.storyHud.classList.add('instruction-dialogue');
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
// v0.8：测试面板收进右上角按钮。默认界面干净；开启后模拟模式启动，下方测试按钮栏与右侧辅助按钮才出现。
let testPanelOpen=false, forcedSim=false;
function updateTestUI(){
 show(el.debug,testPanelOpen);
 show(el.accessibleBtn,testPanelOpen||usedSimulation);
 el.testBtn.classList.toggle('on',testPanelOpen);
 el.testBtn.textContent=testPanelOpen?'测试模式：开':'测试模式';
}
// v0.9：真实识别模式下，剧情衔接不再依赖鼠标点「继续」——
// 识别到一次明确的手势变化（挥手/张掌/竖拇指，或 STILL→MOVING 状态切换）即推进一格。
function tryGestureAdvance(){
 if(simMode || !cameraHealthy || !nextAction || current==='END' || modalOpen || phase==='transition')return false;
 const f=nextAction; nextAction=null; setNext(null,null); f(); return true;
}
function toggleTechHud(){
 techHudOn=!techHudOn; show(el.techHud,techHudOn);
 if(!techHudOn)el.techHud.classList.remove('lit');
}
function updateTechHud(dt){
 if(!techHudOn)return;
 el.thHand.textContent=cameraHealthy&&handState!=='NO_HAND'?'TRACKED':'—';
 el.thGesture.textContent=(()=>{const g=(currentGesture==='NONE'||!currentGesture)?'—':currentGesture;
  if(g==='—'&&Date.now()-waveSeenAt<2500)return 'WAVE';return g;})();
 let motion=null;
 if(Number.isFinite(latestMotion))motion=latestMotion;
 else if(cameraHealthy&&Date.now()-lastHandAt<750&&dt>0){
   motion=Math.min(1,Math.hypot(currentPalm.x-lastPalmX,currentPalm.y-lastPalmY)/dt*1000/.45);
 }
 el.thMotion.textContent=motion===null?'—':motion.toFixed(2);
 el.thState.textContent=handState;
 const holdMs=handState==='STILL'?(Number.isFinite(lastStillMs)&&lastStillMs>0?lastStillMs:seaStillMs):0;
 el.thHold.textContent=holdMs>0?(holdMs/1000).toFixed(1)+'s':'—';
 if(Date.now()-techEventAt<4000){el.thEvent.textContent='SILENCE_REACHED ✓';el.techHud.classList.add('lit');}
 else {el.thEvent.textContent='—';el.techHud.classList.remove('lit');}
 lastPalmX=currentPalm.x;lastPalmY=currentPalm.y;
}
function sceneLook(){
 const ward=['WARD','RETURN_WARD','MIRROR','FINAL_DOOR'].includes(current),ocean=['SEA','AQUARIUM','END'].includes(current);
 el.wardBg.style.opacity=ward?'1':'0';el.oceanBg.style.opacity=ocean?'1':'0';
 el.oceanTint.style.opacity=current==='SEA'? String(.64 - proximity*.43):'0';
 el.fishLayer.style.opacity=(ocean&&current!=='END')?'1':'0';
 el.mirrorLayer.style.opacity=current==='MIRROR'?'1':'0';
 el.mirrorLayer.classList.remove('trying-to-speak');
 el.glassLayer.style.opacity=current==='FINAL_DOOR'?'1':'0';
 el.stage.classList.remove('is-ward','is-mirror','is-final','is-bridge');
 if(current==='WARD'||current==='RETURN_WARD')el.stage.classList.add('is-ward');
 if(current==='MIRROR')el.stage.classList.add('is-mirror');
 if(current==='FINAL_DOOR')el.stage.classList.add('is-final');
 el.stage.dataset.scene=current;
 [el.reaching,el.wardGesture,el.playerGesture,el.wardNote,el.wardTickets,el.nurseCue,el.mirrorTech,el.windowThought,el.sisterGreetingAsset,el.sisterReachAsset,el.nurseAsset].forEach(x=>show(x,false));
 el.stage.classList.remove('turbulent','calm');
 show(el.handShadow,false);el.handShadow.style.opacity='0';el.handShadow.classList.remove('focused');
 el.endingArt.classList.remove('visible');show(el.endingArt,false);
 [el.endingLine,el.endingTitle].forEach(x=>{x.classList.remove('visible');show(x,false);});
 el.wardGesture.style.transform='';
 if(!['SEA','CALIBRATE'].includes(current))el.waterRipple.style.opacity='0';
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
 cupSeenUntil=0;cupProtectionUntil=0;waitingForStillAfterWave=false;
 fishApproachMode='idle';fishApproachProgress=0;gatheredAt=0;el.fishHalo.style.opacity='0';show(el.fishAssistBtn,false);show(el.cupPrompt,false);
 if(id==='WARD')wardPalmArmed=currentGesture!=='PALM';
 if(id==='RETURN_WARD')returnPalmArmed=currentGesture!=='PALM';
 finalHoldMs=0;finalNoHandMs=0;finalWaitAt=0;delayGuardUntil=Date.now()+420;
 calmArmed=false;quietMs=0;
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
  else setNext('继续：无视觉模块（模拟）',()=>{simMode=true;usedSimulation=true;updateMode();updateTestUI();enterScene('CALIBRATE')});
  el.accessibleBtn.textContent='使用模拟输入继续';
 } else if(id==='CALIBRATE'){
  phase='calibrate_palm';delayGuardUntil=0;calmArmed=false;quietMs=0;
  setCaption('把一只手放在镜头中间，向镜头张开手掌。','床旁沟通屏');
  setGoal(simMode?'按键盘 P 键张掌继续（或点右上角「测试模式」用按钮）；这不是实时摄像头识别。':'请在摄像头前做出 PALM（张开手掌）。');
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
  // v0.9 结尾定格：明亮水族馆 + 两个人并肩 + 鱼群从深海重新出现，
  // 中央只有一句话，最后浮现标题「请勿喧哗」，稳定停留不再推进。
  phase='end';setGoal('');setCaption('');
  if(artReady.ending){show(el.endingArt,true);later(140,()=>el.endingArt.classList.add('visible'));}
  later(900,()=>{if(current!=='END')return;show(el.endingLine,true);requestAnimationFrame(()=>el.endingLine.classList.add('visible'));});
  later(2600,()=>{if(current!=='END')return;show(el.endingTitle,true);requestAnimationFrame(()=>el.endingTitle.classList.add('visible'));});
  setNext('重新体验',()=>enterScene('CONSENT'));
 }
}
function showWardNote(text,cross=false){
 el.noteText.textContent=text;el.wardNote.classList.remove('crossed');show(el.wardNote,true);
 if(cross)later(450,()=>el.wardNote.classList.add('crossed'));
}
function wardStart(){
 // 已知事实提前告诉玩家；妹妹康复这件事仍保留到后续自然揭示。
 phase='ward_intro';setGoal('');say('W00A');
 later(2050,()=>say('W00B'));
 later(4320,()=>say('W00C'));
 later(5400,()=>say('W00D')); // v0.7：照顾她是他的盔甲，也是他逃避自己的方式。
 later(7000,()=>{
  say('W01');showWardNote('今天也要照顾好她。');
 });
 later(8100,()=>{
  say('H01');theme('SISTER_FULL');
  showSisterAction('✋','她先向你做出问候动作');
 });
 later(9900,()=>{
  say('W02');phase='ward_wait_palm';
  // H01 的交流动作先表演，之后才成为操作教程。
  show(el.sisterGreetingAsset,artReady.greeting);
  setGoal(wardPalmArmed?'她已经向你打招呼，轮到你回应。':'先放松手，再张掌回应她。');
  showPlayerGesture('✋','把张开的手掌放进镜头');
  delayGuardUntil=Date.now()+550;
 });
}
function wardPalmDone(){
 if(phase!=='ward_wait_palm')return;
 phase='ward_after_palm';show(el.playerGesture,false);show(el.sisterGreetingAsset,false);show(el.wardNote,false);
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
 phase='sea_play';proximity=.27;specialProximity=.14;seaEverWaved=false;gatheredOnce=false;wavedAgain=false;confirmedRepeat=false;seaStillMs=0;water=.09;
 cupTouched=false;cupPoseActive=false;cupSeenUntil=0;cupProtectionUntil=0;
 fishInvitationUntil=0;lastWaveAt=0;waitingForStillAfterWave=false;
 fishApproachMode='idle';fishApproachProgress=0;gatheredAt=0;
 show(el.fishAssistBtn,false);show(el.cupPrompt,false);
 say('S01');setGoal('试着靠近那条小鱼。');setNext(null,null);
 later(12000,()=>{if(phase==='sea_play'&&!gatheredOnce&&hintsEnabled) say('S02')});
 el.accessibleBtn.textContent='辅助操作';
}
function seaGathered(){
 if(!gatheredOnce){gatheredOnce=true;gatheredAt=Date.now();cupProtectionUntil=Date.now()+1100;
   fishInvitationUntil=Date.now()+3500;say('SEA01');setGoal('鱼正在靠近。你可以再次挥手验证，也可以等它游过来。');
  later(1900,()=>{if(current==='SEA'&&phase==='sea_play'&&gatheredOnce){say('S03');setGoal('它还在等你。双手轻轻捧起，邀请小鱼自己过来。')}});
  later(3400,()=>{if(current==='SEA'&&phase==='sea_play'&&gatheredOnce)say('S05')}); // v0.7：点破深海是哥哥内心的映射。
  later(6200,()=>{if(current==='SEA'&&phase==='sea_play'&&gatheredOnce&&!cupTouched)
    setNext('跳过轻捧，继续剧情',()=>transition('RETURN_WARD'))});
 } else if(wavedAgain&&!confirmedRepeat){confirmedRepeat=true;cupProtectionUntil=Date.now()+1100;setGoal('你重新试过了：它真的会回应你的等待。也可以缓缓伸出双手。');}
}
function returnWard(){
 phase='return_lines';const queue=['R01','W04','R02A','R02','R03','R04','R05'];let ix=0;
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
    el.nurseCue.classList.remove('responded');
    show(el.nurseAsset,artReady.nurse);
    setGoal('护士站在她视线之外。留意小满接下来先做了什么。');
    later(1100,()=>{el.nurseCue.classList.add('responded');
      show(el.nurseAsset,false);});
  }else if(id==='R04'){
    show(el.nurseCue,false);show(el.nurseAsset,false);show(el.wardTickets,true);
    setGoal('这次是小满主动把两张票推过来。');
  }else if(id==='R05'){
    phase='return_reply';setGoal('小满在等你的回应。可张掌回应，也可以直接继续。');
    showPlayerGesture('✋','回应她的邀请（非强制）');
    delayGuardUntil=Date.now()+450;
    setNext('继续（可不使用手势）',startMirrorBridge);return;
  }
  if(id==='W04' || id==='R03'){
    // Reserve reading time for the crossed-out thought and the nurse's subtle clue.
    setNext(null,null);
    later(id==='W04'?1100:1950,()=>setNext('继续',advance));
  }else setNext('继续',advance);
 }
 advance();el.accessibleBtn.textContent='辅助继续';
}
function startMirrorBridge(){
 if(current!=='RETURN_WARD'||phase==='return_bridge')return;
 phase='return_bridge';setNext(null,null);setGoal('');show(el.playerGesture,false);
 show(el.wardGesture,false);show(el.wardTickets,false);show(el.nurseCue,false);show(el.nurseAsset,false);
 say('BR01');el.stage.classList.add('is-bridge');
 // 不创建独立镜子关卡：始终留在病房窗户前，利用窗户原有的反光。
 el.mirrorLayer.style.opacity='.36';
 later(1800,()=>{
  el.windowThought.textContent='如果她不再需要我呢？';show(el.windowThought,true);
  el.mirrorLayer.classList.add('trying-to-speak');
  say('M01'); // 原剧情的“我……还能说什么？”，变成窗户倒影上的内心闪念。
 });
 later(4150,()=>{
  show(el.windowThought,false);el.mirrorLayer.classList.remove('trying-to-speak');
  setCaption('','');setGoal('');el.mirrorLayer.style.opacity='0';
 });
 later(4850,()=>transition('FINAL_DOOR'));
}
// 旧 MIRROR 仅保留为历史调试入口，不在正常场景链中出现。
function mirrorStart(){
 phase='legacy_mirror';setGoal('旧版调试入口：正式版只使用病房窗户倒影。');
 say('M01');setNext('进入最终回应',()=>transition('FINAL_DOOR'));
}
function mirrorToFinal(){transition('FINAL_DOOR')}
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
 phase='final_reach';show(el.wardGesture,false);show(el.reaching,true);show(el.sisterReachAsset,artReady.reach);setGoal('');setCaption('','');
 later(1350,()=>{el.glassLayer.style.opacity='0';});
 later(2600,()=>{
  show(el.reaching,true);say('F01');phase='final_dialog_0';
  const ids=['F10','F10B','F02','F13','F14','F11','F12'];let i=0; // v0.7：F13/F14 哥哥承认伪装并决定面对自己。
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
// v0.6 第一张牌：开场反转。摄像头游戏的第一课不是「做动作」，而是「停下来」。
function startCalmTeaching(){
 if(current!=='CALIBRATE')return;
 phase='calibrate_quiet';calmArmed=true;quietMs=0;delayGuardUntil=Date.now()+420;
 say('C01');setGoal('挥挥手，看看水面会怎样。');
 setNext('直接去病房',()=>enterScene('WARD'));
 el.stage.classList.add('calm');
 later(13000,()=>{if(current==='CALIBRATE'&&phase==='calibrate_quiet')enterScene('WARD')});
}
function calmDisturbed(){
 if(current!=='CALIBRATE'||phase!=='calibrate_quiet'||!calmArmed)return;
 calmArmed=false;quietMs=0;
 el.stage.classList.remove('calm');el.stage.classList.add('turbulent');
 say('C02');setGoal('现在，什么都别做。');
 later(1500,()=>{if(current==='CALIBRATE'&&phase==='calibrate_quiet'&&!calmArmed)
   setGoal('保持静止，让水面平静下来。')});
}
function calmDone(){
 if(current!=='CALIBRATE'||phase!=='calibrate_quiet')return;
 phase='calibrate_done';setNext(null,null);quietMs=0;
 el.stage.classList.remove('turbulent');el.stage.classList.add('calm');
 say('C04');setGoal('');theme('SISTER_FULL');
 later(2300,()=>{if(current==='CALIBRATE'&&phase==='calibrate_done')enterScene('WARD')});
}
// v0.6 第三张牌：终局隐藏回应。把手移出画面、什么都不做，也是一种回答。
function finalLetGo(){
 if(phase!=='final_reply')return;
 phase='final_letgo';finalNoHandMs=0;setNext(null,null);setGoal('你什么都没有做。');
 show(el.reaching,false);show(el.wardGesture,false);show(el.playerGesture,false);show(el.handShadow,false);
 say('N01');theme('BROTHER_COMPLETE');
 later(2600,()=>say('N02'));
 later(5300,()=>transition('AQUARIUM'));
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
 cameraHealthy=false;handState='NO_HAND';currentGesture='NONE';cupPoseActive=false;cupSeenUntil=0;
 lastStateAt=0;lastHandAt=0;seaStillMs=0;finalHoldMs=0;cupTouchUntil=0;fishInvitationUntil=0;
 if(reason)brief(reason);
}
function cupTouch(source='VISION'){
 // No hard 3.3s invitation window: allow slow players, scene stillness remains a separate discovery.
 if(cupTouched || phase!=='sea_play' || !gatheredOnce || Date.now()-gatheredAt<1450 || proximity<.62 || waitingForStillAfterWave
    || Date.now()-lastWaveAt<1050 || !['idle','finished'].includes(fishApproachMode))return false;
 cupTouched=true;phase='sea_cup_cutscene';setNext(null,null);cupTouchUntil=Date.now()+5100;
 fishApproachMode='approaching';fishApproachProgress=0;
 // B outputs one palm coordinate, not the TWO-hand centroid. Favor the center, slightly follow x.
 fishTargetX=Math.max(46,Math.min(54,47+currentPalm.x*6));fishTargetY=65;
 show(el.fishAssistBtn,false);show(el.cupPrompt,false);
 if(source==='ASSISTED'){usedSimulation=true;updateMode();brief('此次捧鱼使用了辅助按钮，不能算纯摄像头识别');}
 setGoal('小鱼看了看你，决定自己游进你捧起的双手。');
 return true;
}
function handleInput(raw, source='VISION'){
 if(!raw)return;
 let typ=raw.type;
 if(typ==='WAVE'&&source==='VISION')waveSeenAt=Date.now(); // 挥手是独立事件，HUD 短暂点亮 GESTURE 行。
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
     } else if(source==='VISION')tryGestureAdvance(); // v0.9：未被特定等待消费的张掌，视为推进剧情的信号。
   }else if(raw.gesture==='GOOD' && !modalOpen)handleInput({type:'GOOD'},source);
   return;
 }
 if(typ==='SILENCE_STATE'){
   const prevState=lastMotionState;lastMotionState=raw.state;
   handState=raw.state;lastStateAt=Date.now();
   if(Number.isFinite(raw.motion))latestMotion=raw.motion;
   if(Number.isFinite(raw.still_ms))lastStillMs=raw.still_ms;
   if(!simMode && cameraHealthy)brief(raw.state==='NO_HAND'?'摄像头正常：请将手放入画面':
      raw.state==='STILL'?'正在检测静止 '+raw.still_ms+'ms':'已检测到手部移动');
   if(raw.state==='NO_HAND'){
     lastHandAt=0;seaStillMs=0;finalHoldMs=0;cupPoseActive=false;cupSeenUntil=0;
     currentGesture='NONE';wardPalmArmed=true;returnPalmArmed=true;finalPalmArmed=true;
   }
   // v0.9：真实模式下「动了一下」也是推进剧情的明确信号（STILL→MOVING 状态切换）。
   if(source==='VISION' && raw.state==='MOVING' && prevState==='STILL')tryGestureAdvance();
   return;
 }
 if(typ==='CUP_EXIT'){
   // B may send NONE frequently: it is not a successful CUP and must never create grace by itself.
   if(cupPoseActive)cupSeenUntil=Date.now()+1550;
   cupPoseActive=false;return;
 }
 if(typ==='CUP'){cupPoseActive=true;cupSeenUntil=Date.now()+1550;}
 if(typ==='SILENCE_REACHED'){techEventAt=Date.now();return;} // 终局从进入等待阶段后重新累计连续有效 STILL。
 if(modalOpen || current==='CONSENT'||phase==='transition')return;
 if(Date.now()<delayGuardUntil)return;
 if(current==='CALIBRATE'){
  if(phase==='calibrate_palm'&&typ==='PALM'){
    if(!simMode && !cameraHealthy)return;
    startCalmTeaching();return;
  }
  if(phase==='calibrate_quiet'&&typ==='WAVE'){calmDisturbed();return;}
  return;
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
     // An already-recognized cup or the very short post-gather hand-positioning grace
     // should not be misinterpreted as an intentional repeat wave.
     if((cupPoseActive||Date.now()<cupSeenUntil || Date.now()<cupProtectionUntil ||
         ['approaching','resting','leaving'].includes(fishApproachMode)) && gatheredOnce){setGoal('慢慢靠拢双手，小鱼还在等你。');return;}
     seaEverWaved=true;lastWaveAt=Date.now();fishInvitationUntil=0;
     waitingForStillAfterWave=true;
     if(fishApproachMode==='finished') {fishApproachMode='idle';cupTouched=false;}
     if(fishApproachMode!=='idle')return;
     water=1;seaStillMs=0;proximity=Math.min(proximity,.28);specialProximity=Math.min(specialProximity,.15);
     if(gatheredOnce){wavedAgain=true;setGoal('水流又出现了，小鱼再次退开。')}
     else setGoal('水流被你搅动了，小鱼避开了。');
     return; // v0.9 修正：挥手是深海的搅水交互，被场景消费后不得再触发「推进剧情」。
   }
   if(typ==='CUP'){
     if(gatheredOnce&&proximity>.62){cupTouch()}
     else if(gatheredOnce)setGoal('先让水流平静，等小鱼自己靠近；双手可以提前摆好。');
     return; // 捧鱼提示同样只属于深海交互，不推进剧情。
   }
 }
 if(current==='FINAL_DOOR'&&phase==='final_reply'&&typ==='PALM'
      &&(source!=='VISION'||finalPalmArmed)){
   finalPalmArmed=false;finishFinal();
 }
 if(current==='FINAL_DOOR'&&phase==='final_old_gesture'&&['PALM','GOOD','WAVE'].includes(typ)){
   setGoal('动作被识别了，玻璃却没有因此改变。');
   return; // 旧手势展示期消费所有动作，不应触发通用剧情推进。
 }
 // v0.9：真实模式下挥手/竖拇指未被特定交互消费时，推进当前剧情衔接。
 if(source==='VISION' && (typ==='WAVE'||typ==='GOOD'))tryGestureAdvance();
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
   if(current==='CALIBRATE'&&(phase==='calibrate_quiet'||phase==='calibrate_done')){
     // 开场反转：水面被动作搅动，静止后自然平息 —— 静止本身也是回答。
     if(!calmArmed&&phase==='calibrate_quiet'){
       quietMs=still?quietMs+dt:0;
       if(quietMs>=1800)calmDone();
     }
     const locationFresh=simMode||(cameraHealthy&&Date.now()-lastHandAt<750);
     if(locationFresh){el.waterRipple.style.left=(currentPalm.x*70+15)+'%';el.waterRipple.style.top=(currentPalm.y*48+25)+'%';}
     const rippleOp=phase==='calibrate_done'?0:(calmArmed?.5:Math.max(0,.85*(1-quietMs/1800)));
     el.waterRipple.style.opacity=String(rippleOp);
   }
   if(current==='SEA'){
     if(!simMode && Date.now()-lastStateAt>1000){handState='NO_HAND';seaStillMs=0;cupPoseActive=false;cupSeenUntil=0;}
     if(['approaching','resting','arrived'].includes(fishApproachMode)){
       water+=(.02-water)*Math.min(1,dt/550);
       proximity+=(.89-proximity)*Math.min(1,dt/560);
       specialProximity+=(1-specialProximity)*Math.min(1,dt/390);
       if(fishApproachMode==='approaching'){
         fishApproachProgress=Math.min(1,fishApproachProgress+dt/1650);
         if(fishApproachProgress>=1){fishApproachMode='resting';fishHoldUntil=Date.now()+1050;setGoal('你没有追上去，它却主动停在了你的手前。')}
       } else if(fishApproachMode==='resting' && Date.now()>fishHoldUntil){
         fishApproachMode='arrived';setGoal('它主动来到了你身边。');
         later(570,()=>{if(current==='SEA'&&phase==='sea_cup_cutscene')transition('RETURN_WARD')});
       }
     } else if(seaEverWaved && fresh && still){
       waitingForStillAfterWave=false;
       seaStillMs+=dt;water+=(0-water)*Math.min(1,dt/550);
       const target=seaStillMs>2000?1:seaStillMs>500? .45 + (seaStillMs-500)/1500*.5 : .15;
       proximity+=(target-proximity)*Math.min(1,dt/650);
       specialProximity+=((seaStillMs>700?proximity*.98:.09)-specialProximity)*Math.min(1,dt/1050);
       if(!gatheredOnce && seaStillMs>2100 && proximity>.67)seaGathered();
       if(gatheredOnce && wavedAgain && !confirmedRepeat && seaStillMs>2050 && proximity>.64)seaGathered();
     } else if(seaEverWaved && fresh && handState==='MOVING'){
       seaStillMs=0;
       if(gatheredOnce && !waitingForStillAfterWave){
         // Repositioning both hands for the fish is ordinary movement, not an actual WAVE.
         water+=(.14-water)*Math.min(1,dt/480);
         proximity+=(.84-proximity)*Math.min(1,dt/720);
         specialProximity+=(.77-specialProximity)*Math.min(1,dt/800);
       } else {
         water+=(1-water)*Math.min(1,dt/260);
         proximity+=(.02-proximity)*Math.min(1,dt/330);
         specialProximity+=(.03-specialProximity)*Math.min(1,dt/390);
       }
     } else {water+=((!seaEverWaved && fresh && handState==='MOVING'?.5:.05)-water)*Math.min(1,dt/900);}
     if(gatheredOnce && proximity>.69 && Date.now()-lastWaveAt>1050){fishInvitationUntil=Date.now()+3300;}
     if((cupPoseActive||Date.now()<cupSeenUntil) && gatheredOnce && !cupTouched && fresh)cupTouch();
     show(el.cupPrompt, gatheredOnce && Date.now()-gatheredAt>1900 && proximity>.69 && !cupTouched && phase==='sea_play' && ['idle','finished'].includes(fishApproachMode));
     show(el.fishAssistBtn, gatheredOnce && proximity>.68 && !cupTouched && (Date.now()-gatheredAt>4600) && ['idle','finished'].includes(fishApproachMode));
     el.oceanTint.style.opacity=String(.64 - proximity*.43);
     const palmTracked=simMode || (cameraHealthy && Date.now()-lastHandAt<750);
     const palmShiftX=palmTracked?(currentPalm.x-.5)*38:0;
     const palmShiftY=palmTracked?(currentPalm.y-.5)*28:0;
     const wave=Math.sin(t/710)*9, otherWave=Math.sin(t/570+1.12)*7.5;
     const left=document.querySelector('.school.left'),right=document.querySelector('.school.right');
     left.style.transform=`translate(calc(${(1-proximity)*-55}% + ${palmShiftX.toFixed(1)}px),${(wave+palmShiftY).toFixed(1)}px)`;
     right.style.transform=`scaleX(-1) translate(calc(${(1-proximity)*-52}% + ${(palmShiftX*-1).toFixed(1)}px),${(otherWave+palmShiftY).toFixed(1)}px)`;
     const approaching=['approaching','resting','arrived'].includes(fishApproachMode);
     const ease=fishApproachProgress*fishApproachProgress*(3-2*fishApproachProgress);
     const baseX=48+(1-specialProximity)*6,baseY=44+(1-specialProximity)*(-7);
     const destX=approaching?baseX+(fishTargetX-baseX)*ease:baseX;
     const destY=approaching?baseY+(fishTargetY-baseY)*ease:baseY;
     const size=(.50+.31*specialProximity)*(1-ease)+1.75*ease;
     el.specialFish.style.left=destX+'%';el.specialFish.style.top=destY+'%';
     el.specialFish.style.transform=`translate(-50%,-50%) translateY(${wave*1.1*(1-ease)}px) scale(${size})`;
     el.specialFish.style.filter=`drop-shadow(0 0 ${7+19*ease}px rgba(255,223,170,${.25+.65*ease}))`;
     el.fishHalo.style.left=destX+'%';el.fishHalo.style.top=(destY+8)+'%';
     el.fishHalo.style.opacity=String(approaching?.77*ease:0);
     // 坐标需足够新鲜；切断摄像头或未见手时水纹不应伪装为被玩家控制。
     const locationFresh=simMode || (cameraHealthy && Date.now()-lastHandAt<750);
     el.waterRipple.style.opacity=String(locationFresh?Math.min(.96,water*.97):0);
     if(locationFresh){el.waterRipple.style.left=(currentPalm.x*70+15)+'%';el.waterRipple.style.top=(currentPalm.y*48+25)+'%';}

   } else if(current==='FINAL_DOOR'&&phase==='final_wait'){
      // 本场景重新累计，模拟亦必须手动按 S；真实模式只统计场景开启后的新鲜状态。
      if(still && (simMode?lastStateAt>=finalWaitAt:(lastStateAt>=finalWaitAt))){
        finalHoldMs+=dt;
        if(finalHoldMs>=2000)finalSisterReaches();
      } else finalHoldMs=0;
   } else if(current==='FINAL_DOOR'&&phase==='final_reply'){
      // v0.6 隐藏回应：摄像头健康时主动把手移出画面并保持，也是最后的回答。
      // 视觉程序断流（cameraHealthy=false）绝不触发，只有新鲜的 NO_HAND 状态才累计。
      const noHandFresh=simMode?handState==='NO_HAND':cameraHealthy&&handState==='NO_HAND'&&Date.now()-lastStateAt<900;
      finalNoHandMs=noHandFresh?finalNoHandMs+dt:0;
      if(finalNoHandMs>=1600)finalLetGo();
   }
   // v0.6 第二张牌：被注视。你的手影落在病房里，小满的视线随你的手移动。
   const handShadowOn=(current==='WARD'&&['ward_wait_palm','ward_optional_good'].includes(phase))
     ||(current==='RETURN_WARD'&&phase==='return_reply')
     ||(current==='FINAL_DOOR'&&['final_wait','final_reply'].includes(phase));
   if(handShadowOn){
     const handFresh=simMode?handState!=='NO_HAND':cameraHealthy&&Date.now()-lastHandAt<750;
     show(el.handShadow,true);
     el.handShadow.style.opacity=String(handFresh?.5:.07);
     el.handShadow.classList.toggle('focused',handFresh&&handState==='STILL');
     if(handFresh){
       el.handShadow.style.left=(currentPalm.x*38+31)+'%';
       el.handShadow.style.top=(currentPalm.y*26+57)+'%';
     }
   } else if(!el.handShadow.classList.contains('hidden')){show(el.handShadow,false);}
   if(['WARD','RETURN_WARD','FINAL_DOOR'].includes(current)&&!el.wardGesture.classList.contains('hidden')){
     const gazeFresh=simMode?handState!=='NO_HAND':cameraHealthy&&Date.now()-lastHandAt<750;
     const lean=gazeFresh?Math.max(-1,Math.min(1,(currentPalm.x-.5)*2))*10:0;
     el.wardGesture.style.transform=`translateX(${lean.toFixed(1)}px) rotate(${(lean*.07).toFixed(2)}deg)`;
   }
 }
 updateTechHud(dt);
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
 ?'本作使用游戏自定义交流动作，并非正式手语教学。小满的手势有独立动态图示和「手势交流 · 剧情释义」字幕；哥哥的内心文字、环境碎片及系统提示采用不同样式。张掌回应、竖大拇指鼓励；挥手搅动水流。深海卡住时可让水面平静。第一次聚鱼之后，若想捧鱼：双手掌心朝镜头、左右并排且高度接近、手腕相对靠近、手指自然张开并稍向两侧展开，稳定约半秒；不必真的把指尖扣成碗状。轻微挪动手掌不会使鱼群逃离；只有明显的再次挥手才会。若暂时识别不到，可点独立的辅助按钮（会标记为辅助）。真实静止要求手留在画面内，摄像头丢失不会算静止。窗户倒影为预制演出，不采集或分析面部动作。成功轻捧后小鱼会主动游近，然后返回病房；如识别不成功可主动跳过或使用辅助。静音仍保留全部剧情字幕。提示：回应不一定都要做出某个动作，有些回应，安静也能传达。按 T 键可随时打开/关闭右上角「技术透视模式」，实时显示摄像头识别到的状态（手势、运动量、静止计时与 SILENCE_REACHED 事件），用于证明交互来自真实识别，而非预制动画。'
 :'游戏已暂停。所有剧情等待计时都在暂停时冻结；可以继续或退出。';
 show(el.modal,true);
}
function closeModal(){modalOpen=false;show(el.modal,false);seaStillMs=0;finalHoldMs=0;delayGuardUntil=Date.now()+300;
 if(current==='FINAL_DOOR'&&phase==='final_wait')finalWaitAt=Date.now();}
function accessibility(){
 usedSimulation=true;updateMode();updateTestUI();
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
 if(current==='MIRROR'){mirrorToFinal();return}
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
  try{const extra=await fetch('content/round2_additions.json',{cache:'no-store'}).then(x=>x.json());
   for(const item of extra.lines||[])if(!lines.has(item.id))lines.set(item.id,item);
  }catch(err){console.warn('Optional round2 dialogue unavailable',err)}
  try{const extra=await fetch('content/round3_additions.json',{cache:'no-store'}).then(x=>x.json());
   for(const item of extra.lines||[])if(!lines.has(item.id))lines.set(item.id,item);
  }catch(err){console.warn('Optional round3 dialogue unavailable',err)}
  try{const extra=await fetch('content/round4_additions.json',{cache:'no-store'}).then(x=>x.json());
   for(const item of extra.lines||[])if(!lines.has(item.id))lines.set(item.id,item);
  }catch(err){console.warn('Optional round4 dialogue unavailable',err)}
  setupOptionalArt();
  for(const scene of r.sceneOrder){const op=document.createElement('option');op.value=scene;op.textContent=SCENELABELS[scene];el.sceneJump.appendChild(op)}
 }catch(e){setCaption('无法加载 story.json：'+e,'启动错误');}
 try{const inf=await fetch('/api/info').then(r=>r.json());visionConfigured=inf.mode==='VISION_AVAILABLE';}
 catch(e){visionConfigured=false}
 updateMode();
 el.startBtn.onclick=()=>{unlockAudio();show(el.cover,false);enterScene('CONSENT')};
 el.musicBtn.onclick=()=>{soundOn=!soundOn;el.musicBtn.textContent='声音：'+(soundOn?'开':'关');if(!soundOn&&ambient){ambient.pause();ambient=null;}else if(soundOn){unlockAudio();ambientForScene(current)}};
 el.nextBtn.onclick=()=>{if(!modalOpen && nextAction){const f=nextAction;f()}};
 el.accessibleBtn.onclick=()=>accessibility();
 el.fishAssistBtn.onclick=()=>{if(current==='SEA'&&phase==='sea_play')cupTouch('ASSISTED');};
 el.pauseBtn.onclick=()=>openModal('pause');el.helpBtn.onclick=()=>openModal('help');
 el.closeModal.onclick=()=>closeModal();el.quitBtn.onclick=()=>quit();
 el.testBtn.onclick=()=>{
  testPanelOpen=!testPanelOpen;
  if(testPanelOpen){if(!simMode)forcedSim=true;simMode=true;usedSimulation=true;}
  else if(forcedSim){forcedSim=false;simMode=false;}
  updateMode();updateTestUI();
 };
 updateTestUI();
 document.querySelectorAll('#debug [data-input]').forEach(b=>b.onclick=()=>simInput(b.dataset.input));
 document.onkeydown=(event)=>{
  if(event.target.tagName==='SELECT'||modalOpen)return;
  const keys={p:'PALM',g:'GOOD',w:'WAVE',m:'MOVING',s:'STILL',n:'NO_HAND',c:'CUP',x:'CUP_EXIT'};
  if(keys[event.key.toLowerCase()]&&current!=='CONSENT'){simInput(keys[event.key.toLowerCase()]);}
  else if(event.key.toLowerCase()==='t'){toggleTechHud();}
 };
 el.disableHints.onchange=()=>{hintsEnabled=!el.disableHints.checked};
 window.addEventListener('pagehide',()=>{if(!simMode)navigator.sendBeacon('/api/vision/stop','');});
 el.sceneJump.onchange=()=>{if(el.sceneJump.value){usedSimulation=true;updateMode();updateTestUI();show(el.cover,false);enterScene(el.sceneJump.value)}el.sceneJump.value=''};
 poll();requestAnimationFrame(frame);
}
boot();
})();
