"use client";

import { useEffect, useRef } from "react";
import { arc, pie, scaleOrdinal, select } from "d3";

type ChartDatum = {
  label: string;
  value: number;
};

export function ModeCompositionChart({ data }: { data: ChartDatum[] }) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const svg = select(svgRef.current);
    if (!svgRef.current) {
      return;
    }

    svg.selectAll("*").remove();

    const width = 320;
    const height = 220;
    const radius = Math.min(width, height) / 2 - 14;

    const pieGenerator = pie<ChartDatum>()
      .value((d) => d.value)
      .sort(null);

    const color = scaleOrdinal<string>()
      .domain(data.map((d) => d.label))
      .range(["#67764a", "#b2643b", "#8a9f74", "#d5a677"]);

    const pathGenerator = arc<ReturnType<typeof pieGenerator>[number]>()
      .innerRadius(radius * 0.45)
      .outerRadius(radius);

    const group = svg
      .attr("viewBox", `0 0 ${width} ${height}`)
      .append("g")
      .attr("transform", `translate(${width / 2}, ${height / 2})`);

    group
      .selectAll("path")
      .data(pieGenerator(data))
      .join("path")
      .attr("d", pathGenerator)
      .attr("fill", (d) => color(d.data.label) || "#67764a")
      .attr("stroke", "#f7f1e8")
      .attr("stroke-width", 2)
      .attr("opacity", 0)
      .transition()
      .duration(500)
      .attr("opacity", 1);
  }, [data]);

  return (
    <div className="card-surface p-4">
      <p className="mb-2 text-xs uppercase tracking-[0.2em] text-[var(--color-clay-700)]">Config Balance</p>
      <svg ref={svgRef} className="h-[220px] w-full" aria-label="Mode composition chart" />
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-[var(--color-clay-700)]">
        {data.map((entry) => (
          <span key={entry.label}>
            <strong className="text-[var(--color-ink-900)]">{entry.value}</strong> {entry.label}
          </span>
        ))}
      </div>
    </div>
  );
}
