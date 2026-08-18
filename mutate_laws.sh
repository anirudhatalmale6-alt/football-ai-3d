#!/bin/sh
# ==============================================================================================
# mutate_laws.sh - break each Law on purpose and check that the suite notices
# Copyright (c) AI2ORBIT Co. 2026
#
#   sh mutate_laws.sh
#
# A test suite that has never failed proves nothing. Twice on this project a test passed for the
# wrong reason and was only found by deliberately deleting the code it was supposed to be
# guarding. So every rule in laws.js gets the same treatment here: change one character, run the
# suite, and the suite MUST go red. A mutation that survives is a rule with no real test behind
# it, and it is reported as a failure of this script, not of the code.
#
# The file is restored after every mutation, and again on exit even if this is interrupted.
# ==============================================================================================
set -u
SRC=laws.js
BAK=$(mktemp)
cp "$SRC" "$BAK"
trap 'cp "$BAK" "$SRC"; rm -f "$BAK"' EXIT INT TERM

KILLED=0
SURVIVED=0
SURVIVORS=""

mutate() {
  desc="$1"; from="$2"; to="$3"
  cp "$BAK" "$SRC"
  # A mutation that does not apply is worse than one that survives: it means this script is
  # silently testing nothing. So the substitution is checked before the suite is run.
  if ! grep -qF "$from" "$SRC"; then
    echo "  ERROR  the mutation did not apply - the text is not in $SRC: $desc"
    SURVIVED=$((SURVIVED+1)); SURVIVORS="$SURVIVORS
    (did not apply) $desc"
    return
  fi
  python3 - "$SRC" "$from" "$to" <<'PY'
import sys
p, a, b = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(p).read()
open(p, 'w').write(s.replace(a, b, 1))
PY
  if node test_laws.mjs >/dev/null 2>&1; then
    echo "  SURVIVED  $desc"
    SURVIVED=$((SURVIVED+1)); SURVIVORS="$SURVIVORS
    $desc"
  else
    n=$(node test_laws.mjs 2>/dev/null | grep -c '^  FAIL')
    echo "  killed by $n check(s)   $desc"
    KILLED=$((KILLED+1))
  fi
  cp "$BAK" "$SRC"
}

echo "================================================================"
echo "mutate_laws.sh - can the suite fail?"
echo "================================================================"
echo

# Law 11, the offside line itself.
mutate "the offside line ignores the halfway line" \
  "Math.max(secondLast, ballProj, 0)" "Math.max(secondLast, ballProj)"
mutate "the offside line ignores the ball" \
  "Math.max(secondLast, ballProj, 0)" "Math.max(secondLast, 0)"
mutate "the offside line ignores the defence" \
  "Math.max(secondLast, ballProj, 0)" "Math.max(ballProj, 0)"
mutate "the line is the LAST opponent instead of the second last" \
  "proj.length >= 2 ? proj[1]" "proj.length >= 2 ? proj[0]"
mutate "level with the second last opponent is given offside" \
  "return { offside: margin > laws.levelToleranceM" \
  "return { offside: margin >= laws.levelToleranceM"
mutate "the competition tolerance is ignored" \
  "margin > laws.levelToleranceM" "margin > 0"

# Law 11, the involvement half of the decision.
mutate "offside is given from a throw in, a goal kick and a corner" \
  "const applies = offsideAppliesFrom(restartType || null);" "const applies = true;"
mutate "offside is never given from a dropped ball or a free kick" \
  "const applies = offsideAppliesFrom(restartType || null);" \
  "const applies = restartType === null || restartType === undefined;"
mutate "a deliberate save is treated like any other deliberate play" \
  "if (contact.fromDeliberateOpponentPlay && !contact.fromSave)" \
  "if (contact.fromDeliberateOpponentPlay)"
mutate "interfering with an opponent is dropped from the decision" \
  "if (contact.challengedBy && contact.challengedBy === f.id)" \
  "if (false && contact.challengedBy === f.id)"
mutate "the vision cone does not check which side of the ball the player is on" \
  "if (pl > kl) return false;" "if (false) return false;"

# Law 9 and Law 10, in, out, and the goal.
mutate "the ball is out when its CENTRE crosses the line" \
  "return Math.abs(z) - r > pitch.halfWidth || Math.abs(x) - r > pitch.halfLength;" \
  "return Math.abs(z) > pitch.halfWidth || Math.abs(x) > pitch.halfLength;"
mutate "the goal is judged on the centre of the ball, not the whole of it" \
  "const plane = s * (pitch.halfLength + r);" "const plane = s * pitch.halfLength;"
mutate "the crossbar is not checked" \
  "y < pitch.crossbar - r && y >= 0" "y >= 0"
mutate "the goal is sampled per frame instead of interpolated" \
  "const wasBefore = (prev.x - plane) * s < 0;" "const wasBefore = true;"

# Laws 15, 16 and 17.
mutate "a corner and a goal kick are swapped" \
  "if (lastTouchWasDefender) {" "if (!lastTouchWasDefender) {"
mutate "the throw in goes to the side that put it out" \
  "team: lastTouchTeam === null || lastTouchTeam === undefined ? 0 : 1 - lastTouchTeam,
      // Taken from the point it crossed" \
  "team: lastTouchTeam === null || lastTouchTeam === undefined ? 0 : lastTouchTeam,
      // Taken from the point it crossed"
mutate "a goal may be scored directly from a throw in" \
  "const NO_DIRECT_GOAL = new Set([RESTART.THROW_IN, RESTART.INDIRECT, RESTART.DROPPED]);" \
  "const NO_DIRECT_GOAL = new Set([RESTART.INDIRECT, RESTART.DROPPED]);"

# Law 12, 13 and 14.
mutate "an attacker fouling in the box concedes a penalty against his own side" \
  "if (offenderIsDefending && inPenaltyArea(x, z, offenderDir, pitch)) {" \
  "if (inPenaltyArea(x, z, offenderDir, pitch)) {"
mutate "an indirect offence in the box becomes a penalty" \
  "if (INDIRECT_OFFENCES.has(offence))
    return { type: RESTART.INDIRECT" \
  "if (false)
    return { type: RESTART.INDIRECT"
mutate "an unknown offence is guessed at instead of refused" \
  "if (!known) return { type: null" "if (false) return { type: null"
mutate "the penalty area is only as wide as the goal area" \
  "&& Math.abs(z) <= pitch.penaltyAreaHalfWidth;" "&& Math.abs(z) <= pitch.goalAreaHalfWidth;"
mutate "the wall stands at 8 m instead of 9.15" \
  "freeKickDistance: 9.15," "freeKickDistance: 8.0,"
mutate "the wall is built behind the ball instead of in front of it" \
  "const cx = ballX + dx * laws.freeKickDistance;" \
  "const cx = ballX - dx * laws.freeKickDistance;"
mutate "players ahead of the penalty spot are allowed to stand there" \
  "if (towardsGoal > 1e-9) bad.push({ id: p.id, why: 'ahead of the ball' });" \
  "if (false) bad.push({ id: p.id, why: 'ahead of the ball' });"

# Law 8 and the goalkeeper.
mutate "a dropped ball in the box goes to whoever touched it last" \
  "if (inPenaltyArea(x, z, t.dir, pitch)) {" "if (false) {"
mutate "the keeper gets seven seconds" "goalkeeperSeconds: 6," "goalkeeperSeconds: 7,"
mutate "exactly six seconds is punished" \
  "return { offence: seconds > laws.goalkeeperSeconds," \
  "return { offence: seconds >= laws.goalkeeperSeconds,"
mutate "a deflection off a team mate counts as a back pass" \
  "(!!deliberateKick || !!fromThrowIn)" "true"

# Advantage.
mutate "advantage is never pulled back" \
  "if (world.foulingTeamHasBall)" "if (false)"
mutate "advantage is held for ten seconds" "advantageSeconds: 4," "advantageSeconds: 10,"

echo
echo "================================================================"
echo "  $((KILLED+SURVIVED)) mutations, $KILLED killed, $SURVIVED survived"
if [ "$SURVIVED" -gt 0 ]; then
  echo "  a survivor is a rule with no real test behind it:$SURVIVORS"
fi
echo "================================================================"
[ "$SURVIVED" -eq 0 ]
