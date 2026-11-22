# AI 검증 평가 서비스

교사가 출제한 **문제지와 정답을 AI가 검증**하고, AI가 문제지에 **풀이를 적어 가며 OMR로 답을 내면 정답과 비교해 채점**하는 웹 서비스입니다. 초·중·고 중간고사·기말고사·단원평가와 수능·모의고사 형식을 지원합니다.

**사이트:** https://xproom.github.io/ai-csat-report/

## 흐름

1. **표지 옵션**: 학교급·학년·시험 종류·과목을 고르면 표지와 문항 구성이 잡힙니다 (수능·모의고사는 표준 구성).
2. **문제지·정답**: 문제지(PDF·사진)와 정답표(CSV·TXT·JSON·PDF·사진)를 올립니다. 복수 정답은 `②④`·`2|4`처럼 씁니다. 수능·모의고사는 홀수형·짝수형을 고르며, `번호,홀수형,짝수형` 표는 고른 형의 열을 반영합니다.
3. **검증**: 아래 항목을 자동으로 검사합니다.
4. **AI 풀어보기**: AI가 문항마다 문제 아래 점선 상자에 풀이를 굴림체로 적고 OMR에 마킹하며, 끝나면 정답과 비교해 채점합니다. 풀이가 적힌 문제지는 PDF로 내려받을 수 있습니다. AI가 모두 같은 다른 답을 낸 문항은 정답 재확인 대상으로 검증에 표시됩니다.

## 문제지 및 정답 검증

| 항목 | 검사 내용 |
|---|---|
| 가. 배점 합계와 총점 | 모든 문항 배점의 합이 총점(계획 → 표준 구성 → 100점)과 정확히 같은지, 문제지에 인쇄된 `[3점]` 표시나 "표시가 없는 문항은 2점" 안내와 입력한 배점이 같은지 |
| 나. 문항 번호 | 문항 구성·정답표·문제지에서 빠진 번호(12번 다음 14번)와 겹친 번호(12번 두 번). 선택과목 문항은 과목 수만큼 나와도 정상 |
| 다. 선택형·서답형 구성 | 선택형(객관식)과 서답형(단답·서술) 문항 수·배점이 출제 계획(직접 입력) 또는 표준 구성과 맞는지 |
| 라. 객관식 선지 | 선지 번호 ①~⑤가 빠짐없이 있는지, 번호가 겹치지 않는지, 선지 내용이 같은 것이 없는지 |
| 마. 정답 표기 | "모두 고르시오" 문항에 정답이 하나뿐이거나, 하나만 고르는 문항에 정답이 둘 이상인 경우, 범위를 벗어난 정답, 빠진 정답 |
| 바. 홀수형·짝수형 (수능·모의평가·모의고사) | 문제지에 인쇄된 형, 정답표의 형(홀수형·짝수형 열이 함께 있는 표는 평가지의 형 열을 읽음)과 설정한 형이 같은지 |
| 사. 쪽 번호 | 문제지 쪽 번호가 순서대로인지, 빠지거나 겹친 쪽, "3/8"의 전체 쪽 수가 실제와 다른 경우 |
| 아. AI 풀이 대조 | AI 풀이가 모두 같은 다른 답을 낸 문항 (정답 오류 의심) |

- 글자가 들어 있는 PDF는 브라우저에서 바로 읽어 대조합니다 (무료).
- 스캔본·사진이거나 더 정확히 보려면 **AI 정밀 검증**으로 Claude가 문제지를 직접 읽습니다 (API 사용).

## 중앙 서버 (Supabase)

로그인하면 평가지·문제지·검증·풀이 기록이 Supabase에 저장되어 어느 기기에서나 이어서 쓸 수 있습니다. 로그인하지 않으면 지금처럼 브라우저(IndexedDB)에만 저장됩니다.

1. [Supabase](https://supabase.com)에서 프로젝트를 만듭니다.
2. SQL Editor에서 [`supabase/schema.sql`](supabase/schema.sql)을 실행합니다 (표 3개, 행 수준 보안 정책, 비공개 파일 버킷 `paper-files`).
3. Authentication → URL Configuration의 Site URL·Redirect URLs에 사이트 주소(예: `https://xproom.github.io/ai-csat-report/`, 개발 중이면 `http://localhost:5173/`)를 넣습니다.
4. 연결 정보(Project URL, anon/publishable 키)를 넣습니다. 둘 중 하나를 고르세요.
   - 사이트 전체에 연결: GitHub 저장소 Settings → Secrets and variables → Actions → **Variables**에 `SUPABASE_URL`, `SUPABASE_ANON_KEY`를 만들고 다시 배포
   - 브라우저마다 연결: 사이트의 설정 → 중앙 서버에 입력
5. 설정 화면에서 이메일 로그인 링크로 로그인하고, 필요하면 「이 브라우저 자료 서버로 올리기」를 누릅니다.

교사마다 본인 자료만 읽고 쓸 수 있습니다 (`owner_id = auth.uid()`). service_role 키는 사이트에 넣지 마세요. Anthropic API 키는 서버에 저장하지 않습니다.

## 결과 가져오기 형식

```json
[
  { "model": "GPT-6.2", "seconds": 84.5, "answers": { "1": "3", "2": "5", "21": "12" } },
  { "model": "Gemini 4", "answers": [{ "no": 1, "answer": "3" }] }
]
```

## 개발

```powershell
cd web; npm ci; npm run dev
```

- 테스트: `npm test` (채점·답 파싱·검증·클라우드 저장소)
- 빌드: `npm run build` (배포 경로는 `VITE_BASE` 환경 변수, 기본 `/`)
- `main`에 push하면 GitHub Actions가 테스트 후 GitHub Pages에 배포합니다.

### 구조 (`web/src`)

- `lib/schema.js` 평가지·풀이 데이터 형식, `lib/grading.js` 채점, `lib/aiRunner.js` Claude 호출, `lib/db.js` 저장소(IndexedDB ↔ 서버 전환), `lib/cloud.js` Supabase 연동
- `lib/verify.js` 문제지·정답 검증, `lib/pdfText.js` PDF 글자에서 문항 번호·배점 표시·선지·쪽 번호 읽기, `components/VerifyPanel.jsx` 검증 화면
- `components/PaperCover.jsx` 표지, `components/OmrCard.jsx` OMR 답안지, `components/RunPanel.jsx` 풀이 추가
- `lib/liveSolve.js` 문항별 실시간 풀이(스트리밍·시각 기록), `lib/replay.js` 재생 상태 계산, `components/SolveViewer.jsx` AI 풀이 보기 화면, `components/CompactOmr.jsx` 세로형 OMR, `components/GradeSheet.jsx` 채점 완료 화면
- `pages/` 홈, 새 평가지(표지 옵션 → 문제지·정답 → 검증 → AI 풀어보기), 평가지 상세(표지·문제지·정답·검증·AI 풀이·채점 결과 — 성적표·OMR 답안지·문항 통계), 검증 현황, 설정

## 주의

- AI 풀이 요청은 브라우저에서 Anthropic API로 바로 갑니다. API 키는 이 브라우저에만 저장되며, 사용 한도를 정한 전용 키를 권장합니다.
- 학교 시험 문제지의 저작권은 출제 학교·교사에게 있습니다. 중앙 서버에 로그인한 경우에만 문제지가 본인 계정의 비공개 저장소에 올라갑니다.

## 출처

[hehee9/CSAT-benchmark](https://github.com/hehee9/CSAT-benchmark)(MIT)를 포크해 시작했습니다. 저장소 루트의 Python 패키지(`csat_benchmark/`)와 데이터(`published/`, `benchmarks/`)는 원본의 수능 벤치마크 파이프라인으로, 현재 웹 서비스에서는 쓰지 않습니다. 라이선스는 `LICENSE.md`를 따릅니다.
