'use strict';

/**
 * Cache em memória com validade (TTL) e deduplicação de buscas simultâneas.
 * Devolve uma função cached(chave, carregador) que acrescenta `cache: true|false` ao resultado.
 */
function createCache(ttlMs) {
  const store = new Map();
  return async function cached(key, loader) {
    const hit = store.get(key);
    if (hit && hit.value && Date.now() - hit.at < ttlMs) return { ...hit.value, cache: true };
    if (hit && hit.pending) return { ...(await hit.pending), cache: false };
    const pending = loader();
    store.set(key, { pending });
    try {
      const value = await pending;
      store.set(key, { value, at: Date.now() });
      return { ...value, cache: false };
    } catch (err) {
      store.delete(key);
      throw err;
    }
  };
}

module.exports = { createCache };
