// public/dev(開発版)を生成する: シム調整の試験場。本番 public/ のシムと共有コードを汚さない。
//   node tools/harness/make-dev.mjs
// 生成物: public/dev/ … 本番のコピーに以下のパッチを当てたもの
//   - game.js: DEV=true(通信・リプレイ発行/再生を無効化)
//   - index.html: noindex+タイトルに【DEV】+ lib 参照を ../lib/ へ(dev は親の lib を使う)
//   - sims/(リプレイ再生無効のため不要)・og.png・lib/ は複製しない(dev/ 自身も除外)
// 運用: make-dev → commit/push → 人間が /dev/ で確認 → 確定したら release-sim.mjs で本番へ一括リリース。
// public/dev は削除せず常設の作業場として残す(正=CLAUDE.md。旧 kouki-dev 時代の「削除コミット」運用は廃止)。
import { rmSync, cpSync, readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = process.env.KOUKI_ROOT || join(dirname(fileURLToPath(import.meta.url)), '../..');
const src = join(root, 'public'), dst = join(root, 'public/dev');

// dst が src の内側にあるため cpSync(src, dst) は不可(ERR_FS_CP_EINVAL)。
// トップレベル要素を個別にコピーし、dev/ 自身・sims/・lib/・og.png を除外する。
const EXCLUDE = new Set(['dev', 'sims', 'lib', 'og.png']);
rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
for (const name of readdirSync(src)) {
  if (EXCLUDE.has(name)) continue;
  cpSync(join(src, name), join(dst, name), { recursive: true });
}

function patch(file, from, to, label) {
  const p = join(dst, file), t = readFileSync(p, 'utf8');
  const n = t.split(from).length - 1;
  if (n !== 1) { console.error(`NG: ${file} のパッチ対象「${label}」が ${n} 箇所(1箇所のはず)`); process.exit(1); }
  writeFileSync(p, t.replace(from, to));
}
patch('game.js', 'const DEV = false;', 'const DEV = true; ', 'DEVフラグ');
patch('index.html', '<title>ARMOR ARENA — 鋼機工廠</title>',
  '<meta name="robots" content="noindex">\n<title>【DEV】ARMOR ARENA — 鋼機工廠</title>', 'noindex+DEVタイトル');
patch('index.html', '<script src="lib/api.js">', '<script src="../lib/api.js">', 'lib/api.js 参照');
patch('index.html', '<script src="lib/share.js">', '<script src="../lib/share.js">', 'lib/share.js 参照');

if (existsSync(join(dst, 'sims'))) { console.error('NG: sims/ が複製されている(除外不全)'); process.exit(1); }
if (existsSync(join(dst, 'dev'))) { console.error('NG: dev/ が入れ子に複製されている(除外不全)'); process.exit(1); }
console.log('public/dev 生成完了(commit/push すると Pages の /dev/ で人間確認できる)');
console.log('シム調整はこの中の sim.js / parts.js / fields.js を編集して反復。確定したら release-sim.mjs。');
