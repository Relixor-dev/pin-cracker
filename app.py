import random
from flask import Flask, render_template, request, jsonify, session

app = Flask(__name__)
app.secret_key = "pin-cracker-secret-key"

DIFFICULTY_LENGTHS = {
    "easy": 3,
    "normal": 4,
    "hard": 5
}

def generate_code(length=4):
    return "".join(str(random.randint(0, 9)) for _ in range(length))

def generate_hints(code):
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

    possible_hints.append(f"The sum of all {length} digits is {sum(digits)}.")
    possible_hints.append(f"Digit #1 + Digit #{length} equals {digits[0] + digits[-1]}.")

    if length >= 3:
        possible_hints.append(f"Digit #2 + Digit #3 equals {digits[1] + digits[2]}.")

    if digits[0] > digits[-1]:
        possible_hints.append(f"Digit #1 is larger than Digit #{length}.")
    elif digits[0] < digits[-1]:
        possible_hints.append(f"Digit #1 is smaller than Digit #{length}.")
    else:
        possible_hints.append(f"Digit #1 and Digit #{length} are the same.")

    if len(set(digits)) < length:
        possible_hints.append("At least one digit repeats in the PIN.")
    else:
        possible_hints.append("All digits in the PIN are unique.")

    num_hints = 3 if length <= 4 else 4
    return random.sample(possible_hints, num_hints)

def evaluate_guess(secret, guess):
    length = len(secret)
    statuses = ["absent"] * length
    secret_remaining = {}

    for i in range(length):
        if guess[i] == secret[i]:
            statuses[i] = "correct"
        else:
            secret_remaining[secret[i]] = secret_remaining.get(secret[i], 0) + 1

    for i in range(length):
        if statuses[i] == "absent" and secret_remaining.get(guess[i], 0) > 0:
            statuses[i] = "present"
            secret_remaining[guess[i]] -= 1

    exact = statuses.count("correct")
    misplaced = statuses.count("present")
    return statuses, exact, misplaced

def start_new_session(difficulty="normal", max_attempts=8):
    length = DIFFICULTY_LENGTHS.get(difficulty, 4)
    code = generate_code(length)
    session["code"] = code
    session["difficulty"] = difficulty
    session["length"] = length
    session["max_attempts"] = int(max_attempts)
    session["attempts"] = 0
    return generate_hints(code), length

@app.route("/")
def index():
    hints, length = start_new_session("normal", 8)
    return render_template("index.html", hints=hints, length=length)

@app.route("/guess", methods=["POST"])
def guess():
    data = request.get_json()
    user_guess = data.get("guess", "")
    secret = session.get("code")
    length = session.get("length", 4)
    max_attempts = session.get("max_attempts", 8)

    if not secret:
        hints, length = start_new_session()
        secret = session["code"]

    if len(user_guess) != length or not user_guess.isdigit():
        return jsonify({"error": f"Enter a {length}-digit PIN!"})

    session["attempts"] = session.get("attempts", 0) + 1
    attempts = session["attempts"]

    statuses, exact, misplaced = evaluate_guess(secret, user_guess)
    won = (user_guess == secret)
    lost = (not won and max_attempts > 0 and attempts >= max_attempts)

    return jsonify({
        "won": won,
        "lost": lost,
        "secret": secret if (won or lost) else None,
        "statuses": statuses,
        "exact": exact,
        "misplaced": misplaced,
        "attempts": attempts,
        "max_attempts": max_attempts
    })

@app.route("/reset", methods=["POST"])
def reset():
    data = request.get_json() or {}
    difficulty = data.get("difficulty", session.get("difficulty", "normal"))
    max_attempts = data.get("max_attempts", session.get("max_attempts", 8))

    hints, length = start_new_session(difficulty, max_attempts)
    return jsonify({
        "status": "reset",
        "hints": hints,
        "length": length,
        "max_attempts": int(max_attempts)
    })

if __name__ == "__main__":
    app.run(debug=True)
