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
    def do_POST(self):
        parsed   = urlparse(self.path)
        query    = parse_qs(parsed.query)
        col_name = query.get('collection', [''])[0]
        length   = int(self.headers.get('Content-Length', 0))
        body     = self.rfile.read(length)

        try:
            docs = json.loads(body.decode('utf-8'))
            db   = get_db()
            if col_name:
                db[col_name].delete_many({})
                if docs:
                    if isinstance(docs, list):
                        db[col_name].insert_many(docs)
                    else:
                        db[col_name].insert_one(docs)
            self._respond(200, {'status': 'success'})
        except Exception as e:
            print(f"[db-set] error: {e}")
            self._respond(500, {'status': 'error', 'message': str(e)})

    def do_OPTIONS(self):
        self._respond(200, {})

    def _respond(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass
