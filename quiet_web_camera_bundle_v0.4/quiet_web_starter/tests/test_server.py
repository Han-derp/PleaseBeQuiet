"""不打开摄像头的本地接口自动化测试。"""
import importlib.util
import json
import sys
import threading
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('web_server',root/'server.py')
server=importlib.util.module_from_spec(spec);spec.loader.exec_module(server)
server.WORKER_CONFIG=[sys.executable,str(root/'tests'/'replay_worker_v1.py')]
server.WORKER_CWD=str(root)
host=server.http.server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
thread=threading.Thread(target=host.serve_forever,daemon=True);thread.start()
base=f'http://127.0.0.1:{host.server_port}'

def js(path,method='GET',headers=None):
    req=Request(base+path,method=method,headers=headers or {})
    with urlopen(req,timeout=4) as response:return json.load(response)

try:
    assert js('/api/info')['mode']=='VISION_AVAILABLE'
    try:
        js('/api/vision/start','POST',{'Origin':'http://untrusted.example'})
        raise AssertionError('cross-origin launch not blocked')
    except HTTPError as exc: assert exc.code==403
    start=js('/api/vision/start','POST')
    assert start['ok'] and isinstance(start['start_seq'],int)
    found=set()
    deadline=time.time()+5
    while time.time()<deadline and 'TWO_HAND_POSE' not in found:
        poll=js(f"/api/events?since={start['start_seq']}")
        found.update(e['data']['type'] for e in poll['events'])
        time.sleep(.08)
    assert {'CAMERA_STATE','GESTURE','PALM','WAVE','SILENCE_STATE','SILENCE_REACHED','TWO_HAND_POSE'}<=found, found
    assert js('/api/vision/stop','POST')['ok']
    print('PASS: 服务器在明确同意后启动；同源检查、事件序号、连续数据、CUP 消息和停止正常')
finally:
    if server.WORKER is not None and server.WORKER.poll() is None:
        server.WORKER.terminate()
    host.shutdown();host.server_close()
