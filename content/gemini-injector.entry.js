const MAIN_WORLD_CODE = `
var _ic = HTMLInputElement.prototype.click;
var pendingFile = null;
var tempChatDone = false;

HTMLInputElement.prototype.click = function() {
  if (this.type === 'file' && pendingFile) {
    var dt = new DataTransfer();
    dt.items.add(pendingFile);
    this.files = dt.files;
    var input = this;
    var m1 = { type: 'MW_STATUS', status: 'INTERCEPTED', detail: 'caught' };
    window.postMessage(m1, '*');
    try { window.parent.postMessage(m1, '*'); } catch(e) {}
    setTimeout(function() {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      var m2 = { type: 'MW_STATUS', status: 'ATTACHED', detail: 'done' };
      window.postMessage(m2, '*');
      try { window.parent.postMessage(m2, '*'); } catch(e) {}
      pendingFile = null;
    }, 300);
    return;
  }
  return _ic.call(this);
};

function fakeEvt(t) {
  return {
    isTrusted: true, type: 'click', target: t, currentTarget: t,
    bubbles: true, cancelable: true, defaultPrevented: false, timeStamp: Date.now(),
    detail: 1, which: 1, button: 0, buttons: 1, clientX: 0, clientY: 0,
    ctrlKey: false, shiftKey: false, altKey: false, metaKey: false,
    preventDefault: function() {}, stopPropagation: function() {},
    stopImmediatePropagation: function() {}, composedPath: function() { return [t]; }
  };
}

function findAngularHandlers(el) {
  var results = [];
  var current = el;
  var depth = 0;
  while (current && depth < 20) {
    var ctx = current.__ngContext__;
    if (ctx !== undefined && ctx !== null) {
      results.push({ depth: depth, tag: current.tagName, cls: (current.className||'').slice(0,40), ctxType: typeof ctx, ctxLen: ctx && ctx.length ? ctx.length : 0 });

      if (ctx && typeof ctx === 'object' && ctx.length) {
        var component = null;
        for (var i = 0; i < Math.min(ctx.length, 100); i++) {
          var item = ctx[i];
          if (item && typeof item === 'object' && !Array.isArray(item) && !(item instanceof Node)) {
            var keys = [];
            try { keys = Object.getOwnPropertyNames(item); } catch(e) {}
            var methodNames = keys.filter(function(k) {
              try { return typeof item[k] === 'function'; } catch(e) { return false; }
            });
            if (methodNames.length > 2) {
              component = item;
              var fileMethods = methodNames.filter(function(k) {
                return k.toLowerCase().includes('file') || k.toLowerCase().includes('upload') || k.toLowerCase().includes('attach');
              });
              if (fileMethods.length > 0 || methodNames.length > 10) {
                results.push({ depth: depth, idx: i, methods: methodNames.slice(0,20).join(','), fileMethods: fileMethods.join(',') });
              }
            }
          }
        }
        if (component) {
          for (var key in component) {
            if (typeof component[key] === 'function') {
              var lk = key.toLowerCase();
              if (lk.includes('file') || lk.includes('upload') || lk.includes('attach') || lk.includes('open') || lk.includes('select')) {
                results.push({ depth: depth, method: key, type: 'direct' });
              }
            }
          }
        }
      }
    }
    current = current.parentElement;
    depth++;
  }
  return results;
}

window.addEventListener('message', function(event) {
  if (!event.data) return;

  if (event.data.type === 'CLICK_TEMP_CHAT') {
    if (tempChatDone) return;
    var candidates = Array.from(document.querySelectorAll('button, [role="button"], [role="menuitem"], a'));
    var tempBtn = candidates.find(function(b) {
      var label = (b.getAttribute('aria-label') || '').toLowerCase();
      var text = (b.textContent || '').trim().toLowerCase();
      return label === 'temporary chat' || text === 'temporary chat' || label.includes('temporary');
    });
    if (tempBtn) {
      tempChatDone = true;
      var detail = tempBtn.tagName + ' aria="' + (tempBtn.getAttribute('aria-label') || '') + '" text="' + tempBtn.textContent.trim().slice(0, 40) + '"';
      var m = { type: 'MW_STATUS', status: 'TEMP_FOUND', detail: detail };
      window.postMessage(m, '*'); try { window.parent.postMessage(m, '*'); } catch(e) {}
      tempBtn.click();
      var m2 = { type: 'MW_STATUS', status: 'TEMP_CLICKED', detail: '' };
      window.postMessage(m2, '*'); try { window.parent.postMessage(m2, '*'); } catch(e) {}
    } else {
      var labels = candidates.filter(function(b) { return (b.getAttribute('aria-label')||'').trim().length > 0; }).slice(0,20).map(function(b){return b.getAttribute('aria-label');});
      var m3 = { type: 'MW_STATUS', status: 'TEMP_NOT_FOUND', detail: 'aria-labels: ' + labels.join(' | ') };
      window.postMessage(m3, '*'); try { window.parent.postMessage(m3, '*'); } catch(e) {}
    }
    return;
  }

  if (event.data.type !== 'DO_UPLOAD') return;
  pendingFile = new File([event.data.text], event.data.filename, { type: 'text/markdown' });

  var plusBtn = Array.from(document.querySelectorAll('button, [role="button"]')).find(function(b) {
    var l = (b.getAttribute('aria-label') || '').toLowerCase();
    return l.includes('upload') || l.includes('attach');
  });
  if (!plusBtn) {
    var m = { type: 'MW_STATUS', status: 'NO_PLUS', detail: '' };
    window.postMessage(m, '*'); try { window.parent.postMessage(m, '*'); } catch(e) {}
    return;
  }

  var plusInfo = findAngularHandlers(plusBtn);
  var pm = { type: 'MW_STATUS', status: 'PLUS_NG', detail: JSON.stringify(plusInfo).slice(0, 500) };
  window.postMessage(pm, '*'); try { window.parent.postMessage(pm, '*'); } catch(e) {}

  plusBtn.click();

  setTimeout(function() {
    var fi = Array.from(document.querySelectorAll('button, [role="menuitem"], span, div')).find(function(b) {
      return (b.textContent || '').trim().toLowerCase() === 'files';
    });
    if (!fi) {
      var m = { type: 'MW_STATUS', status: 'NO_FILES', detail: '' };
      window.postMessage(m, '*'); try { window.parent.postMessage(m, '*'); } catch(e) {}
      return;
    }

    var target = fi.closest('button') || fi;
    var info = findAngularHandlers(target);
    var im = { type: 'MW_STATUS', status: 'FILES_NG', detail: JSON.stringify(info).slice(0, 800) };
    window.postMessage(im, '*'); try { window.parent.postMessage(im, '*'); } catch(e) {}

    target.click();
  }, 1500);
});

var ml = { type: 'MW_STATUS', status: 'MAIN_LOADED', detail: 'ready' };
window.postMessage(ml, '*');
try { window.parent.postMessage(ml, '*'); } catch(e) {}
`;

function report(status, detail) {
  window.parent.postMessage({ type: 'INJECTOR_STATUS', status, detail }, '*');
}

function injectMainWorld() {
  const script = document.createElement('script');
  script.textContent = MAIN_WORLD_CODE;
  (document.head || document.documentElement).appendChild(script);
  script.remove();
}

async function waitForGeminiReady() {
  let tries = 0;
  while (tries < 60) {
    const editor = document.querySelector('.ql-editor, [contenteditable="true"]');
    if (editor) return;
    await new Promise((r) => setTimeout(r, 500));
    tries++;
  }
}

async function handleAttach(markdown, filename) {
  report('started', `${filename} ${markdown.length} chars`);

  try {
    const textBlob = new Blob([markdown], { type: 'text/plain' });
    const htmlBlob = new Blob([markdown], { type: 'text/html' });
    const item = new ClipboardItem({ 'text/plain': textBlob, 'text/html': htmlBlob });
    await navigator.clipboard.write([item]);
  } catch {
    try { await navigator.clipboard.writeText(markdown); } catch {}
  }

  window.postMessage({ type: 'DO_UPLOAD', text: markdown, filename }, '*');

  const result = await new Promise((resolve) => {
    function listener(event) {
      const d = event.data;
      if (!d) return;
      if (d.type === 'MW_STATUS') {
        report(d.status, d.detail);
        if (['ATTACHED', 'NO_PLUS', 'NO_FILES'].includes(d.status)) {
          window.removeEventListener('message', listener);
          resolve(d);
        }
      }
    }
    window.addEventListener('message', listener);
    setTimeout(() => { window.removeEventListener('message', listener); resolve(null); }, 20000);
  });

  if (result?.status === 'ATTACHED') {
    report('SUCCESS', 'file attached automatically');
  } else {
    report('clipboard_ready', 'press Cmd+V to paste');
  }
}

injectMainWorld();
report('loaded', 'main-world injected');

window.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_URL') {
    window.postMessage({ type: 'CURRENT_URL', url: location.href }, '*');
  }
  if (event.data?.type === 'ATTACH_FILE' && (event.data.markdown || event.data.text)) {
    waitForGeminiReady().then(() => {
      handleAttach(event.data.markdown || event.data.text, event.data.filename || 'page.md');
    });
  }
});
