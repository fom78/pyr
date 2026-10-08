/** Error de negocio con mensaje apto para mostrar al usuario (en español). */
export class UserError extends Error {
  constructor(message: string, public code: string = "USER_ERROR", public status = 400) {
    super(message);
    this.name = "UserError";
  }
}

export class NotFoundError extends UserError {
  constructor(what = "Recurso") {
    super(`${what} no encontrado.`, "NOT_FOUND", 404);
  }
}
