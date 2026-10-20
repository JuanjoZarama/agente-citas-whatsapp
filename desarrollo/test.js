// Pruebas de los nodos Code con un entorno que imita a n8n (Luxon + $input + $()).
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { DateTime, Settings } = require('luxon');

const C = (f) => fs.readFileSync(path.join(__dirname, 'code', f), 'utf8');
const AGENDA = C('_agenda.js');

// "Ahora" fijo: jueves 15 de octubre de 2026, 8:58 a. m. en Bogotá
const AHORA = DateTime.fromISO('2026-10-15T08:58:00', { zone: 'America/Bogota' }).toMillis();
Settings.now = () => AHORA;

const CFG = {
  negocio: 'Mi Negocio', asistente: 'Sofía', servicios: 'Consulta', direccion: 'Calle 1', info_extra: '',
  politica_datos_url: 'https://x.co', calendar_id: 'primary', zona_horaria: 'America/Bogota',
  horario: JSON.stringify({ 1: ['08:00-12:00', '14:00-18:00'], 2: ['08:00-12:00', '14:00-18:00'], 3: ['08:00-12:00', '14:00-18:00'], 4: ['08:00-12:00', '14:00-18:00'], 5: ['08:00-12:00', '14:00-18:00'], 6: ['08:00-12:00'], 7: [] }),
  duracion_min: 60, intervalo_min: 60, anticipacion_min: 120, dias_max: 30, max_citas_activas: 3, cerrar_festivos: true,
};

function run(src, { input = [], nodes = {}, each = false }) {
  const items = input.map((json) => ({ json }));
  const $ = (name) => {
    const data = (nodes[name] || []).map((json) => ({ json }));
    if (!nodes[name]) throw new Error(`Nodo no simulado: ${name}`);
    return { first: () => data[0], all: () => data, item: data[0] };
  };
  const fn = new Function('$input', '$', 'DateTime', '$json', src);
  if (each) {
    const it = items[0];
    return fn({ item: it, all: () => items, first: () => it }, $, DateTime, it.json);
  }
  return fn({ all: () => items, first: () => items[0] }, $, DateTime, undefined);
}

let ok = 0;
const test = (name, f) => { f(); ok++; console.log(`  ✓ ${name}`); };

// ---------- Reglas de agenda (festivos) ----------
const reglas = (entrada, cfg = CFG) => run(C('reglas_agenda.js'), { input: [entrada], nodes: { 'Configuración': [cfg] } })[0].json;
test('festivos de Colombia 2026 completos', () => {
  const f = reglas({ accion: 'disponibilidad' }).festivos;
  const esperados = ['2026-01-01', '2026-01-12', '2026-03-23', '2026-04-02', '2026-04-03', '2026-05-01', '2026-05-18', '2026-06-08', '2026-06-15', '2026-06-29', '2026-07-20', '2026-08-07', '2026-08-17', '2026-10-12', '2026-11-02', '2026-11-16', '2026-12-08', '2026-12-25'];
  assert.deepStrictEqual(f.filter((d) => d.startsWith('2026')).sort(), esperados.sort());
});
test('festivos de Colombia 2027 (Semana Santa y traslados)', () => {
  const f = new Set(reglas({ accion: 'x' }).festivos);
  ['2027-01-11', '2027-03-22', '2027-03-25', '2027-03-26', '2027-05-10', '2027-05-31', '2027-06-07', '2027-07-05', '2027-08-16', '2027-10-18', '2027-11-01', '2027-11-15']
    .forEach((d) => assert(f.has(d), `falta ${d}`));
});
test('limpia nulos, teléfono y usa nombre de perfil', () => {
  const r = reglas({ accion: 'agendar', telefono: '+57 300 123 4567', nombre: null, nombre_perfil: 'Ana', fecha: ' 2026-10-16 ' });
  assert.strictEqual(r.telefono, '573001234567');
  assert.strictEqual(r.nombre, 'Ana');
  assert.strictEqual(r.fecha, '2026-10-16');
  assert.strictEqual(r.event_id, '');
});
test('sin festivos si cerrar_festivos = false', () => {
  assert.strictEqual(reglas({ accion: 'x' }, { ...CFG, cerrar_festivos: false }).festivos.length, 0);
});

// ---------- Disponibilidad ----------
const req = (extra) => ({ ...reglas({ accion: 'disponibilidad', telefono: '573001234567', ...extra }) });
const rango = (fecha) => run(C('rango_busqueda.js'), { nodes: { 'Configuración': [CFG], 'Reglas de agenda': [req({ fecha })] } })[0].json;
test('rango: fecha válida consulta 7 días', () => {
  const r = rango('2026-10-16');
  assert.strictEqual(r.consultar, true);
  assert.strictEqual(r.desde, '2026-10-16T00:00:00.000-05:00');
  assert.strictEqual(r.hasta, '2026-10-23T00:00:00.000-05:00');
});
test('rango: fecha pasada arranca hoy con aviso', () => {
  const r = rango('2026-10-01');
  assert.strictEqual(r.desde.slice(0, 10), '2026-10-15');
  assert(r.aviso.includes('ya pasó'));
});
test('rango: formato inválido y fecha muy lejana', () => {
  assert.strictEqual(rango('16/10/2026').consultar, false);
  assert.strictEqual(rango('2027-01-30').consultar, false);
});

const libres = (fecha, eventos) => {
  const r = rango(fecha);
  return run(`${AGENDA}\n${C('horarios_libres.js')}`, {
    input: eventos.length ? eventos : [{}],
    nodes: { 'Configuración': [CFG], 'Reglas de agenda': [req({ fecha })], 'Rango de búsqueda': [r] },
  })[0].json.response;
};
const ev = (id, ini, fin, extra = {}) => ({ id, status: 'confirmed', start: { dateTime: ini }, end: { dateTime: fin }, ...extra });
test('horarios: excluye ocupados, respeta transparentes y cancelados', () => {
  const t = libres('2026-10-16', [
    ev('a', '2026-10-16T09:00:00-05:00', '2026-10-16T10:00:00-05:00'),
    ev('b', '2026-10-16T10:00:00-05:00', '2026-10-16T11:00:00-05:00', { transparency: 'transparent' }),
    ev('c', '2026-10-16T14:00:00-05:00', '2026-10-16T15:00:00-05:00', { status: 'cancelled' }),
  ]);
  assert(t.includes('Horarios libres el viernes 2026-10-16: 08:00, 10:00, 11:00, 14:00, 15:00, 16:00, 17:00.'), t);
});
test('horarios: hoy respeta 2 horas de anticipación', () => {
  const t = libres('2026-10-15', []);
  assert(t.includes('jueves 2026-10-15: 11:00, 14:00'), t);
});
test('horarios: festivo sugiere los días siguientes', () => {
  const t = libres('2026-11-02', []);
  assert(t.includes('no hay horarios libres (festivo)'), t);
  assert(t.includes('martes 2026-11-03'), t);
});
test('horarios: domingo cerrado y evento de todo el día bloquea', () => {
  const t = libres('2026-10-18', [{ id: 'z', status: 'confirmed', start: { date: '2026-10-19' }, end: { date: '2026-10-20' } }]);
  assert(t.includes('no hay atención ese día'), t);
  assert(!t.includes('lunes 2026-10-19'), t);
  assert(t.includes('martes 2026-10-20'), t);
});
test('horarios: evento que pisa parte del cupo lo bloquea', () => {
  const t = libres('2026-10-16', [ev('d', '2026-10-16T08:30:00-05:00', '2026-10-16T08:45:00-05:00')]);
  assert(t.includes('2026-10-16: 09:00,'), t);
});

// ---------- Agendar ----------
const validar = (extra) => run(`${AGENDA}\n${C('validar_cita.js')}`, {
  nodes: { 'Configuración': [CFG], 'Reglas de agenda': [reglas({ accion: 'agendar', telefono: '573001234567', nombre_perfil: 'Ana', servicio: 'Consulta', ...extra })] },
})[0].json;
test('validar: cita correcta', () => {
  const v = validar({ fecha: '2026-10-16', hora: '15:00' });
  assert.strictEqual(v.valido, true);
  assert.strictEqual(v.inicio, '2026-10-16T15:00:00.000-05:00');
  assert.strictEqual(v.fin, '2026-10-16T16:00:00.000-05:00');
  assert.strictEqual(v.nombre, 'Ana');
  assert(/viernes 16 de octubre a las 3:00/.test(v.resumen), v.resumen);
});
test('validar: hora sin cero inicial', () => {
  assert.strictEqual(validar({ fecha: '2026-10-16', hora: '9:00' }).valido, true);
});
test('validar: rechaza fuera de la grilla, fuera de horario, pasado, festivo y sin servicio', () => {
  assert(validar({ fecha: '2026-10-16', hora: '15:30' }).response.includes('no está en la agenda'));
  assert(validar({ fecha: '2026-10-16', hora: '12:00' }).response.includes('no está en la agenda'));
  assert(validar({ fecha: '2026-10-15', hora: '09:00' }).response.includes('ya pasó'));
  assert(validar({ fecha: '2026-11-02', hora: '09:00' }).response.includes('festivo'));
  assert(validar({ fecha: '2026-10-16', hora: '09:00', servicio: '' }).response.includes('Falta el servicio'));
  assert(validar({ fecha: '2026-10-16', hora: '25:00' }).response.includes('no existe'));
});

const decidir = (enHorario, delCliente) => {
  const v = validar({ fecha: '2026-10-16', hora: '15:00' });
  return run(C('decidir_cita.js'), {
    input: delCliente.length ? delCliente : [{}],
    nodes: { 'Configuración': [CFG], 'Validar cita': [v], 'Eventos en ese horario': enHorario.length ? enHorario : [{}], 'Citas del cliente': delCliente.length ? delCliente : [{}] },
  })[0].json;
};
const mia = (id, ini) => ev(id, ini, ini.replace('T15', 'T16'), { description: 'Cliente: Ana\nWhatsApp: 573001234567' });
test('decidir: agenda si está libre', () => {
  const d = decidir([], []);
  assert.strictEqual(d.ok, true);
  assert(d.descripcion.includes('WhatsApp: 573001234567'));
  assert.strictEqual(d.titulo, 'Consulta - Ana');
});
test('decidir: ocupado por otra persona', () => {
  const d = decidir([ev('o', '2026-10-16T15:00:00-05:00', '2026-10-16T16:00:00-05:00', { description: 'WhatsApp: 579999999999' })], []);
  assert.strictEqual(d.ok, false);
  assert(d.response.includes('ya está ocupado'));
});
test('decidir: la misma cita no se duplica', () => {
  const d = decidir([mia('m1', '2026-10-16T15:00:00-05:00')], []);
  assert(d.response.includes('ya tiene esta cita') && d.response.includes('m1'));
});
test('decidir: tope de citas activas', () => {
  const d = decidir([], [mia('1', '2026-10-20T15:00:00-05:00'), mia('2', '2026-10-21T15:00:00-05:00'), mia('3', '2026-10-22T15:00:00-05:00')]);
  assert(d.response.includes('máximo 3'));
});

// ---------- Mis citas y cancelar ----------
test('formatear: solo futuras, propias y ordenadas', () => {
  const r = run(C('formatear_citas.js'), {
    input: [mia('b', '2026-10-22T15:00:00-05:00'), mia('a', '2026-10-20T15:00:00-05:00'), mia('pasada', '2026-10-01T15:00:00-05:00'),
      ev('otro', '2026-10-21T15:00:00-05:00', '2026-10-21T16:00:00-05:00', { description: 'WhatsApp: 571111111111' })],
    nodes: { 'Configuración': [CFG], 'Reglas de agenda': [reglas({ accion: 'mis_citas', telefono: '573001234567' })] },
  })[0].json.response;
  assert(r.indexOf('(ID: a)') < r.indexOf('(ID: b)'), r);
  assert(!r.includes('pasada') && !r.includes('otro'), r);
});
test('formatear: sin citas', () => {
  const r = run(C('formatear_citas.js'), { input: [{}], nodes: { 'Configuración': [CFG], 'Reglas de agenda': [reglas({ accion: 'mis_citas', telefono: '573001234567' })] } })[0].json.response;
  assert.strictEqual(r, 'El cliente no tiene citas próximas.');
});
const verificar = (evento, event_id = 'x1') => run(C('verificar_dueno.js'), {
  input: [evento], nodes: { 'Configuración': [CFG], 'Reglas de agenda': [reglas({ accion: 'cancelar', telefono: '573001234567', event_id })] },
})[0].json;
test('cancelar: solo citas propias y futuras', () => {
  assert.strictEqual(verificar(mia('x1', '2026-10-20T15:00:00-05:00')).ok, true);
  const ajena = verificar(ev('x1', '2026-10-20T15:00:00-05:00', '2026-10-20T16:00:00-05:00', { description: 'WhatsApp: 571111111111' }));
  const inexistente = verificar({ error: 'Not Found' });
  assert.strictEqual(ajena.ok, false);
  assert.strictEqual(ajena.response, inexistente.response);
  assert(verificar(mia('x1', '2026-10-01T15:00:00-05:00')).response.includes('ya pasó'));
  assert(verificar(mia('x1', '2026-10-20T15:00:00-05:00'), '').response.includes('Falta el ID'));
});

// ---------- Recordatorios ----------
test('rango de mañana', () => {
  const r = run(C('rango_manana.js'), { nodes: { 'Configuración': [CFG] } })[0].json;
  assert.strictEqual(r.desde, '2026-10-16T00:00:00.000-05:00');
  assert.strictEqual(r.hasta, '2026-10-17T00:00:00.000-05:00');
});
test('recordatorios: solo citas del bot', () => {
  const r = run(C('preparar_recordatorios.js'), {
    input: [mia('a', '2026-10-16T15:00:00-05:00'), ev('manual', '2026-10-16T09:00:00-05:00', '2026-10-16T10:00:00-05:00'), {}],
    nodes: { 'Configuración': [CFG] },
  });
  assert.strictEqual(r.length, 1);
  assert.deepStrictEqual(r[0].json, { telefono: '573001234567', nombre: 'Ana', fecha_texto: 'viernes 16 de octubre', hora_texto: r[0].json.hora_texto });
  assert(/^3:00/.test(r[0].json.hora_texto), r[0].json.hora_texto);
});

// ---------- Mensajes de WhatsApp ----------
const webhook = (msg) => ({ messaging_product: 'whatsapp', metadata: { phone_number_id: '111' }, contacts: [{ profile: { name: 'Ana' }, wa_id: '573001234567' }], messages: msg ? [msg] : undefined, field: 'messages' });
test('leer: texto, botón, audio, imagen y estados', () => {
  const r = run(C('leer_mensaje.js'), {
    input: [
      webhook({ from: '573001234567', id: 'w1', type: 'text', text: { body: ' Hola ' } }),
      webhook({ from: '573001234567', id: 'w2', type: 'button', button: { text: 'Cancelar' } }),
      webhook({ from: '573001234567', id: 'w3', type: 'audio', audio: { id: 'm1' } }),
      webhook({ from: '573001234567', id: 'w4', type: 'image', image: { id: 'i1' } }),
      { messaging_product: 'whatsapp', statuses: [{ status: 'read' }] },
    ],
  });
  assert.strictEqual(r.length, 4);
  assert.deepStrictEqual(r.map((x) => x.json.tipo), ['text', 'text', 'audio', 'image']);
  assert.strictEqual(r[0].json.texto, 'Hola');
  assert.strictEqual(r[2].json.media_id, 'm1');
  assert.deepStrictEqual(r.map((x) => x.pairedItem.item), [0, 1, 2, 3]);
});
const contexto = (msg, json, esNuevo = true) => run(C('preparar_contexto.js'), {
  each: true, input: [json],
  nodes: { 'Configuración': [CFG], 'Leer mensaje': [msg], 'Registrar contacto': [{ es_nuevo: esNuevo, bot_pausado: false, duplicado: false }] },
}).json;
test('contexto: calendario, cliente nuevo y texto', () => {
  const c = contexto({ telefono: '573001234567', nombre: 'Ana', tipo: 'text', texto: 'quiero una cita', phone_number_id: '111' }, { success: true });
  assert.strictEqual(c.texto, 'quiero una cita');
  assert.strictEqual(c.es_nuevo, true);
  assert(c.calendario.startsWith('- jueves 2026-10-15 (hoy)\n- viernes 2026-10-16 (mañana)'), c.calendario);
  assert(c.horario_texto.startsWith('lunes 08:00-12:00 y 14:00-18:00'), c.horario_texto);
  assert(c.horario_texto.includes('domingo cerrado'));
  assert(/^jueves 15 de octubre de 2026, 8:58/.test(c.ahora), c.ahora);
});
test('contexto: tiempo desde el mensaje anterior', () => {
  const m = { telefono: '1', nombre: 'Ana', tipo: 'text', texto: 'hola', phone_number_id: '111' };
  const conPrevio = (valor) => run(C('preparar_contexto.js'), {
    each: true, input: [{ success: true }],
    nodes: { 'Configuración': [CFG], 'Leer mensaje': [m], 'Registrar contacto': [{ es_nuevo: false, ultimo_contacto: valor }] },
  }).json.ultimo_contacto;
  assert.strictEqual(conPrevio('2026-10-12T13:58:00.000Z'), 'hace 3 días');
  assert.strictEqual(conPrevio(new Date('2026-10-15T13:50:00.000Z')), 'hace 8 minutos');
  assert.strictEqual(contexto(m, { success: true }).ultimo_contacto, 'este es su primer mensaje');
});
test('contexto: nota de voz transcrita y fallida', () => {
  const m = { telefono: '1', nombre: 'Ana', tipo: 'audio', texto: '', phone_number_id: '111' };
  assert.strictEqual(contexto(m, { text: 'para mañana' }).texto, '[Nota de voz transcrita] para mañana');
  assert(contexto(m, { error: 'falló' }).texto.includes('no se pudo transcribir'));
});

test('contexto: transcripción de Gemini (candidates/parts)', () => {
  const m = { telefono: '1', nombre: 'Ana', tipo: 'audio', texto: '', phone_number_id: '111' };
  const g = { candidates: [{ content: { parts: [{ text: 'pensando', thought: true }, { text: 'quiero cita el viernes' }] } }] };
  assert.strictEqual(contexto(m, g).texto, '[Nota de voz transcrita] quiero cita el viernes');
  assert(contexto(m, { candidates: [] }).texto.includes('no se pudo transcribir'));
});

console.log(`\n${ok} pruebas OK`);
