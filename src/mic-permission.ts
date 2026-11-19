// One-time microphone permission page. Side panels can't show Chrome's permission
// prompt, but an extension tab can, and the grant then applies to the whole extension.
const result = document.getElementById('result')!;
document.getElementById('allow')!.addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    result.textContent = 'Done. You can close this tab and press "Ask by voice" in Lumen.';
    setTimeout(() => window.close(), 2500);
  } catch {
    result.textContent = 'The microphone was not allowed. You can change this in Chrome settings, Privacy and security, Site settings, Microphone.';
  }
});
