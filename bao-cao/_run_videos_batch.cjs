'use strict';
const fs = require('fs');
const path = require('path');

const SHARED = JSON.parse(fs.readFileSync('templates/_shared.json', 'utf8'));

// id -> { imageJobId, imgServer }
const ENTRIES = {
  'dome-product': { imageJobId: '0a8f1d8cf7884f21aa04df27cd24f0b3', imgServer: 'https://examined-jobs-heard-franklin.trycloudflare.com' },
  'led-strips-colorful': { imageJobId: '1f206e81c8b940c2a59cc664540d99f2', imgServer: 'https://examined-jobs-heard-franklin.trycloudflare.com' },
  'water-splashes-light': { imageJobId: '48e5ef9e425a49159309c2b8b11dbb7b', imgServer: 'https://cindy-buffer-workflow-marketplace.trycloudflare.com' },
  'smoky-pedestal': { imageJobId: 'e3e6e16dbf9148a18ae2df81654dcb03', imgServer: 'https://examined-jobs-heard-franklin.trycloudflare.com' },
  'helicopter-city-product': { imageJobId: 'dcbbfb4ae54847daad097eb262d41a0c', imgServer: 'https://cindy-buffer-workflow-marketplace.trycloudflare.com' },
  'smoke-reveal': { imageJobId: '39fc86f00ae64fd7997dd5a527105f15', imgServer: 'https://examined-jobs-heard-franklin.trycloudflare.com' },
  'snow': { imageJobId: '66d8a4cbc7f14c5aba231ad7ae11ccb3', imgServer: 'https://cindy-buffer-workflow-marketplace.trycloudflare.com' },
  'roses-smoke': { imageJobId: '94ebc768cd3348dba9e46e5bb54a9e05', imgServer: 'https://examined-jobs-heard-franklin.trycloudflare.com' },
  'liquid-gold': { imageJobId: '5cb5471669124294a3028d78e7689c38', imgServer: 'https://cindy-buffer-workflow-marketplace.trycloudflare.com' },
};

const VID_SERVERS = [
  'https://jackson-surround-border-submitted.trycloudflare.com',
  'https://missed-throw-spin-somebody.trycloudflare.com',
];

function log(...a) { console.log(new Date().toISOString().slice(11, 19), ...a); }

async function postJob(base, p, body) {
  const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const txt = await r.text();
  let j; try { j = JSON.parse(txt); } catch (e) { j = { raw: txt.slice(0, 300) }; }
  if (!r.ok) throw new Error('HTTP ' + r.status + ': ' + (j.detail || j.raw || txt).toString().slice(0, 400));
  return j;
}
async function pollJob(base, id, label) {
  for (;;) {
    await new Promise(r => setTimeout(r, 10000));
    const r = await fetch(base + '/jobs/' + id, { signal: AbortSignal.timeout(20000) }).catch(e => { throw new Error('poll network error: ' + e.message); });
    const j = await r.json();
    log(label, j.stage, j.progress, j.elapsed + 's');
    if (j.status !== 'processing') {
      if (j.status === 'error') throw new Error(label + ' job error: ' + j.error + (j.where ? ' @ ' + j.where : ''));
      return j;
    }
  }
}
async function downloadResult(base, id, outPath) {
  const r = await fetch(base + '/jobs/' + id + '/result');
  if (!r.ok) throw new Error('download result HTTP ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(outPath, buf);
}

async function stage2(id, vidServer) {
  const { imageJobId, imgServer } = ENTRIES[id];
  const tpl = JSON.parse(fs.readFileSync(path.join('templates', id, 'template.json'), 'utf8'));
  const chuyenDong = [tpl.effect_prompt, SHARED.preserve_product_clause].filter(Boolean).join(' ');
  const anhUrl = imgServer + '/jobs/' + imageJobId + '/result';
  const body = { anh_url: anhUrl, chuyen_dong: chuyenDong, test_case: 'baocao-' + id, ...(tpl.params || {}) };
  log(id, '[video] submitting on', vidServer, '...');
  const job = await postJob(vidServer, '/generate/image_to_video_wan22', body);
  log(id, 'JOB_ID', job.job_id, 'on', vidServer);
  await pollJob(vidServer, job.job_id, id + ' [video]');
  await downloadResult(vidServer, job.job_id, path.join('bao-cao', id, 'test_result.mp4'));
  log(id, '[video] DONE ->', job.job_id);
}

(async () => {
  const pending = Object.keys(ENTRIES).filter(id => !fs.existsSync(path.join('bao-cao', id, 'test_result.mp4')));
  if (!pending.length) { log('nothing pending, all done.'); return; }
  log('pending:', pending.join(', '));
  const half = Math.ceil(pending.length / 2);
  const groupA = pending.slice(0, half);
  const groupB = pending.slice(half);
  log('groupA (vidServer1):', groupA.join(', '));
  log('groupB (vidServer2):', groupB.join(', '));
  async function runGroup(group, server) {
    for (const id of group) {
      try { await stage2(id, server); }
      catch (e) { log(id, '!!! FAILED:', e.message); }
    }
  }
  await Promise.all([runGroup(groupA, VID_SERVERS[0]), runGroup(groupB, VID_SERVERS[1])]);
  log('=== batch run done ===');
})().catch(e => { log('FATAL', e.stack || e.message); process.exit(1); });
