"use client";

import * as React from "react";
import { Card, Pill } from "@/components/ui";
import { TrendingUp, TrendingDown, Clock, Users, Activity, Monitor, Smartphone, Tablet } from "lucide-react";

type UsageData = {
  todayEvents: number;
  todayUsers: number;
  thisWeekEvents: number;
  lastWeekEvents: number;
  totalEvents30d: number;
  avgSessionDuration: number;
  totalSessions: number;
  dauData: { date: string; count: number }[];
  eventsByDay: { date: string; count: number }[];
  topEventTypes: [string, number][];
  topPages: [string, number][];
  deviceBreakdown: Record<string, number>;
  browserBreakdown: Record<string, number>;
  osBreakdown: Record<string, number>;
  hourlyActivity: { hour: number; count: number }[];
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
}

function StatCard({ label, value, icon: Icon, change, changeLabel }: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  change?: number;
  changeLabel?: string;
}) {
  const isPositive = change && change > 0;
  const isNegative = change && change < 0;
  
  return (
    <Card className="cardInteractive">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>{label}</div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{value}</div>
          {change !== undefined && (
            <div className="row" style={{ gap: 4, marginTop: 8 }}>
              {isPositive && <TrendingUp size={14} color="var(--success, #4ade80)" />}
              {isNegative && <TrendingDown size={14} color="var(--danger)" />}
              <span style={{ 
                fontSize: 12, 
                color: isPositive ? "var(--success, #4ade80)" : isNegative ? "var(--danger)" : "var(--muted)" 
              }}>
                {isPositive ? "+" : ""}{change}% {changeLabel}
              </span>
            </div>
          )}
        </div>
        <div style={{ 
          width: 40, 
          height: 40, 
          borderRadius: 8, 
          background: "rgba(99, 179, 255, 0.1)", 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "center" 
        }}>
          <Icon size={20} color="var(--primary)" />
        </div>
      </div>
    </Card>
  );
}

function LineChart({ data, height = 120 }: { data: { date: string; count: number }[]; height?: number }) {
  if (!data.length) return null;
  const max = Math.max(...data.map((d) => d.count), 1);
  const width = 600;
  const padding = 30;

  const points = data
    .map((d, i) => {
      const x = padding + (i / (data.length - 1)) * (width - padding * 2);
      const y = height - padding - (d.count / max) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  // Area under the line
  const areaPoints = [
    `${padding},${height - padding}`,
    ...data.map((d, i) => {
      const x = padding + (i / (data.length - 1)) * (width - padding * 2);
      const y = height - padding - (d.count / max) * (height - padding * 2);
      return `${x},${y}`;
    }),
    `${width - padding},${height - padding}`
  ].join(" ");

  const xLabels = data.filter((_, i) => i % 7 === 0 || i === data.length - 1);

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ maxWidth: width }}>
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
        <line
          key={pct}
          x1={padding}
          x2={width - padding}
          y1={height - padding - pct * (height - padding * 2)}
          y2={height - padding - pct * (height - padding * 2)}
          stroke="var(--border)"
          strokeWidth="1"
        />
      ))}

      {/* Area fill */}
      <polygon
        fill="url(#chartGradient)"
        points={areaPoints}
        opacity="0.3"
      />

      {/* Data line */}
      <polyline
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />

      {/* Gradient definition */}
      <defs>
        <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Y-axis labels */}
      <text x={padding - 5} y={height - padding} fontSize="10" fill="var(--muted)" textAnchor="end">
        0
      </text>
      <text x={padding - 5} y={padding + 4} fontSize="10" fill="var(--muted)" textAnchor="end">
        {max}
      </text>

      {/* X-axis labels */}
      {xLabels.map((d) => {
        const idx = data.findIndex((dd) => dd.date === d.date);
        const x = padding + (idx / (data.length - 1)) * (width - padding * 2);
        return (
          <text
            key={d.date}
            x={x}
            y={height - 8}
            fontSize="9"
            fill="var(--muted)"
            textAnchor="middle"
          >
            {d.date.slice(5)}
          </text>
        );
      })}
    </svg>
  );
}

function BarChart({ data, maxValue }: { data: { label: string; value: number }[]; maxValue: number }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      {data.map((item) => (
        <div key={item.label} className="row" style={{ alignItems: "center", gap: 12 }}>
          <div style={{ width: 140, fontSize: 12, textAlign: "right", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.label}
          </div>
          <div style={{ flex: 1, background: "rgba(255, 255, 255, 0.05)", borderRadius: 4, height: 24 }}>
            <div
              style={{
                width: `${(item.value / maxValue) * 100}%`,
                height: "100%",
                background: "linear-gradient(90deg, var(--primary), rgba(99, 179, 255, 0.6))",
                borderRadius: 4,
                minWidth: item.value > 0 ? 4 : 0
              }}
            />
          </div>
          <div style={{ width: 50, fontSize: 12, fontWeight: 600 }}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function HourlyChart({ data }: { data: { hour: number; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  
  return (
    <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 100 }}>
      {data.map((d) => (
        <div
          key={d.hour}
          style={{
            flex: 1,
            background: `linear-gradient(to top, var(--primary), rgba(99, 179, 255, 0.4))`,
            height: `${(d.count / max) * 100}%`,
            minHeight: d.count > 0 ? 4 : 0,
            borderRadius: "2px 2px 0 0",
            position: "relative"
          }}
          title={`${d.hour}:00 - ${d.count} events`}
        />
      ))}
    </div>
  );
}

function DonutChart({ data, colors }: { data: { label: string; value: number }[]; colors: string[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return <div className="muted">No data</div>;

  let currentAngle = 0;
  const size = 120;
  const strokeWidth = 24;
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;

  return (
    <div className="row" style={{ gap: 24, alignItems: "center" }}>
      <svg width={size} height={size}>
        {data.map((d, i) => {
          const percentage = d.value / total;
          const angle = percentage * 360;
          const startAngle = currentAngle;
          currentAngle += angle;
          
          const startRad = (startAngle - 90) * (Math.PI / 180);
          const endRad = (currentAngle - 90) * (Math.PI / 180);
          
          const x1 = center + radius * Math.cos(startRad);
          const y1 = center + radius * Math.sin(startRad);
          const x2 = center + radius * Math.cos(endRad);
          const y2 = center + radius * Math.sin(endRad);
          
          const largeArc = angle > 180 ? 1 : 0;
          
          return (
            <path
              key={d.label}
              d={`M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`}
              fill="none"
              stroke={colors[i % colors.length]}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
          );
        })}
      </svg>
      <div className="stack" style={{ gap: 8 }}>
        {data.map((d, i) => (
          <div key={d.label} className="row" style={{ gap: 8, alignItems: "center" }}>
            <div style={{ 
              width: 12, 
              height: 12, 
              borderRadius: 3, 
              background: colors[i % colors.length] 
            }} />
            <span style={{ fontSize: 13 }}>{d.label}</span>
            <span className="muted" style={{ fontSize: 12 }}>
              {Math.round((d.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function UsageClient({ data }: { data: UsageData }) {
  const weekChange = data.lastWeekEvents > 0
    ? Math.round(((data.thisWeekEvents - data.lastWeekEvents) / data.lastWeekEvents) * 100)
    : 0;

  const deviceData = Object.entries(data.deviceBreakdown)
    .filter(([_, v]) => v > 0)
    .map(([label, value]) => ({ label, value }));
  
  const browserData = Object.entries(data.browserBreakdown)
    .filter(([_, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, value]) => ({ label, value }));

  const osData = Object.entries(data.osBreakdown)
    .filter(([_, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, value]) => ({ label, value }));

  const deviceColors = ["#63b3ff", "#4ade80", "#fbbf24"];
  const browserColors = ["#63b3ff", "#4ade80", "#fbbf24", "#f87171", "#a78bfa"];

  return (
    <div className="stack" style={{ gap: 24 }}>
      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
        <StatCard label="Today's Users" value={data.todayUsers} icon={Users} />
        <StatCard label="Today's Events" value={data.todayEvents} icon={Activity} />
        <StatCard 
          label="This Week" 
          value={data.thisWeekEvents} 
          icon={Activity} 
          change={weekChange}
          changeLabel="vs last week"
        />
        <StatCard 
          label="Avg Session" 
          value={formatDuration(data.avgSessionDuration)} 
          icon={Clock} 
        />
      </div>

      {/* DAU Chart */}
      <Card>
        <div className="cardHeader">
          <div className="cardTitle">Daily Active Users</div>
          <div className="cardSubtitle">Unique users per day (30 days)</div>
        </div>
        <div style={{ marginTop: 16, overflowX: "auto" }}>
          <LineChart data={data.dauData} height={150} />
        </div>
      </Card>

      {/* Events by Day */}
      <Card>
        <div className="cardHeader">
          <div className="cardTitle">Events Over Time</div>
          <div className="cardSubtitle">Total events per day (30 days)</div>
        </div>
        <div style={{ marginTop: 16, overflowX: "auto" }}>
          <LineChart data={data.eventsByDay} height={150} />
        </div>
      </Card>

      {/* Peak Hours */}
      <Card>
        <div className="cardHeader">
          <div className="cardTitle">Peak Usage Hours</div>
          <div className="cardSubtitle">Activity by hour of day (UTC)</div>
        </div>
        <div style={{ marginTop: 16 }}>
          <HourlyChart data={data.hourlyActivity} />
          <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
            <span className="muted" style={{ fontSize: 10 }}>12am</span>
            <span className="muted" style={{ fontSize: 10 }}>6am</span>
            <span className="muted" style={{ fontSize: 10 }}>12pm</span>
            <span className="muted" style={{ fontSize: 10 }}>6pm</span>
            <span className="muted" style={{ fontSize: 10 }}>12am</span>
          </div>
        </div>
      </Card>

      {/* Two Column Layout */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", gap: 16 }}>
        {/* Device Breakdown */}
        <Card>
          <div className="cardHeader">
            <div className="cardTitle">Device Breakdown</div>
          </div>
          <div style={{ marginTop: 16 }}>
            <DonutChart data={deviceData} colors={deviceColors} />
          </div>
          <div className="row" style={{ gap: 16, marginTop: 16, justifyContent: "center" }}>
            <div className="row" style={{ gap: 4, alignItems: "center" }}>
              <Monitor size={14} /> Desktop
            </div>
            <div className="row" style={{ gap: 4, alignItems: "center" }}>
              <Smartphone size={14} /> Mobile
            </div>
            <div className="row" style={{ gap: 4, alignItems: "center" }}>
              <Tablet size={14} /> Tablet
            </div>
          </div>
        </Card>

        {/* Browser Breakdown */}
        <Card>
          <div className="cardHeader">
            <div className="cardTitle">Browser Breakdown</div>
          </div>
          <div style={{ marginTop: 16 }}>
            <DonutChart data={browserData} colors={browserColors} />
          </div>
        </Card>
      </div>

      {/* OS Breakdown */}
      <Card>
        <div className="cardHeader">
          <div className="cardTitle">Operating System</div>
        </div>
        <div style={{ marginTop: 16 }}>
          <BarChart
            data={osData}
            maxValue={osData[0]?.value || 1}
          />
        </div>
      </Card>

      {/* Two Column Layout */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", gap: 16 }}>
        {/* Top Event Types */}
        <Card>
          <div className="cardHeader">
            <div className="cardTitle">Top Events</div>
            <div className="cardSubtitle">Most common event types (30 days)</div>
          </div>
          <div style={{ marginTop: 16 }}>
            <BarChart
              data={data.topEventTypes.map(([type, count]) => ({ label: type, value: count }))}
              maxValue={data.topEventTypes[0]?.[1] || 1}
            />
          </div>
        </Card>

        {/* Top Pages */}
        <Card>
          <div className="cardHeader">
            <div className="cardTitle">Top Pages</div>
            <div className="cardSubtitle">Most visited pages (30 days)</div>
          </div>
          <div style={{ marginTop: 16 }}>
            <BarChart
              data={data.topPages.map(([path, count]) => ({ label: path, value: count }))}
              maxValue={data.topPages[0]?.[1] || 1}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

