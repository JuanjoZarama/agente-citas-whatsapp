// Limpia los datos que envió el agente y calcula los festivos de Colombia
// (Ley 51 de 1983, "Ley Emiliani") para este año y el siguiente.
const entrada = $input.first().json;
const cfg = $('Configuración').first().json;
const zona = cfg.zona_horaria || 'America/Bogota';
const hoy = DateTime.now().setZone(zona);

function pascua(anio) {
  // Algoritmo de Meeus/Jones/Butcher (calendario gregoriano)
  const a = anio % 19, b = Math.floor(anio / 100), c = anio % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return DateTime.fromObject({ year: anio, month: mes, day: dia }, { zone: zona });
}

function alLunes(fecha) {
  // weekday: 1 = lunes ... 7 = domingo
  return fecha.weekday === 1 ? fecha : fecha.plus({ days: 8 - fecha.weekday });
}

function festivosColombia(anio) {
  const f = (mes, dia) => DateTime.fromObject({ year: anio, month: mes, day: dia }, { zone: zona });
  const p = pascua(anio);
  return [
    f(1, 1), f(5, 1), f(7, 20), f(8, 7), f(12, 8), f(12, 25),
    alLunes(f(1, 6)), alLunes(f(3, 19)), alLunes(f(6, 29)), alLunes(f(8, 15)),
    alLunes(f(10, 12)), alLunes(f(11, 1)), alLunes(f(11, 11)),
    p.minus({ days: 3 }), p.minus({ days: 2 }),
    p.plus({ days: 43 }), p.plus({ days: 64 }), p.plus({ days: 71 }),
  ].map((d) => d.toISODate());
}

const limpiar = (v) => (v === null || v === undefined ? '' : String(v).trim());

return [{
  json: {
    accion: limpiar(entrada.accion),
    telefono: limpiar(entrada.telefono).replace(/\D/g, ''),
    nombre: limpiar(entrada.nombre) || limpiar(entrada.nombre_perfil) || 'Cliente',
    fecha: limpiar(entrada.fecha),
    hora: limpiar(entrada.hora),
    servicio: limpiar(entrada.servicio),
    notas: limpiar(entrada.notas),
    event_id: limpiar(entrada.event_id),
    festivos: cfg.cerrar_festivos === false
      ? []
      : [...festivosColombia(hoy.year), ...festivosColombia(hoy.year + 1)],
  },
  pairedItem: { item: 0 },
}];
