// Tous les services partagés, en un seul import : `import { services } from './index.js'`.
import { audio } from './audio.js';
import { voix } from './voix.js';
import { guide } from './guide.js';
import { retour } from './retour.js';
import { aide } from './aide.js';
import { micro } from './micro.js';
import { prononciation } from './prononciation.js';
import { sons } from './sons.js';
import { carnet } from './carnet.js';
import { revisions } from './revisions.js';
import { stockage } from './stockage.js';
import { visuels } from './visuels.js';
import { icones } from './icones.js';

export const services = { audio, voix, guide, retour, aide, micro, prononciation, sons, carnet, revisions, stockage, visuels, icones };
export { audio, voix, guide, retour, aide, micro, prononciation, sons, carnet, revisions, stockage, visuels, icones };
