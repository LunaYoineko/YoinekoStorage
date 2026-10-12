import asynchttpserver, asyncdispatch, json, strutils, mimetypes, times, base64, uri
import db_connector/db_sqlite

const dbFile = "storage.db"
var db = open(dbFile, "", "", "")

proc initDb() =
  db.exec(sql"""
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL
    );
  """)
  db.exec(sql"""
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      storage_key TEXT NOT NULL,
      data BLOB NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, storage_key),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  """)
  echo "[INFO] Database initialized successfully."

initDb()

proc hashPassword(password: string): string =
  var h = 0
  for c in password:
    h = (h * 31) + ord(c)
  return "hashed_" & $h

proc respondCors(req: Request, code: HttpCode, content: string, contentType: string = "application/json") {.async.} =
  var headers = newHttpHeaders([
    ("Access-Control-Allow-Origin", "*"),
    ("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS"),
    ("Access-Control-Allow-Headers", "Content-Type"),
    ("Content-Type", contentType)
  ])
  await req.respond(code, content, headers)

proc onRequest(req: Request) {.async.} =
  try:
    if req.reqMethod == HttpMethod.HttpOptions:
      await respondCors(req, Http200, "")
      return

    case req.reqMethod
    of HttpGet:
      if req.url.path == "/":
        await respondCors(req, Http200, "Nim Storage Server is running.")
      elif req.url.path == "/api/files":
        var userId = ""
        var storageKey = ""

        for pair in req.url.query.split('&'):
          let kv = pair.split('=', 2)
          if kv.len == 2:
            let key = decodeUrl(kv[0])
            let val = decodeUrl(kv[1])
            if key == "user_id": userId = val
            elif key == "key": storageKey = val

        if userId == "":
          await respondCors(req, Http400, $(%* {"status": "error", "message": "Missing user_id parameter"}))
          return

        if storageKey == "":
          var fileKeys = newJArray()
          for row in db.fastRows(sql"SELECT storage_key, created_at FROM files WHERE user_id = ? ORDER BY created_at DESC", userId.parseInt()):
            fileKeys.add(%* {
              "storage_key": row[0],
              "created_at": row[1]
            })
          
          let resJson = %* {
            "status": "success",
            "files": fileKeys
          }
          await respondCors(req, Http200, $resJson)
          return

        let countStr = db.getValue(sql"SELECT COUNT(*) FROM files WHERE user_id = ? AND storage_key = ?", userId.parseInt(), storageKey)
        var fileExists = false
        if countStr.len > 0:
          try:
            fileExists = countStr.parseInt() > 0
          except ValueError:
            fileExists = false

        if fileExists:
          let binaryData = db.getValue(sql"SELECT data FROM files WHERE user_id = ? AND storage_key = ?", userId.parseInt(), storageKey)
          let base64Encoded = base64.encode(binaryData)

          let resJson = %* {
            "status": "success",
            "storage_key": storageKey,
            "data": base64Encoded
          }
          await respondCors(req, Http200, $resJson)
        else:
          await respondCors(req, Http404, $(%* {"status": "error", "message": "File not found"}))
      else:
        await respondCors(req, Http404, $(%* {"error": "Not Found"}))
    
    of HttpPost:
      if req.url.path == "/api/register":
        let body = parseJson(req.body)
        let username = body["username"].getStr()
        let rawPassword = body["password"].getStr()
        let hashed = hashPassword(rawPassword)

        db.exec(sql"INSERT INTO users (username, password_hash) VALUES (?, ?)", username, hashed)
        await respondCors(req, Http200, $(%* {"status": "success", "message": "User registered"}))

      elif req.url.path == "/api/login":
        let body = parseJson(req.body)
        let username = body["username"].getStr()
        let rawPassword = body["password"].getStr()
        let hashed = hashPassword(rawPassword)

        let userIdStr = db.getValue(sql"SELECT id FROM users WHERE username = ? AND password_hash = ?", username, hashed)

        if userIdStr.len > 0:
          let userId = userIdStr.parseInt()
          let resJson = %* {
            "status": "success",
            "message": "Login successful",
            "user_id": userId,
            "username": username
          }
          await respondCors(req, Http200, $resJson)
        else:
          await respondCors(req, Http401, $(%* {"status": "error", "message": "Invalid username or password"}))

      elif req.url.path == "/api/files":
        let body = parseJson(req.body)
        let userId = body["user_id"].getInt()
        let storageKey = body["storage_key"].getStr()
        let base64Data = body["data"].getStr()

        let decodedBinary = base64.decode(base64Data)

        db.exec(sql"""
          INSERT INTO files (user_id, storage_key, data) VALUES (?, ?, ?)
          ON CONFLICT (user_id, storage_key) DO UPDATE SET data = excluded.data, created_at = CURRENT_TIMESTAMP
        """, userId, storageKey, decodedBinary.cstring)

        await respondCors(req, Http200, $(%* {"status": "success", "key": storageKey}))
      else:
        await respondCors(req, Http404, $(%* {"error": "Not Found"}))

    of HttpDelete:
      if req.url.path == "/api/files":
        var userId = ""
        var storageKey = ""

        for pair in req.url.query.split('&'):
          let kv = pair.split('=', 2)
          if kv.len == 2:
            let key = decodeUrl(kv[0])
            let val = decodeUrl(kv[1])
            if key == "user_id": userId = val
            elif key == "key": storageKey = val
        
        if userId == "" or storageKey == "":
          await respondCors(req, Http400, $(%* {"status": "error", "message": "Missing user_id or key parameter"}))
          return

        db.exec(sql"DELETE FROM files WHERE user_id = ? AND storage_key = ?", userId.parseInt(), storageKey)

        let resJson = %* {
          "status": "success",
          "message": "File deleted successfully",
          "storage_key": storageKey
        }
        await respondCors(req, Http200, $resJson)
      else:
        await respondCors(req, Http404, $(%* {"error": "Not Found"}))

    else:
      await respondCors(req, Http405, $(%* {"error": "Method Not Allowed"}))

  except CatchableError:
    let errJson = %* {"status": "error", "message": getCurrentExceptionMsg()}
    await respondCors(req, Http400, $errJson)

proc main() {.async.} =
  var server = newAsyncHttpServer()
  echo "[INFO] Server starting on http://localhost:5000"
  await server.serve(Port(5000), onRequest)

waitFor main()