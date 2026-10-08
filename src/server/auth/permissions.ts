// Permisos centralizados. Toda verificación de autorización pasa por `can()`.
// Es una función pura (sin DB) para poder usarla en servidor, UI y tests.

export type Role = "ADMIN" | "MOD" | "USER";

export type Action =
  | "admin.access" // entrar al panel
  | "dashboard.view"
  | "category.manage"
  | "question.create"
  | "question.edit"
  | "question.review"
  | "question.import"
  | "question.autoApprove" // aprobar directamente al importar/crear
  | "quiz.manage"
  | "quiz.publish"
  | "quiz.recalculate"
  | "tournament.manage"
  | "user.list"
  | "user.ban"
  | "user.setRole"
  | "credits.adjust"
  | "settings.manage"
  | "rules.edit"
  | "audit.view"
  | "play";

export type Actor = {
  id: string;
  role: Role;
  banned?: boolean;
};

/** Permisos opcionales que el admin puede habilitar a los mods (vienen de la config). */
export type ModGrants = {
  canBan?: boolean;
  canPublishQuizzes?: boolean;
};

const MOD_ACTIONS = new Set<Action>([
  "admin.access",
  "dashboard.view",
  "category.manage",
  "question.create",
  "question.edit",
  "question.review",
  "question.import",
  "quiz.manage",
  "tournament.manage",
  "user.list",
  "play",
]);

const USER_ACTIONS = new Set<Action>(["play"]);

export function can(actor: Actor | null | undefined, action: Action, grants: ModGrants = {}): boolean {
  if (!actor) return false;
  // Un baneado no puede hacer nada salvo ver (las lecturas no pasan por can()).
  if (actor.banned) return false;
  switch (actor.role) {
    case "ADMIN":
      return true;
    case "MOD":
      if (MOD_ACTIONS.has(action)) return true;
      if (action === "user.ban") return Boolean(grants.canBan);
      if (action === "quiz.publish") return grants.canPublishQuizzes !== false;
      return false;
    case "USER":
      return USER_ACTIONS.has(action);
    default:
      return false;
  }
}

export class ForbiddenError extends Error {
  constructor(public action: Action) {
    super(`No tenés permiso para realizar esta acción (${action}).`);
    this.name = "ForbiddenError";
  }
}

export function assertCan(actor: Actor | null | undefined, action: Action, grants?: ModGrants): asserts actor is Actor {
  if (!can(actor, action, grants)) throw new ForbiddenError(action);
}
