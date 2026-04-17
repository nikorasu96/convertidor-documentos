// __tests__/permisoCirculacionExtractor.test.ts
import { extraerDatosPermisoCirculacion, bestEffortValidationPermisoCirculacion } from "@/extractors/permisoCirculacionExtractor";
import logger from "@/utils/logger";

describe("permisoCirculacionExtractor", () => {
  test("extraerDatosPermisoCirculacion debe extraer datos correctamente", () => {
    const sampleText = `
      Placa Única: ABC-123
      Codigo SII: SII456
      Valor Permiso: 1000
      Pago total: X
      Pago cuota 1:
      Pago cuota 2: X
      Total a pagar: 1500
      Fecha de emisión: 01/01/2025
      Fecha Vencimiento: 31/12/2025
      Forma de Pago: EFECTIVO
    `;
    const { data } = extraerDatosPermisoCirculacion(sampleText);

    expect(data["Placa Única"]).toBe("ABC-123");
    expect(data["Código SII"]).toBe("SII456");
    expect(data["Valor Permiso"]).toBe("1000");
    expect(data["Pago total"]).toBe("X");
    // Si algún campo queda vacío se reemplaza por "No aplica"
    expect(data["Pago Cuota 1"]).toBe("No aplica");
    expect(data["Pago Cuota 2"]).toBe("X");
    expect(data["Total a pagar"]).toBe("1500");
    expect(data["Fecha de emisión"]).toBe("01/01/2025");
    expect(data["Fecha de vencimiento"]).toBe("31/12/2025");
    expect(data["Forma de Pago"]).toBe("EFECTIVO");
  });

  test("bestEffortValidationPermisoCirculacion debe lanzar error para datos inválidos", () => {
    const datosInvalidos = {
      "Placa Única": "",
      "Código SII": "",
      "Valor Permiso": "ab",
      "Pago total": "No aplica", // se considera válido
      "Pago Cuota 1": "X",
      "Pago Cuota 2": "X",
      "Total a pagar": "1500",
      "Fecha de emisión": "invalid date",
      "Fecha de vencimiento": "31/12/2025",
      "Forma de Pago": "Efectivo"
    };

    expect(() => bestEffortValidationPermisoCirculacion(datosInvalidos, "testFile.pdf")).toThrow(
      /presenta problemas/
    );
  });
});
