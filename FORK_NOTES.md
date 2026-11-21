# AI 수능 성적표: 포크 메모

원본: [hehee9/CSAT-benchmark](https://github.com/hehee9/CSAT-benchmark) (MIT). `LICENSE.md`의 원본 저작권 고지는 그대로 유지해야 합니다.
원본 저장소는 `upstream` 리모트로 등록되어 있습니다. 원본의 데이터 업데이트를 받으려면 `git fetch upstream` 후 병합하세요.

## 원본에서 바뀐 점 (MVP)

| 기능 | 위치 |
|---|---|
| 브랜딩(서비스명, 링크, 워터마크) | `web/src/config/brand.js` |
| 배포 경로를 환경 변수로 설정(`VITE_BASE`, 기본값 `/`) | `web/vite.config.js`, `web/index.html`, `public/manifest.json`, `public/sw.js` |
| **등급 성적표 탭**: 영어·한국사 절대평가 등급, 국어·수학·탐구 등급(등급컷 입력 시), 국수영탐 등급 합 | `web/src/components/tables/GradeReport.jsx`, `web/src/utils/gradeTransform.js` |
| **응답 품질 표**: 무응답·추출 실패 분리, 유효 응답 정답률 | 위와 같음 |
| **시험 당일 모델만** 빠른 필터(시험일까지 출시된 모델) | `web/src/utils/modelFilters.js`, `web/src/config/examInfo.js` |

## 운영 전 해야 할 일

1. `web/src/config/brand.js`: 서비스 이름, 저장소 URL, 연락처 입력
2. `web/src/config/examInfo.js`: 국어·수학·탐구 원점수 등급컷과 출처 입력 (비워 두면 원점수만 표시)
3. 시험 시행일 확인 (`csat-2027`은 2026-11-19로 입력됨, `mock-2027-09`은 비어 있음)
4. 아이콘(`web/public/icons`, `vite.svg`) 교체
5. `.github/workflows/deploy.yml` 점검: 원본은 매시간 cron으로 배포하고 OpenRouter 키를 사용합니다

## 실행

```powershell
cd web; npm ci; npm run dev
```

테스트: `node --test web/tests/*.test.mjs`. `export-manifest` 테스트 1건은 원본에서도 실패합니다.
