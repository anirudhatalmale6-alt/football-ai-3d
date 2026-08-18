#!/bin/sh
# ==============================================================================================
# mutate_play.sh - break the GAME's use of the Laws and check the browser suite notices
# Copyright (c) AI2ORBIT Co. 2026
#
#   sh mutate_play.sh [url]        default http://127.0.0.1:8834/play.html
#
# mutate_laws.sh proves the rules are tested. It cannot prove the GAME asks them, asks them with
# the right arguments, or does what the answer says - which is where a rules engine usually goes
# wrong, because every rule is individually correct and the wiring is not.
#
# So this one edits play.html rather than laws.js: it swaps the sides at a throw in, it stops
# the offside snapshot being taken, it lets the referee kick before the wall is back, it makes
# a keeper defend the wrong goal. Each of those has to turn the browser suite red.
#
# Only the Laws section of the suite is run, with --laws. The gait, the camera and the half time
# clock are not affected by any of these mutations and running them thirty times over would say
# nothing.
# ==============================================================================================
set -u
URL="${1:-http://127.0.0.1:8834/play.html}"
SRC=play.html
BAK=$(mktemp)
cp "$SRC" "$BAK"
trap 'cp "$BAK" "$SRC"; rm -f "$BAK"' EXIT INT TERM

KILLED=0; SURVIVED=0; SURVIVORS=""

mutate() {
  desc="$1"; from="$2"; to="$3"
  cp "$BAK" "$SRC"
  if ! grep -qF "$from" "$SRC"; then
    echo "  ERROR  the mutation did not apply: $desc"
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
  out=$(python3 test_play.py "$URL" --laws 2>&1)
  rc=$?
  n=$(echo "$out" | grep -c '^  FAIL')
  # A mutation that makes the suite CRASH has also been caught, and an earlier version of this
  # script scored those as survivors because it only counted FAIL lines. Deleting the offside
  # snapshot made the next line dereference null, the run died with a page error and printed no
  # FAIL at all, and the report said the rule was untested. It was not: it was untestable that
  # run. The exit status is part of the answer.
  [ "$rc" -ne 0 ] && [ "$n" -eq 0 ] && n=-1
  if [ "$n" -eq 0 ]; then
    echo "  SURVIVED  $desc"
    SURVIVED=$((SURVIVED+1)); SURVIVORS="$SURVIVORS
    $desc"
  elif [ "$n" -eq -1 ]; then
    echo "  killed by a crash        $desc"
    KILLED=$((KILLED+1))
  else
    echo "  killed by $n check(s)   $desc"
    KILLED=$((KILLED+1))
  fi
  cp "$BAK" "$SRC"
}

echo "================================================================"
echo "mutate_play.sh - can the browser suite fail?"
echo "  against $URL"
echo "================================================================"
echo

mutate "the offside snapshot is never taken" \
  "  G.offside = LAW.snapshotOffside({" "  G.offside = null && LAW.snapshotOffside({"
# NOT MUTATED, and worth saying why rather than quietly leaving it out: excluding the passer
# from the snapshot - the filter(q => q !== p) in kickBall - cannot change any decision. The
# offside line is never in front of the ball, and the passer is standing on the ball, so his
# margin is exactly zero and level is onside. Putting him back in the list is an EQUIVALENT
# mutation: no input distinguishes it. Inventing a check that appeared to catch it would be
# writing a test for an effect that does not exist. The filter stays because it says what is
# meant; it is not load bearing.
mutate "offside is judged from the halfway line instead of from the ball" \
  "ballX: p.pos.x, dir: p.dir, restartType: G.lastRestart," \
  "ballX: 0, dir: p.dir, restartType: G.lastRestart,"
mutate "the flag is never acted on" \
  "if (wasFlagged && judgeOffside(best)) { afterBall(dt); return; }" \
  "if (false && judgeOffside(best)) { afterBall(dt); return; }"
mutate "the offside restart goes to the wrong side" \
  "awardRestart({ type: LAW.RESTART.INDIRECT, team: 1 - receiver.team, x: f.x, z: f.z });" \
  "awardRestart({ type: LAW.RESTART.INDIRECT, team: receiver.team, x: f.x, z: f.z });"
mutate "the line drawn on the screen is computed a second time instead of read off" \
  "offsideMesh.position.x = line.x;" "offsideMesh.position.x = line.x + 0.5;"
mutate "the restart is decided in the game instead of asked of the rules layer" \
  "const dec = LAW.restartForOut({ x: ball.pos.x, z: ball.pos.z," \
  "const dec = ({type:'throwIn', team:0, x:0, z:34}) && LAW.restartForOut({ x: 0, z: 0,"
mutate "a corner is not put in the corner" \
  "const c = LAW.cornerSpot(Math.sign(dec.x) || 1, Math.sign(dec.z) || 1);" \
  "const c = LAW.cornerSpot(-(Math.sign(dec.x) || 1), Math.sign(dec.z) || 1);"
mutate "a goal kick is taken by an outfielder" \
  "type === LAW.RESTART.GOAL_KICK || dec.toGoalkeeper" "false"
mutate "the foul restart ignores where the foul happened" \
  "const dec = LAW.foulRestart({ offence, x, z, offenderDir: offender.dir," \
  "const dec = LAW.foulRestart({ offence, x: 0, z: 0, offenderDir: offender.dir,"
mutate "every foul is an indirect free kick" \
  "const offence = TACKLE_OFFENCES[Math.floor(rnd()*TACKLE_OFFENCES.length)];" \
  "const offence = 'dangerousPlay';"
mutate "the referee does not wait for the wall" \
  "if (!LAW.freeKickLegal({ opponents: opp, ballX: d.x, ballZ: d.z }).legal" \
  "if (false && LAW.freeKickLegal({ opponents: opp, ballX: d.x, ballZ: d.z }).legal"
mutate "opponents do not have to retreat at all" \
  "if (p.team !== d.team && dist < req) {" "if (false) {"
mutate "the keeper's six seconds are never counted" \
  "  o.holding += dt;" "  o.holding += 0;"
mutate "an indirect free kick may be scored from directly" \
  "      if (G.awaitSecondTouch) {" "      if (false) {"
mutate "a keeper gathers a shot instead of parrying it" \
  "if (best && best.gk && sp > 13) {" "if (false) {"
mutate "the goalkeepers defend the goal they are attacking" \
  "    const gx = -p.dir*(PITCH_X-1.2);" "    const gx = p.dir*(PITCH_X-1.2);"
mutate "a player may be left with no real coordinates" \
  "  if (!(m > 1e-6)) return {x:0, z:0, m:0};" "  if (false) return {x:0, z:0, m:0};"

echo
echo "================================================================"
echo "  $((KILLED+SURVIVED)) mutations, $KILLED killed, $SURVIVED survived"
if [ "$SURVIVED" -gt 0 ]; then
  echo "  a survivor is wiring with no real check behind it:$SURVIVORS"
fi
echo "================================================================"
[ "$SURVIVED" -eq 0 ]
