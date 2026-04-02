#!/usr/bin/env node
// previewシステムが注入するポート（3002など）で受け取り、
// ポート3000（ユーザーのサーバー）にプロキシする
// ポート3000が空いている場合はNext.jsを直接起動する

const net = require("net")
const { spawnSync } = require("child_process")
const path = require("path")

// previewシステムが渡す --port 引数を取得
const portArg = process.argv.find((a) => a === "--port")
const portIdx = process.argv.indexOf("--port")
const previewPort = portArg && portIdx !== -1 ? parseInt(process.argv[portIdx + 1]) : null

// ポート3000が使用中かチェック
const check = net.createServer()
check.listen(3000, () => {
  // 3000が空いている → Next.jsを直接起動
  check.close(() => {
    console.log("Starting Next.js dev server on port 3000...")
    spawnSync("npx", ["next", "dev", "--turbopack"], {
      stdio: "inherit",
      env: process.env,
      cwd: path.join(__dirname, ".."),
    })
  })
})
check.on("error", () => {
  // 3000が使用中 → previewポートから3000へのTCPプロキシを立てる
  const listenPort = previewPort || 3002
  console.log(`Port 3000 in use — proxying preview port ${listenPort} → 3000`)

  const proxy = net.createServer((clientSocket) => {
    const serverSocket = net.createConnection(3000, "127.0.0.1")
    clientSocket.pipe(serverSocket)
    serverSocket.pipe(clientSocket)
    clientSocket.on("error", () => serverSocket.destroy())
    serverSocket.on("error", () => clientSocket.destroy())
  })

  proxy.listen(listenPort, () => {
    console.log(`Proxy listening on port ${listenPort}`)
  })
})
