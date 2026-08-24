# -*- coding: utf-8 -*-
"""
NNY 坦克大战 - 局域网联机服务端
使用方式:
    1. 打开命令行，进入本文件目录
    2. 运行: python tank_server.py
    3. 保持窗口运行
    4. 同局域网下的设备浏览器访问: http://<你的电脑IP>:8000/tank.html
       例如: http://192.168.1.100:8000/tank.html
    5. 主菜单选择「局域网联机」-> 创建房间/输入房间号即可对战
"""
import json
import random
import string
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote
import os

# 服务端口
PORT = 8000
# 静态文件目录 (HTML文件所在目录)
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))

# ============ 房间管理 ============
class RoomManager:
    def __init__(self):
        self.rooms = {}      # {room_id: room_data}
        self.lock = threading.Lock()

    def _gen_room_id(self):
        """生成4位数字房间号"""
        with self.lock:
            for _ in range(100):
                rid = ''.join(random.choices(string.digits, k=4))
                if rid not in self.rooms:
                    return rid
            # 如果用完了，用6位
            return ''.join(random.choices(string.digits, k=6))

    def create_room(self, host_name="主机"):
        room_id = self._gen_room_id()
        room = {
            "room_id": room_id,
            "created_at": time.time(),
            "last_active": time.time(),
            "host": host_name,
            "status": "waiting",  # waiting | playing | finished
            "player1": {"name": host_name, "ready": False, "x": None, "y": None, "dir": 0, "alive": True, "last_ping": time.time()},
            "player2": None,  # 加入后设置
            "map": None,      # 地图数据
            "p1_input": None, # P1 输入快照
            "p2_input": None, # P2 输入快照
            "events": [],     # 事件列表（射击等）
            "enemies": [],    # 敌人状态
            "bullets": [],    # 子弹状态
            "baseAlive": True,
            "message": "",
        }
        with self.lock:
            self.rooms[room_id] = room
        print(f"[房间] 创建: {room_id} | 主机: {host_name}")
        return room_id

    def join_room(self, room_id, joiner_name="客人"):
        with self.lock:
            room = self.rooms.get(room_id)
            if not room:
                return {"ok": False, "msg": "房间不存在"}
            if room["player2"] is not None:
                return {"ok": False, "msg": "房间已满"}
            if room["status"] != "waiting":
                return {"ok": False, "msg": "游戏已开始"}
            room["player2"] = {"name": joiner_name, "ready": False, "x": None, "y": None, "dir": 0, "alive": True, "last_ping": time.time()}
            room["last_active"] = time.time()
        print(f"[房间] 加入: {room_id} | 客人: {joiner_name}")
        return {"ok": True, "msg": "加入成功"}

    def get_room(self, room_id):
        with self.lock:
            r = self.rooms.get(room_id)
            if r:
                # 返回副本
                return {k: v for k, v in r.items() if k != "lock"}
            return None

    def set_ready(self, room_id, player_num, ready=True):
        with self.lock:
            room = self.rooms.get(room_id)
            if not room:
                return False
            key = f"player{player_num}"
            p = room.get(key)
            if p:
                p["ready"] = ready
                room["last_active"] = time.time()
        return True

    def start_game(self, room_id, map_data):
        with self.lock:
            room = self.rooms.get(room_id)
            if not room:
                return False
            if not room["player1"]["ready"] or not (room["player2"] and room["player2"]["ready"]):
                return False
            room["status"] = "playing"
            room["map"] = map_data
            room["last_active"] = time.time()
            room["events"] = []
        print(f"[房间] 游戏开始: {room_id}")
        return True

    def push_state(self, room_id, player_num, x, y, direction, alive):
        with self.lock:
            room = self.rooms.get(room_id)
            if not room:
                return
            key = f"player{player_num}"
            p = room.get(key)
            if p:
                p["x"] = x
                p["y"] = y
                p["dir"] = direction
                p["alive"] = alive
                p["last_ping"] = time.time()
            room["last_active"] = time.time()

    def push_event(self, room_id, event):
        with self.lock:
            room = self.rooms.get(room_id)
            if not room:
                return
            room["events"].append({"t": time.time(), **event})
            # 限制事件数
            if len(room["events"]) > 100:
                room["events"] = room["events"][-50:]

    def pop_events(self, room_id, since_idx):
        with self.lock:
            room = self.rooms.get(room_id)
            if not room:
                return []
            new_events = room["events"][since_idx:]
            return new_events

    def set_status(self, room_id, status):
        with self.lock:
            room = self.rooms.get(room_id)
            if room:
                room["status"] = status
                room["last_active"] = time.time()

    def cleanup_expired(self):
        """清理超过15分钟没活动的房间"""
        now = time.time()
        with self.lock:
            to_del = [rid for rid, r in self.rooms.items() if now - r["last_active"] > 15*60]
            for rid in to_del:
                print(f"[房间] 过期清理: {rid}")
                del self.rooms[rid]

manager = RoomManager()

# ============ HTTP 处理器 ============
class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # 静默日志（仅打印重要信息）
        pass

    def _send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, path):
        if path.endswith("/"):
            path += "tank.html"
        abs_path = os.path.normpath(os.path.join(ROOT_DIR, path.lstrip("/")))
        if not abs_path.startswith(ROOT_DIR):
            self.send_error(403, "Forbidden")
            return
        if not os.path.isfile(abs_path):
            self.send_error(404, "Not Found")
            return
        ext = os.path.splitext(abs_path)[1].lower()
        mime = {
            ".html": "text/html; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".gif": "image/gif",
            ".svg": "image/svg+xml",
            ".ico": "image/x-icon",
        }.get(ext, "application/octet-stream")
        with open(abs_path, "rb") as f:
            content = f.read()
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(content)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        qs = parse_qs(parsed.query)

        # === 房间 API ===
        if path == "/api/create":
            name = qs.get("name", ["主机"])[0][:20] or "主机"
            rid = manager.create_room(name)
            self._send_json({"ok": True, "room_id": rid})
            return

        if path == "/api/join":
            rid = qs.get("room_id", [""])[0].strip()
            name = qs.get("name", ["客人"])[0][:20] or "客人"
            res = manager.join_room(rid, name)
            self._send_json(res)
            return

        if path == "/api/status":
            rid = qs.get("room_id", [""])[0].strip()
            room = manager.get_room(rid)
            if not room:
                self._send_json({"ok": False, "msg": "房间不存在"})
                return
            # 清理不必要的字段以减小传输
            room_safe = {
                "ok": True,
                "room_id": room["room_id"],
                "status": room["status"],
                "host": room["host"],
                "player1": {"name": room["player1"]["name"], "ready": room["player1"]["ready"],
                            "x": room["player1"]["x"], "y": room["player1"]["y"],
                            "dir": room["player1"]["dir"], "alive": room["player1"]["alive"]},
                "player2": {"name": room["player2"]["name"], "ready": room["player2"]["ready"],
                            "x": room["player2"]["x"], "y": room["player2"]["y"],
                            "dir": room["player2"]["dir"], "alive": room["player2"]["alive"]} if room["player2"] else None,
                "map": room["map"],
                "baseAlive": room["baseAlive"],
                "message": room["message"],
            }
            self._send_json(room_safe)
            return

        if path == "/api/ready":
            rid = qs.get("room_id", [""])[0].strip()
            pn = int(qs.get("p", ["1"])[0])
            ready = qs.get("v", ["1"])[0] in ("1", "true", "True")
            ok = manager.set_ready(rid, pn, ready)
            self._send_json({"ok": ok})
            return

        if path == "/api/start":
            rid = qs.get("room_id", [""])[0].strip()
            # 地图数据放POST body更合适，但GET也支持
            ok = manager.start_game(rid, None)
            self._send_json({"ok": ok})
            return

        if path == "/api/cleanup":
            manager.cleanup_expired()
            self._send_json({"ok": True, "rooms": list(manager.rooms.keys())})
            return

        # === 静态文件 ===
        self._send_file(path)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        length = int(self.headers.get("Content-Length", "0") or "0")
        raw = self.rfile.read(length) if length > 0 else b"{}"
        try:
            data = json.loads(raw.decode("utf-8")) if raw else {}
        except Exception:
            data = {}

        if path == "/api/state":
            rid = str(data.get("room_id", "")).strip()
            pn = int(data.get("p", 1))
            manager.push_state(
                rid, pn,
                data.get("x"), data.get("y"),
                data.get("dir", 0),
                data.get("alive", True)
            )
            # 附加事件
            for ev in data.get("events", []) or []:
                manager.push_event(rid, ev)
            room = manager.get_room(rid)
            # 返回对手状态和事件
            since = int(data.get("since", 0))
            events = manager.pop_events(rid, since)
            other_pn = 2 if pn == 1 else 1
            other_key = f"player{other_pn}"
            other = room and room.get(other_key)
            self._send_json({
                "ok": True,
                "other": {"name": other["name"], "ready": other["ready"],
                          "x": other["x"], "y": other["y"],
                          "dir": other["dir"], "alive": other["alive"]} if other else None,
                "events": events,
                "event_count": len(room["events"]) if room else 0,
                "baseAlive": room["baseAlive"] if room else True,
                "status": room["status"] if room else None,
                "map": room["map"] if room else None,
            })
            return

        if path == "/api/start":
            rid = str(data.get("room_id", "")).strip()
            ok = manager.start_game(rid, data.get("map"))
            self._send_json({"ok": ok})
            return

        if path == "/api/finish":
            rid = str(data.get("room_id", "")).strip()
            manager.set_status(rid, "finished")
            self._send_json({"ok": True})
            return

        self._send_json({"ok": False, "msg": "未知接口"}, 404)


# ============ 入口 ============
def cleanup_loop():
    while True:
        time.sleep(60)
        try:
            manager.cleanup_expired()
        except Exception as e:
            print("[清理] 出错:", e)

def main():
    # 打印本机IP提示
    import socket
    hostname = socket.gethostname()
    ips = []
    try:
        # 尝试获取局域网IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ips.append(s.getsockname()[0])
        s.close()
    except Exception:
        pass
    try:
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = info[4][0]
            if ip not in ips and not ip.startswith("127."):
                ips.append(ip)
    except Exception:
        pass
    if "127.0.0.1" not in ips:
        ips.append("127.0.0.1")

    print("=" * 60)
    print("  NNY 坦克大战 · 局域网联机服务端 启动成功!")
    print("=" * 60)
    print(f"  本地访问:  http://127.0.0.1:{PORT}/tank.html")
    for ip in ips:
        if ip != "127.0.0.1":
            print(f"  局域网访问: http://{ip}:{PORT}/tank.html")
    print("=" * 60)
    print("  联机操作步骤:")
    print("  1. 主机方 保持此窗口运行")
    print("  2. 两台设备浏览器打开上面的地址（同一Wi-Fi下）")
    print("  3. 主机方 点「局域网联机」→「创建房间」，得到4位房间号")
    print("  4. 客机方 点「局域网联机」→「加入房间」，输入房间号")
    print("  5. 双方都点「准备」后，主机方点「开始游戏」即可对战")
    print("=" * 60)
    print("  按 Ctrl+C 停止服务")
    print("=" * 60)

    # 启动清理线程
    t = threading.Thread(target=cleanup_loop, daemon=True)
    t.start()

    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[停止] 服务已关闭")

if __name__ == "__main__":
    main()
