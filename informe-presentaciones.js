// api/informe-presentaciones.js
// Se ejecuta automáticamente cada lunes (ver vercel.json) y envía al gerente
// un email con las presentaciones de producto registradas la semana anterior (lunes a domingo).
//
// VARIABLES DE ENTORNO NECESARIAS (configurar en Vercel → Settings → Environment Variables):
//   FIREBASE_SERVICE_ACCOUNT  → JSON completo de la cuenta de servicio de Firebase (como string)
//   RESEND_API_KEY            → API key de Resend (https://resend.com)
//   EMAIL_FROM                → remitente verificado, ej: "MGtrauma <informes@mgtrauma.com>"
//   GERENTE_EMAIL             → email del gerente que recibirá el informe
//   CRON_SECRET               → cadena secreta cualquiera; Vercel la envía automáticamente
//                               en el header Authorization de las llamadas de Cron

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  });
}
const db = admin.firestore();

const ACT_LBL = {
  cirugia: '🔪 Cirugía',
  material: '📦 Material',
  comercial: '🤝 Visita comercial',
  formacion: '🎓 Formación',
  documentacion: '📄 Documentación',
  otro: '📝 Otro',
};

// Calcula el lunes y el domingo de la semana ANTERIOR a la fecha dada, en formato YYYY-MM-DD
function semanaAnterior(hoy) {
  const d = new Date(hoy);
  const dia = d.getDay(); // 0=domingo, 1=lunes, ... 6=sábado
  const diffAlLunesActual = dia === 0 ? -6 : 1 - dia;
  const lunesActual = new Date(d);
  lunesActual.setDate(d.getDate() + diffAlLunesActual);
  const lunesPasado = new Date(lunesActual);
  lunesPasado.setDate(lunesActual.getDate() - 7);
  const domingoPasado = new Date(lunesActual);
  domingoPasado.setDate(lunesActual.getDate() - 1);
  const fmt = (x) => x.toISOString().split('T')[0];
  return { desde: fmt(lunesPasado), hasta: fmt(domingoPasado) };
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

module.exports = async (req, res) => {
  // Vercel Cron añade automáticamente este header cuando invoca la función
  if (process.env.CRON_SECRET && req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const { desde, hasta } = semanaAnterior(new Date());

    const snap = await db
      .collection('visitas')
      .where('fecha', '>=', desde)
      .where('fecha', '<=', hasta)
      .get();

    const presentaciones = snap.docs
      .map((d) => d.data())
      .filter((v) => v.presentacion === true)
      .sort((a, b) => a.fecha.localeCompare(b.fecha));

    const filasHtml = presentaciones.length
      ? presentaciones.map((p) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(p.fecha)}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(p.usuario)}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(p.lugar)}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb">${(p.actividades || []).map((a) => ACT_LBL[a] || a).join(', ')}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(p.presentacionTexto)}</td>
        </tr>`).join('')
      : `<tr><td colspan="5" style="padding:14px;color:#6b7280">Sin presentaciones de producto registradas esta semana.</td></tr>`;

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto">
        <h2 style="color:#111827">📊 Presentaciones de producto</h2>
        <p style="color:#6b7280;font-size:13px">Semana del ${desde} al ${hasta}</p>
        <table style="border-collapse:collapse;width:100%;font-size:13px">
          <thead>
            <tr style="background:#111827;color:#fff">
              <th style="padding:8px;text-align:left">Fecha</th>
              <th style="padding:8px;text-align:left">Comercial</th>
              <th style="padding:8px;text-align:left">Hospital</th>
              <th style="padding:8px;text-align:left">Actividad</th>
              <th style="padding:8px;text-align:left">Detalle</th>
            </tr>
          </thead>
          <tbody>${filasHtml}</tbody>
        </table>
        <p style="color:#6b7280;font-size:12px;margin-top:16px">
          Total: ${presentaciones.length} presentación(es) — informe generado automáticamente por MGtrauma cada lunes.
        </p>
      </div>`;

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: process.env.GERENTE_EMAIL,
        subject: `Presentaciones de producto — semana del ${desde} al ${hasta}`,
        html,
      }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(data));

    res.status(200).json({ ok: true, enviadas: presentaciones.length, desde, hasta });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
};
