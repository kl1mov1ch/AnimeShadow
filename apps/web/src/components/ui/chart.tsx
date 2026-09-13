import * as React from "react";
import * as RechartsPrimitive from "recharts";
import type { LegendPayload, TooltipContentProps, TooltipPayloadEntry } from "recharts";
import { cn } from "@/lib/utils";

/** Per-series label/color, keyed by the series' `dataKey` (or `nameKey`
 * value). Colors are exposed to the chart as `var(--color-<key>)`. */
export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode;
    icon?: React.ComponentType<{ className?: string }>;
    color?: string;
  }
>;

const ChartContext = React.createContext<{ config: ChartConfig } | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);
  if (!context) throw new Error("useChart must be used within a <ChartContainer />");
  return context;
}

function ChartContainer({
  className,
  children,
  config,
  style,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig;
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"];
}) {
  const colorVars = Object.fromEntries(
    Object.entries(config)
      .filter(([, item]) => item.color)
      .map(([key, item]) => [`--color-${key}`, item.color]),
  ) as React.CSSProperties;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        style={{ ...colorVars, ...style }}
        className={cn(
          "flex aspect-video justify-center text-xs",
          "[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground",
          "[&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50",
          "[&_.recharts-curve.recharts-tooltip-cursor]:stroke-border",
          "[&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border",
          "[&_.recharts-radial-bar-background-sector]:fill-muted",
          "[&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted/60",
          "[&_.recharts-reference-line_[stroke='#ccc']]:stroke-border",
          "[&_.recharts-sector[stroke='#fff']]:stroke-transparent",
          "[&_.recharts-layer]:outline-hidden [&_.recharts-sector]:outline-hidden [&_.recharts-surface]:outline-hidden",
          className,
        )}
        {...props}
      >
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

/** Resolves which config entry a tooltip/legend item belongs to — either
 * directly by key, or via a field on the underlying data row (pie slices
 * carry their series name in the row itself, not in `dataKey`). */
function getPayloadConfig(config: ChartConfig, item: unknown, key: string) {
  if (typeof item !== "object" || item === null) return undefined;
  const record = item as Record<string, unknown>;
  const inner =
    typeof record.payload === "object" && record.payload !== null
      ? (record.payload as Record<string, unknown>)
      : undefined;

  let configKey = key;
  if (typeof record[key] === "string") configKey = record[key] as string;
  else if (inner && typeof inner[key] === "string") configKey = inner[key] as string;

  return config[configKey] ?? config[key];
}

const ChartTooltip = RechartsPrimitive.Tooltip;

function ChartTooltipContent({
  active,
  payload,
  label,
  className,
  indicator = "dot",
  hideLabel = false,
  hideIndicator = false,
  labelFormatter,
  valueFormatter,
  nameKey,
}: Partial<Pick<TooltipContentProps, "active" | "payload" | "label">> & {
  className?: string;
  indicator?: "line" | "dot" | "dashed";
  hideLabel?: boolean;
  hideIndicator?: boolean;
  labelFormatter?: (label: string | number | undefined) => React.ReactNode;
  valueFormatter?: (value: number, item: TooltipPayloadEntry) => React.ReactNode;
  nameKey?: string;
}) {
  const { config } = useChart();
  if (!active || !payload?.length) return null;

  return (
    <div
      className={cn(
        "grid min-w-[10rem] items-start gap-1.5 rounded-xl border border-border/60 bg-background/95 px-3 py-2 text-xs shadow-xl backdrop-blur",
        className,
      )}
    >
      {!hideLabel && label != null && (
        <div className="font-medium text-foreground">
          {labelFormatter ? labelFormatter(label) : label}
        </div>
      )}
      <div className="grid gap-1.5">
        {payload.map((item, index) => {
          const key = `${nameKey || item.name || item.dataKey || "value"}`;
          const itemConfig = getPayloadConfig(config, item, key);
          const rowFill = (item.payload as { fill?: string } | undefined)?.fill;
          const color = rowFill || item.color || item.fill;
          const value = item.value;

          return (
            <div key={`${key}-${index}`} className="flex w-full items-center gap-2">
              {!hideIndicator && (
                <span
                  aria-hidden
                  className={cn(
                    "shrink-0 rounded-[2px]",
                    indicator === "dot" && "size-2.5",
                    indicator === "line" && "h-3 w-1",
                    indicator === "dashed" && "h-3 w-0 border-[1.5px] border-dashed bg-transparent",
                  )}
                  style={{
                    backgroundColor: indicator === "dashed" ? undefined : color,
                    borderColor: color,
                  }}
                />
              )}
              <div className="flex flex-1 items-center justify-between gap-4 leading-none">
                <span className="text-muted-foreground">{itemConfig?.label ?? item.name}</span>
                {value != null && (
                  <span className="font-mono font-medium tabular-nums text-foreground">
                    {typeof value === "number"
                      ? valueFormatter
                        ? valueFormatter(value, item)
                        : value.toLocaleString()
                      : String(value)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const ChartLegend = RechartsPrimitive.Legend;

function ChartLegendContent({
  className,
  hideIcon = false,
  payload,
  verticalAlign = "bottom",
  nameKey,
}: {
  className?: string;
  hideIcon?: boolean;
  payload?: ReadonlyArray<LegendPayload>;
  verticalAlign?: "top" | "bottom" | "middle";
  nameKey?: string;
}) {
  const { config } = useChart();
  if (!payload?.length) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5",
        verticalAlign === "top" ? "pb-3" : "pt-3",
        className,
      )}
    >
      {payload.map((item, index) => {
        const key = `${nameKey || item.dataKey || "value"}`;
        const itemConfig = getPayloadConfig(config, item, key);
        const Icon = itemConfig?.icon;
        return (
          <div key={`${key}-${index}`} className="flex items-center gap-1.5 text-muted-foreground">
            {Icon && !hideIcon ? (
              <Icon className="size-3" />
            ) : (
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: item.color }}
              />
            )}
            {itemConfig?.label ?? item.value}
          </div>
        );
      })}
    </div>
  );
}

export {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
};
