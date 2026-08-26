const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const exifr = require('exifr');

const PHOTOS_DIR = path.join(__dirname, '새사진');
const EXCEL_FILE = path.join(__dirname, 'community_mapping_photo_list.xlsx');

async function main() {
  if (!fs.existsSync(PHOTOS_DIR)) {
    console.error('새사진 폴더가 없습니다.');
    process.exit(1);
  }

  const files = fs.readdirSync(PHOTOS_DIR).filter(f =>
    /\.(jpe?g)$/i.test(f)
  );

  if (files.length === 0) {
    console.log('새사진 폴더에 jpg/jpeg 파일이 없습니다.');
    return;
  }

  console.log(`${files.length}개 파일 발견\n`);

  const wb = XLSX.readFile(EXCEL_FILE);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const headers = rows[0];
  let nextNo = 0;
  for (let i = 1; i < rows.length; i++) {
    const n = rows[i][0];
    if (typeof n === 'number' && n > nextNo) nextNo = n;
  }
  nextNo += 1;

  const colIdx = {
    no: headers.indexOf('연번'),
    file: headers.indexOf('파일명'),
    date: headers.indexOf('촬영일자'),
    time: headers.indexOf('촬영시각'),
    lat: headers.indexOf('위도(Lat)'),
    lng: headers.indexOf('경도(Lng)'),
    bearing: headers.indexOf('방위각'),
    addr: headers.indexOf('주소(오버레이 텍스트)'),
  };

  const added = [];
  const skipped = [];

  for (const file of files) {
    const filePath = path.join(PHOTOS_DIR, file);
    try {
      const exif = await exifr.parse(filePath, true);
      const lat = exif.latitude;
      const lng = exif.longitude;
      if (lat == null || lng == null) {
        skipped.push(file);
        continue;
      }

      const dt = exif.DateTimeOriginal || exif.CreateDate || exif.ModifyDate || null;
      let dateStr = '';
      let timeStr = '';
      if (dt) {
        const d = new Date(dt);
        if (!isNaN(d.getTime())) {
          dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        }
      }

      const row = new Array(headers.length).fill('');
      row[colIdx.no] = nextNo;
      row[colIdx.file] = file;
      row[colIdx.date] = dateStr;
      row[colIdx.time] = timeStr;
      row[colIdx.lat] = lat;
      row[colIdx.lng] = lng;
      if (colIdx.bearing >= 0 && exif.GPSImgDirection != null) {
        row[colIdx.bearing] = `${Math.round(exif.GPSImgDirection)}°`;
      }

      rows.push(row);
      added.push({ no: nextNo, file, lat, lng, date: dateStr, time: timeStr });
      nextNo++;
    } catch (e) {
      skipped.push(file);
    }
  }

  if (added.length > 0) {
    const newWs = XLSX.utils.aoa_to_sheet(rows);
    newWs['!cols'] = ws['!cols'];
    wb.Sheets[wb.SheetNames[0]] = newWs;
    XLSX.writeFile(wb, EXCEL_FILE);
  }

  console.log('=== 결과 ===');
  console.log(`추가됨: ${added.length}개`);
  added.forEach(a => {
    console.log(`  연번 ${a.no} | ${a.file} | ${a.date} ${a.time} | ${a.lat}, ${a.lng}`);
  });

  if (skipped.length > 0) {
    console.log(`\n건너뜀 (GPS 없음): ${skipped.length}개`);
    skipped.forEach(f => console.log(`  - ${f}`));
  }

  if (added.length === 0 && skipped.length === 0) {
    console.log('처리된 파일이 없습니다.');
  }
}

main();
