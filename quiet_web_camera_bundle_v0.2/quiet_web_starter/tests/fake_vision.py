"""开发用模拟 JSONL，不打开摄像头。不可用于真实摄像头演示。"""
import json
import sys
import time
for item in [
    {'type': 'CAMERA_STATUS', 'healthy': True},
    {'type': 'PALM', 'x': 0.43, 'y': 0.58},
    {'type': 'WAVE', 'ts_ms': 2000},
    {'type': 'SILENCE_STATE', 'state': 'MOVING', 'still_ms': 0, 'motion': 0.41},
]:
    print(json.dumps(item,ensure_ascii=False),flush=True)
    time.sleep(.2)
while True:
    print(json.dumps({'type':'SILENCE_STATE','state':'STILL','still_ms':2000,'motion':.01}),flush=True)
    time.sleep(.1)
