// Calcula los horarios libres del día pedido y, si no hay, de los días siguientes.
// Al modelo solo le llegan horas libres: nunca nombres ni datos de otros clientes.
const rango = $('Rango de búsqueda').first().json;
const desde = DateTime.fromISO(rango.desde, { zone: zona });
const hasta = DateTime.fromISO(rango.hasta, { zone: zona });
const ocupados = bloqueos($input.all().map((it) => it.json));
const minimo = ahora.plus({ minutes: anticipacion });

const dias = [];
for (let d = desde; d < hasta; d = d.plus({ days: 1 })) {
  const libres = cuposDelDia(d).filter((t) => t >= minimo && !ocupados.some((b) => choca(t, b)));
  let motivo = 'agenda llena';
  if (festivos.has(d.toISODate())) motivo = 'festivo';
  else if (!(horario[String(d.weekday)] || []).length) motivo = 'no hay atención ese día';
  dias.push({ d, libres, motivo });
}

const lista = (ts) => ts.map((t) => t.toFormat('HH:mm')).join(', ');
const pedido = dias[0];
let texto = rango.aviso || '';
if (pedido.libres.length) {
  texto += `Horarios libres el ${etiqueta(pedido.d)}: ${lista(pedido.libres)}.`;
} else {
  texto += `El ${etiqueta(pedido.d)} no hay horarios libres (${pedido.motivo}).`;
  const otros = dias.slice(1).filter((x) => x.libres.length).slice(0, 3);
  texto += otros.length
    ? ` Próximos días con cupo: ${otros.map((x) => `${etiqueta(x.d)} (${lista(x.libres.slice(0, 6))})`).join('; ')}.`
    : ' Tampoco hay cupos en los días siguientes de esa semana.';
}
texto += ` Cada cita dura ${duracion} minutos.`;
return [{ json: { response: texto }, pairedItem: { item: 0 } }];
