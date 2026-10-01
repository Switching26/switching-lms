import { monter as evaluation } from './evaluation.js';
export const meta={titre:'Bilan et test éclair'};
export async function monter(racine,ctx){
 const d=ctx.donnees;
 return evaluation(racine,{...ctx,testUnite:true,donnees:{...d,type:'test_eclair',items:d.test_eclair?.questions||[],points:d.test_eclair?.points||4}});
}
