// Valida la fecha pedida y define qué semana se lee del calendario.
const cfg = $('Configuración').first().json;
const req = $('Reglas de agenda').first().json;
const zona = cfg.zona_horaria || 'America/Bogota';
const ahora = DateTime.now().setZone(zona);
const diasMax = Number(cfg.dias_max) || 30;
const ultimoDia = ahora.startOf('day').plus({ days: diasMax });
const salida = (json) => [{ json, pairedItem: { item: 0 } }];

let dia = DateTime.fromISO(req.fecha, { zone: zona });
if (!/^\d{4}-\d{2}-\d{2}$/.test(req.fecha) || !dia.isValid) {
  return salida({ consultar: false, response: 'Fecha inválida. Envía la fecha en formato AAAA-MM-DD.' });
}
dia = dia.startOf('day');
let aviso = '';
if (dia < ahora.startOf('day')) {
  dia = ahora.startOf('day');
  aviso = 'La fecha pedida ya pasó; se muestran horarios desde hoy. ';
}
if (dia > ultimoDia) {
  return salida({
    consultar: false,
    response: `Solo se agenda hasta ${diasMax} días adelante (último día: ${ultimoDia.toISODate()}).`,
  });
}
const hasta = DateTime.min(dia.plus({ days: 7 }), ultimoDia.plus({ days: 1 }));
return salida({ consultar: true, aviso, desde: dia.toISO(), hasta: hasta.toISO() });
