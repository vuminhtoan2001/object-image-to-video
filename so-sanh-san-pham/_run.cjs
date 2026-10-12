'use strict';
// Chay image_prompt cua TUNG template voi nhieu san pham. Chay lai se bo qua anh da co.
const fs = require('fs');
const path = require('path');

const SERVER = process.env.SERVER || 'https://exist-atomic-beef-depot.trycloudflare.com';
const OUT = __dirname;
const TPL_ROOT = path.join(__dirname, '..', 'templates');
const PRODUCTS = [
  { key: 'tui-xach', url: 'https://lacamie.com/wp-content/uploads/2025/11/TX5A0807-TRANG-03-tui-xach-hobo-nhun-mieng-dinh-dinh-tan-da-scaled.jpg' },
  { key: 'ao-thun', url: 'https://file.hstatic.net/1000290074/file/ao-thun-be-trai-93204__11__c2d1cb4560964baeb744d7815d225139_grande.jpg' },
];
const MANIFEST = path.join(OUT, '_manifest.json');

function log(...a) { console.log(new Date().toISOString().slice(11, 19), ...a); }

async function run(id, p, tpl, baseB64, outPath) {
  const r = await fetch(SERVER + '/generate/accessory_flux_lab', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ anh_nguoi_base64: baseB64, anh_phu_kien_url: p.url, prompt: tpl.image_prompt, dan_lai: false }),
  });
  const job = await r.json();
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + JSON.stringify(job));
  const t0 = Date.now();
  for (;;) {
    await new Promise(r => setTimeout(r, 8000));
    const j = await (await fetch(SERVER + '/jobs/' + job.job_id)).json();
    if (j.status === 'error') throw new Error(j.error);
    if (j.status !== 'processing') break;
    if (Date.now() - t0 > 15 * 60e3) throw new Error('timeout');
  }
  const res = await fetch(SERVER + '/jobs/' + job.job_id + '/result');
  if (!res.ok) throw new Error('download HTTP ' + res.status);
  fs.writeFileSync(outPath, Buffer.from(await res.arrayBuffer()));
  return job.job_id;
}

(async () => {
  const m = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : { products: PRODUCTS, results: {} };
  m.products = PRODUCTS;
  const ids = fs.readdirSync(TPL_ROOT).filter(d => fs.existsSync(path.join(TPL_ROOT, d, 'template.json')));
  for (const id of ids) {
    const tpl = JSON.parse(fs.readFileSync(path.join(TPL_ROOT, id, 'template.json'), 'utf8'));
    const baseB64 = fs.readFileSync(path.join(TPL_ROOT, id, 'base.png')).toString('base64');
    fs.mkdirSync(path.join(OUT, id), { recursive: true });
    m.results[id] = m.results[id] || {};
    for (const p of PRODUCTS) { // server chi chay 1 job/luc -> chay tuan tu
      const outPath = path.join(OUT, id, p.key + '.png');
      if (fs.existsSync(outPath)) { log(id, p.key, 'skip (da co)'); continue; }
      log(id, p.key, 'submit...');
      try {
        const jobId = await run(id, p, tpl, baseB64, outPath);
        m.results[id][p.key] = { job_id: jobId };
        log(id, p.key, 'DONE');
      } catch (e) {
        m.results[id][p.key] = { error: e.message };
        log(id, p.key, 'LOI', e.message);
      }
      fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2));
    }
  }
  log('XONG TAT CA');
})();
