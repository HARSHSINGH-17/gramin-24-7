// ============ SAFETY: if browser storage is blocked/full, keep data in memory so app still opens ============
(function () {
  let ok = true;
  try {
    localStorage.setItem("__pc_t", "1");
    localStorage.removeItem("__pc_t");
  } catch (e) {
    ok = false;
  }
  const mem = {},
    has = (k) => Object.prototype.hasOwnProperty.call(mem, k);
  if (!ok) {
    const f = {
      getItem: (k) => (has(k) ? mem[k] : null),
      setItem: (k, v) => {
        mem[k] = String(v);
      },
      removeItem: (k) => {
        delete mem[k];
      },
      clear: () => {
        Object.keys(mem).forEach((k) => delete mem[k]);
      },
      key: (n) => Object.keys(mem)[n] || null,
    };
    Object.defineProperty(f, "length", { get: () => Object.keys(mem).length });
    try {
      Object.defineProperty(window, "localStorage", {
        value: f,
        configurable: true,
      });
    } catch (e) {}
    window.__pcMemStore = true;
    return;
  }
  const S = Storage.prototype,
    sg = S.getItem,
    ss = S.setItem,
    sr = S.removeItem;
  S.setItem = function (k, v) {
    try {
      ss.call(this, k, v);
      delete mem[k];
    } catch (e) {
      mem[k] = String(v);
      window.__pcMemStore = true;
    }
  };
  S.getItem = function (k) {
    return has(k) ? mem[k] : sg.call(this, k);
  };
  S.removeItem = function (k) {
    delete mem[k];
    sr.call(this, k);
  };
})();
