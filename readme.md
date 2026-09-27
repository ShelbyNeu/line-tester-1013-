Line Tester 1013
A VoIP test set styled after an old Ma Bell / Western Electric analog line tester — big VU-style meter, toggle switches, a keypad — built on Twilio's Voice API. It places real phone calls and shows live call quality (MOS, R-factor, jitter, RTT, packet loss, negotiated codec) while the call is up.
�
What it actually measures (read this first)
A call placed through this tool has two legs:
Browser ⇄ Twilio edge — WebRTC media, negotiated as PCMU or Opus. The Voice JS SDK reports real per-second stats for this leg (jitter, rtt, packetsLostFraction, codecName, and Twilio's own live MOS estimate) via the sample event. This is what the meter and LCD show, live, while the call is connected.
Twilio edge ⇄ carrier ⇄ analog line — once Twilio bridges to a real PSTN number, that leg is out of the browser SDK's visibility. Genuine quality data for it (Twilio's post-call Voice Insights summary, or a PESQ/POLQA score run against a recording) isn't available in real time through this client.
So: this is an honest, live quality readout of the softphone leg, and a codec/jitter/RTT test tool for that leg — not a certified end-to-end POTS-line quality meter. It's the same limitation every WebRTC-based softphone quality tool has. If you need certified end-to-end numbers, record the call (<Record> in TwiML) and run PESQ/POLQA on the file, or pull the Voice Insights call summary from Twilio's REST API after the call ends.
The R-factor shown is derived from the live MOS by numerically inverting the standard ITU-T G.107 (E-model) R→MOS curve — a widely used approximation, not an independently measured value.
Real analog PSTN calls almost always run G.711 (µ-law in North America) end-to-end; carriers don't let you pick a different PSTN codec. The codec toggle in this app controls which codec Twilio negotiates for the browser leg (PCMU or Opus) — that's the one leg where codec choice is actually yours.
Features
Retro analog-meter + digital LCD dashboard, live during a call
Dial-out mode: call any real number and watch quality metrics
Reference-tone mode: plays a standard 1004 Hz test tone down the line for an old-school listen test
Codec toggle (PCMU / Opus) for the browser leg
On-screen keypad (DTMF) and an event log
Setup
1. Twilio account
You'll need, from the Twilio Console:
Account SID
An API Key + Secret (Account → API keys & tokens)
A TwiML App (Voice → TwiML Apps) — set its Voice Request URL to https://YOUR-HOST/voice (use ngrok for local testing)
A Twilio phone number (used as caller ID for outbound calls)
2. Install and configure
git clone <your fork of this repo>
cd voip-quality-tester
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in the values above
3. Run
python app.py
Then, in another terminal, expose it so Twilio can reach /voice:
ngrok http 5000
Point the TwiML App's Voice Request URL at the ngrok HTTPS URL + /voice, then open the ngrok URL (or localhost:5000 for the token call itself) in your browser.
Project layout
app.py                  Flask backend: /token (access tokens), /voice (TwiML)
static/index.html       UI markup
static/css/style.css    Retro line-tester skin
static/js/app.js        Twilio Voice JS SDK wiring + live meter updates
requirements.txt
.env.example
Publishing this to GitHub
This chat doesn't have a connected GitHub integration, so push it yourself:
cd voip-quality-tester
git init
git add .
git commit -m "Line Tester 1013: retro VoIP quality test set"
gh repo create line-tester-1013 --public --source=. --push
# or, without gh:
git remote add origin git@github.com:YOUR-USERNAME/line-tester-1013.git
git branch -M main
git push -u origin main
.env is already git-ignored — double check it never gets committed, since it holds your Twilio Auth credentials.
License
MIT — see LICENSE.