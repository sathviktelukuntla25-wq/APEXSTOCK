from http.server import BaseHTTPRequestHandler
import json
import os
from urllib.parse import urlparse, parse_qs

def get_db():
    import pymongo
    uri = os.environ.get('MONGODB_URI', 'mongodb://localhost:27017/')
    client = pymongo.MongoClient(uri, serverSelectionTimeoutMS=4000)
    return client['apexstock_warehouse']

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        query  = parse_qs(parsed.query)
        col_name = query.get('collection', [''])[0]

        items = []
        try:
            db = get_db()
            if col_name:
                items = list(db[col_name].find({}, {'_id': 0}))
        except Exception as e:
            print(f"[db-get] error: {e}")

        self._respond(200, items)

    def do_OPTIONS(self):
        self._respond(200, {})

    def _respond(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass
