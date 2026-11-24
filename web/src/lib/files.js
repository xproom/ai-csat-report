/**
 * @file files.js
 * @brief 문제지로 쓸 수 있는 파일 형식 - 업로드·백업 복원·보기가 함께 씀
 * - 백업 파일이나 서버 자료에 다른 형식(예: HTML)이 섞여 있어도 이 사이트 안에서 실행되지 않게 함
 */

export const FILE_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif']

/** @brief 보기용 주소에 쓸 안전한 파일 (허용한 형식이 아니면 null) */
export function viewableBlob(file) {
  if (!file?.blob || !FILE_TYPES.includes(file.type)) return null
  return file.blob.type === file.type ? file.blob : new Blob([file.blob], { type: file.type })
}

/** @brief 백업에 담긴 파일 되살리기 (외부 주소는 열지 않음) */
export async function backupBlob(type, dataUrl) {
  if (!FILE_TYPES.includes(type) || !/^data:/i.test(String(dataUrl))) throw new Error('백업 파일에 열 수 없는 문제지가 들어 있습니다.')
  const blob = await (await fetch(dataUrl)).blob()
  return new Blob([blob], { type })
}
