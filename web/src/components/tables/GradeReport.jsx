/**
 * @file GradeReport.jsx
 * @brief 모델별 수능 등급 성적표와 응답 품질(무효 응답) 표
 */

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { buildGradeReport, hasRelativeGradeCuts } from '@/utils/gradeTransform'
import { getExamInfo } from '@/config/examInfo'

const CARD = 'bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 md:p-6'

/** @brief 등급별 배지 색 */
function _gradeClass(grade) {
  if (grade == null) return 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
  if (grade === 1) return 'bg-blue-600 text-white'
  if (grade === 2) return 'bg-blue-400 text-white dark:bg-blue-500'
  if (grade === 3) return 'bg-sky-200 text-sky-900 dark:bg-sky-800 dark:text-sky-100'
  if (grade <= 5) return 'bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-gray-100'
  return 'bg-orange-200 text-orange-900 dark:bg-orange-900 dark:text-orange-100'
}

/** @brief 등급 + 원점수 셀 */
function GradeCell({ item, label, t }) {
  if (!item) return <td className="px-2 py-2 text-center text-gray-400">—</td>
  return (
    <td className="px-2 py-2 text-center whitespace-nowrap">
      <span className={`inline-flex min-w-[2.25rem] justify-center rounded-md px-1.5 py-0.5 text-sm font-bold ${_gradeClass(item.grade)}`}>
        {item.grade == null ? '—' : t('grade.gradeValue', { grade: item.grade })}
      </span>
      <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
        {item.raw}/{item.max}{label ? ` · ${label}` : ''}
      </div>
    </td>
  )
}

/** @brief 비율을 퍼센트 문자열로 */
function _pct(value) {
  return value == null ? '—' : `${(value * 100).toFixed(1)}%`
}

/**
 * @brief 등급 성적표 탭
 * @param {Object} props - { data, models, exam }
 */
export default function GradeReport({ data, models, exam }) {
  const { t } = useTranslation()
  const [sortByGrade, setSortByGrade] = useState(false)
  const examInfo = useMemo(() => getExamInfo(exam?.id), [exam?.id])
  const hasCuts = hasRelativeGradeCuts(examInfo)

  const report = useMemo(() => buildGradeReport(data, models, exam, examInfo), [data, models, exam, examInfo])

  const rows = useMemo(() => {
    if (!sortByGrade) return report
    return [...report].sort((a, b) => (a.gradeSum ?? 99) - (b.gradeSum ?? 99))
  }, [report, sortByGrade])

  const invalidRows = useMemo(
    () => report.filter(row => row.invalid.invalid > 0).sort((a, b) => b.invalid.invalidRate - a.invalid.invalidRate),
    [report]
  )
  const cleanCount = report.length - invalidRows.length

  return (
    <div className="space-y-6">
      <section className={CARD}>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('grade.title')}</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{t('grade.subtitle')}</p>
          </div>
          {hasCuts && (
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={sortByGrade} onChange={e => setSortByGrade(e.target.checked)} />
              {t('grade.sortByGradeSum')}
            </label>
          )}
        </div>

        <div className={`mb-4 rounded-md px-3 py-2 text-sm ${hasCuts
          ? 'bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-100'
          : 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100'}`}
        >
          <p>{t('grade.absoluteNote')}</p>
          <p className="mt-1">
            {hasCuts
              ? t('grade.cutSource', { source: examInfo.gradeCutSource || t('grade.sourceUnknown') })
              : t('grade.noCuts')}
          </p>
        </div>

        {rows.length === 0 ? (
          <p className="py-8 text-center text-gray-500 dark:text-gray-400">{t('grade.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300">
                  <th className="sticky left-0 bg-white px-2 py-2 text-left dark:bg-gray-800">{t('table.model')}</th>
                  <th className="px-2 py-2">{t('table.korean')}</th>
                  <th className="px-2 py-2">{t('table.math')}</th>
                  <th className="px-2 py-2">{t('table.english')}</th>
                  <th className="px-2 py-2">{t('table.history')}</th>
                  <th className="px-2 py-2">{t('grade.inquiry1')}</th>
                  <th className="px-2 py-2">{t('grade.inquiry2')}</th>
                  <th className="px-2 py-2" title={t('grade.gradeSumHelp')}>{t('grade.gradeSum')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.model} className="border-b border-gray-100 dark:border-gray-700/60">
                    <td className="sticky left-0 bg-white px-2 py-2 font-medium text-gray-900 dark:bg-gray-800 dark:text-gray-100">
                      {row.model}
                    </td>
                    <GradeCell item={row.korean} label={row.korean?.elective} t={t} />
                    <GradeCell item={row.math} label={row.math?.elective} t={t} />
                    <GradeCell item={row.english} t={t} />
                    <GradeCell item={row.history} t={t} />
                    <GradeCell item={row.inquiry[0]} label={row.inquiry[0]?.subject} t={t} />
                    <GradeCell item={row.inquiry[1]} label={row.inquiry[1]?.subject} t={t} />
                    <td className="px-2 py-2 text-center font-bold text-gray-900 dark:text-gray-100">
                      {row.gradeSum == null ? '—' : Number.isInteger(row.gradeSum) ? row.gradeSum : row.gradeSum.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{t('grade.comboNote')}</p>
      </section>

      <section className={CARD}>
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('grade.qualityTitle')}</h2>
        <p className="mt-1 mb-4 text-sm text-gray-600 dark:text-gray-400">{t('grade.qualitySubtitle')}</p>
        {invalidRows.length === 0 ? (
          <p className="py-4 text-center text-gray-500 dark:text-gray-400">{t('grade.qualityAllClean')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300">
                  <th className="sticky left-0 bg-white px-2 py-2 text-left dark:bg-gray-800">{t('table.model')}</th>
                  <th className="px-2 py-2 text-right">{t('grade.questions')}</th>
                  <th className="px-2 py-2 text-right">{t('grade.noAnswer')}</th>
                  <th className="px-2 py-2 text-right">{t('grade.parseFailed')}</th>
                  <th className="px-2 py-2 text-right">{t('grade.invalidRate')}</th>
                  <th className="px-2 py-2 text-right">{t('grade.accuracy')}</th>
                  <th className="px-2 py-2 text-right" title={t('grade.validAccuracyHelp')}>{t('grade.validAccuracy')}</th>
                </tr>
              </thead>
              <tbody>
                {invalidRows.map(({ model, invalid }) => (
                  <tr key={model} className="border-b border-gray-100 dark:border-gray-700/60">
                    <td className="sticky left-0 bg-white px-2 py-2 font-medium text-gray-900 dark:bg-gray-800 dark:text-gray-100">{model}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{invalid.questions}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{invalid.noAnswer}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{invalid.parseFailed}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-semibold text-orange-600 dark:text-orange-400">{_pct(invalid.invalidRate)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{_pct(invalid.accuracy)}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-semibold">{_pct(invalid.validAccuracy)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {invalidRows.length > 0 && cleanCount > 0 && (
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{t('grade.qualityCleanCount', { count: cleanCount })}</p>
        )}
      </section>
    </div>
  )
}
