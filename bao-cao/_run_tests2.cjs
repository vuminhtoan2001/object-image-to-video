'use strict';
const fs = require('fs');
const path = require('path');

const IMG_SERVERS = [
  'https://examined-jobs-heard-franklin.trycloudflare.com',
  'https://cindy-buffer-workflow-marketplace.trycloudflare.com',
];
const VID_SERVERS = [
  'https://jackson-surround-border-submitted.trycloudflare.com',
  'https://missed-throw-spin-somebody.trycloudflare.com',
];
const PRODUCT_URL = 'https://bizweb.dktcdn.net/thumb/grande/100/469/765/products/1503-9de8f3562b364e56b550ff30bc493122-2c0db7cc76fd4b7f8b3c767fb24bc277-d4f804d8fc474b4bae5f628ff0d632e0-master.jpg';

const SHARED = JSON.parse(fs.readFileSync('templates/_shared.json', 'utf8'));

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

const templateIds = fs.readdirSync('templates').filter(d => {
  const p = path.join('templates', d);
  return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'template.json'));
}).sort();

async function stage1(id, imgServer) {
  const tDir = path.join('templates', id);
  const tpl = JSON.parse(fs.readFileSync(path.join(tDir, 'template.json'), 'utf8'));
  const baseImgB64 = fs.readFileSync(path.join(tDir, 'base.png')).toString('base64');
  log(id, '[image] submitting on', imgServer, '...');
  const job = await postJob(imgServer, '/generate/accessory_flux_lab', {
    anh_nguoi_base64: baseImgB64,
    anh_phu_kien_url: PRODUCT_URL,
    prompt: tpl.image_prompt,
    dan_lai: false,
    test_case: 'baocao-' + id,
  });
  await pollJob(imgServer, job.job_id, id + ' [image]');
  fs.mkdirSync(path.join('bao-cao', id), { recursive: true });
  await downloadResult(imgServer, job.job_id, path.join('bao-cao', id, 'test_preview_image.png'));
  log(id, '[image] DONE ->', job.job_id, 'on', imgServer);
  return { id, tpl, imageJobId: job.job_id, imgServer };
}

(async () => {
  log('templates found:', templateIds.join(', '));
  log('=== STAGE 1: image generation (PARALLEL across 2 GPUs) ===');
  const half = Math.ceil(templateIds.length / 2);
  const groupA = templateIds.slice(0, half);
  const groupB = templateIds.slice(half);
  const results = [];
  const failed = [];
  async function runGroup(group, server) {
    for (const id of group) {
      try { results.push(await stage1(id, server)); }
      catch (e) { log(id, '!!! STAGE1 FAILED:', e.message); failed.push({ id, error: e.message }); }
    }
  }
  await Promise.all([runGroup(groupA, IMG_SERVERS[0]), runGroup(groupB, IMG_SERVERS[1])]);
  fs.writeFileSync('bao-cao/_stage1_manifest.json', JSON.stringify({ ok: results.map(r => ({ id: r.id, imageJobId: r.imageJobId, imgServer: r.imgServer })), failed }, null, 2));
  log('=== STAGE 1 DONE === ok:', results.length, '/ failed:', failed.length);
})().catch(e => { log('FATAL', e.stack || e.message); process.exit(1); });
