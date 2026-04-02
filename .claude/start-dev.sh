#!/bin/bash
# ポート3000がすでに使用中なら sleep でプロセスを維持しpreviewが既存サーバーを使う
# そうでなければ自分でNext.jsを起動する
cd "$(dirname "$0")/.."
if lsof -i:3000 > /dev/null 2>&1; then
  exec sleep infinity
else
  exec npx next dev --turbopack
fi
