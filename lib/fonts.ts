import fs from "fs"
import path from "path"

let _mplus800: string | null = null

/** M PLUS Rounded 1c 800 を Base64 で返す（初回のみ読み込み、以降はキャッシュ） */
export function getMplus800Base64(): string {
  if (!_mplus800) {
    const p = path.join(process.cwd(), "public/fonts/mplus-rounded-800.ttf")
    _mplus800 = fs.readFileSync(p).toString("base64")
  }
  return _mplus800
}

/** SVG埋め込み用 @font-face 宣言文字列 */
export function getMplusFontFace(): string {
  return `@font-face {
    font-family: 'MPR';
    src: url('data:font/ttf;base64,${getMplus800Base64()}') format('truetype');
    font-weight: 800;
  }`
}
