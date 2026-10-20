// Junta lo que el agente necesita: el texto del cliente, los datos del negocio,
// la fecha actual y un calendario de los próximos 14 días (para que "el viernes"
// se convierta en la fecha correcta).
const cfg = $('Configuración').first().json;
const msg = $('Leer mensaje').item.json;
const contacto = $('Registrar contacto').item.json;
const zona = cfg.zona_horaria || 'America/Bogota';
const ahora = DateTime.now().setZone(zona).setLocale('es');

// Si fue nota de voz llega la transcripción: OpenAI la deja en "text" y Gemini
// en candidates[0].content.parts. Si no, se usa el texto escrito.
const esAudio = msg.tipo === 'audio';
const transcripcion = typeof $json.text === 'string'
  ? $json.text
  : ((($json.candidates || [])[0] || {}).content || { parts: [] }).parts
    .filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join(' ');
const escrito = String((esAudio ? transcripcion : msg.texto) || '').trim();
let texto = escrito || '(mensaje sin texto)';
if (esAudio) {
  texto = escrito
    ? `[Nota de voz transcrita] ${escrito}`
    : '[El cliente envió una nota de voz que no se pudo transcribir. Pídele con amabilidad que la escriba.]';
}

const calendario = [];
for (let i = 0; i < 14; i++) {
  const d = ahora.plus({ days: i });
  const extra = i === 0 ? ' (hoy)' : i === 1 ? ' (mañana)' : '';
  calendario.push(`- ${d.toFormat('cccc')} ${d.toISODate()}${extra}`);
}

// Cuánto pasó desde el mensaje anterior ("hace 3 días"), para no retomar conversaciones viejas.
let ultimoContacto = 'este es su primer mensaje';
if (contacto.ultimo_contacto) {
  const previo = DateTime.fromJSDate(new Date(contacto.ultimo_contacto)).setZone(zona).setLocale('es');
  if (previo.isValid) ultimoContacto = previo.toRelative({ base: ahora });
}

const dias = { 1: 'lunes', 2: 'martes', 3: 'miércoles', 4: 'jueves', 5: 'viernes', 6: 'sábado', 7: 'domingo' };
const horario = typeof cfg.horario === 'string' ? JSON.parse(cfg.horario) : (cfg.horario || {});
const horarioTexto = Object.keys(dias)
  .map((k) => `${dias[k]} ${(horario[k] || []).length ? horario[k].join(' y ') : 'cerrado'}`)
  .join('; ');

return {
  json: {
    texto,
    telefono: msg.telefono,
    nombre: msg.nombre || 'cliente',
    phone_number_id: msg.phone_number_id,
    es_nuevo: contacto.es_nuevo === true,
    ultimo_contacto: ultimoContacto,
    ahora: ahora.toFormat("cccc d 'de' LLLL 'de' yyyy, h:mm a"),
    calendario: calendario.join('\n'),
    horario_texto: horarioTexto + (cfg.cerrar_festivos === false ? '' : '; festivos cerrado'),
    negocio: cfg.negocio,
    asistente: cfg.asistente,
    servicios: cfg.servicios,
    direccion: cfg.direccion,
    info_extra: cfg.info_extra,
    politica_datos_url: cfg.politica_datos_url,
    duracion_min: cfg.duracion_min,
  },
};
