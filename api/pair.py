from http.server import BaseHTTPRequestHandler
import json

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # On Vercel, pairing is handled by PeerJS WebRTC - this is a stub
        self._respond(200, {'status': 'paired', 'note': 'Use PeerJS on cloud deployment'})

    def do_OPTIONS(self):
        self._respond(200, {})

    def _respond(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass
