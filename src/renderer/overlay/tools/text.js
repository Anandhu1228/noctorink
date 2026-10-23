/**
 * Text placement. The keyboard is the laptop keyboard (Weylus does not carry
 * keys). Enter inserts a newline; Escape or a tap outside commits.
 */
(function () {
  function fontSize(penSize) {
    return window.InkGeo.textFontSize(penSize);
  }

  function open(textarea, session) {
    textarea.value = session.text || '';
    textarea.style.left = `${session.x}px`;
    textarea.style.top = `${session.y}px`;
    textarea.style.color = session.color;
    textarea.style.caretColor = session.color;
    textarea.style.fontSize = `${session.fontSize}px`;
    textarea.style.lineHeight = '1.25';
    textarea.style.width = `${Math.max(180, session.fontSize * 8)}px`;
    textarea.classList.add('visible');
    autosize(textarea, session.fontSize);
    textarea.focus();
  }

  function close(textarea) {
    textarea.classList.remove('visible');
    textarea.value = '';
  }

  function autosize(textarea, fontSizePx) {
    textarea.style.height = '0px';
    const next = Math.max(fontSizePx * 1.4, textarea.scrollHeight);
    textarea.style.height = `${next}px`;
  }

  window.InkText = { fontSize, open, close, autosize };
})();
