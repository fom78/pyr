import { describe, expect, it } from "vitest";
import { usernameBase } from "@/server/auth/username";

describe("usernameBase (usuario automático para altas con Google)", () => {
  it("usa la parte local del mail, en minúsculas y sin símbolos raros", () => {
    expect(usernameBase("Juan.Perez+pyr@gmail.com", "Juan Pérez")).toBe("juan.perezpyr");
    expect(usernameBase("maria_gomez@hotmail.com", null)).toBe("maria_gomez");
  });

  it("saca acentos y la ñ, y no deja puntos o guiones bajos en los bordes", () => {
    expect(usernameBase("_.Ñandú.Ágil._@x.com", null)).toBe("nandu.agil");
  });

  it("con el mail de relleno usa el nombre", () => {
    expect(usernameBase("abc@sin-email.invalid", "José María López")).toBe("josemarialopez");
  });

  it("corta a 20 caracteres y completa los muy cortos; vacío = jugador", () => {
    expect(usernameBase("unnombredeusuariomuylargoparaeljuego@x.com", null)).toHaveLength(20);
    expect(usernameBase("ab@x.com", null)).toBe("ab_");
    expect(usernameBase("@x.com", "!!!")).toBe("jugador");
    expect(usernameBase(null, null)).toBe("jugador");
  });
});
