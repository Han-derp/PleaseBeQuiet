"""服务器自动化测试用 v1 JSONL 回放；不连接摄像头，不等于 B 的实际识别。"""
import json, time

def emit(kind,**kwargs):
    print(json.dumps({'v':1,'type':kind,'ts_ms':int(time.monotonic()*1000),**kwargs}),flush=True)

emit('CAMERA_STATE',available=True)
emit('GESTURE',gesture='NONE',confidence=0)
for _ in range(4):
    emit('PALM',x=.43,y=.58)
    emit('SILENCE_STATE',state='MOVING',still_ms=0,motion=.35)
    time.sleep(.08)
emit('GESTURE',gesture='PALM',confidence=.92)
emit('WAVE')
for _ in range(5):
    emit('SILENCE_STATE',state='STILL',still_ms=300+(_*220),motion=.02)
    time.sleep(.08)
emit('SILENCE_REACHED')
emit('TWO_HAND_POSE',pose='CUPPED_HANDS')
time.sleep(.18)
emit('TWO_HAND_POSE',pose='NONE')
emit('SILENCE_STATE',state='NO_HAND',still_ms=0,motion=0)
while True:
    emit('SILENCE_STATE',state='NO_HAND',still_ms=0,motion=0)
    time.sleep(.12)
