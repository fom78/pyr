import type { Role } from "@/generated/prisma/enums";

export const ROLE_LABEL: Record<Role, string> = { ADMIN: "Admin", MOD: "Mod", USER: "Usuario" };
