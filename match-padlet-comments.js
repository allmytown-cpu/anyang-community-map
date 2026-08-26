const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const sharp = require('sharp');

const BASE = __dirname;
const PADLET_FILE = path.join(BASE, 'Padlet - 3.xlsx');
const A_FOLDERS = ['새사진'];
const B_FOLDERS = ['__', '___'];

const DHASH_THRESHOLD = 10;
const PHASH_THRESHOLD = 10;

function extractFilename(url) {
  if (!url || typeof url !== 'string') return '';
  return decodeURIComponent(url.split('?')[0].split('/').pop());
}

function hamming(h1, h2) {
  let d = 0;
  for (let i = 0; i < h1.length; i++) {
    if (h1[i] !== h2[i]) d++;
  }
  return d;
}

async function dHash(filePath, size = 32) {
  try {
    const { data } = await sharp(filePath)
      .resize(size + 1, size, { fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let hash = '';
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = y * (size + 1) + x;
        hash += data[idx] < data[idx + 1] ? '1' : '0';
      }
    }
    return hash;
  } catch (e) { return null; }
}

function dct2d(matrix, N) {
  const result = Array.from({ length: N }, () => new Float64Array(N));
  for (let u = 0; u < N; u++) {
    for (let v = 0; v < N; v++) {
      let sum = 0;
      for (let x = 0; x < N; x++) {
        for (let y = 0; y < N; y++) {
          sum += matrix[x][y]
            * Math.cos((2 * x + 1) * u * Math.PI / (2 * N))
            * Math.cos((2 * y + 1) * v * Math.PI / (2 * N));
        }
      }
      const cu = u === 0 ? 1 / Math.SQRT2 : 1;
      const cv = v === 0 ? 1 / Math.SQRT2 : 1;
      result[u][v] = 0.25 * cu * cv * sum;
    }
  }
  return result;
}

async function pHash(filePath, imgSize = 64, dctSize = 8) {
  try {
    const { data } = await sharp(filePath)
      .resize(imgSize, imgSize, { fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const matrix = [];
    for (let y = 0; y < imgSize; y++) {
      matrix[y] = new Float64Array(imgSize);
      for (let x = 0; x < imgSize; x++) {
        matrix[y][x] = data[y * imgSize + x];
      }
    }
    const dct = dct2d(matrix, imgSize);
    const lowFreq = [];
    for (let y = 0; y < dctSize; y++) {
      for (let x = 0; x < dctSize; x++) {
        lowFreq.push(dct[y][x]);
      }
    }
    let sum = 0;
    for (const v of lowFreq) sum += v;
    const mean = sum / lowFreq.length;
    let hash = '';
    for (const v of lowFreq) {
      hash += v > mean ? '1' : '0';
    }
    return hash;
  } catch (e) { return null; }
}

function collectFiles(folders) {
  const files = [];
  for (const folder of folders) {
    const dir = path.join(BASE, folder);
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir).filter(f => /\.(jpe?g)$/i.test(f));
    for (const f of entries) {
      files.push({ folder, name: f, path: path.join(dir, f) });
    }
  }
  return files;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function main() {
  console.log('=== A그룹 해시 계산 (dHash + pHash) ===');
  const aFiles = collectFiles(A_FOLDERS);
  console.log(`A그룹: ${aFiles.length}개 파일`);
  const aHashes = [];
  for (const f of aFiles) {
    const [dh, ph] = await Promise.all([dHash(f.path), pHash(f.path)]);
    if (dh && ph) aHashes.push({ ...f, dHash: dh, pHash: ph });
    if (aHashes.length % 50 === 0) process.stderr.write(`${aHashes.length}..`);
  }
  console.log(`\nA그룹 해시 완료: ${aHashes.length}개`);

  console.log('\n=== B그룹 해시 계산 (dHash + pHash) ===');
  const bFiles = collectFiles(B_FOLDERS);
  console.log(`B그룹: ${bFiles.length}개 파일`);
  const bHashes = [];
  for (const f of bFiles) {
    const [dh, ph] = await Promise.all([dHash(f.path), pHash(f.path)]);
    if (dh && ph) bHashes.push({ ...f, dHash: dh, pHash: ph });
    if (bHashes.length % 50 === 0) process.stderr.write(`${bHashes.length}..`);
  }
  console.log(`\nB그룹 해시 완료: ${bHashes.length}개`);

  console.log('\n=== Padlet 댓글 로드 ===');
  const padletWb = XLSX.readFile(PADLET_FILE);
  const posts = XLSX.utils.sheet_to_json(padletWb.Sheets['게시물']);
  const rawComments = XLSX.utils.sheet_to_json(padletWb.Sheets['댓글']);

  const commentMap = {};
  for (const c of rawComments) {
    const num = c['게시물 번호'];
    const text = (c['댓글'] || '').trim();
    if (!text || text === '댓글 없음') continue;
    if (!commentMap[num]) commentMap[num] = [];
    commentMap[num].push(text);
  }

  const postByFilename = {};
  for (const p of posts) {
    const fn = extractFilename(p['첨부 링크']);
    if (!fn) continue;
    const texts = commentMap[p['게시물 번호']] || [];
    postByFilename[fn] = {
      postNum: p['게시물 번호'],
      comments: texts.join(' | '),
      createdAt: p['만든 시간'] || '',
    };
  }
  console.log(`Padlet 게시물: ${posts.length}개, 댓글 있는 게시물: ${Object.values(postByFilename).filter(p => p.comments).length}개`);

  console.log('\n=== 매칭 수행 (dual hash) ===');
  const matches = [];

  for (const b of bHashes) {
    let bestDist = Infinity;
    let bestDH = Infinity;
    let bestPH = Infinity;
    let bestA = null;

    for (const a of aHashes) {
      const d = hamming(b.dHash, a.dHash);
      if (d < bestDist) {
        bestDist = d;
        bestDH = d;
        bestPH = hamming(b.pHash, a.pHash);
        bestA = a;
      }
    }

    const padletInfo = postByFilename[b.name] || null;

    matches.push({
      bFile: b.name,
      bFolder: b.folder,
      bPath: path.relative(BASE, b.path).replace(/\\/g, '/'),
      aFile: bestA ? bestA.name : '',
      aPath: bestA ? path.relative(BASE, bestA.path).replace(/\\/g, '/') : '',
      dHashDist: bestDH,
      pHashDist: bestPH,
      comment: padletInfo ? padletInfo.comments : '',
      padletPostNum: padletInfo ? padletInfo.postNum : '',
      category: '',
    });
  }

  for (const m of matches) {
    const dualMatch = m.dHashDist <= DHASH_THRESHOLD && m.pHashDist <= PHASH_THRESHOLD;
    if (dualMatch) {
      m.category = 'confirmed';
    } else if (m.dHashDist <= DHASH_THRESHOLD * 3 || m.pHashDist <= PHASH_THRESHOLD * 3) {
      m.category = 'needs_check';
    } else {
      m.category = 'no_match';
    }
  }

  console.log('\n=== 중복 매칭 검사 ===');
  const aMatchCount = {};
  for (const m of matches) {
    if (m.category === 'confirmed' && m.aFile) {
      if (!aMatchCount[m.aFile]) aMatchCount[m.aFile] = [];
      aMatchCount[m.aFile].push(m);
    }
  }

  let demoted = 0;
  for (const [aFile, mArray] of Object.entries(aMatchCount)) {
    if (mArray.length > 1) {
      for (const m of mArray) {
        m.category = 'needs_check';
        demoted++;
      }
    }
  }
  console.log(`중복 매칭으로 확인필요 하향: ${demoted}개`);

  const confirmed = matches.filter(m => m.category === 'confirmed');
  const needsCheck = matches.filter(m => m.category === 'needs_check');
  const noMatch = matches.filter(m => m.category === 'no_match');

  console.log(`\n확실한 매칭: ${confirmed.length}개`);
  console.log(`확인 필요: ${needsCheck.length}개`);
  console.log(`매칭 없음: ${noMatch.length}개`);

  console.log('\n=== review.html 생성 ===');
  const html = buildReviewHtml(confirmed, needsCheck, noMatch);
  fs.writeFileSync(path.join(BASE, 'review.html'), html, 'utf-8');
  console.log('review.html 저장 완료');
  console.log('\n=== 완료 ===');
}

function buildReviewHtml(confirmed, needsCheck, noMatch) {
  const allItems = [...confirmed, ...needsCheck, ...noMatch];
  const matchData = allItems.map(m => ({
    bFile: m.bFile,
    aFile: m.aFile,
    aPath: m.aPath,
    bPath: m.bPath,
    d: m.dHashDist,
    p: m.pHashDist,
    c: m.comment || '',
    cat: m.category,
  }));

  let rows = '';
  for (let i = 0; i < allItems.length; i++) {
    const m = allItems[i];
    rows += `
        <tr data-i="${i}">
          <td><span class="cell-fn">${escapeHtml(m.aFile)}</span><br><img src="${escapeHtml(m.aPath)}" loading="lazy"></td>
          <td><span class="cell-fn">${escapeHtml(m.bFile)}</span><br><img src="${escapeHtml(m.bPath)}" loading="lazy"></td>
          <td class="num">${m.dHashDist}</td>
          <td class="num">${m.pHashDist}</td>
          <td class="comment">${escapeHtml(m.comment || '(없음)')}</td>
          <td class="judge" data-i="${i}"></td>
        </tr>`;
  }

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>매칭 검토 - review.html</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,'Malgun Gothic',sans-serif;background:#f5f5f5;padding:20px}
  h1{margin-bottom:10px}
  .summary{background:#fff;border-radius:8px;padding:16px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,.1);display:flex;flex-wrap:wrap;align-items:center;gap:16px}
  .summary span{font-size:15px}
  .summary .num{font-size:20px;font-weight:700}
  .toolbar{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;align-items:center}
  .filter button{padding:6px 16px;border:2px solid #ddd;border-radius:6px;background:#fff;cursor:pointer;font-size:14px}
  .filter button.active{border-color:#333;background:#333;color:#fff}
  table{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)}
  th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #eee;vertical-align:top}
  th{background:#fafafa;font-weight:600;font-size:13px;color:#555}
  td img{max-width:260px;max-height:190px;margin-top:4px;border-radius:4px;display:block}
  .cell-fn{font-size:11px;color:#888;word-break:break-all}
  .num{text-align:center;font-family:monospace;font-size:14px}
  .comment{max-width:220px;font-size:13px;color:#333}
  .judge{text-align:center;white-space:nowrap}
  .judge button{padding:5px 12px;margin:2px;border:none;border-radius:4px;cursor:pointer;font-size:13px;font-weight:600}
  .btn-m{background:#d4edda;color:#155724}.btn-m:hover{background:#28a745;color:#fff}
  .btn-n{background:#f8d7da;color:#721c24}.btn-n:hover{background:#dc3545;color:#fff}
  .badge-m{display:inline-block;padding:5px 14px;border-radius:4px;font-weight:700;font-size:13px;background:#28a745;color:#fff}
  .badge-n{display:inline-block;padding:5px 14px;border-radius:4px;font-weight:700;font-size:13px;background:#dc3545;color:#fff}
  .progress-bar{width:200px;height:18px;background:#eee;border-radius:9px;overflow:hidden;display:inline-block;vertical-align:middle}
  .progress-fill{height:100%;background:#28a745;transition:width .3s}
  .tb-btn{padding:8px 20px;border:none;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer}
  #export-btn{background:#007bff;color:#fff}#export-btn:hover{background:#0056b3}
  #reset-btn{border:2px solid #dc3545;background:#fff;color:#dc3545}#reset-btn:hover{background:#dc3545;color:#fff}
</style>
</head>
<body>
  <h1>매칭 검토 (dHash + pHash dual hash)</h1>
  <div class="summary">
    <span>확실: <span class="num" style="color:green" id="s-conf">${confirmed.length}</span></span>
    <span>확인필요: <span class="num" style="color:orange" id="s-chk">${needsCheck.length}</span></span>
    <span>없음: <span class="num" style="color:red" id="s-none">${noMatch.length}</span></span>
    <span id="progress-text" style="color:#555">검토: 0/${allItems.length}</span>
    <span class="progress-bar"><span class="progress-fill" id="progress-fill" style="width:0%"></span></span>
  </div>
  <div class="toolbar">
    <div class="filter">
      <button class="active" data-f="all">전체</button>
      <button data-f="confirmed">확실</button>
      <button data-f="needs_check">확인필요</button>
      <button data-f="no_match">없음</button>
      <button data-f="judged">판단완료</button>
      <button data-f="unjudged">미판단</button>
    </div>
    <span style="flex:1"></span>
    <button class="tb-btn" id="export-btn">결과 내보내기 (JSON)</button>
    <button class="tb-btn" id="reset-btn">전체 초기화</button>
  </div>
  <table>
    <thead>
      <tr><th>A그룹 사진</th><th>B그룹 사진</th><th>dHash</th><th>pHash</th><th>패들렛 댓글</th><th>판단</th></tr>
    </thead>
    <tbody>${rows}
    </tbody>
  </table>
<script>
(function(){
  var DATA = ${JSON.stringify(matchData)};
  var KEY = 'review-judgments';
  var TOTAL = DATA.length;
  var cur = 'all';

  function load(){ try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){return{}} }
  function save(j){ localStorage.setItem(KEY, JSON.stringify(j)); }

  function renderJudge(){
    var j = load();
    var cnt = 0;
    document.querySelectorAll('.judge[data-i]').forEach(function(td){
      var i = +td.getAttribute('data-i');
      var d = DATA[i];
      var k = d.bFile;
      var e = j[k];
      if(e) cnt++;
      var tr = td.closest('tr');
      if(e){
        var isM = e.result==='match';
        td.innerHTML = '<span class="'+(isM?'badge-m':'badge-n')+'">'+(isM?'일치함':'불일치함')+'</span>'
          +'<br><button class="btn-m" data-r="match" data-i="'+i+'">일치</button> '
          +'<button class="btn-n" data-r="nomatch" data-i="'+i+'">불일치</button>';
      } else {
        td.innerHTML = '<button class="btn-m" data-r="match" data-i="'+i+'">일치</button> '
          +'<button class="btn-n" data-r="nomatch" data-i="'+i+'">불일치</button>';
      }
    });
    document.getElementById('progress-text').textContent = '검토: '+cnt+'/'+TOTAL;
    document.getElementById('progress-fill').style.width = (TOTAL?cnt/TOTAL*100:0)+'%';
    applyFilter();
  }

  function applyFilter(){
    var j = load();
    document.querySelectorAll('tbody tr').forEach(function(tr){
      var i = +tr.getAttribute('data-i');
      var d = DATA[i];
      var k = d.bFile;
      var judged = !!j[k];
      var show = false;
      if(cur==='all') show=true;
      else if(cur==='judged') show=judged;
      else if(cur==='unjudged') show=!judged;
      else show=(d.cat===cur);
      tr.style.display = show?'':'none';
    });
  }

  document.addEventListener('click', function(e){
    var btn = e.target;
    if(btn.dataset.r){
      var i = +btn.dataset.i;
      var d = DATA[i];
      var j = load();
      if(j[d.bFile] && j[d.bFile].result===btn.dataset.r){
        delete j[d.bFile];
      } else {
        j[d.bFile] = {aFile:d.aFile, result:btn.dataset.r};
      }
      save(j);
      renderJudge();
    }
    if(btn.dataset.f){
      cur = btn.dataset.f;
      document.querySelectorAll('.filter button').forEach(function(b){b.classList.remove('active')});
      btn.classList.add('active');
      applyFilter();
    }
    if(btn.id==='export-btn'){
      var j = load();
      var arr = [];
      Object.keys(j).forEach(function(k){ arr.push({bFile:k, aFile:j[k].aFile, result:j[k].result}); });
      var blob = new Blob([JSON.stringify(arr,null,2)],{type:'application/json'});
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'review-results.json';
      a.click();
      URL.revokeObjectURL(a.href);
    }
    if(btn.id==='reset-btn'){
      if(confirm('모든 판단 결과를 초기화하시겠습니까?')){
        localStorage.removeItem(KEY);
        renderJudge();
      }
    }
  });

  renderJudge();
})();
</script>
</body>
</html>`;
}

main().catch(e => { console.error(e); process.exit(1); });
