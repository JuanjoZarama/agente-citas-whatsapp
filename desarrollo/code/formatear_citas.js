// Lista las citas futuras de quien escribe, con su ID (para cancelar o reprogramar).
const cfg = $('Configuración').first().json;
const req = $('Reglas de agenda').first().json;
const zona = cfg.zona_horaria || 'America/Bogota';
const ahora = DateTime.now().setZone(zona);
const marca = `WhatsApp: ${req.telefono}`;

const propias = $input.all()
  .map((it) => it.json)
  .filter((e) => e && e.id && e.status !== 'cancelled' && String(e.description || '').includes(marca))
  .map((e) => ({ e, ini: DateTime.fromISO((e.start && (e.start.dateTime || e.start.date)) || '', { zone: zona }) }))
  .filter((x) => x.ini.isValid && x.ini >= ahora)
  .sort((a, b) => a.ini - b.ini);

const texto = propias.length
  ? 'Citas próximas del cliente:\n' + propias
    .map((x, i) => `${i + 1}. ${x.ini.setLocale('es').toFormat("cccc d 'de' LLLL 'a las' h:mm a")} - ${x.e.summary || 'Cita'} (ID: ${x.e.id})`)
    .join('\n')
  : 'El cliente no tiene citas próximas.';
return [{ json: { response: texto }, pairedItem: { item: 0 } }];
