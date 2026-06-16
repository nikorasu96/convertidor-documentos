import { buildTable } from "@/core/pipeline/buildTable";
import type { ConversionSuccess } from "@/core/domain/result";

function ok(fileName: string, data: Record<string, string>): ConversionSuccess {
  return { status: "ok", fileName, data };
}

describe("buildTable", () => {
  it("Permiso: separa Placa Única y dígito verificador, con orden correcto", () => {
    const t = buildTable(
      [ok("p.pdf", { "Placa Única": "VLBP65-K", "Valor Permiso": "169917" })],
      "PERMISO_CIRCULACION"
    );
    expect(t.headers[0]).toBe("Nombre PDF");
    expect(t.headers[1]).toBe("Placa Única");
    expect(t.headers[2]).toBe("digito verificador");
    const row = t.rows[0];
    expect(row[t.headers.indexOf("Placa Única")]).toBe("VLBP65");
    expect(row[t.headers.indexOf("digito verificador")]).toBe("K");
  });

  it("SOAP: normaliza INSCRIPCION R.V.M", () => {
    const t = buildTable([ok("s.pdf", { "INSCRIPCION R.V.M": "TWGV11 - 7", PRIMA: "100" })], "SOAP");
    const row = t.rows[0];
    expect(row[t.headers.indexOf("INSCRIPCION R.V.M")]).toBe("TWGV11");
    expect(row[t.headers.indexOf("digito verificador")]).toBe("7");
  });

  it("Homologación: quita guiones de la Patente y NO agrega dígito verificador", () => {
    const t = buildTable([ok("h.pdf", { Patente: "AB-CD12", Marca: "TOYOTA" })], "CERTIFICADO_DE_HOMOLOGACION");
    expect(t.headers).not.toContain("digito verificador");
    expect(t.rows[0][t.headers.indexOf("Patente")]).toBe("ABCD12");
  });

  it("rellena la columna dígito verificador en filas que no lo tienen", () => {
    const t = buildTable(
      [
        ok("a.pdf", { "Placa Única": "VLBP65-K" }),
        ok("b.pdf", { "Placa Única": "ABCD12" }), // 6 chars, sin dígito
      ],
      "PERMISO_CIRCULACION"
    );
    expect(t.headers).toContain("digito verificador");
    expect(t.rows[1][t.headers.indexOf("digito verificador")]).toBe("");
  });

  it("tabla vacía sin éxitos", () => {
    const t = buildTable([], "SOAP");
    expect(t.headers).toEqual([]);
    expect(t.rows).toEqual([]);
  });
});
