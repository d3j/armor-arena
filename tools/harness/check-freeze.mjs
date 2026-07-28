// リプレイ凍結の等価性チェック: sims/v<REPLAY_V>/ が live の sim/parts/fields とバイト一致するか。
// シム改修時(REPLAY_V バンプ+新スナップショット作成後)と、kouki を触るセッションの最後に回す。
//   node tools/harness/check-freeze.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { REPLAY_V } from '../../public/replay.js';

const kouki = join(dirname(fileURLToPath(import.meta.url)), '../../public');
let ng = 0;
for (const f of ['sim.js', 'parts.js', 'fields.js']) {
  const live = readFileSync(join(kouki, f), 'utf8');
  let frozen = null;
  try { frozen = readFileSync(join(kouki, `sims/v${REPLAY_V}`, f), 'utf8'); } catch (e) {}
  if (frozen === null) { console.error(`NG: sims/v${REPLAY_V}/${f} がない(スナップショット未作成)`); ng++; }
  else if (frozen !== live) { console.error(`NG: sims/v${REPLAY_V}/${f} が live と不一致(シムを変えたなら REPLAY_V を上げて新スナップショットを作る)`); ng++; }
}
console.log(ng ? `check-freeze: ${ng} 件 NG` : `check-freeze: OK(v${REPLAY_V} == live)`);
process.exit(ng ? 1 : 0);
