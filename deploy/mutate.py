"""Break the contract on purpose, and see whether the suite notices.

    python deploy/mutate.py [--only <substring>]

Each mutant is one edit that makes SPECLOCK wrong in a way somebody could
plausibly ship: a guard inverted, a floor removed, a check deleted. A green
suite that survives one of these is not holding the thing it claims to hold.

A mutant that survives is either a missing test or a genuinely equivalent
change. The second kind is listed in EQUIVALENT with the reason, so nobody has
to rediscover it. A mutant whose pattern no longer matches the contract is a
FAILURE, not a notice: it means a check quietly stopped being made when
something was renamed.
"""
import argparse
import os
import pathlib
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "contracts" / "speclock.py").read_text(encoding="utf-8")
NL = chr(10)

MUTANTS = [
    # --- who may act ---------------------------------------------------------
    ("anybody may add a requirement",
     '        self._creator_only(spec)' + NL + '        if spec["state"] == S_FROZEN:' + NL +
     '            _fail("this specification is frozen; its requirements cannot change", E_FROZEN)',
     '        if spec["state"] == S_FROZEN:' + NL +
     '            _fail("this specification is frozen; its requirements cannot change", E_FROZEN)'),
    ("anybody may freeze a specification",
     '        self._creator_only(spec)' + NL + '        if spec["state"] == S_FROZEN:' + NL +
     '            _fail("this specification is already frozen", E_FROZEN)',
     '        if spec["state"] == S_FROZEN:' + NL +
     '            _fail("this specification is already frozen", E_FROZEN)'),
    ("the creator is whoever the caller says",
     "        creator = self._sender()", "        creator = self._sender() or ''"),

    # --- freezing ------------------------------------------------------------
    ("requirements may change after freezing",
     '        if spec["state"] == S_FROZEN:' + NL +
     '            _fail("this specification is frozen; its requirements cannot change", E_FROZEN)',
     "        pass"),
    ("a specification may be frozen twice",
     '        if spec["state"] == S_FROZEN:' + NL +
     '            _fail("this specification is already frozen", E_FROZEN)',
     "        pass"),
    ("a specification with no requirements may be frozen",
     "        if len(requirements) < MIN_REQUIREMENTS:", "        if False:"),
    ("the criteria digest ignores the statements",
     '            "requirements": [[r["requirement_id"], r["statement"], r["severity"]]',
     '            "requirements": [[r["requirement_id"]]'),
    ("an unfrozen specification may be assessed",
     '        if spec["state"] != S_FROZEN:', "        if False:"),

    # --- what a requirement may be -------------------------------------------
    ("a requirement id may be anything",
     "        if not REQUIREMENT_ID.match(rid):", "        if False:"),
    ("requirement ids may repeat",
     '        if self.requirements.get(f"{sid}|{rid}"):', "        if False:"),
    ("a specification may hold unlimited requirements",
     "        if len(ids) >= MAX_REQUIREMENTS:", "        if False:"),
    ("severity may be anything",
     "        if clean_severity not in SEVERITIES:", "        if False:"),

    # --- content integrity ---------------------------------------------------
    ("the baseline hash is taken on trust",
     '        computed = _digest_of(body)' + NL + '        claimed = str(baseline_hash or "").strip().lower()' + NL +
     "        if claimed and claimed != computed:",
     '        computed = _digest_of(body)' + NL + '        claimed = str(baseline_hash or "").strip().lower()' + NL +
     "        if False:"),
    ("the proposed hash is taken on trust",
     '        computed = _digest_of(body)' + NL + '        claimed = str(proposed_hash or "").strip().lower()' + NL +
     "        if claimed and claimed != computed:",
     '        computed = _digest_of(body)' + NL + '        claimed = str(proposed_hash or "").strip().lower()' + NL +
     "        if False:"),
    ("the baseline is not stored, only its hash",
     '        self.content[f"baseline|{sid}"] = body', "        pass"),

    # --- reading the model ---------------------------------------------------
    ("an unknown status is accepted",
     "        if status not in FINDING_STATUSES:", "        if False:"),
    ("a requirement may be answered twice",
     "        if rid in seen:", "        if False:"),
    ("a requirement may go unanswered",
     "    if missing:", "    if False:"),
    ("an answer about another specification is accepted",
     "        if rid not in statements:", "        if False:"),
    ("prose is unbounded",
     '        evidence = _sanitize(str(row.get("evidence") or "").strip())[:MAX_EVIDENCE]',
     '        evidence = _sanitize(str(row.get("evidence") or "").strip())'),

    # --- grounding -----------------------------------------------------------
    ('a decisive answer needs no evidence',
     '        if status in (F_SATISFIED, F_VIOLATED):\n            grounded = _grounds(evidence, haystack)',
     '        if False:\n            grounded = _grounds(evidence, haystack)'),
    ('a quote need not appear in either document',
     '            grounded = _grounds(evidence, haystack)',
     '            grounded = True'),
    ("grounding is checked against the markup",
     "    return SPACES.sub(\" \", MARKUP.sub(\"\", str(text or \"\"))).strip().lower()",
     "    return str(text or \"\")"),
    ("the floor holds a failure but not a pass",
     "        held = status in (F_SATISFIED, F_VIOLATED) and not f[\"grounded\"]",
     "        held = status == F_VIOLATED and not f[\"grounded\"]"),
    ("an ungrounded answer still counts",
     '        settled.append({**f, "effective_status": F_UNCLEAR if held else status, "held": bool(held)})',
     '        settled.append({**f, "effective_status": status, "held": bool(held)})'),

    ('any run of words grounds a citation',
     '    for start in range(len(words) - QUOTE_WORDS + 1):',
     '    for start in range(min(1, len(words))):'),
    # --- the verdict ---------------------------------------------------------
    ("a violation is not decisive",
     "    if F_VIOLATED in statuses:", "    if False:"),
    ("an unsettled requirement is ignored",
     "    if F_UNCLEAR in statuses:", "    if False:"),
    ("the verdict reads what the model answered, not what the floor settled",
     '    statuses = [f["effective_status"] for f in findings]',
     '    statuses = [f["status"] for f in findings]'),
    ("silence is compatible",
     "    if F_VIOLATED in statuses:" + NL + "        return V_BREAKING" + NL +
     "    if F_UNCLEAR in statuses:" + NL + "        return V_INCONCLUSIVE",
     "    if F_VIOLATED in statuses:" + NL + "        return V_BREAKING"),

    # --- the panel -----------------------------------------------------------
    ("the validator agrees with anything",
     '            if str(theirs.get("decisive") or "") != mine["decisive"]:',
     "            if False:"),
    ("the validator never does the work itself",
     "                mine = self._evaluate(spec, requirements, baseline, proposed)",
     '                mine = {"decisive": str(theirs.get("decisive") or "")}'),
    ("what the panel compares ignores the status",
     '    return _sha256_hex(_canon([[f["requirement_id"], f["status"], f["effective_status"]]',
     '    return _sha256_hex(_canon([[f["requirement_id"], f["effective_status"]]'),
    ("what the panel compares ignores what grounding settled",
     '    return _sha256_hex(_canon([[f["requirement_id"], f["status"], f["effective_status"]]',
     '    return _sha256_hex(_canon([[f["requirement_id"], f["status"]]'),
    ("what the panel compares ignores which requirement",
     '    return _sha256_hex(_canon([[f["requirement_id"], f["status"], f["effective_status"]]',
     '    return _sha256_hex(_canon([[f["status"], f["effective_status"]]'),
    ("the agreed answer is stored without being checked again",
     '        if _decisive(findings) != str(agreed.get("decisive") or ""):',
     "        if False:"),
    ("a leader failure is always agreed with",
     "                return self._agrees_with_failure(leaders_result, spec, requirements," + NL +
     "                                                 baseline, proposed)",
     "                return True"),

    # --- untrusted evidence --------------------------------------------------
    ("evidence is not fenced before the reader sees it",
     '        "<<<BEGIN BASELINE SPECIFICATION>>>",', '        "",'),
    ("a fence inside a document is deleted rather than replaced",
     '    return ANGLE_RUN.sub(" ", str(text or ""))', '    return ANGLE_RUN.sub("", str(text or ""))'),
    ("documents reach the reader unsanitised",
     "        _sanitize(proposed),", "        proposed,"),
    ("a field may carry a fence",
     "    if ANGLE_RUN.search(out):" + NL +
     '        _fail(f"{field} cannot contain three or more angle brackets in a row", E_INVALID_INPUT)',
     "    pass"),
]

EQUIVALENT = {
    "what the panel compares ignores which requirement":
        "equivalent by construction, and the reason is worth keeping. The findings are "
        "sorted by requirement id before the digest is taken, so the position of a status "
        "in that list IS the requirement it belongs to -- two different mappings cannot "
        "produce the same ordered list of statuses. The id stays in the tuple as defence "
        "against the day somebody changes the sort",
    "the creator is whoever the caller says":
        "gl.message.sender_address is never empty inside a write, so `or ''` cannot change it. "
        "The mutant is here to say that the creator comes from the signature and not from an "
        "argument, which is the property worth stating even though it cannot be broken this way",
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="", help="run only mutants whose name contains this")
    # Each mutant is a full suite run, so the whole sweep outlives some task
    # timeouts. These let it be run in halves without weakening any of it.
    ap.add_argument("--start", type=int, default=0, help="index of the first mutant to run")
    ap.add_argument("--count", type=int, default=0, help="how many to run (0 means all of them)")
    args = ap.parse_args()

    chosen = [m for m in MUTANTS if args.only.lower() in m[0].lower()]
    chosen = chosen[args.start:(args.start + args.count) if args.count else None]
    print(f"{len(chosen)} of {len(MUTANTS)} mutants"
          + (f", from index {args.start}" if args.start else ""), flush=True)
    survivors, bad = [], []
    with tempfile.TemporaryDirectory() as tmp:
        for name, old, new in chosen:
            found = SOURCE.count(old)
            if found != 1:
                print(f"BAD MUTANT {name!r}: pattern found {found} times", flush=True)
                bad.append(name)
                continue
            path = pathlib.Path(tmp) / "speclock.py"
            path.write_text(SOURCE.replace(old, new), encoding="utf-8")
            env = {**os.environ, "SPECLOCK_CONTRACT": str(path), "PYTHONUTF8": "1"}
            proc = subprocess.run([sys.executable, "-m", "pytest", "tests/direct", "-q", "-x",
                                   "-p", "no:cacheprovider"], cwd=ROOT, env=env,
                                  capture_output=True, text=True)
            killed = proc.returncode != 0
            print(f"{'killed  ' if killed else 'SURVIVED'} {name}", flush=True)
            if not killed:
                survivors.append(name)

    equivalent = [s for s in survivors if s in EQUIVALENT]
    undocumented = [s for s in survivors if s not in EQUIVALENT]
    ran = len(chosen) - len(bad)
    print(f"{NL}{ran - len(survivors)}/{ran} mutants killed, {len(equivalent)} documented "
          f"equivalent, {len(undocumented)} undocumented"
          + (f", {len(bad)} BAD PATTERN(S)" if bad else ""))
    for name in undocumented:
        print(f"  SURVIVOR    {name}")
    for name in bad:
        print(f"  BAD PATTERN {name}: the contract no longer contains what this mutant edits, "
              f"so the check it stood for is not being made")
    for name in equivalent:
        print(f"  equivalent  {name}: {EQUIVALENT[name]}")
    return 1 if undocumented or bad else 0


if __name__ == "__main__":
    sys.exit(main())
