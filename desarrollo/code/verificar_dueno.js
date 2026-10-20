// Solo se cancela una cita si tiene el número de quien escribe.
// El mensaje es el mismo si no existe o si es de otra persona, para no revelar citas ajenas.
const cfg = $('Configuración').first().json;
const req = $('Reglas de agenda').first().json;
const zona = cfg.zona_horaria || 'America/Bogota';
const ahora = DateTime.now().setZone(zona);
const e = $input.first().json;
const salida = (json) => [{ json, pairedItem: { item: 0 } }];
const noEncontrada = 'No encontré una cita con ese ID a nombre de este cliente. Usa ver_mis_citas para ver sus citas.';

if (!req.event_id) return salida({ ok: false, response: 'Falta el ID de la cita. Usa ver_mis_citas para obtenerlo.' });
if (!e || e.error || !e.id || e.status === 'cancelled') return salida({ ok: false, response: noEncontrada });
if (!String(e.description || '').includes(`WhatsApp: ${req.telefono}`)) return salida({ ok: false, response: noEncontrada });

const ini = DateTime.fromISO((e.start && (e.start.dateTime || e.start.date)) || '', { zone: zona });
if (ini.isValid && ini < ahora) return salida({ ok: false, response: 'Esa cita ya pasó; no se puede cancelar.' });

return salida({
  ok: true,
  event_id: e.id,
  resumen: `${ini.setLocale('es').toFormat("cccc d 'de' LLLL 'a las' h:mm a")} - ${e.summary || 'Cita'}`,
});
