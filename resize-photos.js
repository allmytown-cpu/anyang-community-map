const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const BASE_DIR = __dirname;
const OUTPUT_DIR = path.join(BASE_DIR, 'photos');
const SOURCE_FOLDERS = ['1회차', '2회차', '3회차', '새사진'];
const MAX_WIDTH = 800;
const JPEG_QUALITY = 80;

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`${OUTPUT_DIR} 폴더 생성됨`);
  }

  let total = 0;
  let skipped = 0;

  for (const folder of SOURCE_FOLDERS) {
    const srcDir = path.join(BASE_DIR, folder);
    if (!fs.existsSync(srcDir)) {
      console.log(`${folder}/ 폴더 없음 - 건너뜀`);
      continue;
    }

    const files = fs.readdirSync(srcDir).filter(f => /\.(jpe?g)$/i.test(f));
    if (files.length === 0) continue;

    console.log(`${folder}/ : ${files.length}개 파일`);

    for (const file of files) {
      const src = path.join(srcDir, file);
      const dst = path.join(OUTPUT_DIR, file);

      try {
        const metadata = await sharp(src).metadata();
        const w = metadata.width || 0;
        const h = metadata.height || 0;

        if (w <= MAX_WIDTH && h <= MAX_WIDTH) {
          fs.copyFileSync(src, dst);
        } else {
          await sharp(src)
            .resize({ width: MAX_WIDTH, withoutEnlargement: true })
            .jpeg({ quality: JPEG_QUALITY })
            .toFile(dst);
        }
        total++;
      } catch (e) {
        console.log(`  건너뜀: ${file} (${e.message})`);
        skipped++;
      }
    }
  }

  console.log(`\n완료: ${total}개 리사이즈, ${skipped}개 건너뜀`);
  console.log(`출력: ${OUTPUT_DIR}`);
}

main();
