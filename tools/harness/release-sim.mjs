// kouki-dev で確定したシムを本番へ一括リリースする(リプレイ互換の掟3・5)。
//   node tools/harness/release-sim.mjs
// やること: ①kouki-dev のシム3ファイルを本番 kouki/ へコピー ②REPLAY_V を +1
//           ③新しい sims/v<新>/ に凍結スナップショット作成 ④等価性を即検証
// リリース後にやること(このスクリプトはやらない):
//   - node tools/harness/check-freeze.mjs と実ブラウザ検証
//   - workers/kouki の再デプロイ(サーバ権威シムも変わる。wrangler 認証のあるマシンで)
//   - public/dev/ の削除コミット
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = process.env.KOUKI_ROOT || join(dirname(fileURLToPath(import.meta.url)), '../..');
const dev = join(root, 'public/dev'), prod = join(root, 'public');
const TRIO = ['sim.js', 'parts.js', 'fields.js'];

for (const f of TRIO) if (!existsSync(join(dev, f))) { console.error(`NG: ${dev}/${f} がない(make-dev で開発版を作って調整してから)`); process.exit(1); }

// REPLAY_V を +1(replay.js)
const rpPath = join(prod, 'replay.js');
const rp = readFileSync(rpPath, 'utf8');
const m = /export const REPLAY_V = (\d+);/.exec(rp);
if (!m) { console.error('NG: replay.js に REPLAY_V が見つからない'); process.exit(1); }
const oldV = Number(m[1]), newV = oldV + 1;

// シム3ファイルを本番へ → 新スナップショット作成
for (const f of TRIO) copyFileSync(join(dev, f), join(prod, f));
mkdirSync(join(prod, `sims/v${newV}`), { recursive: true });
for (const f of TRIO) copyFileSync(join(prod, f), join(prod, `sims/v${newV}`, f));
writeFileSync(rpPath, rp.replace(m[0], `export const REPLAY_V = ${newV};`));

// 即時検証: 新スナップショット == 新live
let ng = 0;
for (const f of TRIO) {
  if (readFileSync(join(prod, f), 'utf8') !== readFileSync(join(prod, `sims/v${newV}`, f), 'utf8')) { console.error(`NG: sims/v${newV}/${f} 不一致`); ng++; }
}
if (ng) process.exit(1);
console.log(`リリース完了: REPLAY_V ${oldV} → ${newV} / sims/v${newV}/ 作成・等価性OK`);
console.log('残タスク: check-freeze+実ブラウザ検証 / workers/kouki 再デプロイ(申し送り可) / kouki-dev 削除コミット');
