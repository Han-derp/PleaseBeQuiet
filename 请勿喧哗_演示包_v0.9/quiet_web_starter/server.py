"""《请勿喧哗》本地零依赖 HTTP/JSONL 桥。仅监听 localhost，网页不打开摄像头。"""
import argparse
import collections
import http.server
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import time
import urllib.parse

ROOT = Path(__file__).resolve().parent
EVENTS = collections.deque(maxlen=512)
LOCK = threading.Lock()
SEQ = 0
LAST_VISION_AT = 0.0
LAST_CAMERA_AVAILABLE = False
WORKER = None
WORKER_ERROR = None
WORKER_CONFIG = None
WORKER_CWD = None
WORKER_STOPPING = False
WORKER_LOG = collections.deque(maxlen=10)


def accept_line(line):
    global SEQ, LAST_VISION_AT, LAST_CAMERA_AVAILABLE
    try:
        data = json.loads(line)
        if not isinstance(data, dict) or not isinstance(data.get('type'), str):
            return
    except (TypeError, ValueError):
        print('[vision stdout not JSON]', line[:200], file=sys.stderr)
        return
    with LOCK:
        SEQ += 1
        if data.get('v')==1 and data.get('type')=='CAMERA_STATE' and isinstance(data.get('available'),bool):
            LAST_CAMERA_AVAILABLE=data['available']
        LAST_VISION_AT = time.time()
        EVENTS.append({'seq': SEQ, 'received_at': LAST_VISION_AT, 'data': data})


def read_stdout(proc):
    for raw in proc.stdout:
        accept_line(raw.rstrip('\r\n'))
    print('[vision] stdout closed', file=sys.stderr)


def read_stderr(proc):
    for line in proc.stderr:
        msg = line.strip()
        if msg:
            with LOCK:
                WORKER_LOG.append(msg[:240])
        print('[vision stderr]', msg, file=sys.stderr)


def monitor_proc(proc):
    global WORKER_ERROR
    exit_code = proc.wait()
    with LOCK:
        if not WORKER_STOPPING:
            message = next((s for s in reversed(WORKER_LOG) if 'Model file not found' in s
                or 'Missing dependency' in s or 'Could not open camera' in s
                or 'Worker error:' in s), None)
            WORKER_ERROR = (message or ('识别进程已退出，退出码 '+str(exit_code)))[:220]
    print('[vision] exited', exit_code, file=sys.stderr)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_json(self, data):
        content = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def do_POST(self):
        global WORKER, WORKER_ERROR, WORKER_STOPPING
        # 浏览器只允许游戏本身的同源请求启动摄像头；无 Origin 的本机 CLI 仍可调试。
        origin = self.headers.get('Origin')
        if origin and origin not in {f'http://127.0.0.1:{self.server.server_port}',
                                      f'http://localhost:{self.server.server_port}'}:
            self.send_error(403, 'Cross-origin camera start is forbidden')
            return
        if self.path == '/api/vision/start':
            if not WORKER_CONFIG:
                self.send_json({'ok': False, 'error': '未配置真实识别启动命令'})
                return
            if WORKER is not None and WORKER.poll() is None:
                self.send_json({'ok': True, 'start_seq': SEQ, 'camera_available': LAST_CAMERA_AVAILABLE})
                return
            try:
                with LOCK:
                    start_seq = SEQ
                    WORKER_LOG.clear()
                    WORKER_STOPPING = False
                WORKER = subprocess.Popen(WORKER_CONFIG, cwd=WORKER_CWD,
                        stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE, text=True, encoding='utf-8',
                        errors='replace', bufsize=1)
                WORKER_ERROR = None
                threading.Thread(target=read_stdout, args=(WORKER,), daemon=True).start()
                threading.Thread(target=read_stderr, args=(WORKER,), daemon=True).start()
                threading.Thread(target=monitor_proc, args=(WORKER,), daemon=True).start()
                print('[vision] started after explicit local consent:', WORKER_CONFIG)
                self.send_json({'ok': True, 'start_seq': start_seq})
            except OSError as exc:
                WORKER_ERROR = str(exc)
                self.send_json({'ok': False, 'error': WORKER_ERROR})
            return
        if self.path == '/api/vision/stop':
            WORKER_STOPPING = True
            if WORKER is not None and WORKER.poll() is None:
                WORKER.terminate()
                try:
                    WORKER.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    WORKER.kill()
            with LOCK:
                WORKER_ERROR = None
            self.send_json({'ok': True})
            return
        self.send_error(404)

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        if url.path == '/api/events':
            try:
                since = max(0, int(urllib.parse.parse_qs(url.query).get('since', ['0'])[0]))
            except ValueError:
                since = 0
            with LOCK:
                events = [item for item in EVENTS if item['seq'] > since]
                latest = SEQ
                stamp = LAST_VISION_AT
            worker_active = WORKER is not None and WORKER.poll() is None
            self.send_json({'events': events, 'latest_seq': latest,
                            'vision_configured': WORKER_CONFIG is not None,
                            'worker_active': worker_active,
                            'stream_fresh': worker_active and (time.time()-stamp < 1.5),
                            'worker_error': WORKER_ERROR})
            return
        if url.path == '/api/info':
            self.send_json({'project': '请勿喧哗', 'mode': 'VISION_AVAILABLE' if WORKER_CONFIG else 'SIM_ONLY'})
            return
        return super().do_GET()


def main():
    global WORKER, WORKER_ERROR
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--vision-cwd', default=None,
                        help='B 的原脚本工作目录；依实际工程设置')
    parser.add_argument('--vision', nargs=argparse.REMAINDER,
                        help='B 的可执行命令，必须放最后，例如 --vision python gesture_demo.py')
    args = parser.parse_args()
    global WORKER_CONFIG, WORKER_CWD
    WORKER_CONFIG = args.vision or None
    WORKER_CWD = args.vision_cwd
    if WORKER_CONFIG:
        print('[vision] 可用，但必须用户在网页上明确同意后才启动摄像头。')
    else:
        print('[mode] SIM_ONLY：未配置真实 B 程序；所有操作仅为模拟/辅助。')
    # Windows 上 SO_REUSEADDR 会允许多个进程绑定同一端口，导致旧 SIM_ONLY 服务器
    # 静默抢占新实例。关闭它：端口被占时立即报错，而不是两个服务器都“看起来活着”。
    class SingleInstanceServer(http.server.ThreadingHTTPServer):
        allow_reuse_address = False

    try:
        httpd = SingleInstanceServer(('127.0.0.1', args.port), Handler)
    except OSError as exc:
        print(f'[error] 无法监听 http://127.0.0.1:{args.port}：{exc}', file=sys.stderr)
        print('        端口被占用：通常是另一个旧服务器还在运行（例如直接运行 python server.py 的模拟模式）。', file=sys.stderr)
        print(f'        请关闭旧服务器窗口；仍不行可运行: netstat -ano | findstr :{args.port} 找到并结束占用进程。', file=sys.stderr)
        return 1
    print(f'打开：http://127.0.0.1:{args.port}')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\n正在退出……')
    finally:
        httpd.server_close()
        if WORKER and WORKER.poll() is None:
            WORKER.terminate()
            try:
                WORKER.wait(timeout=2)
            except subprocess.TimeoutExpired:
                WORKER.kill()


if __name__ == '__main__':
    raise SystemExit(main())
