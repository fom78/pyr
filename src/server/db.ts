import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Una sola instancia por proceso (en dev, sobrevive al hot reload).
// Se guarda también la clase: si `prisma generate` regeneró el cliente (migración nueva con el
// servidor de dev corriendo), la clase cambia y se crea uno nuevo; si no, el viejo no conoce
// los modelos nuevos y `prisma.<modelo>` es undefined.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; prismaClass?: typeof PrismaClient };

function createClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

const cached = globalForPrisma.prismaClass === PrismaClient ? globalForPrisma.prisma : undefined;
if (!cached && globalForPrisma.prisma) void globalForPrisma.prisma.$disconnect().catch(() => {});

export const prisma = cached ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaClass = PrismaClient;
}

export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
/** Cliente o transacción: los servicios aceptan cualquiera de los dos. */
export type Db = typeof prisma | Tx;
