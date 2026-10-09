'use strict';
const fs = require('fs');
const path = require('path');

const IMG_SERVER = 'https://cindy-buffer-workflow-marketplace.trycloudflare.com';
const VID_SERVERS = [];
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

async function stage1(id) {
  const tDir = path.join('templates', id);
  const tpl = JSON.parse(fs.readFileSync(path.join(tDir, 'template.json'), 'utf8'));
  const baseImgB64 = fs.readFileSync(path.join(tDir, 'base.png')).toString('base64');
  log(id, '[image] submitting...');
  const job = await postJob(IMG_SERVER, '/generate/accessory_flux_lab', {
    anh_nguoi_base64: baseImgB64,
    anh_phu_kien_url: PRODUCT_URL,
    prompt: tpl.image_prompt,
    dan_lai: false, // BAT mac dinh o AccessoryFluxLab (lam cho ca ghep phu kien noi chuoi) -
                     // voi THAY NGUYEN SAN PHAM thi no dan de pixel anh GOC trong vung duoi
                     // nguong, lam san pham cu "song lai" mot phan. PHAI tat cho use case nay.
    test_case: 'baocao-' + id,
  });
  await pollJob(IMG_SERVER, job.job_id, id + ' [image]');
  fs.mkdirSync(path.join('bao-cao', id), { recursive: true });
  await downloadResult(IMG_SERVER, job.job_id, path.join('bao-cao', id, 'test_preview_image.png'));
  log(id, '[image] DONE ->', job.job_id);
  return { id, tpl, imageJobId: job.job_id };
}

async function stage2(entry, vidServer) {
  const { id, tpl, imageJobId } = entry;
  const chuyenDong = [tpl.effect_prompt, SHARED.preserve_product_clause].filter(Boolean).join(' ');
  const anhUrl = IMG_SERVER + '/jobs/' + imageJobId + '/result';
  const body = { anh_url: anhUrl, chuyen_dong: chuyenDong, test_case: 'baocao-' + id, ...(tpl.params || {}) };
  log(id, '[video] submitting on', vidServer, '...');
  const job = await postJob(vidServer, '/generate/image_to_video_wan22', body);
  await pollJob(vidServer, job.job_id, id + ' [video]');
  await downloadResult(vidServer, job.job_id, path.join('bao-cao', id, 'test_result.mp4'));
  log(id, '[video] DONE ->', job.job_id);
  return { id, videoJobId: job.job_id };
}

(async () => {
  log('templates found:', templateIds.join(', '));
  log('=== STAGE 1: image generation (sequential, 1 GPU) ===');
  const stage1Results = [];
  const failed1 = [];
  for (const id of templateIds) {
    try { stage1Results.push(await stage1(id)); }
    catch (e) { log(id, '!!! STAGE1 FAILED:', e.message); failed1.push({ id, error: e.message }); }
  }
  fs.writeFileSync('bao-cao/_stage1_manifest.json', JSON.stringify({ imgServer: IMG_SERVER, ok: stage1Results.map(r => ({ id: r.id, imageJobId: r.imageJobId })), failed: failed1 }, null, 2));
  log('stage1 ok:', stage1Results.length, '/ failed:', failed1.length);

  if (!VID_SERVERS.length) {
    log('=== STAGE 1 ONLY (no video server given yet) === done, waiting for video server URL(s)');
    return;
  }
  log('=== STAGE 2: video generation (parallel across 2 GPUs) ===');
  const half = Math.ceil(stage1Results.length / 2);
  const groupA = stage1Results.slice(0, half);
  const groupB = stage1Results.slice(half);
  const failed2 = [];
  async function runGroup(group, server) {
    for (const entry of group) {
      try { await stage2(entry, server); }
      catch (e) { log(entry.id, '!!! STAGE2 FAILED:', e.message); failed2.push({ id: entry.id, error: e.message }); }
    }
  }
  await Promise.all([runGroup(groupA, VID_SERVERS[0]), runGroup(groupB, VID_SERVERS[1])]);
  fs.writeFileSync('bao-cao/_stage2_failed.json', JSON.stringify(failed2, null, 2));
  log('=== ALL DONE === stage2 failed:', failed2.length);
})().catch(e => { log('FATAL', e.stack || e.message); process.exit(1); });
