const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const BASE = __dirname;
const MAP_FILE = path.join(BASE, 'community_mapping_photo_list.xlsx');
const RESULTS_FILE = path.join(BASE, 'review-results.json');

function main() {
  if (!fs.existsSync(RESULTS_FILE)) {
    console.error('review-results.json 파일이 없습니다. 먼저 review.html에서 결과를 내보내세요.');
    process.exit(1);
  }

  const results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'));
  const matches = results.filter(r => r.result === 'match');
  console.log(`review-results.json: 전체 ${results.length}개, 일치 ${matches.length}개, 불일치 ${results.length - matches.length}개`);

  if (matches.length === 0) {
    console.log('일치한 매칭이 없어서 엑셀을 수정하지 않습니다.');
    return;
  }

  console.log('\n=== 엑셀 읽기 ===');
  const mapWb = XLSX.readFile(MAP_FILE);
  const mapWs = mapWb.Sheets[mapWb.SheetNames[0]];
  const mapRows = XLSX.utils.sheet_to_json(mapWs, { header: 1 });
  const headers = mapRows[0];

  let commentColIdx = headers.indexOf('패들렛댓글');
  if (commentColIdx === -1) {
    headers.push('패들렛댓글');
    commentColIdx = headers.length - 1;
  }
  const fileNameColIdx = headers.indexOf('파일명');

  const matchByAFile = {};
  for (const m of matches) {
    matchByAFile[m.aFile] = m;
  }

  let updated = 0;
  for (let i = 1; i < mapRows.length; i++) {
    const fileName = mapRows[i][fileNameColIdx] || '';
    const match = matchByAFile[fileName];
    if (match) {
      const padletInfo = findPadletComment(match.bFile);
      if (padletInfo) {
        mapRows[i][commentColIdx] = padletInfo;
        updated++;
      }
    }
  }

  console.log(`패들렛댓글 반영: ${updated}개`);

  const newWs = XLSX.utils.aoa_to_sheet(mapRows);
  newWs['!cols'] = mapWs['!cols'];
  mapWb.Sheets[mapWb.SheetNames[0]] = newWs;
  const buf = XLSX.write(mapWb, { type: 'buffer', bookType: 'xlsx' });
  fs.writeFileSync(MAP_FILE, buf);
  console.log('community_mapping_photo_list.xlsx 저장 완료');
}

function findPadletComment(bFileName) {
  try {
    const padletWb = XLSX.readFile(path.join(BASE, 'Padlet - 3.xlsx'));
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

    for (const p of posts) {
      const fn = extractFilename(p['첨부 링크']);
      if (fn === bFileName) {
        const texts = commentMap[p['게시물 번호']] || [];
        return texts.join(' | ') || null;
      }
    }
  } catch (e) {
    console.error('Padlet 파일 읽기 오류:', e.message);
  }
  return null;
}

function extractFilename(url) {
  if (!url || typeof url !== 'string') return '';
  return decodeURIComponent(url.split('?')[0].split('/').pop());
}

main();
