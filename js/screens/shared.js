// Éléments partagés entre écrans.

import { h, icon, toast, confirmSheet } from '../ui/dom.js';

export function demoBanner(app) {
  return h('div', { class: 'banner', role: 'note' },
    icon('sparkle'),
    h('span', { class: 'grow' }, h('b', null, 'Données de démonstration. '), 'Ces nuits sont synthétiques et ne décrivent personne.'),
    h('button', { class: 'btn small ghost', type: 'button', onclick: async () => {
      if (!(await confirmSheet({ title: 'Supprimer la démonstration ?', text: 'Seules les nuits de démonstration seront supprimées. Vos propres saisies sont conservées.', confirm: 'Supprimer' }))) return;
      const n = await app.repo.removeDemo();
      toast(`${n} épisodes de démonstration supprimés.`);
      app.rerender();
    } }, 'Retirer'));
}

export const PERIODS = [[7, '7 j'], [30, '30 j'], [90, '90 j'], [365, '1 an']];
