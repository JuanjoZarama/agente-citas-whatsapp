// Extrae del webhook de WhatsApp solo lo que el flujo necesita.
// Los avisos de estado (enviado, entregado, leído) no traen "messages" y se descartan aquí.
const salida = [];
$input.all().forEach((item, i) => {
  const v = item.json;
  const msg = (v.messages || [])[0];
  if (!msg) return;
  const contacto = (v.contacts || [])[0] || {};
  let tipo = msg.type;
  let texto = '';
  let media_id = null;
  if (tipo === 'text') {
    texto = (msg.text && msg.text.body) || '';
  } else if (tipo === 'button') {
    // Respuesta a un botón de una plantilla
    texto = (msg.button && msg.button.text) || '';
    tipo = 'text';
  } else if (tipo === 'interactive') {
    const it = msg.interactive || {};
    texto = (it.button_reply && it.button_reply.title) || (it.list_reply && it.list_reply.title) || '';
    tipo = 'text';
  } else if (tipo === 'audio') {
    media_id = (msg.audio && msg.audio.id) || null;
  }
  salida.push({
    json: {
      telefono: String(msg.from || '').replace(/\D/g, ''),
      nombre: (contacto.profile && contacto.profile.name) || '',
      message_id: msg.id,
      tipo,
      texto: String(texto).trim(),
      media_id,
      phone_number_id: (v.metadata && v.metadata.phone_number_id) || '',
    },
    pairedItem: { item: i },
  });
});
return salida;
