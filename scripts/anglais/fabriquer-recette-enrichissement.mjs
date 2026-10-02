// Prépare un scénario playwright-cli privé ; aucun identifiant dans le dépôt.
import fs from 'node:fs/promises';
const role=process.argv[2];
if(!['admin','apprenant','bilan'].includes(role))throw Error('Usage: node scripts/anglais/fabriquer-recette-enrichissement.mjs admin|apprenant|bilan');
const base=process.env.ANGLAIS_TEST_URL||'http://127.0.0.1:3096';
if(!['127.0.0.1','localhost','anglais.localhost'].includes(new URL(base).hostname))throw Error('Recette locale uniquement');
const comptes=JSON.parse(await fs.readFile('.local/comptes.json','utf8'));
const source=await fs.readFile(role==='bilan'?'scripts/anglais/bilan-productions-ui.js':'scripts/anglais/enrichissement-ui.js','utf8');
const cible=`.local/enrich-ui-${role}.js`;
await fs.writeFile(cible,source.replace('__COMPTES__',JSON.stringify(comptes)).replace('__BASE__',JSON.stringify(base)).replace('__ROLE__',JSON.stringify(role)),{mode:0o600});
console.log(cible);
