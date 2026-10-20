/* ==========================================================================
   realtime.js — Versão de demonstração
   Na versão original, um WebSocket mantém todos os aparelhos da loja
   sincronizados. Aqui os dados ficam só neste navegador, então o indicador
   do topo apenas informa que o app está em modo demonstração / offline.
   ========================================================================== */

const Realtime = {
  init() {
    const pill = document.getElementById('sync-pill');
    if (!pill) return;
    pill.classList.add('is-online');
    pill.classList.remove('is-offline');
    pill.title = 'Versão de demonstração: os dados ficam salvos só neste navegador';
    document.getElementById('sync-pill-text').textContent = 'Demonstração';
  },
};

window.Realtime = Realtime;
