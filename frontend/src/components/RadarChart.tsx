import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart as RechartsRadarChart,
  ResponsiveContainer,
} from "recharts"
import { EvaluationResult } from "../types/index"

interface RadarChartProps {
  scores: EvaluationResult
}

export function RadarChart({ scores }: RadarChartProps) {
  const data = [
    { metric: "Technical", value: scores.technicalAccuracy },
    { metric: "Adaptability", value: scores.adaptability },
    { metric: "Communication", value: scores.communication },
    { metric: "Efficiency", value: scores.efficiency },
  ]

  return (
    <div className="h-[360px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RechartsRadarChart data={data}>
          <PolarGrid stroke="rgba(148,163,184,0.16)" />
          <PolarAngleAxis dataKey="metric" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 10]}
            tick={{ fill: "#6b7280", fontSize: 10 }}
            axisLine={false}
          />
          <Radar
            name="Scores"
            dataKey="value"
            stroke="#7c83ff"
            fill="#7c83ff"
            fillOpacity={0.22}
          />
        </RechartsRadarChart>
      </ResponsiveContainer>
    </div>
  )
}