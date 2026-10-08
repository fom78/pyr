import { authorize } from "@/server/auth/guard";
import { userCan } from "@/server/auth/session";
import { previewImport } from "@/server/import/excel";
import { assertRateLimit } from "@/server/ratelimit";
import { apiError } from "@/server/api";
import { UserError } from "@/server/errors";

const MAX_XLSX = 5 * 1024 * 1024;
const MAX_ZIP = 25 * 1024 * 1024;

/** Sube Excel (+ zip opcional) y crea la previsualización. Devuelve { jobId }. */
export async function POST(req: Request) {
  try {
    const user = await authorize("question.import");
    await assertRateLimit(`import:${user.id}`, 20, 3600);
    const form = await req.formData();
    const xlsx = form.get("xlsx");
    const zip = form.get("zip");
    if (!(xlsx instanceof File) || xlsx.size === 0) throw new UserError("Elegí el archivo Excel (.xlsx).");
    if (!/\.xlsx$/i.test(xlsx.name)) throw new UserError("El archivo debe ser .xlsx (Excel).");
    if (xlsx.size > MAX_XLSX) throw new UserError("El Excel supera los 5 MB.");
    if (zip instanceof File && zip.size > MAX_ZIP) throw new UserError("El .zip supera los 25 MB.");
    const autoApprove = form.get("approve") === "on" && (await userCan(user, "question.autoApprove"));
    const job = await previewImport({
      authorId: user.id,
      fileName: xlsx.name,
      xlsx: Buffer.from(await xlsx.arrayBuffer()),
      zip: zip instanceof File && zip.size > 0 ? Buffer.from(await zip.arrayBuffer()) : undefined,
      autoApprove,
    });
    return Response.json({ jobId: job.id });
  } catch (err) {
    return apiError(err);
  }
}
