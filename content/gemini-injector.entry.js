window.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_URL') {
    window.parent.postMessage({ type: 'CURRENT_URL', url: location.href }, '*');
  }
  if (event.data?.type === 'CLICK_TEMP_CHAT') {
    const buttons = document.querySelectorAll('button, [role="button"]');
    for (const btn of buttons) {
      const text = btn.textContent?.toLowerCase() || '';
      if (text.includes('new chat') || text.includes('temporary') || text.includes('start')) {
        btn.click();
        break;
      }
    }
  }
});
