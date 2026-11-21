/**
 * @file brand.js
 * @brief 서비스 브랜딩 설정 (이름, 링크, 워터마크)
 * @note 서비스 이름과 연락처가 정해지면 이 파일만 고치면 됩니다.
 *       repoUrl, contactEmail을 비워 두면 해당 링크는 화면에 표시되지 않습니다.
 */

export const BRAND = {
  name: 'AI 수능 성적표',
  nameEn: 'AI CSAT Report Card',
  owner: '',
  repoUrl: '',
  contactEmail: '',
  /** 이미지 내보내기 시 하단에 찍히는 문구 */
  watermark: 'AI 수능 성적표'
}

/** 원본 프로젝트 고지 (MIT 라이선스 저작권 고지 유지용) */
export const UPSTREAM = {
  name: 'CSAT-benchmark',
  author: 'hehee9',
  url: 'https://github.com/hehee9/CSAT-benchmark'
}
