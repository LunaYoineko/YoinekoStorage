import httpclient, json, os, parseopt, base64, strutils, uri, times

const serverUrl = "http://localhost:5000/api"
const sessionFile = ".yscli_session"
const defaultPrefix = "files"

proc printUsage() =
  echo "=== Yoineko Storage CLI ==="
  echo "Usage:"
  echo "  yscli register  -u <username> -p <password>"
  echo "  yscli login     -u <username> -p <password>"
  echo "  yscli upload    -u <user_id> -f <filepath> [-k <storage_key>] # -k 省略時は files/<filename> になります"
  echo "  yscli download  -u <user_id> -k <storage_key> -o <output_path>"
  echo "  yscli list      -u <user_id>"
  echo "  yscli delete    -u <user_id> -k <storage_key>"
  echo "(Note: Once logged in, -u can be omitted)"
  echo "(storage_key is prefix/filePath)"

proc saveSession(userId: int, username: string) =
  let expireTime = (now() + 1.years).toTime().toUnix()
  let sessionData = %* {
    "user_id": userId,
    "username": username,
    "expires_at": expireTime
  }
  writeFile(sessionFile, $sessionData)

proc loadCachedUserId(): string =
  if not fileExists(sessionFile):
    return ""
  try:
    let content = readFile(sessionFile)
    let node = parseJson(content)
    let expiresAt = node["expires_at"].getInt()
    let currentEpoch = now().toTime().toUnix()

    if currentEpoch < expiresAt:
      return $node["user_id"].getInt()
    else:
      removeFile(sessionFile)
      return ""
  except Exception:
    return ""

proc main() =
  let args = commandLineParams()
  if args.len == 0:
    printUsage()
    return

  var command = args[0]
  var username = ""
  var password = ""
  var userId = ""
  var storageKey = ""
  var filePath = ""
  var outputPath = ""

  var i = 1
  while i < args.len:
    let arg = args[i]
    if (arg == "-u" or arg == "--username" or arg == "--user_id") and i + 1 < args.len:
      username = args[i + 1]
      userId = args[i + 1]
      inc(i, 2)
    elif (arg == "-p" or arg == "--password") and i + 1 < args.len:
      password = args[i + 1]
      inc(i, 2)
    elif (arg == "-k" or arg == "--key") and i + 1 < args.len:
      storageKey = args[i + 1]
      inc(i, 2)
    elif (arg == "-f" or arg == "--file") and i + 1 < args.len:
      filePath = args[i + 1]
      inc(i, 2)
    elif (arg == "-o" or arg == "--output") and i + 1 < args.len:
      outputPath = args[i + 1]
      inc(i, 2)
    else:
      inc(i, 1)
  
  if userId == "" and command notin ["register", "login"]:
    userId = loadCachedUserId()
    if userId != "":
      echo "[Info] Using cached session (User ID: ", userId, ")"

  var client = newHttpClient()
  client.headers = newHttpHeaders([("Content-Type", "application/json")])

  case command
  of "register":
    if username == "" or password == "":
      echo "Error: -u (username) and -p (password) are required."
      return
    let payload = %* {"username": username, "password": password}
    try:
      let resp = client.post(serverUrl & "/register", body = $payload)
      echo resp.body
    except HttpRequestError as e:
      echo "Network Error: ", e.msg

  of "login":
    if username == "" or password == "":
      echo "Error: -u (username) and -p (password) are required."
      return
    let payload = %* {"username": username, "password": password}
    try:
      let resp = client.post(serverUrl & "/login", body = $payload)
      echo resp.body
      if resp.code == Http200:
        let jsonNode = parseJson(resp.body)
        let uid = jsonNode["user_id"].getInt()
        let uname = jsonNode["username"].getStr()
        saveSession(uid, uname)
        echo "Session saved successfully (Valid for 1 year)."
    except HttpRequestError as e:
      echo "Network Error: ", e.msg

  of "upload":
    if userId == "" or filePath == "":
      echo "Error: -u (user_id), -f (file path) are required."
      return
    if not fileExists(filePath):
      echo "Error: File not found -> ", filePath
      return

    let actualStorageKey = if storageKey != "": storageKey else: defaultPrefix & "/" & extractFilename(filePath)

    try:
      let fileBytes = readFile(filePath)
      let base64Data = encode(fileBytes)
      let payload = %* {
        "user_id": userId.parseInt(),
        "storage_key": actualStorageKey,
        "data": base64Data
      }
      let resp = client.post(serverUrl & "/files", body = $payload)
      echo resp.body
    except Exception as e:
      echo "Error: ", e.msg

  of "download":
    if userId == "" or storageKey == "":
      echo "Error: -u (user_id) and -k (storage_key) are required."
      return
    
    var parts = storageKey.split('/')
    let defaultFilename = if parts.len > 0: parts.pop() else: "downloaded_file"
    let outPath = if outputPath == "": defaultFilename else: outputPath

    try:
      let url = serverUrl & "/files?user_id=" & userId & "&key=" & encodeUrl(storageKey)
      let resp = client.get(url)
      if resp.code == Http200:
        let jsonNode = parseJson(resp.body)
        let base64Data = jsonNode["data"].getStr()
        let decodedBytes = decode(base64Data)
        writeFile(outPath, decodedBytes)
        echo "Successfully downloaded to: ", outPath
      else:
        echo "Error: ", resp.body
    except Exception as e:
      echo "Error: ", e.msg
  
  of "list":
    if userId == "":
      echo "Error: -u (user_id) is required."
      return

    try:
      let url = serverUrl & "/files?user_id=" & userId
      let resp = client.get(url)
      if resp.code == Http200:
        let jsonNode = parseJson(resp.body)
        let files = jsonNode["files"]
        echo "--- File List (User ID: ", userId, ") ---"
        for f in files:
          echo " - ", f["storage_key"].getStr(), " (created: ", f["created_at"].getStr(), ")"
      else:
        echo "Error: ", resp.body
    except Exception as e:
      echo "Error: ", e.msg

  of "delete":
    if userId == "" or storageKey == "":
      echo "Error: -u (user_id) and -k (storage_key) are required."
      return

    try:
      let url = serverUrl & "/files?user_id=" & userId & "&key=" & encodeUrl(storageKey)
      let resp = client.request(url, httpMethod = HttpDelete)
      echo resp.body
    except Exception as e:
      echo "Error: ", e.msg

  else:
    printUsage()

main()