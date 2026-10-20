// Rango del día siguiente completo, en la zona horaria del negocio.
const cfg = $('Configuración').first().json;
const zona = cfg.zona_horaria || 'America/Bogota';
const manana = DateTime.now().setZone(zona).plus({ days: 1 }).startOf('day');
return [{ json: { desde: manana.toISO(), hasta: manana.plus({ days: 1 }).toISO() }, pairedItem: { item: 0 } }];
