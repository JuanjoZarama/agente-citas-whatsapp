// Arma un recordatorio por cada cita de mañana que agendó el bot
// (las que tienen la línea "WhatsApp: <número>" en la descripción).
const cfg = $('Configuración').first().json;
const zona = cfg.zona_horaria || 'America/Bogota';
const salida = [];
$input.all().forEach((it, i) => {
  const e = it.json;
  if (!e || !e.id || e.status === 'cancelled' || !(e.start && e.start.dateTime)) return;
  const desc = String(e.description || '');
  const tel = (desc.match(/WhatsApp:\s*\+?(\d{8,15})/) || [])[1];
  if (!tel) return;
  const nombre = ((desc.match(/Cliente:\s*(.+)/) || [])[1] || 'cliente').trim();
  const ini = DateTime.fromISO(e.start.dateTime, { zone: zona }).setLocale('es');
  salida.push({
    json: {
      telefono: tel,
      nombre,
      fecha_texto: ini.toFormat("cccc d 'de' LLLL"),
      hora_texto: ini.toFormat('h:mm a'),
    },
    pairedItem: { item: i },
  });
});
return salida;
