import React, { useState } from 'react'

interface FileItem {
  storage_key: string;
  created_at: string;
}

export default function App() {
  // 認証関連の状態
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [userId, setUserId] = useState<number>(1);
  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");

  // ファイル管理関連の状態
  const [prefix, setPrefix] = useState<string>("");
  const [filePath, setFilePath] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [downloadKey, setDownloadKey] = useState<string>("");
  const [fileList, setFileList] = useState<FileItem[]>([]);
  const [status, setStatus] = useState<string>("");

  const API_ENDPOINT = "http://localhost:5000/api/"

  const fetchFileList = async (currentUserId: number) => {
    try {
      const res = await fetch(`${API_ENDPOINT}files?user_id=${currentUserId}`);
      const data = await res.json();
      if (res.ok && data.files) {
        setFileList(data.files);
      }
    } catch (err) {
      console.error("ファイル一覧の取得に失敗しました", err);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_ENDPOINT}register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus(`登録成功！ログインしてください。`);
      } else {
        setStatus(`登録エラー: ${data.message}`);
      }
    } catch (err: unknown) {
      if (err instanceof Error) setStatus(`通信エラー: ${err.message}`);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_ENDPOINT}login`, {
        method: "POST",
        headers: { "Content-Type": "appliaction/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (res.ok) {
        setUserId(data.user_id);
        setIsLoggedIn(true);
        setStatus(`ログイン成功: ${data.username} (ID: ${data.user_id})`);
        fetchFileList(data.user_id);
      } else {
        setStatus(`ログイン失敗: ${data.message}`);
      }
    } catch (err: unknown) {
      if (err instanceof Error) setStatus(`通信エラー: ${err.message}`);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setFilePath(e.target.files[0].name);
      setPrefix("files");
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setStatus("ファイルを選択してください");
      return;
    }

    try {
      setStatus("ファイルをバイナリに変換中...");

      const arrayBuffer = await file.arrayBuffer();

      const uint8Array = new Uint8Array(arrayBuffer);
      const binaryString = Array.from(uint8Array, byte => String.fromCharCode(byte)).join('');
      const base64Data = btoa(binaryString);

      const storageKey = `${prefix}/${filePath}`;

      setStatus("サーバーへアップロード中...");

      const response = await fetch(`${API_ENDPOINT}files`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: userId,
          storage_key: storageKey,
          data: base64Data,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setStatus(`アップロード成功！ キー: ${result.key}`);
        setDownloadKey(result.key);
        fetchFileList(userId);
      } else {
        setStatus(`エラー: ${result.message}`);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setStatus(`通信エラー: ${err.message}`);
      } else {
        setStatus("予期せぬエラーが発生しました。");
      }
    }
  };

  const handleDownload = async () => {
    if (!downloadKey) {
      setStatus("ダウンロードするキーを入力してください。");
      return;
    }

    try {
      setStatus("ファイルをダウンロード中...");
      const url = `${API_ENDPOINT}files?user_id=${userId}&key=${encodeURIComponent(downloadKey)}`;

      const response = await fetch(url);
      const result = await response.json();

      if (response.ok) {
        const binaryString = atob(result.data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const blob = new Blob([bytes]);
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;

        const filename = downloadKey.split('/').pop() || 'downloaded_file';
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(blobUrl);

        setStatus(`ダウンロード成功: ${filename}`);
      } else {
        setStatus(`ダウンロードエラー: ${result.message}`);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setStatus(`通信エラー: ${err.message}`);
      } else {
        setStatus("予期せぬエラーが発生しました。");
      }
    }
  };

  const handleDelete = async (targetKey: string) => {
    if (!window.confirm(`本当に "${targetKey}" を削除しますか？`)) {
      return;
    }

    try {
      setStatus("ファイル削除中...");
      const url = `${API_ENDPOINT}files?user_id=${userId}&key=${encodeURIComponent(targetKey)}`;

      const response = await fetch(url, {
        method: "DELETE",
      });

      const result = await response.json();
      if (response.ok) {
        setStatus(`削除成功: ${targetKey}`);
        fetchFileList(userId);
      } else {
        setStatus(`削除エラー: ${result.message}`);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setStatus(`通信エラー: ${err.message}`);
      }
    }
  };

  return (
    <div style={{ maxWidth: "600px", margin: "40px auto", fontFamily: "sans-serif", padding: "20px" }}>
      <h2>宵猫ストレージ</h2>

      {!isLoggedIn ? (
        /* 認証セクション */
        <div style={{ padding: "15px", border: "1px solid #ccc", borderRadius: "6px", marginBottom: "20px" }}>
          <h3>ユーザー登録 / ログイン</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div>
              <label style={{ display: "block", marginBottom: "3px" }}>ユーザー名:</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{ width: "80%", padding: "8px" }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "3px" }}>パスワード:</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ width: "80%", padding: "8px" }}
              />
            </div>
            <div style={{ display: "flex", gap: "10px", marginTop: "5px" }}>
              <button
                type="button"
                onClick={handleRegister}
                style={{ flex: 1, padding: "10px", background: "#6c757d", color: "#fff", border: "none", cursor: "pointer", borderRadius: "4px" }}
              >
                新規登録
              </button>
              <button
                type="button"
                onClick={handleLogin}
                style={{ flex: 1, padding: "10px", background: "#007bff", color: "#fff", border: "none", cursor: "pointer", borderRadius: "4px" }}
              >
                ログイン
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* ログイン中表示 & ファイル操作セクション */
        <div>
          <div style={{ padding: "10px", background: "#e2f0d9", border: "1px solid #c8e1b7", borderRadius: "4px", marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>ログイン中: <strong>{username}</strong> (ID: {userId})</span>
            <button
              onClick={() => setIsLoggedIn(false)}
              style={{ padding: "5px 10px", background: "#dc3545", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
            >
              ログアウト
            </button>
          </div>

          {/* アップロードセクション */}
          <form onSubmit={handleUpload} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
            <h3>アップロード</h3>

            <div>
              <label style={{ display: "block", marginBlock: "5px" }}>ファイル選択:</label>
              <input
                type="file"
                onChange={handleFileChange}
                style={{ width: "100%", padding: "8px" }}
              />
            </div>

            <div style={{ padding: "10px", background: "#f9fff6", border: "1px solid #c8e1b7", borderRadius: "4px", marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ color: "red" }}>
                ※ ファイル選択後自動で入力されます。<br />
                デフォルトのプレフィックスは 'files' です。
              </strong>
            </div>

            <div>
              <label style={{ display: "block", marginBlock: "5px" }}>プレフィックス (例:docs, images):</label>
              <input
                type="text"
                value={prefix}
                placeholder="files"
                onChange={(e) => setPrefix(e.target.value)}
                style={{ width: "100%", padding: "8px" }}
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "5px" }}>保存パス・ファイル名 (例: sub/file.bin):</label>
              <input
                type="text"
                value={filePath}
                placeholder="sample.bin"
                onChange={(e) => setFilePath(e.target.value)}
                style={{ width: "100%", padding: "8px" }}
              />
            </div>

            <button
              type="submit"
              style={{ padding: "10px", background: "#007bff", color: "#fff", border: "none", cursor: "pointer", borderRadius: "4px" }}
            >
              アップロード
            </button>
          </form>

          {/* 保存済みファイル一覧セクション */}
          <div style={{ padding: "15px", border: "1px solid #ccc", borderRadius: "6px", marginBottom: "20px" }}>
            <h3>保存済みファイル一覧</h3>
            {fileList.length === 0 ? (
              <p style={{ color: "#666", fontSize: "14px" }} >ファイルがありません。</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
                {fileList.map((file, idx) => (
                  <li key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px", background: "#fdfdfd", border: "1px solid #eee", borderRadius: "4px" }}>
                    <div>
                      <strong style={{ fontFamily: "monospace" }}>{file.storage_key}</strong>
                      <span style={{ fontSize: "12px", color: "#888", marginLeft: "10px" }}>({file.created_at})</span>
                    </div>
                    <div style={{ display: "flex", gap: "5px" }}>
                      <button
                        type="button"
                        onClick={() => { setDownloadKey(file.storage_key); handleDownload(); }}
                        style={{ padding: "4px 8px", background: "#17a2b8", color: "#fff", border: "none", borderRadius: "3px", cursor: "pointer", fontSize: "12px" }}
                      >
                        ダウンロード
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(file.storage_key)}
                        style={{ padding: "4px 8px", background: "#dc3545", color: "#fff", border: "none", borderRadius: "3px", cursor: "pointer", fontSize: "12px"}}
                      >
                        削除
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {status && (
        <div style={{ marginTop: "20px", padding: "10px", background: "#f8f9fa", border: "1px solid #dee2e6", borderRadius: "4px" }}>
          <strong>ステータス:</strong> {status}
        </div>
      )}
    </div>
  );
}