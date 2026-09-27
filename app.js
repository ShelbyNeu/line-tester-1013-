/* Line Tester 1013 — client
 * Runs the Twilio Voice JS SDK, drives the analog needle + LCD readout
 * from the SDK's real per-second `sample` event (RTCSample), and wires
 * up the retro control surface (keypad, codec toggle, mode toggle).
 *
 * IMPORTANT, read this before treating the numbers as gospel:
 * The `sample` event reports quality for the leg between this browser
 * and the nearest Twilio media edge (WebRTC media metrics: jitter,
 * RTT, packet loss, and Twilio's own real-time MOS estimate derived
 * from them). When you dial out to a real PSTN/analog number, that
 * call has a second leg — Twilio's edge to the carrier to the analog
 * line — that this SDK cannot see or score. Genuine end-to-end MOS for
 * that PSTN leg would need Twilio Voice Insights' call-summary API
 * (available after the call ends) or a PESQ/POLQA analysis of a
 * recording. This tool measures and shows what a WebRTC softphone can
 * actually see live: an honest quality picture of the browser<->Twilio
 * leg, plus the negotiated codec, in real time.
 */

const els = {
  mos: document.getElementById('val-mos'),
  r: document.getElementById('val-r'),
  jitter: document.getElementById('val-jitter'),
  rtt: document.getElementById('val-rtt'),
  loss: document.getElementById('val-loss'),
  codec: document.getElementById('val-codec'),
  needle: document.getElementById('needle'),
  number: document.getElementById('number'),
  keys: document.querySelectorAll('.key'),
  callBtn: document.getElementById('btn-call'),
  hangupBtn: document.getElementById('btn-hangup'),
  toggleCodec: document.getElementById('toggle-codec'),
  toggleMode: document.getElementById('toggle-mode'),
  lampReady: document.getElementById('lamp-ready'),
  lampRing: document.getElementById('lamp-ring'),
  lampConn: document.getElementById('lamp-conn'),
  log: document.getElementById('log'),
};

let device = null;
let activeCall = null;
let codecPref = 'pcmu';
let testMode = 'dial';

function log(msg) {
  const line = document.createElement('div');
  const t = new Date().toLocaleTimeString();
  line.textContent = `[${t}] ${msg}`;
  els.log.appendChild(line);
  els.log.scrollTop = els.log.scrollHeight;
}

function setLamp(el, on, green = false) {
  el.classList.toggle('lit', on && !green);
  el.classList.toggle('lit-green', on && green);
}

/* ---- Needle + readout ---------------------------------------------- */

// Map MOS (1..5) onto the meter sweep drawn in index.html (-58..+58deg)
function mosToAngle(mos) {
  const clamped = Math.max(1, Math.min(5, mos));
  const t = (clamped - 1) / 4; // 0..1
  return -58 + t * 116;
}

// Numerically invert the ITU-T G.107 (E-model) R->MOS curve to show an
// approximate R-factor for a given MOS. This is a standard, well-known
// forward formula; there is no simple closed-form inverse, so we solve
// it with bisection. Approximate — treat as indicative, not certified.
function rFromMos(targetMos) {
  function mosFromR(R) {
    if (R < 0) return 1;
    if (R > 100) return 4.5;
    return 1 + 0.035 * R + R * (R - 60) * (100 - R) * 7e-6;
  }
  let lo = 0, hi = 100;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (mosFromR(mid) < targetMos) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

function updateReadout(sample) {
  const mos = sample.mos;
  if (mos != null) {
    els.mos.textContent = mos.toFixed(2);
    els.r.textContent = rFromMos(mos).toFixed(0);
    els.needle.style.transform = `rotate(${mosToAngle(mos)}deg)`;
  }
  els.jitter.textContent = `${sample.jitter.toFixed(0)} ms`;
  els.rtt.textContent = `${sample.rtt.toFixed(0)} ms`;
  els.loss.textContent = `${(sample.packetsLostFraction * 100).toFixed(1)}%`;
  els.codec.textContent = (sample.codecName || codecPref).toUpperCase();
}

/* ---- Device setup ---------------------------------------------------*/

async function setupDevice() {
  const res = await fetch('/token');
  const data = await res.json();
  if (data.error) {
    log(`ERROR getting token: ${data.error}`);
    return;
  }
  device = new Twilio.Device(data.token, {
    codecPreferences: [codecPref],
    logLevel: 'error',
  });

  device.on('registered', () => {
    setLamp(els.lampReady, true, true);
    log('Device registered. Ready to place a call.');
  });
  device.on('error', (e) => log(`Device error: ${e.message}`));
  device.register();
}

function resetCallUi() {
  activeCall = null;
  els.callBtn.disabled = false;
  els.hangupBtn.disabled = true;
  setLamp(els.lampRing, false);
  setLamp(els.lampConn, false);
}

function wireCall(call) {
  activeCall = call;
  call.on('ringing', () => { setLamp(els.lampRing, true); log('Ringing…'); });
  call.on('accept', () => {
    setLamp(els.lampRing, false);
    setLamp(els.lampConn, true, true);
    log('Connected. Live metrics below.');
  });
  call.on('disconnect', () => { log('Call ended.'); resetCallUi(); });
  call.on('cancel', () => { log('Call canceled.'); resetCallUi(); });
  call.on('reject', () => { log('Call rejected.'); resetCallUi(); });
  call.on('sample', updateReadout);
  call.on('warning', (name) => log(`Quality warning: ${name}`));
}

/* ---- Controls ---------------------------------------------------- */

els.keys.forEach((k) => {
  k.addEventListener('click', () => {
    els.number.value += k.textContent;
    if (activeCall) activeCall.sendDigits(k.textContent);
  });
});

function bindToggle(toggle, onChange) {
  toggle.querySelectorAll('.toggle-option').forEach((opt) => {
    opt.addEventListener('click', () => {
      toggle.querySelectorAll('.toggle-option').forEach((o) => o.classList.remove('active'));
      opt.classList.add('active');
      onChange(opt.dataset.value);
    });
  });
}

bindToggle(els.toggleCodec, (val) => {
  codecPref = val;
  log(`Codec preference set to ${val.toUpperCase()} (applies to next call).`);
  if (device) device.updateOptions({ codecPreferences: [val] });
});

bindToggle(els.toggleMode, (val) => {
  testMode = val;
  els.number.placeholder = val === 'tone'
    ? 'not needed for tone test'
    : '+1 area code, then number';
});

els.callBtn.addEventListener('click', async () => {
  if (!device) { log('Device not ready yet.'); return; }
  const params = { mode: testMode };
  if (testMode === 'dial') {
    const to = els.number.value.trim();
    if (!to) { log('Enter a number to dial first.'); return; }
    params.To = to;
  } else {
    params.tone = '1004';
  }
  els.callBtn.disabled = true;
  els.hangupBtn.disabled = false;
  const call = await device.connect({ params });
  wireCall(call);
});

els.hangupBtn.addEventListener('click', () => {
  if (activeCall) activeCall.disconnect();
});

setupDevice();
