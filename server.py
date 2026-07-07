import http.server
import socketserver
import urllib.parse
import json
import os
import socket
import asyncio
import threading

PORT     = 8080
WS_PORT  = 8765

queues     = {}   # REST fallback session queues: { peer_id: [skus] }
handshakes = {}   # REST fallback handshake state: { peer_id: bool }

# ── WebSocket session registry ───────────────────────────────────────────────
# ws_sessions[peer_id] = { "laptop": websocket | None, "mobile": websocket | None }
ws_sessions   = {}
scanned_cache = {}  # Duplicate prevention cache: { peer_id: set(barcodes) }

# ── MongoDB Connectivity Config ──────────────────────────────────────────────
mongo_enabled = False
db = None
try:
    import pymongo
    mongo_client = pymongo.MongoClient("mongodb://localhost:27017/", serverSelectionTimeoutMS=1500)
    mongo_client.server_info()
    db = mongo_client["apexstock_warehouse"]
    mongo_enabled = True
    print("[MongoDB] Connected successfully to local database 'apexstock_warehouse'!")
except Exception as e:
    print(f"[MongoDB] Offline: {e}. Falling back to LocalStorage buffers.")

# ── Local IP helper ──────────────────────────────────────────────────────────
def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

# ── WebSocket handler ────────────────────────────────────────────────────────
async def ws_handler(websocket):
    peer_id  = None
    role     = None   # "laptop" | "mobile"

    try:
        async for raw in websocket:
            try:
                msg = json.loads(raw)
            except Exception:
                continue

            msg_type = msg.get("type", "")

            # ── Registration ──────────────────────────────────────────────
            if msg_type == "register":
                peer_id = msg.get("peer")
                role    = msg.get("role")   # "laptop" or "mobile"
                if not peer_id or role not in ("laptop", "mobile"):
                    continue

                if peer_id not in ws_sessions:
                    ws_sessions[peer_id]   = {"laptop": None, "mobile": None}
                    scanned_cache[peer_id] = set()

                ws_sessions[peer_id][role] = websocket
                print(f"[WS] {role.upper()} registered for session: {peer_id}")

                # If both sides are now connected → send "paired" to laptop
                sess = ws_sessions[peer_id]
                if sess["laptop"] and sess["mobile"]:
                    try:
                        await sess["laptop"].send(json.dumps({"type": "paired"}))
                        await sess["mobile"].send(json.dumps({"type": "paired"}))
                        print(f"[WS] Session {peer_id} fully paired!")
                    except Exception:
                        pass

            # ── Barcode / SKU scan relay ──────────────────────────────────
            elif msg_type == "scan":
                sku = msg.get("sku", "").strip()
                if not sku or not peer_id:
                    continue

                # Duplicate prevention: ignore re-scans within same session
                cache = scanned_cache.get(peer_id, set())
                if sku in cache:
                    print(f"[WS] Duplicate scan ignored: {sku} in session {peer_id}")
                    await websocket.send(json.dumps({"type": "dup", "sku": sku}))
                    continue
                cache.add(sku)
                scanned_cache[peer_id] = cache

                print(f"[WS] Relaying scan {sku} → laptop for session {peer_id}")
                laptop_ws = ws_sessions.get(peer_id, {}).get("laptop")
                if laptop_ws:
                    try:
                        await laptop_ws.send(json.dumps({"type": "scan_sku", "sku": sku}))
                        await websocket.send(json.dumps({"type": "ack", "sku": sku}))
                    except Exception as relay_err:
                        print(f"[WS] Relay error: {relay_err}")
                else:
                    print(f"[WS] No laptop connected for session {peer_id}")

    except Exception as e:
        print(f"[WS] Connection closed: {e}")
    finally:
        # Clean up registry on disconnect
        if peer_id and role and peer_id in ws_sessions:
            ws_sessions[peer_id][role] = None
            print(f"[WS] {role.upper()} disconnected from session {peer_id}")
            # Notify the other side
            other_role = "mobile" if role == "laptop" else "laptop"
            other_ws   = ws_sessions[peer_id].get(other_role)
            if other_ws:
                try:
                    await other_ws.send(json.dumps({"type": "disconnected"}))
                except Exception:
                    pass

# ── Async WebSocket server entry point ───────────────────────────────────────
async def start_ws_server():
    import websockets
    async with websockets.serve(ws_handler, "0.0.0.0", WS_PORT):
        print(f"[WS Server] WebSocket server active at ws://0.0.0.0:{WS_PORT}")
        await asyncio.Future()  # Run forever

def run_ws_thread():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(start_ws_server())

# ── HTTP request handler ─────────────────────────────────────────────────────
class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Silence noisy HTTP access logs

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path  = parsed_url.path
        query = urllib.parse.parse_qs(parsed_url.query)

        # 0. Server local IP
        if path == "/api/get-server-ip":
            self._json({"ip": get_local_ip(), "wsPort": WS_PORT})
            return

        # 1. REST pairing fallback
        if path == "/api/pair":
            peer_id = query.get('peer', [''])[0]
            if peer_id:
                handshakes[peer_id] = True
                print(f"[REST] Mobile handshake: {peer_id}")
            self._json({"status": "paired"})
            return

        elif path == "/api/check-pair":
            peer_id = query.get('peer', [''])[0]
            paired  = handshakes.get(peer_id, False)
            self._json({"paired": paired})
            return

        elif path == "/api/send-scan":
            peer_id = query.get('peer', [''])[0]
            sku     = query.get('sku',  [''])[0]
            if peer_id and sku:
                queues.setdefault(peer_id, []).append(sku)
                print(f"[REST] SKU enqueued: {sku} → {peer_id}")
            self._json({"status": "enqueued"})
            return

        elif path == "/api/poll-scan":
            peer_id = query.get('peer', [''])[0]
            items   = queues.get(peer_id, [])
            if items:
                queues[peer_id] = []
            self._json({"skus": items})
            return

        elif path == "/api/db-get":
            col_name = query.get('collection', [''])[0]
            items = []
            if mongo_enabled and col_name:
                try:
                    items = list(db[col_name].find({}, {"_id": 0}))
                except Exception as e:
                    print(f"[MongoDB] Find error on {col_name}: {e}")
            self._json(items)
            return

        return http.server.SimpleHTTPRequestHandler.do_GET(self)

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path  = parsed_url.path
        query = urllib.parse.parse_qs(parsed_url.query)

        if path == "/api/db-set":
            col_name = query.get('collection', [''])[0]
            length   = int(self.headers.get('Content-Length', 0))
            body     = self.rfile.read(length)
            try:
                docs = json.loads(body.decode('utf-8'))
                if mongo_enabled and col_name:
                    db[col_name].delete_many({})
                    if docs:
                        if isinstance(docs, list):
                            db[col_name].insert_many(docs)
                        else:
                            db[col_name].insert_one(docs)
                    print(f"[MongoDB] Synced '{col_name}': {len(docs) if isinstance(docs, list) else 1} docs.")
                self.send_header('Access-Control-Allow-Origin', '*')
                self._json({"status": "success"})
            except Exception as e:
                print(f"[MongoDB] Save error: {e}")
                self._json({"status": "error", "message": str(e)}, code=500)

    def _json(self, payload, code=200):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header('Content-type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

# ── Main entry point ─────────────────────────────────────────────────────────
os.chdir(os.path.dirname(os.path.abspath(__file__)))

# Launch WebSocket server in background daemon thread
ws_thread = threading.Thread(target=run_ws_thread, daemon=True)
ws_thread.start()

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", PORT), CustomHandler) as httpd:
    local_ip = get_local_ip()
    print(f"[HTTP Server] Active at http://localhost:{PORT}  (LAN: http://{local_ip}:{PORT})")
    print(f"[WS  Server] Active at ws://localhost:{WS_PORT}  (LAN: ws://{local_ip}:{WS_PORT})")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("[Server] Shutting down...")
