const assert = require('node:assert/strict');
const {normalize} = require('../vision_adapter.js');
const one = (a)=>normalize({v:1,...a});
assert.deepEqual(one({type:'CAMERA_STATE',available:true}),[{type:'CAMERA_STATUS',healthy:true}]);
assert.deepEqual(one({type:'CAMERA_STATE',available:false}),[{type:'CAMERA_STATUS',healthy:false}]);
assert.deepEqual(one({type:'GESTURE',gesture:'PALM',confidence:.94}),[{type:'GESTURE_LABEL',gesture:'PALM',confidence:.94}]);
assert.deepEqual(one({type:'GESTURE',gesture:'GOOD',confidence:.7}),[{type:'GESTURE_LABEL',gesture:'GOOD',confidence:.7}]);
assert.deepEqual(one({type:'GESTURE',gesture:'NONE'}),[{type:'GESTURE_LABEL',gesture:'NONE',confidence:0}]);
assert.deepEqual(one({type:'PALM',x:.43,y:.58}),[{type:'PALM_COORDS',x:.43,y:.58}]);
assert.deepEqual(one({type:'WAVE'}),[{type:'WAVE'}]);
assert.deepEqual(one({type:'SILENCE_STATE',state:'STILL',still_ms:500,motion:.01}),
  [{type:'SILENCE_STATE',state:'STILL',still_ms:500,motion:.01}]);
assert.deepEqual(one({type:'SILENCE_STATE',state:'NO_HAND',still_ms:0,motion:0}),
  [{type:'SILENCE_STATE',state:'NO_HAND',still_ms:0,motion:0}]);
assert.deepEqual(one({type:'SILENCE_REACHED'}),[{type:'SILENCE_REACHED'}]);
assert.deepEqual(one({type:'TWO_HAND_POSE',pose:'CUPPED_HANDS'}),[{type:'CUP'}]);
assert.deepEqual(one({type:'TWO_HAND_POSE',pose:'NONE'}),[{type:'CUP_EXIT'}]);
assert.deepEqual(one({type:'TWO_HAND_POSE',pose:'BAD'}),[]);
assert.deepEqual(normalize({type:'PALM',x:.1,y:.2}),[]); // 非 v1 不冒充正式数据
console.log('PASS: B 正式 JSONL v1 的七类消息适配；坐标不会误触发张掌剧情');
