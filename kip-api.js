(function (global) {
  'use strict';

  const DEFAULT_GAS_API_URL = 'https://script.google.com/macros/s/AKfycbz-TbIJPwI52m5JJ-hA0JcAkNiXOJzaqtElKPDyYKQqFD6YOqC27jJ7zJKGiu2pU5LS/exec';
  const STORAGE_KEY = 'kip_gas_api_url';
  const CHANNEL = 'KIP_GAS_RPC';
  const BRIDGE_TIMEOUT_MS = 2500;
  const REQUEST_TIMEOUT_MS = 60000;

  const pending = new Map();
  let sequence = 0;
  let iframe = null;
  let bridgeReady = false;
  let readyPromise = null;
  let resolveReady = null;

  function isValidApiUrl(value) {
    return /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec(?:[?#].*)?$/.test(
      String(value || '').trim()
    );
  }

  function safeStorageGet(key) {
    try {
      return localStorage.getItem(key) || '';
    } catch (error) {
      return '';
    }
  }

  function safeStorageSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (error) {}
  }

  function resolveApiUrl() {
    const queryUrl = new URLSearchParams(global.location.search).get('api') || '';
    const configuredUrl = String(global.KIP_GAS_API_URL || DEFAULT_GAS_API_URL || '').trim();
    const storedUrl = safeStorageGet(STORAGE_KEY);
    const candidates = [queryUrl, configuredUrl, storedUrl];

    for (const candidate of candidates) {
      if (isValidApiUrl(candidate)) {
        const value = candidate.trim();
        safeStorageSet(STORAGE_KEY, value);
        return value;
      }
    }

    return '';
  }

  const apiUrl = resolveApiUrl();

  function clientBaseUrl() {
    return new URL('.', global.location.href).href;
  }

  function buildPageUrl(fileName) {
    const url = new URL(fileName, global.location.href);
    if (apiUrl) {
      url.searchParams.set('api', apiUrl);
    }
    return url.href;
  }

  function markReady(value) {
    bridgeReady = Boolean(value);
    if (resolveReady) {
      resolveReady(bridgeReady);
      resolveReady = null;
    }
  }

  function ensureBridge() {
    if (!apiUrl || iframe) {
      return;
    }

    readyPromise = new Promise(function (resolve) {
      resolveReady = resolve;
    });

    iframe = document.createElement('iframe');
    iframe.title = 'KIP Apps Script Bridge';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.tabIndex = -1;
    iframe.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;border:0;left:-9999px;top:-9999px;';
    iframe.src = apiUrl;

    const target = document.body || document.documentElement;
    target.appendChild(iframe);

    setTimeout(function () {
      if (!bridgeReady) {
        markReady(false);
      }
    }, BRIDGE_TIMEOUT_MS);
  }

  global.addEventListener('message', function (event) {
    if (!iframe || event.source !== iframe.contentWindow) {
      return;
    }

    const payload = event.data || {};
    if (payload.channel !== CHANNEL) {
      return;
    }

    if (payload.type === 'ready') {
      markReady(true);
      return;
    }

    if (payload.type !== 'response' || !pending.has(payload.id)) {
      return;
    }

    const item = pending.get(payload.id);
    pending.delete(payload.id);
    clearTimeout(item.timeoutId);

    if (payload.ok === true) {
      item.resolve(payload.result);
    } else {
      item.reject(new Error(payload.error || 'Apps Script request failed.'));
    }
  });

  async function waitForBridge() {
    ensureBridge();

    if (bridgeReady) {
      return true;
    }

    if (!readyPromise) {
      return false;
    }

    return readyPromise;
  }

  function callThroughIframe(action, args) {
    return new Promise(function (resolve, reject) {
      if (!iframe || !iframe.contentWindow) {
        reject(new Error('Apps Script bridge belum tersedia.'));
        return;
      }

      const id = 'kip-rpc-' + Date.now() + '-' + (++sequence);
      const timeoutId = setTimeout(function () {
        pending.delete(id);
        reject(new Error('Permintaan Apps Script melewati batas waktu.'));
      }, REQUEST_TIMEOUT_MS);

      pending.set(id, { resolve, reject, timeoutId });
      iframe.contentWindow.postMessage({
        channel: CHANNEL,
        type: 'request',
        id,
        action,
        args,
        clientBaseUrl: clientBaseUrl()
      }, '*');
    });
  }

  async function callThroughFetch(action, args) {
    const formBody = new URLSearchParams();
    formBody.set('payload', JSON.stringify({
      action,
      args,
      clientBaseUrl: clientBaseUrl()
    }));

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeoutId = controller
      ? setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS)
      : null;

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        body: formBody,
        redirect: 'follow',
        signal: controller ? controller.signal : undefined
      });

      const text = await response.text();
      let payload;

      try {
        payload = JSON.parse(text);
      } catch (error) {
        throw new Error('Respons GAS bukan JSON. Pastikan deployment berjalan sebagai pemilik dan akses diatur ke Anyone.');
      }

      if (!payload || payload.ok !== true) {
        throw new Error(payload && payload.error ? payload.error : 'Respons API tidak valid.');
      }

      return payload.result;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  async function call(action) {
    if (!apiUrl) {
      throw new Error('GAS API URL belum dikonfigurasi.');
    }

    const args = Array.prototype.slice.call(arguments, 1);
    const isReady = await waitForBridge();

    if (isReady) {
      try {
        return await callThroughIframe(String(action), args);
      } catch (iframeError) {
        console.warn('KIP iframe bridge failed; trying fetch fallback.', iframeError);
      }
    }

    return callThroughFetch(String(action), args);
  }

  function createRunner(successHandler, failureHandler) {
    return new Proxy({}, {
      get: function (_target, property) {
        if (property === 'withSuccessHandler') {
          return function (handler) {
            return createRunner(handler, failureHandler);
          };
        }

        if (property === 'withFailureHandler') {
          return function (handler) {
            return createRunner(successHandler, handler);
          };
        }

        return function () {
          const args = Array.prototype.slice.call(arguments);
          call.apply(null, [String(property)].concat(args))
            .then(function (result) {
              if (typeof successHandler === 'function') {
                successHandler(result);
              }
            })
            .catch(function (error) {
              if (typeof failureHandler === 'function') {
                failureHandler(error);
              } else if (typeof successHandler === 'function') {
                successHandler({ success: false, message: error.message });
              } else {
                console.error(error);
              }
            });
        };
      }
    });
  }

  global.KIP_API = Object.freeze({
    url: apiUrl,
    call,
    buildPageUrl,
    ready: waitForBridge
  });

  global.buildGitHubPageUrl = buildPageUrl;
  global.google = global.google || {};
  global.google.script = global.google.script || {};
  global.google.script.run = createRunner(null, null);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureBridge, { once: true });
  } else {
    ensureBridge();
  }
})(window);
