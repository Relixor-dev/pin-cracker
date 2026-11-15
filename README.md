# 🔐 PIN CRACKER // Security Terminal

A retro-futuristic, vault-cracking deduction game built with **Python (Flask)**, **Vanilla JavaScript**, and **Upstash Redis**. Analyze intercepted mathematical telemetry clues, track ruled-out digits on a live matrix, and bypass the keypad lock before security triggers.

**[▶ Play Live on Render](https://onrender.com)**

---

## 🎮 Game Modes & Features

* **Standard Breach (3- to 6-Digit):** Choose your security length (`3`, `4`, `5`, or `6` digits), max attempts (`2`, `3`, `5`, `8`, or `∞`), and optional speedrun countdown (`15s`, `30s`, or `45s`).
* **Daily Vault Challenge:** A globally synced daily puzzle that rotates between 3, 4, 5, and 6 digits for everyone, complete with a live global solve counter and Wordle-style emoji share grid (`🟩🟨⬛`).
* **Progressive Clues:** Starts with a single intercepted clue and decrypts one new hint after every failed guess.
* **Heist Ladder (3 Stages):** Escalate from a 3-digit gate (5 tries) to a 4-digit laser grid (4 tries) and a 5-digit core (3 tries) on a shared 60-second clock.
* **Create Friend Vault:** Set your own 3-to-6 digit PIN, pick 0 to 5 auto-generated clues, add a custom note, and generate a shareable challenge URL.
* **Firewall Mutators & Emergency Decrypt:** Toggle **No-Repeat Digits** or **Time Drain (-2s/miss)** for bonus XP, or sacrifice 1 remaining attempt once per round to reveal an exact digit slot.
* **10 Clearance Ranks & Global Top-10 Leaderboard:** Earn XP on every breach to climb from **Script Kiddie** to **Zero-Day Sovereign** and sync your codename to the global **Upstash Redis** leaderboard.

---

## 🛠️ Tech Stack

* **Backend:** Python 3, Flask, Gunicorn
* **Database:** Upstash Redis (REST API) with local JSON fallback
* **Frontend:** HTML5, CSS3, Vanilla JavaScript (Web Audio API synth SFX & `localStorage` rank tracking)
* **Hosting:** Render

---

## 🚀 Run Locally

1. **Clone the repository:**
   ```bash
   git clone https://github.com
   cd pin-cracker
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Start the server:**
   ```bash
   python app.py
   ```

4. **Open in your browser:**
   Visit `http://127.0.0.1:8080` to launch the terminal.
