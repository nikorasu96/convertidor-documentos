import { processDocument } from "@/core/pipeline/processDocument";
import type { PdfTextSource } from "@/core/text/PdfTextSource";

const HOMOLOGACION_TEXT =
  "CERTIFICADO DE HOMOLOGACIÓN FECHA DE EMISIÓN 19/JUL/2022 Nº CORRELATIVO 12345 " +
  "CÓDIGO DE INFORME TÉCNICO IT-2022-01 PATENTE ABCD12 VÁLIDO HASTA JUL/2025 " +
  "TIPO DE VEHÍCULO AUTOMOVIL MARCA TOYOTA AÑO 2022 MODELO COROLLA COLOR ROJO " +
  "VIN 1HGCM82633A123456 Nº MOTOR 2ZR1234567. Firmado por: JUAN PEREZ 01/01/2024";

const source = (text: string): PdfTextSource => ({ extractText: async () => text });
const throwingSource: PdfTextSource = {
  extractText: async () => {
    throw new Error("binario inválido");
  },
};

const BYTES = new Uint8Array([1, 2, 3]);

describe("processDocument", () => {
  it("devuelve ok cuando el formato coincide y los datos son válidos", async () => {
    const r = await processDocument("h.pdf", BYTES, "CERTIFICADO_DE_HOMOLOGACION", source(HOMOLOGACION_TEXT));
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.data["Patente"]).toBe("ABCD12");
  });

  it("marca NO_TEXT_LAYER cuando no hay texto (PDF escaneado)", async () => {
    const r = await processDocument("scan.pdf", BYTES, "CRT", source("   "));
    expect(r.status).toBe("error");
    if (r.status === "error") expect(r.code).toBe("NO_TEXT_LAYER");
  });

  it("marca FORMAT_MISMATCH cuando el formato detectado difiere del esperado", async () => {
    const r = await processDocument("h.pdf", BYTES, "SOAP", source(HOMOLOGACION_TEXT));
    expect(r.status).toBe("error");
    if (r.status === "error") {
      expect(r.code).toBe("FORMAT_MISMATCH");
      expect(r.detectedFormat).toBe("Certificado de Homologación");
    }
  });

  it("marca PARSE_ERROR cuando el motor falla", async () => {
    const r = await processDocument("x.pdf", BYTES, "SOAP", throwingSource);
    expect(r.status).toBe("error");
    if (r.status === "error") expect(r.code).toBe("PARSE_ERROR");
  });

  it("marca VALIDATION_ERROR cuando faltan datos del formato", async () => {
    const r = await processDocument(
      "crt.pdf",
      BYTES,
      "CRT",
      source("FECHA REVISIÓN: 18 JUNIO 2024 documento sin secciones de certificado")
    );
    expect(r.status).toBe("error");
    if (r.status === "error") expect(r.code).toBe("VALIDATION_ERROR");
  });
});
