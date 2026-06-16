import React from "react";

interface ProcessingSummaryProps {
  loading: boolean;
  files: FileList | null;
  progressCount: number;
  totalProcesados: number;
  totalExitosos: number;
  totalFallidos: number;
  duration: number | null;
  estimatedSeconds: number;
  formatTime: (totalSeconds: number) => string;
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  tone?: "neutral" | "success" | "danger";
}) {
  const valueTone =
    tone === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "danger"
        ? "text-red-500 dark:text-red-400"
        : "text-neutral-900 dark:text-neutral-100";
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="text-[0.7rem] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${valueTone}`}>{value}</p>
    </div>
  );
}

const ProcessingSummary: React.FC<ProcessingSummaryProps> = ({
  loading,
  files,
  progressCount,
  totalProcesados,
  totalExitosos,
  totalFallidos,
  duration,
  estimatedSeconds,
  formatTime,
}) => {
  const visible = loading || totalProcesados || totalExitosos || totalFallidos || duration !== null;
  if (!visible) return null;

  const total = files?.length ?? 0;
  const percent = loading && total > 0 ? Math.min(100, Math.round((progressCount / total) * 100)) : 100;

  return (
    <div className="mt-6 animate-slide-up">
      {loading && (
        <div className="mb-4">
          <div className="mb-1.5 flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
            <span className="tabular-nums">
              {progressCount} de {total} · {percent}%
            </span>
            <span className="tabular-nums">≈ {formatTime(estimatedSeconds)} restante</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
            <div
              className="h-full rounded-full bg-neutral-900 transition-[width] duration-300 ease-out dark:bg-neutral-100"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Procesados" value={loading ? `${progressCount}/${total}` : totalProcesados} />
        <Stat label="Exitosos" value={totalExitosos} tone="success" />
        <Stat label="Fallidos" value={totalFallidos} tone="danger" />
        <Stat
          label={loading ? "Estimado" : "Duración"}
          value={loading ? formatTime(estimatedSeconds) : duration !== null ? formatTime(Math.round(duration)) : "—"}
        />
      </div>
    </div>
  );
};

export default ProcessingSummary;
