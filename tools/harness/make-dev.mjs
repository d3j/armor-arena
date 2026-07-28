// kouki-dev(開発版)を生成する: シム調整の試験場。本番 kouki/ のシムと共有コードを汚さない。
//   node tools/harness/make-dev.mjs
// 生成物: public/dev/ … 本番のコピーに以下のパッチを当てたもの
//   - game.js: DEV=true(通信・リプレイ発行/再生を無効化)
//   - index.html: noindex+タイトルに【開発版】
//   - sims/(リプレイ再生無効のため不要)と og.png は複製しない
// 運用(リプレイ互換の掟5): make-dev → commit/push → 人間が kouki-dev/ で確認 → 確定したら
// release-sim.mjs で本番へ一括リリース → kouki-dev は削除コミット。
import { rmSync, cpSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = process.env.KOUKI_ROOT || join(dirname(fileURLToPath(import.meta.url)), '../..');
const src = join(root, 'public'), dst = join(root, 'public/dev');

rmSync(dst, { recursive: true, force: true });
cpSync(src, dst, { recursive: true,
  filter: (s) => !s.includes(`${join(src, 'sims')}`) && !s.endsWith('og.png') });

function patch(file, from, to, label) {
  const p = join(dst, file), t = readFileSync(p, 'utf8');
  const n = t.split(from).length - 1;
  if (n !== 1) { console.error(`NG: ${file} のパッチ対象「${label}」が ${n} 箇所(1箇所のはず)`); process.exit(1); }
  writeFileSync(p, t.replace(from, to));
}
patch('game.js', 'const DEV = false;', 'const DEV = true; ', 'DEVフラグ');
patch('index.html', '<title>鋼機工廠', '<meta name="robots" content="noindex">\n<title>【開発版】鋼機工廠', 'noindex+開発版タイトル');

if (existsSync(join(dst, 'sims'))) { console.error('NG: sims/ が複製されている(filter不全)'); process.exit(1); }
console.log('kouki-dev 生成完了 → public/dev/(commit/push すると Pages の /dev/ で人間確認できる)');
console.log('シム調整はこの中の sim.js / parts.js / fields.js を編集して反復。確定したら release-sim.mjs。');
