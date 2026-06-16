import { useState, useMemo } from "react";
import InstructionsModal from "@/components/InstructionsModal";
import FileSelector from "@/components/FileSelector";
import FormatSelector from "@/components/FormatSelector";
import ProcessingSummary from "@/components/ProcessingSummary";
import PreviewTable from "@/components/PreviewTable";
import ExpandedView from "@/components/ExpandedView";
import ThemeToggle from "@/components/ThemeToggle";
import { ArrowRight, Spinner, StopCircle, Eraser, AlertTriangle, Info, ShieldCheck } from "@/components/icons";
import { useConversion } from "@/hooks/useConversion";
import type { PDFFormat } from "@/core/domain/format";

function formatTime(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) && totalSeconds >= 0 ? totalSeconds : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return hours > 0 ? `${hours}h ${minutes}m ${seconds}s` : `${minutes}m ${seconds}s`;
}

export default function App() {
  const [files, setFiles] = useState<FileList | null>(null);
  const [pdfFormat, setPdfFormat] = useState<PDFFormat | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showInstructions, setShowInstructions] = useState(true);

  const conversion = useConversion();
  const loading = conversion.status === "processing";

  const headers = useMemo(() => conversion.table?.headers ?? [], [conversion.table]);
  const rows = useMemo(() => conversion.table?.rows ?? [], [conversion.table]);

  const handleFileChange = (fileList: FileList | null) => {
    setFiles(fileList);
    conversion.reset();
  };

  const handleFormatChange = (format: PDFFormat) => {
    setPdfFormat(format);
    conversion.reset();
  };

  const handleLimpiar = () => {
    setFiles(null);
    setPdfFormat(null);
    conversion.reset();
    const input = document.getElementById("file-upload") as HTMLInputElement | null;
    if (input) input.value = "";
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!files || files.length === 0) return;
    if (!pdfFormat) return;
    void conversion.start(files, pdfFormat);
  };

  const progress = conversion.progress;
  const stats = conversion.stats;
  const totalProcesados = loading ? 0 : stats?.totalProcesados ?? 0;
  const totalExitosos = loading ? progress?.successes ?? 0 : stats?.totalExitosos ?? 0;
  const totalFallidos = loading ? progress?.failures ?? 0 : stats?.totalFallidos ?? 0;
  const estimatedSeconds = Math.round((progress?.estimatedMsLeft ?? 0) / 1000);
  const duration = conversion.status === "done" && conversion.durationMs != null ? conversion.durationMs / 1000 : null;

  const canConvert = !!files && files.length > 0 && !!pdfFormat && !loading;
  const showResults = conversion.status === "done" && conversion.excel;

  return (
    <>
      {showInstructions && <InstructionsModal onClose={() => setShowInstructions(false)} />}

      <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 py-8 sm:py-10">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div className="animate-fade-in">
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-3xl">
              Conversor de PDF a Excel
            </h1>
            <p className="mt-1.5 max-w-xl text-sm text-neutral-500 dark:text-neutral-400">
              Convierte documentos vehiculares a planillas en segundos.
            </p>
          </div>
          <ThemeToggle />
        </header>

        <section className="animate-slide-up rounded-2xl border border-neutral-200 bg-white/60 p-5 shadow-sm backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/40 sm:p-6">
          {conversion.status === "error" && conversion.error && (
            <div className="mb-5 flex animate-fade-in items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 shrink-0 text-[1.05rem]" />
              <span>{conversion.error}</span>
            </div>
          )}
          {conversion.status === "cancelled" && (
            <div className="mb-5 flex animate-fade-in items-center gap-2.5 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-800/40 dark:text-neutral-300">
              <Info className="shrink-0 text-[1.05rem]" />
              Conversión cancelada.
            </div>
          )}

          {showResults ? (
            <div className="flex animate-fade-in items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 dark:border-neutral-800 dark:bg-neutral-800/40">
              <span className="truncate text-sm text-neutral-600 dark:text-neutral-300">
                Conversión completada
              </span>
              <button
                type="button"
                onClick={handleLimpiar}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 transition-all duration-200 hover:border-neutral-300 hover:bg-neutral-50 active:scale-[0.98] dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                <Eraser className="text-[1.05rem]" />
                Nueva conversión
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <FileSelector files={files} loading={loading} onFileChange={handleFileChange} />
              <FormatSelector pdfFormat={pdfFormat} loading={loading} onFormatChange={handleFormatChange} />

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="submit"
                  disabled={!canConvert}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-neutral-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-neutral-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
                >
                  {loading ? (
                    <>
                      <Spinner className="text-[1.05rem]" />
                      Procesando…
                    </>
                  ) : (
                    <>
                      Convertir
                      <ArrowRight className="text-[1.05rem]" />
                    </>
                  )}
                </button>
                {loading ? (
                  <button
                    type="button"
                    onClick={conversion.cancel}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-5 py-3 text-sm font-medium text-red-600 transition-all duration-200 hover:bg-red-50 active:scale-[0.98] dark:border-red-900/50 dark:bg-neutral-900 dark:text-red-400 dark:hover:bg-red-950/40"
                  >
                    <StopCircle className="text-[1.05rem]" />
                    Cancelar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleLimpiar}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-5 py-3 text-sm font-medium text-neutral-700 transition-all duration-200 hover:border-neutral-300 hover:bg-neutral-50 active:scale-[0.98] dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
                  >
                    <Eraser className="text-[1.05rem]" />
                    Limpiar
                  </button>
                )}
              </div>
            </form>
          )}

          <ProcessingSummary
            loading={loading}
            files={files}
            progressCount={progress?.processed ?? 0}
            totalProcesados={totalProcesados}
            totalExitosos={totalExitosos}
            totalFallidos={totalFallidos}
            duration={duration}
            estimatedSeconds={estimatedSeconds}
            formatTime={formatTime}
          />

          {showResults && headers.length > 0 && (
            <PreviewTable
              memoizedHeaders={headers}
              memoizedRows={rows}
              setIsExpanded={setIsExpanded}
              excelBlob={conversion.excel!.blob}
              fileName={conversion.excel!.fileName}
            />
          )}
          {showResults && headers.length === 0 && (
            <div className="mt-6 flex animate-fade-in items-start gap-2.5 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-800/40 dark:text-neutral-300">
              <Info className="mt-0.5 shrink-0 text-[1.05rem]" />
              No se extrajeron datos. Revisa la hoja “Estadisticas” del Excel para ver el detalle de cada archivo.
            </div>
          )}
        </section>

        <footer className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-neutral-400 dark:text-neutral-600">
          <ShieldCheck className="shrink-0 text-[0.95rem]" />
          Procesamiento 100% local — tus archivos no salen de tu equipo.
        </footer>
      </div>

      {isExpanded && headers.length > 0 && (
        <ExpandedView memoizedHeaders={headers} memoizedRows={rows} setIsExpanded={setIsExpanded} />
      )}
    </>
  );
}
