// Copy text to the clipboard, working in both secure and insecure contexts.
//
// The board is served over plain HTTP on the Pi (http://192.168.1.100:8300),
// which is NOT a secure context, so `navigator.clipboard` is undefined there
// and every copy button would throw. Fall back to the legacy
// document.execCommand('copy') path in that case. Under Electron or over
// HTTPS/localhost the modern async API is used.
//
// Returns true on success, false if the copy could not be performed. Callers
// that only show a "Copied!" flash can ignore the result (the flash still
// fires); callers that care can branch on it.
export async function copyText(text) {
  const value = text == null ? '' : String(text);

  if (window.isSecureContext && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Permission denied / transient failure — fall through to the legacy path.
    }
  }

  return legacyCopy(value);
}

// Off-screen textarea + execCommand. Must run inside the user gesture (a click
// handler), which is how every copy button here calls it, so no await precedes
// this on the insecure-context path.
function legacyCopy(value) {
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  // Keep it out of view and prevent scroll/zoom jumps on mobile.
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);

  const selection = document.getSelection();
  const savedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  textarea.select();
  textarea.setSelectionRange(0, value.length);

  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }

  document.body.removeChild(textarea);
  // Restore any prior selection we clobbered.
  if (savedRange && selection) {
    selection.removeAllRanges();
    selection.addRange(savedRange);
  }
  return ok;
}
