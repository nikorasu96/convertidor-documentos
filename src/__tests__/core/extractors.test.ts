import { homologacionExtractor } from "@/core/extraction/formats/homologacion";
import { crtExtractor } from "@/core/extraction/formats/crt";
import { soapExtractor } from "@/core/extraction/formats/soap";
import { permisoCirculacionExtractor } from "@/core/extraction/formats/permisoCirculacion";
import { detectFormat } from "@/core/extraction/detectFormat";

const HOMOLOGACION_TEXT =
  "CERTIFICADO DE HOMOLOGACIÓN INDIVIDUAL " +
  "FECHA DE EMISIÓN 19/JUL/2022 Nº CORRELATIVO 12345 " +
  "CÓDIGO DE INFORME TÉCNICO IT-2022-01 PATENTE ABCD12 " +
  "VÁLIDO HASTA JUL/2025 TIPO DE VEHÍCULO AUTOMOVIL MARCA TOYOTA AÑO 2022 " +
  "MODELO COROLLA COLOR ROJO VIN 1HGCM82633A123456 Nº MOTOR 2ZR1234567. " +
  "Firmado por: JUAN PEREZ 01/01/2024";

const CRT_TEXT =
  "CERTIFICADO DE REVISIÓN TÉCNICA FECHA REVISIÓN: 18 JUNIO 2024 PLANTA: B-1348 " +
  "PLACA PATENTE RDPL72 VÁLIDO HASTA MAYO 2025 " +
  "CERTIFICADO DE EMISIONES CONTAMINANTES VÁLIDO HASTA NOVIEMBRE 2024 " +
  "N°B1348000000515574";

const SOAP_TEXT =
  "SEGURO OBLIGATORIO SOAP INSCRIPCION R.V.M: TWGV11 - 7 Bajo el codigo: ABC123 " +
  "RUT: 96.511.140-7 RIGE DESDE: 01-01-2024 HASTA 01-01-2025 POLIZA N° 6297613-M PRIMA 12345";

const PERMISO_LABELED =
  "PERMISO DE CIRCULACIÓN Placa Única: ABCD12-3 Valor Permiso: 169917 " +
  "Total a pagar: 169917 Fecha de emisión: 01/03/2024 Fecha de vencimiento: 31/03/2025 " +
  "Forma de Pago: Internet";

const PERMISO_UNLABELED =
  "Comprobante municipal VLBP65-K 01/03/2024 31/03/2025 169.917 169.917 " +
  "firma electrónica avanzada";

// Caso Renca: unpdf extrae el texto SIN espacios entre tokens, los valores quedan
// pegados a sus vecinos y el RUT del propietario (77.608.183-3) no debe confundirse
// con el valor del permiso (720.993).
const PERMISO_RENCA_PEGADO =
  "Location: RENCA31/03/2027CAMIONETAVVTY83-7GRIS MERCURIOFORD720.993" +
  "SERVICIOS FINANCIEROS EL GOLF SPA77.608.183-3VERDE-0270.372720.993X" +
  "Este documento contiene una firma electrónica avanzada.Verificar en www.renca.cl. ID:0,0030-03-2026";

describe("detectFormat", () => {
  it("detecta cada formato", () => {
    expect(detectFormat(HOMOLOGACION_TEXT)).toBe("CERTIFICADO_DE_HOMOLOGACION");
    expect(detectFormat(CRT_TEXT)).toBe("CRT");
    expect(detectFormat(SOAP_TEXT)).toBe("SOAP");
    expect(detectFormat(PERMISO_LABELED)).toBe("PERMISO_CIRCULACION");
  });
  it("devuelve null para texto desconocido", () => {
    expect(detectFormat("contenido sin palabras clave")).toBeNull();
  });
});

describe("homologacionExtractor", () => {
  it("extrae y valida", () => {
    const d = homologacionExtractor.extract(HOMOLOGACION_TEXT);
    expect(d["Patente"]).toBe("ABCD12");
    expect(d["Marca"]).toBe("TOYOTA");
    expect(d["Año"]).toBe("2022");
    expect(d["Modelo"]).toBe("COROLLA");
    expect(d["Color"]).toBe("ROJO");
    expect(d["Firmado por"]).toBe("JUAN PEREZ");
    expect(() => homologacionExtractor.validate(d, "h.pdf")).not.toThrow();
  });
});

describe("crtExtractor", () => {
  it("extrae ambos certificados y valida", () => {
    const d = crtExtractor.extract(CRT_TEXT);
    expect(d["Fecha de Revisión"]).toBe("18 JUNIO 2024");
    expect(d["Planta"]).toBe("B-1348");
    expect(d["Placa Patente"]).toBe("RDPL72");
    expect(d["Válido Hasta Revisión Técnica"]).toBe("MAYO 2025");
    expect(d["Válido Hasta Contaminantes"]).toBe("NOVIEMBRE 2024");
    expect(d["Folio"]).toBe("N°B1348000000515574");
    expect(() => crtExtractor.validate(d, "crt.pdf")).not.toThrow();
  });
  it("lanza si no hay ningún certificado", () => {
    expect(() => crtExtractor.extract("FECHA REVISIÓN: 18 JUNIO 2024 sin secciones")).toThrow();
  });
});

describe("soapExtractor", () => {
  it("extrae y valida", () => {
    const d = soapExtractor.extract(SOAP_TEXT);
    expect(d["INSCRIPCION R.V.M"]).toBe("TWGV11 - 7");
    expect(d["RUT"]).toBe("96511140-7");
    expect(d["RIGE DESDE"]).toBe("01-01-2024");
    expect(d["HASTA"]).toBe("01-01-2025");
    expect(d["POLIZA N°"]).toBe("6297613-M");
    expect(d["PRIMA"]).toBe("12345");
    expect(() => soapExtractor.validate(d, "soap.pdf")).not.toThrow();
  });
});

describe("permisoCirculacionExtractor", () => {
  it("extrae con etiquetas", () => {
    const d = permisoCirculacionExtractor.extract(PERMISO_LABELED);
    expect(d["Placa Única"]).toBe("ABCD12-3");
    expect(d["Valor Permiso"]).toBe("169917");
    expect(d["Fecha de emisión"]).toBe("01/03/2024");
    expect(d["Fecha de vencimiento"]).toBe("31/03/2025");
    expect(() => permisoCirculacionExtractor.validate(d, "p.pdf")).not.toThrow();
  });
  it("usa la extracción sin etiquetas como respaldo", () => {
    const d = permisoCirculacionExtractor.extract(PERMISO_UNLABELED);
    expect(d["Placa Única"]).toBe("VLBP65-K");
    expect(d["Fecha de emisión"]).toBe("01/03/2024");
    expect(d["Fecha de vencimiento"]).toBe("31/03/2025");
    expect(d["Valor Permiso"]).toBe("169917");
    expect(d["Forma de Pago"]).toBe("Internet");
    expect(() => permisoCirculacionExtractor.validate(d, "p.pdf")).not.toThrow();
  });

  it("extrae de PDF Renca con texto pegado (sin espacios) sin confundir RUT con valor", () => {
    expect(detectFormat(PERMISO_RENCA_PEGADO)).toBe("PERMISO_CIRCULACION");
    const d = permisoCirculacionExtractor.extract(PERMISO_RENCA_PEGADO);
    expect(d["Placa Única"]).toBe("VVTY83-7");
    expect(d["Fecha de emisión"]).toBe("30/03/2026");
    expect(d["Fecha de vencimiento"]).toBe("31/03/2027");
    expect(d["Valor Permiso"]).toBe("720993"); // no "608183" (fragmento del RUT)
    expect(d["Total a pagar"]).toBe("720993");
    expect(d["Pago total"]).toBe("X"); // la X va pegada al valor total (720.993X)
    expect(d["Pago Cuota 1"]).toBe("No aplica");
    expect(d["Pago Cuota 2"]).toBe("No aplica");
    expect(() => permisoCirculacionExtractor.validate(d, "renca.pdf")).not.toThrow();
  });
});
