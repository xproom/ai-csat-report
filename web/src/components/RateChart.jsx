/**
 * @file RateChart.jsx
 * @brief 문항별 정답률 막대그래프 (그래프 도구가 커서 채점 결과를 볼 때만 내려받음)
 */

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export default function RateChart({ stats }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={stats.map(item => ({ ...item, pct: item.rate === null ? 0 : Math.round(item.rate * 100) }))} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#ece7db" />
        <XAxis dataKey="no" tick={{ fontSize: 11 }} interval="preserveStartEnd" tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip formatter={value => [`${value}%`, '정답률']} labelFormatter={label => `${label}번`} />
        <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
          {stats.map(item => (
            <Cell key={item.no} fill={item.rate === null ? '#d6d0c2' : item.rate < 0.5 ? 'var(--color-pen)' : item.rate < 0.8 ? 'var(--color-accent)' : 'var(--color-brand)'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
