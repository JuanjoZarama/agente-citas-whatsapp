// ---- Reglas de la agenda (se leen del nodo Configuración) ----
const cfg = $('Configuración').first().json;
const req = $('Reglas de agenda').first().json;
const zona = cfg.zona_horaria || 'America/Bogota';
const ahora = DateTime.now().setZone(zona);
const duracion = Number(cfg.duracion_min) || 60;
const paso = Number(cfg.intervalo_min) || duracion;
const anticipacion = Number(cfg.anticipacion_min) || 0;
const diasMax = Number(cfg.dias_max) || 30;
const horario = typeof cfg.horario === 'string' ? JSON.parse(cfg.horario) : (cfg.horario || {});
const festivos = new Set(req.festivos || []);

// Rangos de atención de un día, p. ej. [[08:00, 12:00], [14:00, 18:00]]
function rangosDelDia(dia) {
  if (festivos.has(dia.toISODate())) return [];
  return (horario[String(dia.weekday)] || []).map((r) => {
    const [a, b] = r.split('-').map((s) => s.trim());
    const [ha, ma] = a.split(':').map(Number);
    const [hb, mb] = b.split(':').map(Number);
    return [
      dia.set({ hour: ha, minute: ma, second: 0, millisecond: 0 }),
      dia.set({ hour: hb, minute: mb, second: 0, millisecond: 0 }),
    ];
  });
}

// Todas las horas de inicio posibles de un día según el horario
function cuposDelDia(dia) {
  const cupos = [];
  for (const [a, b] of rangosDelDia(dia)) {
    for (let t = a; t.plus({ minutes: duracion }) <= b; t = t.plus({ minutes: paso })) cupos.push(t);
  }
  return cupos;
}

// Eventos del calendario que ocupan tiempo (ignora cancelados y los marcados como "disponible")
function bloqueos(eventos) {
  return eventos
    .filter((e) => e && e.id && e.status !== 'cancelled' && e.transparency !== 'transparent')
    .map((e) => {
      const ini = e.start && e.start.dateTime
        ? DateTime.fromISO(e.start.dateTime, { zone: zona })
        : DateTime.fromISO(e.start && e.start.date, { zone: zona });
      const fin = e.end && e.end.dateTime
        ? DateTime.fromISO(e.end.dateTime, { zone: zona })
        : DateTime.fromISO(e.end && e.end.date, { zone: zona });
      return { ini, fin, evento: e };
    })
    .filter((b) => b.ini.isValid && b.fin.isValid);
}

const choca = (inicio, b) => inicio < b.fin && inicio.plus({ minutes: duracion }) > b.ini;
const etiqueta = (d) => `${d.setLocale('es').toFormat('cccc')} ${d.toISODate()}`;
// ---- Fin de las reglas ----
