/**
 * ARNES-OPENCODE — plugin arnes-doctor
 * Capas en sesion:
 *  1. Aviso de privacidad una vez por sesion cuando se usa un modelo free.
 *  2. session.error: clasifica el fallo (modelo rotado / cuota / auth / desconocido).
 *     - Modelo rotado  -> corre el doctor (--auto), avisa y prepara el reintento.
 *     - Cuota/auth     -> avisa que NO es rotacion (no corre el doctor).
 *     - Desconocido    -> crea propuesta ADITIVA en el arnes (auto-mejora pasiva).
 *
 * Todo es defensivo: si algo falla aqui, se registra y se ignora para no romper la sesion.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export const ArnesDoctorPlugin = async ({ client, $, directory }) => {
  let avisoDado = false;
  let doctorCorriendo = false;

  const raizArnes = () => {
    try {
      const f = join(directory, ".opencode", "arnes.json");
      if (!existsSync(f)) return null;
      return JSON.parse(readFileSync(f, "utf8"))?.raiz || null;
    } catch { return null; }
  };

  const toast = async (message, variant = "warning") => {
    try { await client?.tui?.showToast?.({ body: { message, variant } }); } catch {}
    try {
      await client?.app?.log?.({
        body: { service: "arnes-doctor", level: "info", message },
      });
    } catch {}
    if (!client?.tui?.showToast) console.log(`[arnes-doctor] ${message}`);
  };

  const clasificar = (texto) => {
    let fx = { model_no_encontrado: [], cuota: [], auth: [] };
    try {
      const raiz = raizArnes();
      if (raiz) fx = JSON.parse(readFileSync(join(raiz, "test", "fixtures", "errores.json"), "utf8"));
    } catch {}
    const t = (texto || "").toLowerCase();
    if (fx.model_no_encontrado?.some((p) => t.includes(p.toLowerCase()))) return "modelo";
    if (fx.cuota?.some((p) => t.includes(p.toLowerCase()))) return "cuota";
    if (fx.auth?.some((p) => t.includes(p.toLowerCase()))) return "auth";
    return "desconocido";
  };

  const proponerFixture = (texto) => {
    try {
      const raiz = raizArnes();
      if (!raiz) return;
      const id = `auto-${Date.now()}`;
      const propuesta = {
        id,
        tipo: "aditivo",
        baseVersion: (JSON.parse(readFileSync(join(raiz, "VERSION"), "utf8")) || "").trim(),
        origen: "plugin:auto",
        fecha: new Date().toISOString().slice(0, 10),
        estado: "pendiente",
        situacion: "Error de sesion no clasificado por los fixtures actuales",
        propuesta: `Agregar patron de deteccion para: "${String(texto).slice(0, 300)}"`,
        texto_error: String(texto).slice(0, 1000),
      };
      mkdirSync(join(raiz, "propuestas"), { recursive: true });
      writeFileSync(join(raiz, "propuestas", `${id}.json`), JSON.stringify(propuesta, null, 2));
      toast("Arnes: error nuevo registrado como propuesta (auto-mejora pasiva).", "info");
    } catch {}
  };

  const reaccionarError = async (texto) => {
    if (doctorCorriendo) return;
    const tipo = clasificar(texto);
    if (tipo === "modelo") {
      doctorCorriendo = true;
      try {
        const raiz = raizArnes();
        let msg = "Modelo del arnes no disponible. Ejecutando doctor (reasignacion automatica)...";
        await toast(msg, "warning");
        if (raiz && existsSync(join(raiz, "scripts", "doctor.mjs"))) {
          const perfil = (() => {
            try { return JSON.parse(readFileSync(join(directory, ".opencode", "arnes.json"), "utf8"))?.perfil || "hibrido"; } catch { return "hibrido"; }
          })();
          const proc = await $`node ${join(raiz, "scripts", "doctor.mjs")} --auto --perfil ${perfil}`.quiet().nothrow();
          msg = proc.exitCode === 0
            ? "Arnes: perfiles reasignados automaticamente. Reenvia la tarea (los subagentes toman el nuevo mapeo)."
            : "Arnes: doctor corrio con advertencias. Revisa su reporte antes de reintentar.";
          await toast(msg, proc.exitCode === 0 ? "info" : "warning");
          try {
            await client?.tui?.appendPrompt?.({
              body: { text: "Los modelos del arnes fueron reasignados por el doctor. Reintenta la tarea que fallo." },
            });
          } catch {}
        } else {
          await toast("Arnes: no encontre la raiz del arnes (.opencode/arnes.json). Corre el doctor manualmente.", "warning");
        }
      } catch (e) {
        await toast("Arnes: fallo el doctor automatico: " + (e?.message || e), "error");
      } finally { doctorCorriendo = false; }
    } else if (tipo === "cuota") {
      await toast("Arnes: cuota/rate-limit del provider (NO es rotacion de modelo). Espera o cambia de perfil; el doctor no aplica aqui.", "warning");
    } else if (tipo === "auth") {
      await toast("Arnes: problema de autenticacion. Corre `opencode auth login`.", "error");
    } else {
      proponerFixture(texto);
    }
  };

  return {
    event: async ({ event }) => {
      try {
        if (!event?.type) return;
        // aviso de privacidad: primer uso detectado de modelo free en la sesion
        if (!avisoDado && (event.type === "message.updated" || event.type === "message.part.updated")) {
          const s = JSON.stringify(event.properties || {});
          const m = s.match(/"(?:modelID|model)":"([^"]+)"/);
          if (m && /free/i.test(m[1])) {
            avisoDado = true;
            await toast(
              "AVISO FREE: los free tiers pueden registrar tus prompts. No pegues datos de clientes reales ni secretos en esta sesion.",
              "warning"
            );
          }
        }
        if (event.type === "session.error") {
          const s = JSON.stringify(event.properties || event);
          const m = s.match(/"(?:message|error|name)":"([^"]{4,400})"/);
          await reaccionarError(m ? m[1] : s.slice(0, 400));
        }
      } catch {}
    },
  };
};
