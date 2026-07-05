var _addEventListener = EventTarget.prototype.addEventListener;
var _inputClick = HTMLInputElement.prototype.click;
var pendingFile = null;

_addEventListener.call(EventTarget.prototype, 'click', function() {});

EventTarget.prototype.addEventListener = function(type, listener, options) {
  if (type === 'click' && !this.__capturedClicks) {
    this.__capturedClicks = [];
  }
  if (type === 'click') {
    this.__capturedClicks.push(listener);
  }
  return _addEventListener.call(this, type, listener, options);
};

HTMLInputElement.prototype.click = function() {
  if (this.type === 'file' && pendingFile) {
    var dt = new DataTransfer();
    dt.items.add(pendingFile);
    this.files = dt.files;
    var input = this;
    var msg = { type: 'INJECTOR_STATUS', status: 'INTERCEPTED', detail: 'file input caught' };
    window.postMessage(msg, '*');
    try { window.parent.postMessage(msg, '*'); } catch(e) {}
    setTimeout(function() {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      var msg2 = { type: 'INJECTOR_STATUS', status: 'ATTACHED', detail: 'file attached' };
      window.postMessage(msg2, '*');
      try { window.parent.postMessage(msg2, '*'); } catch(e) {}
      pendingFile = null;
    }, 300);
    return;
  }
  return _inputClick.call(this);
};

function fakeEvent(target) {
  return {
    isTrusted: true, type: 'click', target: target, currentTarget: target,
    bubbles: true, cancelable: true, defaultPrevented: false, timeStamp: Date.now(),
    view: window, sourceCapabilities: null, composed: true, isComposing: false,
    detail: 1, which: 1, keyCode: 0, charCode: 0, button: 0, buttons: 1,
    clientX: 0, clientY: 0, screenX: 0, screenY: 0, movementX: 0, movementY: 0,
    ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, repeat: false,
    region: null, relatedTarget: null, getModifierState: function() { return false; },
    initMouseEvent: function() {}, initEvent: function() {},
    preventDefault: function() { this.defaultPrevented = true; },
    stopPropagation: function() {}, stopImmediatePropagation: function() {},
    composedPath: function() { return [target]; }, matchMedia: function() { return { matches: false }; },
  };
}

function triggerClick(el) {
  var msg = { type: 'INJECTOR_STATUS', status: 'TRIGGER_CLICK', detail: el.tagName + ' handlers=' + (el.__capturedClicks ? el.__capturedClicks.length : 0) };
  window.postMessage(msg, '*');
  try { window.parent.postMessage(msg, '*'); } catch(e) {}

  if (el.__capturedClicks && el.__capturedClicks.length > 0) {
    var evt = fakeEvent(el);
    for (var i = 0; i < el.__capturedClicks.length; i++) {
      try { el.__capturedClicks[i].call(el, evt); } catch(e) {
        var em = { type: 'INJECTOR_STATUS', status: 'HANDLER_ERROR', detail: String(e).slice(0, 100) };
        window.postMessage(em, '*');
        try { window.parent.postMessage(em, '*'); } catch(e2) {}
      }
    }
  } else {
    el.click();
  }
}

window.addEventListener('message', function(event) {
  if (!event.data || event.data.type !== 'TRIGGER_UPLOAD') return;
  pendingFile = new File([event.data.text], event.data.filename, { type: 'text/markdown' });

  var plusBtn = Array.from(document.querySelectorAll('button, [role="button"]')).find(function(b) {
    var l = (b.getAttribute('aria-label') || '').toLowerCase();
    return l.includes('upload') || l.includes('attach');
  });
  if (!plusBtn) {
    var m = { type: 'INJECTOR_STATUS', status: 'NO_PLUS', detail: '' };
    window.postMessage(m, '*'); try { window.parent.postMessage(m, '*'); } catch(e) {}
    return;
  }

  triggerClick(plusBtn);

  setTimeout(function() {
    var fi = Array.from(document.querySelectorAll('button, [role="menuitem"], span')).find(function(b) {
      return (b.textContent || '').trim().toLowerCase() === 'files';
    });
    if (fi) {
      var target = fi.closest('button') || fi;
      triggerClick(target);
    } else {
      var m = { type: 'INJECTOR_STATUS', status: 'NO_FILES', detail: '' };
      window.postMessage(m, '*'); try { window.parent.postMessage(m, '*'); } catch(e) {}
    }
  }, 1000);
});

var lm = { type: 'INJECTOR_STATUS', status: 'MAIN_LOADED', detail: 'addEventListener patched at document_start' };
window.postMessage(lm, '*');
try { window.parent.postMessage(lm, '*'); } catch(e) {}
