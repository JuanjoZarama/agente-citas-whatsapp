// Meta entrega la nota de voz sin extensión; la API de transcripción
// reconoce el formato por el nombre del archivo.
const item = $input.item;
if (item.binary && item.binary.data) {
  item.binary.data.fileName = 'nota_de_voz.ogg';
  item.binary.data.fileExtension = 'ogg';
  item.binary.data.mimeType = 'audio/ogg';
}
return item;
