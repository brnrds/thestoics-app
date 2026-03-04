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
    if (!svgRef.current) return;

    svg.selectAll("*").remove();

    const width = 320;
    const height = 220;
    const radius = Math.min(width, height) / 2 - 14;

    const pieGenerator = pie<ChartDatum>()
      .value((d) => d.value)
      .sort(null);

    const color = scaleOrdinal<string>()
      .domain(data.map((d) => d.label))
      .range(["#1a1a1a", "#3d6b50", "#9a9a96", "#6b6b68"]);

    const pathGenerator = arc<ReturnType<typeof pieGenerator>[number]>()
      .innerRadius(radius * 0.52)
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
      .attr("fill", (d) => color(d.data.label) || "#1a1a1a")
      .attr("stroke", "var(--color-surface, #ffffff)")
      .attr("stroke-width", 2)
      .attr("opacity", 0)
      .transition()
      .duration(600)
      .attr("opacity", 1);
  }, [data]);

  return (
    <div className="rounded-lg border border-rule bg-surface p-5">
      <p className="label-meta mb-3">Configuration Balance</p>
      <svg
        ref={svgRef}
        className="h-[220px] w-full"
        aria-label="Mode composition chart"
      />
      <div className="mt-3 flex flex-wrap gap-4 font-sans text-xs text-ink-secondary">
        {data.map((entry) => (
          <span key={entry.label}>
            <strong className="text-ink">{entry.value}</strong> {entry.label}
          </span>
        ))}
      </div>
    </div>
  );
}
