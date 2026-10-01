// Typographie française : espace insécable avant « : » et « » », fine insécable avant « ; ! ? »,
// insécable après « « ». Un signe ne part plus seul à la ligne sur téléphone (recette Q n° 9 et 10).
// Sans effet sur l'anglais, qui n'a pas d'espace devant ces signes.
export function typo(texte) {
  return String(texte ?? '')
    .replace(/ ([:»])/g, ' $1')
    .replace(/ ([;!?])/g, ' $1')
    .replace(/« /g, '« ');
}
