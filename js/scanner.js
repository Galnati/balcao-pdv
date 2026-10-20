/* ==========================================================================
   scanner.js — Leitura de código de barras pela câmera do celular
   Usa o leitor nativo do navegador (BarcodeDetector — Chrome/Edge no Android).
   - Com HTTPS (ou localhost): câmera ao vivo dentro do app.
   - Sem HTTPS (ex.: acesso por IP): abre a câmera do celular para tirar uma
     foto do código, e o app lê o código a partir da foto.
   ========================================================================== */

const Scanner = {
  stream: null,
  rodando: false,

  suportado() {
    return 'BarcodeDetector' in window;
  },

  async detector() {
    const desejados = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'];
    let formatos = desejados;
    try {
      const suportados = await window.BarcodeDetector.getSupportedFormats();
      formatos = desejados.filter((f) => suportados.includes(f));
    } catch (e) { /* usa a lista padrão */ }
    return new window.BarcodeDetector({ formats: formatos });
  },

  // callback(codigo) é chamado quando um código é lido
  async abrir(callback) {
    if (!this.suportado()) {
      Utils.toast('Este navegador não lê código de barras pela câmera. Use o Chrome no Android ou um leitor USB.', 'error');
      return;
    }
    const aoVivo = window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    if (!aoVivo) return this.lerPorFoto(callback);

    App.abrirModal('Aponte a câmera para o código', `
      <div class="scanner-box"><video id="scanner-video" playsinline muted></video><div class="scanner-mira"></div></div>
      <p class="hint-text" style="text-align:center;margin-top:10px;">Segure o celular parado a uns 15 cm do código de barras.</p>
      <div class="modal__footer"><button class="btn" id="scanner-cancelar">Cancelar</button></div>`);
    document.getElementById('scanner-cancelar').addEventListener('click', () => this.parar(true));
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    } catch (e) {
      this.parar(true);
      Utils.toast('Não foi possível usar a câmera: permissão negada', 'error');
      return;
    }
    const video = document.getElementById('scanner-video');
    video.srcObject = this.stream;
    await video.play().catch(() => {});
    const det = await this.detector();
    this.rodando = true;
    const loop = async () => {
      if (!this.rodando) return;
      try {
        const achados = await det.detect(video);
        if (achados.length) {
          const codigo = achados[0].rawValue;
          this.parar(true);
          if (navigator.vibrate) navigator.vibrate(80);
          callback(codigo);
          return;
        }
      } catch (e) { /* quadro ainda não pronto */ }
      setTimeout(loop, 180);
    };
    loop();
  },

  lerPorFoto(callback) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.addEventListener('change', async () => {
      const arquivo = input.files[0];
      if (!arquivo) return;
      try {
        const bitmap = await createImageBitmap(arquivo);
        const achados = await (await this.detector()).detect(bitmap);
        if (!achados.length) { Utils.toast('Não encontrei um código na foto. Tente mais perto e com boa luz.', 'error'); return; }
        callback(achados[0].rawValue);
      } catch (e) {
        Utils.toast('Não foi possível ler a foto', 'error');
      }
    });
    input.click();
  },

  parar(fecharModal) {
    this.rodando = false;
    if (this.stream) { this.stream.getTracks().forEach((t) => t.stop()); this.stream = null; }
    if (fecharModal) App.fecharModal();
  },
};

window.Scanner = Scanner;
