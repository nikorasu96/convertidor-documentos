import { validateFiles, MAX_FILE_SIZE } from "@/client/files/validateFiles";

function pdf(name: string, sizeBytes: number, type = "application/pdf"): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

describe("validateFiles", () => {
  it("acepta PDFs válidos", () => {
    const { accepted, rejected } = validateFiles([pdf("a.pdf", 1000)]);
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(0);
  });

  it("rechaza archivos que no son PDF", () => {
    const { accepted, rejected } = validateFiles([new File(["x"], "a.txt", { type: "text/plain" })]);
    expect(accepted).toHaveLength(0);
    expect(rejected[0].error).toMatch(/no es un archivo pdf/i);
  });

  it("rechaza archivos vacíos", () => {
    const { rejected } = validateFiles([pdf("a.pdf", 0)]);
    expect(rejected[0].error).toMatch(/vac/i);
  });

  it("rechaza archivos que superan el tamaño máximo", () => {
    const { rejected } = validateFiles([pdf("big.pdf", MAX_FILE_SIZE + 1)]);
    expect(rejected[0].error).toMatch(/tamaño máximo/i);
  });

  it("separa válidos e inválidos en un mismo lote", () => {
    const { accepted, rejected } = validateFiles([
      pdf("ok.pdf", 1000),
      new File(["x"], "bad.txt", { type: "text/plain" }),
    ]);
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });
});
