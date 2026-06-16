// Pruebas del saneo contra inyección de fórmulas / CSV injection (CWE-1236) y contra
// corrupción/spoofing del .xlsx. El nombre del PDF es 100% controlado por quien genera
// el archivo, por lo que es el vector principal: ni un nombre como `=cmd|'/c calc'!A1.pdf`
// ni uno con espacio/salto de línea/RTL inicial deben producir una fórmula viva.
import { describe, it, expect } from "vitest";
import { neutralizeFormula } from "@/client/excel/buildWorkbook";

const NBSP = String.fromCharCode(0x00a0);
const BOM = String.fromCharCode(0xfeff);
const RLO = String.fromCharCode(0x202e); // right-to-left override
const VT = String.fromCharCode(0x0b); // tabulacion vertical (ilegal en XML)
const NEL = String.fromCharCode(0x85); // next line (control C1) — NO es \s
const LS = String.fromCharCode(0x2028); // line separator
const PS = String.fromCharCode(0x2029); // paragraph separator
// Caracteres de formato (categoría Cf) que NO son \s y que un importador puede saltar
// antes de una fórmula: marcas bidi sueltas y de ancho cero.
const FORMAT_CHARS = [0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x061c, 0x2060, 0x180e].map((cp) =>
  String.fromCodePoint(cp)
);

describe("neutralizeFormula", () => {
  it("antepone apóstrofo a valores que empiezan por carácter de fórmula", () => {
    expect(neutralizeFormula("=1+1")).toBe("'=1+1");
    expect(neutralizeFormula("+1")).toBe("'+1");
    expect(neutralizeFormula("-1+1")).toBe("'-1+1");
    expect(neutralizeFormula("@SUM(A1)")).toBe("'@SUM(A1)");
  });

  it("neutraliza payloads clásicos de inyección vía nombre de archivo", () => {
    expect(neutralizeFormula("=cmd|'/c calc'!A1")).toBe("'=cmd|'/c calc'!A1");
    expect(neutralizeFormula('=HYPERLINK("http://evil","x")')).toBe(
      "'=HYPERLINK(\"http://evil\",\"x\")"
    );
    expect(neutralizeFormula('=WEBSERVICE("http://evil")')).toBe('\'=WEBSERVICE("http://evil")');
  });

  it("cubre el whitespace inicial antes del carácter de fórmula (espacio/NBSP/BOM/tab)", () => {
    expect(neutralizeFormula(" =1+1")).toBe("' =1+1");
    expect(neutralizeFormula(NBSP + "=1+1")).toBe("'" + NBSP + "=1+1");
    expect(neutralizeFormula(BOM + "=1+1")).toBe("'" + BOM + "=1+1");
    expect(neutralizeFormula("\t=HYPERLINK")).toBe("'\t=HYPERLINK");
  });

  it("neutraliza una fórmula en una segunda línea (celda multilínea -> CSV)", () => {
    expect(neutralizeFormula("texto\n=cmd")).toBe("'texto\n=cmd");
    expect(neutralizeFormula("a\r\n=1+1")).toBe("'a\r\n=1+1");
  });

  it("cierra el bypass de caracteres de formato Unicode (Cf) que anteceden a una fórmula", () => {
    for (const fc of FORMAT_CHARS) {
      expect(neutralizeFormula(fc + "=cmd")).toBe("'" + fc + "=cmd");
      expect(neutralizeFormula(fc + "=HYPERLINK(\"x\")")).toBe('\'' + fc + '=HYPERLINK("x")');
    }
    // Combinación de invisible + espacio + fórmula también se neutraliza.
    expect(neutralizeFormula(" " + FORMAT_CHARS[0] + "=1+1")).toBe("' " + FORMAT_CHARS[0] + "=1+1");
  });

  it("cierra el bypass de saltos de línea Unicode exóticos (NEL/LS/PS): se eliminan, sin 2ª línea viva", () => {
    // Líder + fórmula: tras eliminar el separador queda "=..." al frente -> apóstrofo.
    expect(neutralizeFormula(NEL + "=HYPERLINK")).toBe("'=HYPERLINK");
    expect(neutralizeFormula(LS + "=cmd")).toBe("'=cmd");
    expect(neutralizeFormula(PS + "=cmd")).toBe("'=cmd");
    // Mid-línea: el separador se elimina por completo, así que NO queda una 2ª línea
    // que un importador pueda interpretar como fórmula (queda un único campo seguro).
    expect(neutralizeFormula("factura" + NEL + "=cmd")).toBe("factura=cmd");
    expect(neutralizeFormula("factura" + LS + "=cmd")).toBe("factura=cmd");
    expect(neutralizeFormula("factura" + PS + "=cmd")).toBe("factura=cmd");
  });

  it("elimina caracteres de control ilegales en OOXML y controles bidi/RTL", () => {
    // VT (0x0B) es ilegal en XML: se elimina; si deja una fórmula al frente, se neutraliza.
    expect(neutralizeFormula(VT + "=x")).toBe("'=x");
    expect(neutralizeFormula("ab" + VT + "cd")).toBe("abcd");
    // RTL override que falsearía "…fdp.exe" como "exe.pdf": se elimina.
    expect(neutralizeFormula(RLO + "exe.pdf")).toBe("exe.pdf");
  });

  it("no altera valores legítimos de los documentos", () => {
    expect(neutralizeFormula("VVTY83")).toBe("VVTY83");
    expect(neutralizeFormula("31/03/2027")).toBe("31/03/2027");
    expect(neutralizeFormula("123456")).toBe("123456");
    expect(neutralizeFormula("Permiso de Circulación")).toBe("Permiso de Circulación");
    expect(neutralizeFormula("")).toBe("");
    // El carácter de fórmula en medio del valor no se toca (solo importa el inicio de línea).
    expect(neutralizeFormula("A=B")).toBe("A=B");
  });
});
