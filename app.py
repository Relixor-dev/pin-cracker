import json
import os
import random
from datetime import date
import requests
from flask import Flask, render_template, request, jsonify, session

app = Flask(__name__)
app.secret_key = "pin-cracker-secret-key"

DAILY_STATS_FILE = "daily_stats.json"
LEADERBOARD_FILE = "leaderboard_local.json"
UPSTASH_URL = os.environ.get("UPSTASH_REDIS_REST_URL", "").rstrip("/")
UPSTASH_TOKEN = os.environ.get("UPSTASH_REDIS_REST_TOKEN", "")

DIFFICULTY_LENGTHS = {
    "easy": 3,
    "normal": 4,
    "hard": 5,
    "extreme": 6
}

HEIST_STAGES = [
    {"stage": 1, "length": 3, "attempts": 5, "label": "STAGE 1/3 // OUTER GATE"},
    {"stage": 2, "length": 4, "attempts": 4, "label": "STAGE 2/3 // LASER GRID"},
    {"stage": 3, "length": 5, "attempts": 3, "label": "STAGE 3/3 // MAIN CORE"}
]

def _redis_cmd(*args):
    if not UPSTASH_URL or not UPSTASH_TOKEN:
        return None
    try:
        res = requests.post(
            UPSTASH_URL,
            headers={"Authorization": f"Bearer {UPSTASH_TOKEN}"},
            json=[str(a) for a in args],
            timeout=4
        )
        if res.ok:
            return res.json().get("result")
    except Exception:
        return None
    return None

def get_daily_solves(today_str):
    remote = _redis_cmd("GET", f"daily_solves:{today_str}")
    if remote is not None:
        return int(remote)
    if not os.path.exists(DAILY_STATS_FILE):
        return 0
    try:
        with open(DAILY_STATS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return int(data.get(today_str, 0))
    except Exception:
        return 0

def increment_daily_solves(today_str):
    remote = _redis_cmd("INCR", f"daily_solves:{today_str}")
    if remote is not None:
        return int(remote)
    data = {}
    if os.path.exists(DAILY_STATS_FILE):
        try:
            with open(DAILY_STATS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            data = {}
    count = int(data.get(today_str, 0)) + 1
    data[today_str] = count
    try:
        with open(DAILY_STATS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f)
    except Exception:
        pass
    return count

def get_leaderboard():
    raw = _redis_cmd("ZREVRANGE", "pin_cracker_lb", "0", "9", "WITHSCORES")
    if isinstance(raw, list):
        entries = []
        for i in range(0, len(raw), 2):
            if i + 1 < len(raw):
                entries.append({"name": str(raw[i]), "xp": int(float(raw[i + 1]))})
        return entries

    if not os.path.exists(LEADERBOARD_FILE):
        return []
    try:
        with open(LEADERBOARD_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        sorted_items = sorted(data.items(), key=lambda x: int(x[1]), reverse=True)[:10]
        return [{"name": k, "xp": int(v)} for k, v in sorted_items]
    except Exception:
        return []

def submit_leaderboard_score(handle, xp, profile=None):
    clean_name = "".join(c for c in str(handle) if c.isalnum() or c in "_-").upper()[:14]
    if not clean_name:
        clean_name = "ANON_AGENT"
    score_val = max(0, int(xp))

    if isinstance(profile, dict):
        _redis_cmd("SET", f"pin_cracker_prof:{clean_name}", json.dumps(profile))

    current_raw = _redis_cmd("ZSCORE", "pin_cracker_lb", clean_name)
    if current_raw is not None:
        if score_val > int(float(current_raw)):
            _redis_cmd("ZADD", "pin_cracker_lb", str(score_val), clean_name)
        return get_leaderboard()

    res = _redis_cmd("ZADD", "pin_cracker_lb", str(score_val), clean_name)
    if res is not None:
        return get_leaderboard()

    data = {}
    if os.path.exists(LEADERBOARD_FILE):
        try:
            with open(LEADERBOARD_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            data = {}
    if score_val > int(data.get(clean_name, 0)):
        data[clean_name] = score_val
        try:
            with open(LEADERBOARD_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f)
        except Exception:
            pass
    return get_leaderboard()

def get_daily_speed_lb(today_str):
    key = f"pin_cracker_speed:{today_str}"
    raw = _redis_cmd("ZRANGE", key, "0", "9", "WITHSCORES")
    if isinstance(raw, list):
        entries = []
        for i in range(0, len(raw), 2):
            if i + 1 < len(raw):
                entries.append({"name": str(raw[i]), "time": round(float(raw[i + 1]), 1)})
        return entries
    return []

def submit_daily_speed(today_str, handle, time_sec):
    clean_name = "".join(c for c in str(handle) if c.isalnum() or c in "_-").upper()[:14] or "ANON_AGENT"
    t_val = round(max(0.1, float(time_sec)), 1)
    key = f"pin_cracker_speed:{today_str}"
    cur = _redis_cmd("ZSCORE", key, clean_name)
    if cur is None or t_val < float(cur):
        _redis_cmd("ZADD", key, str(t_val), clean_name)
    return get_daily_speed_lb(today_str)
def generate_code(length=4, rng=None, unique_only=False):
    r = rng if rng else random
    if unique_only:
        digits = [str(i) for i in range(10)]
        return "".join(r.sample(digits, length))
    return "".join(str(r.randint(0, 9)) for _ in range(length))

def _create_duel_room(host_name, guest_name=None):
    room_id = "".join(random.choices("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", k=6))
    code = generate_code(4, None, False)
    hints = generate_hints(code, None, total_count=3)
    room_data = {
        "room_id": room_id,
        "code": code,
        "hints": hints,
        "host": host_name,
        "guest": guest_name,
        "host_attempts": 0,
        "guest_attempts": 0,
        "winner": None,
        "win_time": None
    }
    _redis_cmd("SETEX", f"duel_room:{room_id}", "900", json.dumps(room_data))
    return room_data

def _get_duel_room(room_id):
    raw = _redis_cmd("GET", f"duel_room:{room_id}")
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return None

def _save_duel_room(room_data):
    _redis_cmd("SETEX", f"duel_room:{room_data['room_id']}", "900", json.dumps(room_data))


def generate_hints(code, rng=None, total_count=None):
    r = rng if rng else random
    digits = [int(d) for d in code]
    length = len(digits)
    primes = {2, 3, 5, 7}
    possible_hints = []

    for i, d in enumerate(digits):
        pos = i + 1
        if d in primes:
            possible_hints.append(f"Digit #{pos} is a prime number.")
        else:
            possible_hints.append(f"Digit #{pos} is NOT a prime number.")

        if d % 2 == 0:
            possible_hints.append(f"Digit #{pos} is even.")
        else:
            possible_hints.append(f"Digit #{pos} is odd.")

        if d >= 5:
            possible_hints.append(f"Digit #{pos} is 5 or higher.")
        else:
            possible_hints.append(f"Digit #{pos} is less than 5.")

    temp = list(digits)
    first_digit = temp.pop(0)
    second_digit = temp.pop(0)
    third_digit = temp.pop(0)
    last_digit = int(code[-1])

    possible_hints.append(f"The sum of all {length} digits is {sum(digits)}.")
    possible_hints.append(f"Digit #1 + Digit #{length} equals {first_digit + last_digit}.")
    possible_hints.append(f"Digit #2 + Digit #3 equals {second_digit + third_digit}.")

    if length >= 5:
        fourth_digit = temp.pop(0)
        fifth_digit = temp.pop(0)
        possible_hints.append(f"Digit #4 + Digit #5 equals {fourth_digit + fifth_digit}.")

    if first_digit > last_digit:
        possible_hints.append(f"Digit #1 is larger than Digit #{length}.")
    elif first_digit < last_digit:
        possible_hints.append(f"Digit #1 is smaller than Digit #{length}.")
    else:
        possible_hints.append(f"Digit #1 and Digit #{length} are the same.")

    if len(set(digits)) < length:
        possible_hints.append("At least one digit repeats in the PIN.")
    else:
        possible_hints.append("All digits in the PIN are unique.")

    count = total_count if total_count else (3 if length <= 4 else (4 if length == 5 else 5))
    return r.sample(possible_hints, min(count, len(possible_hints)))

def evaluate_guess(secret, guess):
    length = len(secret)
    statuses = ["absent"] * length
    secret_remaining = {}

    for s, g in zip(secret, guess):
        if s != g:
            secret_remaining[s] = secret_remaining.get(s, 0) + 1

    for i, (s, g) in enumerate(zip(secret, guess)):
        if s == g:
            statuses[i] = "correct"
        elif secret_remaining.get(g, 0) > 0:
            statuses[i] = "present"
            secret_remaining[g] -= 1

    exact = statuses.count("correct")
    misplaced = statuses.count("present")
    return statuses, exact, misplaced

def start_new_session(difficulty="normal", max_attempts=8, mode="standard", stage=1, custom_pin="", custom_note="", custom_clues=2, no_repeat=False):
    progressive = False
    stage_label = ""
    unique_flag = bool(no_repeat)
    today_str = date.today().isoformat()
    daily_solves = get_daily_solves(today_str)

    if mode == "daily":
        seeded_rng = random.Random(f"pin-cracker-{today_str}")
        length = seeded_rng.choice([3, 4, 5, 6])
        max_attempts = length + 2
        unique_flag = False
        code = generate_code(length, seeded_rng, False)
        total = 3 if length <= 4 else (4 if length == 5 else 5)
        all_hints = generate_hints(code, seeded_rng, total_count=total)
        session["daily_date"] = today_str
    elif mode == "daily_speed":
        seeded_rng = random.Random(f"pin-cracker-speedrun-{today_str}")
        length = 4
        max_attempts = 8
        unique_flag = False
        code = generate_code(length, seeded_rng, False)
        all_hints = generate_hints(code, seeded_rng, total_count=3)
        session["daily_date"] = today_str
    elif mode == "heist":
        idx = max(0, min(2, int(stage) - 1))
        cfg = HEIST_STAGES.copy().pop(idx)
        length = cfg["length"]
        max_attempts = cfg["attempts"]
        stage_label = cfg["label"]
        code = generate_code(length, None, unique_flag)
        all_hints = generate_hints(code)
        session["daily_date"] = None
    elif mode == "custom" and str(custom_pin).strip().isdigit() and 3 <= len(str(custom_pin).strip()) <= 6:
        code = str(custom_pin).strip()
        length = len(code)
        max_attempts = int(max_attempts) if int(max_attempts) > 0 else 6
        unique_flag = False
        clue_count = max(0, min(5, int(custom_clues)))
        all_hints = generate_hints(code, total_count=clue_count) if clue_count > 0 else []
        if custom_note.strip():
            all_hints.insert(0, f"AGENT NOTE: {custom_note.strip()[:60]}")
        if not all_hints:
            all_hints.append("NO TELEMETRY PROVIDED // DEDUCE BY KEYPAD.")
        session["daily_date"] = None
    else:
        length = DIFFICULTY_LENGTHS.get(difficulty, 4)
        code = generate_code(length, None, unique_flag)
        progressive = (mode == "progressive")
        total = 6 if progressive else (3 if length <= 4 else (4 if length == 5 else 5))
        all_hints = generate_hints(code, total_count=total)
        session["daily_date"] = None

    visible_hints = all_hints[:1] if progressive else all_hints
    hidden_hints = all_hints[1:] if progressive else []

    session["code"] = code
    session["mode"] = mode
    session["heist_stage"] = int(stage)
    session["difficulty"] = difficulty
    session["length"] = length
    session["max_attempts"] = int(max_attempts)
    session["attempts"] = 0
    session["revealed_slots"] = []
    session["hidden_hints"] = hidden_hints
    session["progressive"] = progressive
    session["no_repeat"] = unique_flag

    return {
        "hints": visible_hints,
        "hidden_count": len(hidden_hints),
        "length": length,
        "max_attempts": int(max_attempts),
        "mode": mode,
        "heist_stage": int(stage),
        "stage_label": stage_label,
        "daily_date": session.get("daily_date"),
        "daily_solves": daily_solves,
        "no_repeat": unique_flag
    }
@app.route("/")
def index():
    today_str = date.today().isoformat()
    daily_solves = get_daily_solves(today_str)
    info = start_new_session("normal", 8, "standard")
    return render_template("index.html", hints=info["hints"], length=info["length"], daily_solves=daily_solves)

@app.route("/guess", methods=["POST"])
def guess():
    data = request.get_json()
    user_guess = data.get("guess", "")
    secret = session.get("code")
    length = session.get("length", 4)
    max_attempts = session.get("max_attempts", 8)
    no_repeat = session.get("no_repeat", False)

    if not secret:
        info = start_new_session()
        secret = session["code"]
        length = info["length"]

    if len(user_guess) != length or not user_guess.isdigit():
        return jsonify({"error": f"Enter a {length}-digit PIN!"})

    if no_repeat and len(set(user_guess)) != length:
        return jsonify({"error": "FIREWALL: NO DUPLICATE DIGITS ALLOWED!"})

    session["attempts"] = session.get("attempts", 0) + 1
    attempts = session["attempts"]

    statuses, exact, misplaced = evaluate_guess(secret, user_guess)
    won = (user_guess == secret)
    lost = (not won and max_attempts > 0 and attempts >= max_attempts)

    daily_solves = None
    if won and session.get("mode") == "daily":
        today_str = session.get("daily_date") or date.today().isoformat()
        daily_solves = increment_daily_solves(today_str)

    unlocked_hint = None
    hidden = session.get("hidden_hints", [])
    if not won and not lost and hidden:
        unlocked_hint = hidden.pop(0)
        session["hidden_hints"] = hidden

    return jsonify({
        "won": won,
        "lost": lost,
        "secret": secret if (won or lost) else None,
        "statuses": statuses,
        "exact": exact,
        "misplaced": misplaced,
        "absent": statuses.count("absent"),
        "attempts": attempts,
        "max_attempts": max_attempts,
        "mode": session.get("mode", "standard"),
        "heist_stage": session.get("heist_stage", 1),
        "daily_date": session.get("daily_date"),
        "daily_solves": daily_solves,
        "unlocked_hint": unlocked_hint,
        "hidden_count": len(hidden)
    })

@app.route("/decrypt", methods=["POST"])
def decrypt():
    secret = session.get("code")
    length = session.get("length", 4)
    max_attempts = session.get("max_attempts", 8)
    attempts = session.get("attempts", 0)
    revealed = session.get("revealed_slots", [])

    if not secret:
        return jsonify({"error": "No active session."})
    if len(revealed) >= 1:
        return jsonify({"error": "EMERGENCY DECRYPT ALREADY USED THIS ROUND"})
    if max_attempts > 0 and (max_attempts - attempts) <= 1:
        return jsonify({"error": "INSUFFICIENT ATTEMPTS TO DECRYPT"})

    slot = random.randint(0, length - 1)
    revealed.append(slot)
    session["revealed_slots"] = revealed
    session["attempts"] = attempts + 1

    temp_chars = list(secret)
    for _ in range(slot):
        temp_chars.pop(0)
    digit_val = temp_chars.pop(0)

    return jsonify({
        "clue": f"DECRYPTED: Digit #{slot + 1} is {digit_val}.",
        "slot": slot,
        "digit": digit_val,
        "attempts": session["attempts"],
        "max_attempts": max_attempts
    })

@app.route("/timeout", methods=["POST"])
def timeout():
    return jsonify({"secret": session.get("code", "0000")})

@app.route("/leaderboard", methods=["GET", "POST"])
def leaderboard():
    if request.method == "POST":
        data = request.get_json() or {}
        entries = submit_leaderboard_score(
            data.get("name", "ANON_AGENT"),
            data.get("xp", 0),
            data.get("profile")
        )
        return jsonify({"entries": entries})
    return jsonify({"entries": get_leaderboard()})

@app.route("/daily_speed_lb", methods=["GET", "POST"])
def daily_speed_lb():
    today_str = date.today().isoformat()
    if request.method == "POST":
        data = request.get_json() or {}
        entries = submit_daily_speed(today_str, data.get("name", "ANON_AGENT"), data.get("time", 999))
        return jsonify({"entries": entries})
    return jsonify({"entries": get_daily_speed_lb(today_str)})

@app.route("/profile/<handle>")
def agent_profile(handle):
    clean = "".join(c for c in str(handle) if c.isalnum() or c in "_-").upper()[:14]
    raw = _redis_cmd("GET", f"pin_cracker_prof:{clean}")
    if raw:
        try:
            return jsonify({"found": True, "name": clean, "profile": json.loads(raw)})
        except Exception:
            pass
    return jsonify({"found": False, "name": clean})

@app.route("/duel/matchmake", methods=["POST"])
def duel_matchmake():
    data = request.get_json() or {}
    handle = "".join(c for c in str(data.get("name", "ANON_AGENT")) if c.isalnum() or c in "_-").upper()[:14] or "ANON_AGENT"

    matched_raw = _redis_cmd("GET", f"duel_matched:{handle}")
    if matched_raw:
        _redis_cmd("DEL", f"duel_matched:{handle}")
        room = _get_duel_room(matched_raw)
        if room:
            return jsonify({"status": "matched", "room_id": room["room_id"], "role": "host", "opponent": room["guest"]})

    waiting_raw = _redis_cmd("GET", "duel_queue_waiting")
    if waiting_raw:
        try:
            waiting = json.loads(waiting_raw)
            wait_name = waiting.get("name")
            if wait_name and wait_name != handle:
                _redis_cmd("DEL", "duel_queue_waiting")
                room = _create_duel_room(wait_name, handle)
                _redis_cmd("SETEX", f"duel_matched:{wait_name}", "60", room["room_id"])
                return jsonify({"status": "matched", "room_id": room["room_id"], "role": "guest", "opponent": wait_name})
        except Exception:
            pass

    _redis_cmd("SETEX", "duel_queue_waiting", "20", json.dumps({"name": handle}))
    return jsonify({"status": "waiting"})

@app.route("/duel/cancel", methods=["POST"])
def duel_cancel():
    data = request.get_json() or {}
    handle = "".join(c for c in str(data.get("name", "")) if c.isalnum() or c in "_-").upper()[:14]
    waiting_raw = _redis_cmd("GET", "duel_queue_waiting")
    if waiting_raw and handle in waiting_raw:
        _redis_cmd("DEL", "duel_queue_waiting")
    return jsonify({"status": "cancelled"})

@app.route("/duel/create", methods=["POST"])
def duel_create():
    data = request.get_json() or {}
    handle = "".join(c for c in str(data.get("name", "HOST_AGENT")) if c.isalnum() or c in "_-").upper()[:14] or "HOST_AGENT"
    room = _create_duel_room(handle, None)
    return jsonify({"room_id": room["room_id"]})

@app.route("/duel/join", methods=["POST"])
def duel_join():
    data = request.get_json() or {}
    room_id = str(data.get("room_id", "")).strip().upper()
    handle = "".join(c for c in str(data.get("name", "GUEST_AGENT")) if c.isalnum() or c in "_-").upper()[:14] or "GUEST_AGENT"
    room = _get_duel_room(room_id)
    if not room:
        return jsonify({"error": "Duel room expired or not found."})

    if room["host"] == handle:
        role = "host"
    elif not room["guest"] or room["guest"] == handle:
        room["guest"] = handle
        role = "guest"
        _save_duel_room(room)
    else:
        return jsonify({"error": "Duel room is already full."})

    session["code"] = room["code"]
    session["mode"] = "duel"
    session["length"] = 4
    session["max_attempts"] = 0
    session["attempts"] = 0
    session["revealed_slots"] = []
    session["hidden_hints"] = []
    session["no_repeat"] = False

    return jsonify({
        "room_id": room["room_id"],
        "role": role,
        "host": room["host"],
        "guest": room["guest"],
        "hints": room["hints"],
        "length": 4
    })

@app.route("/duel/sync", methods=["POST"])
def duel_sync():
    data = request.get_json() or {}
    room_id = str(data.get("room_id", "")).strip().upper()
    role = data.get("role", "host")
    attempts = int(data.get("attempts", 0))
    won = bool(data.get("won", False))
    elapsed = float(data.get("elapsed", 0))

    room = _get_duel_room(room_id)
    if not room:
        return jsonify({"error": "Room closed"})

    if role == "host":
        room["host_attempts"] = attempts
        if won and not room["winner"]:
            room["winner"] = room["host"]
            room["win_time"] = round(elapsed, 1)
    else:
        room["guest_attempts"] = attempts
        if won and not room["winner"]:
            room["winner"] = room["guest"]
            room["win_time"] = round(elapsed, 1)

    _save_duel_room(room)
    opp_name = room["guest"] if role == "host" else room["host"]
    opp_attempts = room["guest_attempts"] if role == "host" else room["host_attempts"]
    return jsonify({
        "ready": bool(room["host"] and room["guest"]),
        "opponent": opp_name or "WAITING FOR OPPONENT...",
        "opponent_attempts": opp_attempts,
        "winner": room["winner"],
        "win_time": room["win_time"],
        "secret": room["code"] if room["winner"] else None
    })


@app.route("/reset", methods=["POST"])
def reset():
    data = request.get_json() or {}
    info = start_new_session(
        difficulty=data.get("difficulty", "normal"),
        max_attempts=data.get("max_attempts", 8),
        mode=data.get("mode", "standard"),
        stage=data.get("stage", 1),
        custom_pin=data.get("custom_pin", ""),
        custom_note=data.get("custom_note", ""),
        custom_clues=data.get("custom_clues", 2),
        no_repeat=data.get("no_repeat", False)
    )
    info["status"] = "reset"
    return jsonify(info)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=True, use_reloader=False)
