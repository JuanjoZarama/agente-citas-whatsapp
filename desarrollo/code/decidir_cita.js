// Decide si la cita se puede crear: horario libre, sin duplicados
// y sin pasar el máximo de citas activas por cliente.
const cfg = $('Configuración').first().json;
const v = $('Validar cita').first().json;
const maxCitas = Number(cfg.max_citas_activas) || 3;
const salida = (json) => [{ json, pairedItem: { item: 0 } }];

const reales = (items) => items.map((it) => it.json).filter((e) => e && e.id && e.status !== 'cancelled');
const marca = `WhatsApp: ${v.telefono}`;
const delCliente = (e) => String(e.description || '').includes(marca);
const inicio = DateTime.fromISO(v.inicio);

const enEseHorario = reales($('Eventos en ese horario').all()).filter((e) => e.transparency !== 'transparent');
const propias = reales($('Citas del cliente').all()).filter(delCliente);

const repetida = enEseHorario.find(
  (e) => delCliente(e) && e.start && e.start.dateTime && +DateTime.fromISO(e.start.dateTime) === +inicio,
);
if (repetida) {
  return salida({ ok: false, response: `El cliente ya tiene esta cita agendada (${v.resumen}). ID de la cita: ${repetida.id}` });
}
if (enEseHorario.length) {
  return salida({ ok: false, response: `El horario del ${v.resumen} ya está ocupado. Consulta la disponibilidad y ofrece otra hora.` });
}
if (propias.length >= maxCitas) {
  return salida({
    ok: false,
    response: `El cliente ya tiene ${propias.length} citas próximas (máximo ${maxCitas}). Debe cancelar una antes de agendar otra.`,
  });
}

return salida({
  ok: true,
  titulo: `${v.servicio} - ${v.nombre}`,
  descripcion: [
    `Cliente: ${v.nombre}`,
    marca,
    `Servicio: ${v.servicio}`,
    v.notas ? `Notas: ${v.notas}` : null,
    'Agendada por el asistente de WhatsApp',
  ].filter(Boolean).join('\n'),
  inicio: v.inicio,
  fin: v.fin,
});
