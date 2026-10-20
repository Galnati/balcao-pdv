/* ==========================================================================
   db.js — Cliente da API do servidor (versão multiusuário)
   Mantém a MESMA interface do db.js original (add, put, get, getAll,
   delete, clear, count, exportAll, importAll) para que o resto do app
   funcione sem alterações. Aqui, em vez de IndexedDB, tudo conversa com
   o servidor Node.js via HTTP.
   ========================================================================== */

const API_BASE = '/api';

async function apiFetch(caminho, options) {
  const opts = options || {};
  opts.headers = Object.assign({}, opts.headers, authHeader());
  const res = await fetch(API_BASE + caminho, opts);
  if (res.status === 401) {
    // Sessão expirou ou é inválida — manda de volta pra tela de login.
    if (window.Auth) Auth.logout();
    throw new Error('Sessão expirada. Faça login novamente.');
  }
  if (!res.ok) {
    let msg = 'Erro na comunicação com o servidor (' + res.status + ')';
    try {
      const j = await res.json();
      if (j && j.error) msg = j.error;
    } catch (e) { /* ignora */ }
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

function authHeader() {
  return (window.Auth && Auth.token) ? { Authorization: 'Bearer ' + Auth.token } : {};
}

function jsonHeaders() {
  return { 'Content-Type': 'application/json' };
}

const DB = {
  async add(storeName, obj) {
    const salvo = await apiFetch('/' + storeName, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(obj),
    });
    return salvo.id;
  },

  async put(storeName, obj) {
    const chaveUrl = storeName === 'config' ? obj.chave : obj.id;
    const salvo = await apiFetch('/' + storeName + '/' + encodeURIComponent(chaveUrl), {
      method: 'PUT',
      headers: jsonHeaders(),
      body: JSON.stringify(obj),
    });
    return storeName === 'config' ? salvo.chave : salvo.id;
  },

  async get(storeName, id) {
    try {
      return await apiFetch('/' + storeName + '/' + encodeURIComponent(id));
    } catch (e) {
      return undefined;
    }
  },

  async getAll(storeName) {
    return apiFetch('/' + storeName);
  },

  async delete(storeName, id) {
    await apiFetch('/' + storeName + '/' + encodeURIComponent(id), { method: 'DELETE' });
  },

  async clear(storeName) {
    await apiFetch('/' + storeName, { method: 'DELETE' });
  },

  async count(storeName) {
    const todos = await this.getAll(storeName);
    return todos.length;
  },

  // Movimentação atômica de estoque (evita corrida entre vendas simultâneas)
  async estoqueMovimentar(mov) {
    return apiFetch('/estoque/movimentar', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(mov),
    });
  },

  async exportAll() {
    return apiFetch('/_export');
  },

  async backupAgora() {
    return apiFetch('/_backup-agora', { method: 'POST' });
  },

  async backupStatus() {
    return apiFetch('/_backup-status');
  },

  async importAll(data) {
    return apiFetch('/_import', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    });
  },
};

async function openDatabase() {
  // Confirma que o servidor está de pé antes de iniciar o app.
  await apiFetch('/_ping');
  return true;
}

window.DB = DB;
window.openDatabase = openDatabase;
