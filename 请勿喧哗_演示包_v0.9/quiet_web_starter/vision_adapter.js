/* mini-camp-main/INTERFACE.md (v1) 的唯一协议适配层。
   保留 worker 原本的消息类型；游戏脚本只读规范化后的输入。
   浏览器不调用 getUserMedia；避免与 Python 重复打开摄像头。 */
(function (scope) {
  'use strict';
  function normalize(raw) {
    if (!raw || raw.v !== 1 || typeof raw.type !== 'string') return [];
    switch (raw.type) {
      case 'CAMERA_STATE':
        return typeof raw.available === 'boolean' ? [{type:'CAMERA_STATUS', healthy:raw.available}] : [];
      case 'GESTURE':
        return ['PALM','GOOD','NONE'].includes(raw.gesture)
          ? [{type:'GESTURE_LABEL', gesture:raw.gesture, confidence:raw.confidence ?? 0}]
          : [];
      case 'PALM': // 坐标与 PALM 手势是两种不同消息，绝不直接触发剧情
        return Number.isFinite(raw.x) && Number.isFinite(raw.y)
          ? [{type:'PALM_COORDS', x:Math.max(0,Math.min(1,raw.x)), y:Math.max(0,Math.min(1,raw.y))}]
          : [];
      case 'WAVE': return [{type:'WAVE'}];
      case 'SILENCE_STATE':
        return ['STILL','MOVING','NO_HAND'].includes(raw.state)
          ? [{type:'SILENCE_STATE', state:raw.state,
              still_ms:Number.isFinite(raw.still_ms)?raw.still_ms:0,
              motion:Number.isFinite(raw.motion)?raw.motion:null}]
          : [];
      case 'SILENCE_REACHED': return [{type:'SILENCE_REACHED'}];
      case 'TWO_HAND_POSE':
        return raw.pose==='CUPPED_HANDS' ? [{type:'CUP'}]
          : raw.pose==='NONE' ? [{type:'CUP_EXIT'}] : [];
      default: return [];
    }
  }
  const api = {normalize};
  if (typeof module==='object' && module.exports) module.exports=api;
  scope.VisionProtocol=api;
})(typeof window!=='undefined'?window:globalThis);
