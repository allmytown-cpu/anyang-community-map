# 안양천변 커뮤니티매핑

안양천변 도보 경로 및 지역 커뮤니티매핑을 위한 인터랙티브 지도 프로토타입입니다.

## 구성

| 파일 | 설명 |
|---|---|
| `index.html` | **메인 지도** — GitHub Pages로 배포되는 Leaflet 기반 읽기 전용 지도. GPS 웨이포인트와 도보 경로를 표시합니다. |
| `upload-test.html` | **실험용** — 사진 업로드, EXIF GPS 추출, 수동 마커 지정 기능. 향후 Firebase 등 백엔드 연결 예정. |
| `community_mapping_photo_list.xlsx` | 원본 엑셀 데이터 (연번, GPS 좌표, 촬영일시). |

## 기술 스택

- [Leaflet](https://leafletjs.com/) 1.9.4 — 지도 라이브러리
- [OpenStreetMap](https://www.openstreetmap.org/) — 타일 제공
- [exif-js](https://github.com/exif-js/exif-js) 2.3.0 — EXIF GPS 추출 (upload-test용)

## 배포

`index.html`이 GitHub Pages의 기본 페이지로 자동 배포됩니다.  
WordPress 사이트에서는 iframe으로 삽입하여 사용할 수 있습니다.

```html
<iframe src="https://<username>.github.io/anyang-community-map/" width="100%" height="600" frameborder="0"></iframe>
```

## 로컬 실행

별도의 서버 없이 브라우저에서 `index.html`을 열면 바로 동작합니다.  
`upload-test.html`은 `window.storage` API가 필요한 기능이 포함되어 있어, 지원되는 환경에서만 정상 작동합니다.
