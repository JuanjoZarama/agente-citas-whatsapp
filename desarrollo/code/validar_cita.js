// Revisa que la cita pedida cumpla las reglas antes de tocar el calendario.
const salida = (json) => [{ json, pairedItem: { item: 0 } }];
const error = (mensaje) => salida({ valido: false, response: mensaje });

if (!req.telefono) return error('No se identificó el número del cliente.');
if (!req.servicio) return error('Falta el servicio. Pregúntale al cliente qué servicio necesita.');
if (!/^\d{4}-\d{2}-\d{2}$/.test(req.fecha)) return error('Fecha inválida. Usa el formato AAAA-MM-DD.');
if (!/^\d{1,2}:\d{2}$/.test(req.hora)) return error('Hora inválida. Usa el formato HH:MM de 24 horas.');

const inicio = DateTime.fromISO(`${req.fecha}T${req.hora.padStart(5, '0')}`, { zone: zona });
if (!inicio.isValid) return error('Esa fecha u hora no existe.');
if (inicio < ahora.plus({ minutes: anticipacion })) {
  return error(`Ese horario ya pasó o está muy cerca. Se agenda con mínimo ${anticipacion} minutos de anticipación.`);
}
if (inicio.startOf('day') > ahora.startOf('day').plus({ days: diasMax })) {
  return error(`Solo se agenda hasta ${diasMax} días adelante.`);
}
if (festivos.has(inicio.toISODate())) return error('Ese día es festivo y no hay atención.');
if (!cuposDelDia(inicio.startOf('day')).some((t) => +t === +inicio)) {
  return error(`Esa hora no está en la agenda. Usa consultar_disponibilidad para ver las horas válidas del ${etiqueta(inicio)}.`);
}

return salida({
  valido: true,
  inicio: inicio.toISO(),
  fin: inicio.plus({ minutes: duracion }).toISO(),
  resumen: inicio.setLocale('es').toFormat("cccc d 'de' LLLL 'a las' h:mm a"),
  telefono: req.telefono,
  nombre: req.nombre,
  servicio: req.servicio,
  notas: req.notas,
});
