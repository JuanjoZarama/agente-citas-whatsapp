// Valida cada nodo del workflow contra la definición real de n8n instalada:
// - parámetros que n8n descartaría (nombre mal escrito o no aplicable a esa versión)
// - parámetros obligatorios faltantes
const path = require('path');
const NM = process.argv[3];
const req = (p) => require(path.join(NM, p));
const { NodeHelpers } = req('n8n-workflow');
const wf = require(path.resolve(process.argv[2]));

const pkgs = {
  'n8n-nodes-base': req('n8n-nodes-base/dist/known/nodes.json'),
  '@n8n/n8n-nodes-langchain': req('@n8n/n8n-nodes-langchain/dist/known/nodes.json'),
};

function description(type, version) {
  const [pkg, name] = type.startsWith('@n8n/') ? ['@n8n/n8n-nodes-langchain', type.split('.')[1]] : ['n8n-nodes-base', type.split('.')[1]];
  const info = pkgs[pkg][name];
  const mod = req(path.join(pkg, info.sourcePath));
  const inst = new mod[info.className]();
  const nt = typeof inst.getNodeType === 'function' ? inst.getNodeType(version) : inst;
  const versions = [].concat(nt.description.version);
  if (!versions.includes(version)) throw new Error(`${type} no tiene la versión ${version} (tiene ${versions})`);
  return nt.description;
}

// Compara recursivamente: claves que puse y que n8n no conserva
function perdidos(mio, normal, ruta = '') {
  const out = [];
  if (mio && typeof mio === 'object' && !Array.isArray(mio)) {
    for (const k of Object.keys(mio)) {
      const r = ruta ? `${ruta}.${k}` : k;
      if (!normal || !(k in normal)) out.push(r);
      else if (typeof mio[k] === 'object' && mio[k] !== null && !Array.isArray(mio[k]) && !('__rl' in mio[k]) && !('mappingMode' in mio[k])) out.push(...perdidos(mio[k], normal[k], r));
    }
  }
  return out;
}

let problemas = 0;
for (const node of wf.nodes) {
  try {
    const d = description(node.type, node.typeVersion);
    const normal = NodeHelpers.getNodeParameters(d.properties, node.parameters, true, false, node, d);
    const lost = perdidos(node.parameters, normal);
    const issues = NodeHelpers.getNodeParametersIssues(d.properties, { ...node, parameters: NodeHelpers.getNodeParameters(d.properties, node.parameters, true, false, node, d) }, d);
    const msgs = [];
    if (lost.length) msgs.push(`descartados: ${lost.join(', ')}`);
    if (issues && issues.parameters) msgs.push(`faltan: ${JSON.stringify(issues.parameters)}`);
    if (msgs.length) { problemas++; console.log(`✗ ${node.name} (${node.type}@${node.typeVersion}) → ${msgs.join(' | ')}`); }
    else console.log(`✓ ${node.name}`);
  } catch (e) {
    problemas++;
    console.log(`✗ ${node.name}: ${e.message}`);
  }
}
console.log(problemas ? `\n${problemas} nodos con observaciones` : '\nTodos los nodos son válidos');
