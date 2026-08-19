#!/bin/sh
# ==============================================================================================
# mutate_match.sh - break the match layer and the profiles on purpose, and check the suite notices
# Copyright (c) AI2ORBIT Co. 2026
#
#   sh mutate_match.sh
#
# test_match.mjs passed 175 out of 175 the first time it was run. That is not a good sign on its
# own - it is exactly what a suite that is asserting nothing also looks like. So every rule in
# match.js and profiles.js gets broken here, one at a time, and the suite MUST go red. A mutation
# that survives is a rule with no real test behind it, and it is reported as a failure of this
# script rather than of the code.
#
# This one mutates TWO files, unlike mutate_laws.sh, so each mutation names the file it applies
# to and both are restored on exit even if this is interrupted.
# ==============================================================================================
set -u
M=match.js
P=profiles.js
BM=$(mktemp); BP=$(mktemp)
cp "$M" "$BM"; cp "$P" "$BP"
trap 'cp "$BM" "$M"; cp "$BP" "$P"; rm -f "$BM" "$BP"' EXIT INT TERM

KILLED=0
SURVIVED=0
SURVIVORS=""

mutate() {
  file="$1"; desc="$2"; from="$3"; to="$4"
  cp "$BM" "$M"; cp "$BP" "$P"
  # A mutation that does not apply is worse than one that survives: it means this script is
  # silently testing nothing. So the substitution is checked before the suite is run.
  if ! grep -qF "$from" "$file"; then
    echo "  ERROR  the mutation did not apply - the text is not in $file: $desc"
    SURVIVED=$((SURVIVED+1)); SURVIVORS="$SURVIVORS
    (did not apply) $desc"
    return
  fi
  python3 - "$file" "$from" "$to" <<'PY'
import sys
p, a, b = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(p).read()
open(p, 'w').write(s.replace(a, b, 1))
PY
  if node test_match.mjs >/dev/null 2>&1; then
    echo "  SURVIVED  $desc"
    SURVIVED=$((SURVIVED+1)); SURVIVORS="$SURVIVORS
    $desc"
  else
    n=$(node test_match.mjs 2>/dev/null | grep -c '^  FAIL')
    echo "  killed by $n check(s)   $desc"
    KILLED=$((KILLED+1))
  fi
  cp "$BM" "$M"; cp "$BP" "$P"
}

echo "================================================================"
echo "mutate_match.sh - can the suite fail?"
echo "================================================================"
echo

# ---------------------------------------------------------------------------------- Law 7
mutate "$M" "added time is rounded DOWN, so lost time goes unannounced" \
  "const announced = Math.ceil(lost / 60);" "const announced = Math.floor(lost / 60);"
mutate "$M" "any reason at all is accepted as grounds for adding time" \
  "if (!ADDED_TIME_REASONS.has(s.reason)) { rejected.push(s.reason); continue; }" \
  "if (false) { rejected.push(s.reason); continue; }"
mutate "$M" "a video review does not count as time lost" \
  "  'videoReview',            // both a check and a review at the pitchside monitor" "  "
mutate "$M" "the half ends on time even with a penalty still to be taken" \
  "if (penaltyPending && !penaltyComplete)" "if (false)"
mutate "$M" "the announced addition is ignored, so the half ends early" \
  "const past = elapsedSeconds >= periodSeconds + addedSeconds;" \
  "const past = elapsedSeconds >= periodSeconds;"
mutate "$M" "a half is 40 minutes" "halfMinutes: 45," "halfMinutes: 40,"

# ---------------------------------------------------------------------------------- Law 3
mutate "$M" "a team may continue with six players" "minimumToPlay: 7," "minimumToPlay: 6,"
mutate "$M" "an unnamed player may come on as a substitute" \
  "if (!namedSubstitutes.includes(playerOnId))" "if (false)"
mutate "$M" "a substituted player may come back on in any competition" \
  "if (alreadySubstituted.includes(playerOnId) && !p.returnSubstitutes)" "if (false)"
mutate "$M" "a substitution at the interval spends an opportunity after all" \
  "const usesOpportunity = !atInterval;" "const usesOpportunity = true;"
mutate "$M" "the opportunity limit is not enforced" \
  "if (usesOpportunity && opportunitiesUsed >= opportunities)" "if (false)"
mutate "$M" "the substitution limit is not enforced" \
  "if (substitutionsUsed >= allowance)" "if (false)"
mutate "$M" "a missing competition number is defaulted instead of refused" \
  "if (missing.length)" "if (false)"
mutate "$M" "the extra time substitution is granted whether or not it was stated" \
  "(inExtraTime && p.extraTimeExtraSubstitution ? 1 : 0)" "(inExtraTime ? 1 : 0)"
mutate "$M" "a concussion substitution spends an opportunity" \
  "return { allowed: true, usesOpportunity: false, countsTowardsAllowance: false," \
  "return { allowed: true, usesOpportunity: true, countsTowardsAllowance: true,"
mutate "$M" "the opposing team gains nothing from a concussion substitution" \
  "opponentGains: { substitutions: 1, opportunities: 1 }," \
  "opponentGains: { substitutions: 0, opportunities: 0 },"
mutate "$M" "the goalkeeper may be changed during play" \
  "const ok = !!duringStoppage && !!refereeInformed;" "const ok = !!refereeInformed;"
mutate "$M" "only one player is cautioned for an unannounced change of goalkeeper" \
  "caution: duringStoppage && !refereeInformed ? ['playerOff', 'playerOn'] : []," \
  "caution: duringStoppage && !refereeInformed ? ['playerOff'] : [],"

# ---------------------------------------------------------------------------------- Law 5
mutate "$M" "a decision may be changed after play has restarted" \
  "if (playRestarted)
    return { may: false" "if (false)
    return { may: false"
mutate "$M" "a decision may be changed after the referee has left the field" \
  "if (ended && refereeLeftField)" "if (false)"
mutate "$M" "an offence before the end of a half can never be sanctioned once the half ends" \
  "if (goingToReviewArea || recallingPlayers)" "if (false)"
mutate "$M" "the two questions are collapsed, so the card dies with the restart" \
  "  if (!refereeLeftField)
    return { may: true, reason: 'the referee has not left the field of play' };" \
  "  if (!refereeLeftField)
    return { may: false, reason: 'collapsed onto the restart question' };"

# ---------------------------------------------------------------------------------- the VAR
mutate "$M" "a second caution is reviewable" \
  "if (category === VAR_CATEGORY.RED_CARD && secondCaution)" "if (false)"
mutate "$M" "anything at all is reviewable" \
  "if (!VAR_CATEGORIES.has(category))" "if (false)"
mutate "$M" "a review happens without a clear and obvious error" \
  "if (!clearAndObviousError && !seriousMissedIncident)" "if (false)"
mutate "$M" "a competition with no video assistant referee gets one anyway" \
  "if (!p.videoAssistantReferee)
    return { review: false" "if (false)
    return { review: false"
mutate "$M" "whether there is a VAR at all is assumed instead of asked" \
  "if (!isStated(p.videoAssistantReferee))" "if (false)"
mutate "$M" "the video official may start a review" \
  "const ok = initiatedBy === OFFICIAL.REFEREE && decidedBy === OFFICIAL.REFEREE;" \
  "const ok = decidedBy === OFFICIAL.REFEREE;"
mutate "$M" "the video official may take the decision" \
  "const ok = initiatedBy === OFFICIAL.REFEREE && decidedBy === OFFICIAL.REFEREE;" \
  "const ok = initiatedBy === OFFICIAL.REFEREE;"

# ---------------------------------------------------------------------------------- Law 6
mutate "$M" "the reserve assistant referee is given extra duties" \
  "    'has one duty only: to replace an assistant referee or fourth official who cannot continue'," \
  "    'has one duty only: to replace an official who cannot continue',
    'and assists with the substitution procedure',"
mutate "$M" "the assistant no longer watches the goalkeeper at a penalty" \
  "'at a penalty kick, indicates whether the goalkeeper moves off the goal line before the '" \
  "'at a penalty kick, indicates whether the ball was kicked forward before the '"

# ---------------------------------------------------------------------------------- Law 12
mutate "$M" "a second caution is not a sending off" \
  "  if (secondCaution)
    return { card: CARD.RED" "  if (false)
    return { card: CARD.RED"
mutate "$M" "denying a goal-scoring opportunity in the box is always a red card" \
  "const mitigated = inOwnPenaltyArea && penaltyAwarded" "const mitigated = false && penaltyAwarded"
mutate "$M" "holding is mitigated inside the penalty area like any other offence" \
  "&& !NO_MITIGATION.has(offence) && couldPlayTheBall;" "&& couldPlayTheBall;"
mutate "$M" "a challenge with no chance of playing the ball is mitigated too" \
  "&& !NO_MITIGATION.has(offence) && couldPlayTheBall;" "&& !NO_MITIGATION.has(offence);"
mutate "$M" "the mitigation applies wherever the offence happened, penalty or not" \
  "const mitigated = inOwnPenaltyArea && penaltyAwarded" "const mitigated = inOwnPenaltyArea"
mutate "$M" "a goalkeeper handling in their own area is sent off for it" \
  "if (offenderIsGoalkeeperInOwnArea)" "if (false)"
mutate "$M" "handling to deny a goal is only a caution" \
  "    return { card: CARD.RED,
             reason: 'denying a goal or an obvious goal-scoring opportunity by handling' };" \
  "    return { card: CARD.YELLOW,
             reason: 'denying a goal or an obvious goal-scoring opportunity by handling' };"
mutate "$M" "stopping a promising attack is cautioned even when a penalty was given" \
  "if (inOwnPenaltyArea && penaltyAwarded && !CAUTIONABLE.has(offence))" "if (false)"
mutate "$M" "an offence that is a caution anyway escapes the caution" \
  "if (inOwnPenaltyArea && penaltyAwarded && !CAUTIONABLE.has(offence))" \
  "if (inOwnPenaltyArea && penaltyAwarded)"
mutate "$M" "violent conduct is not a red card everywhere" \
  "const RED_ANYWHERE = new Set(['seriousFoulPlay', 'violentConduct', 'bite', 'spit'," \
  "const RED_ANYWHERE = new Set(['seriousFoulPlay', 'bite', 'spit',"
mutate "$M" "a sin bin is used whether or not the competition adopted it" \
  "if (!isStated(p.temporaryDismissals))
      return { card: CARD.NONE, notStated" \
  "if (false)
      return { card: CARD.NONE, notStated"
mutate "$M" "a plain trip is given a card" \
  "  return { card: CARD.NONE,
           reason: 'NOT STATED: this offence carries no card in this model' };" \
  "  return { card: CARD.YELLOW,
           reason: 'NOT STATED: this offence carries no card in this model' };"

# ---------------------------------------------------------------------------------- Law 10
mutate "$M" "a drawn league fixture is not a draw" \
  "if (p.drawIsAllowed) return { result: RESULT.DRAW" "if (false) return { result: RESULT.DRAW"
mutate "$M" "extra time is assumed when the competition has not said" \
  "if (!isStated(p.extraTime))
      return { result: null" "if (false)
      return { result: null"
mutate "$M" "kicks are assumed when the competition has not said" \
  "if (!isStated(p.kicksFromThePenaltyMark))
    return { result: null" "if (false)
    return { result: null"
mutate "$M" "extra time is skipped and it goes straight to kicks" \
  "if (p.extraTime) return { result: RESULT.EXTRA_TIME" \
  "if (false) return { result: RESULT.EXTRA_TIME"
mutate "$M" "the away goals rule is applied whether or not the competition uses it" \
  "if (!isStated(p.awayGoalsRule))" "if (false)"
mutate "$M" "away goals are counted for the wrong team" \
  "{ aggA += leg.goalsHome; aggB += leg.goalsAway; awayB += leg.goalsAway; }" \
  "{ aggA += leg.goalsHome; aggB += leg.goalsAway; awayA += leg.goalsAway; }"
mutate "$M" "the aggregate is not compared at all" \
  "if (aggA > aggB) return { winner: 'A', aggregate: [aggA, aggB], by: 'aggregate' };" \
  "if (false) return { winner: 'A', aggregate: [aggA, aggB], by: 'aggregate' };"

# ---------------------------------------------------------- kicks from the penalty mark
mutate "$M" "the shoot out runs all ten kicks instead of stopping when it is decided" \
  "    if (A > B + leftB)" "    if (false)"
mutate "$M" "it stops one kick too early, before the other team is out of reach" \
  "    if (A > B + leftB)" "    if (A >= B + leftB)"
mutate "$M" "sudden death ends on a goal without completing the pair" \
  "  if (tA !== tB)
    return { decided: false" "  if (false)
    return { decided: false"
mutate "$M" "a team may kick out of turn" \
  "if (team !== due)" "if (false)"
mutate "$M" "a player who was not on the field at the end may take a kick" \
  "if (!state.eligible[team].includes(playerId))" "if (false)"
mutate "$M" "one player may take every kick" \
  "if (byPlayer > round)" "if (false)"
mutate "$M" "a kick may be taken after the shoot out is decided" \
  "  if (status.decided)" "  if (false)"
mutate "$M" "the teams do not alternate" \
  "return state.kicks.length % 2 === 0 ? state.firstTeam : other;" "return state.firstTeam;"
mutate "$M" "the team with more players does not reduce" \
  "mustReduce: a === b ? null : (a > b ? 'A' : 'B')," "mustReduce: null,"
mutate "$M" "the model picks the takers itself instead of leaving it to the team" \
  "chosenBy: a === b ? null : 'the team, which tells the referee which players are excluded'," \
  "chosenBy: a === b ? null : 'chosen automatically by the engine',"

# ---------------------------------------------------------------------------------- profiles
mutate "$P" "a NOT STATED value overwrites a stated one" \
  "if (!isStated(v)) continue;                // NOT STATED adds nothing; it does not erase" \
  "if (false) continue;"
mutate "$P" "the competition is layered before the context, so the context wins" \
  "  layer(out, ctx);
  layer(out, c);" \
  "  layer(out, c);
  layer(out, ctx);"
mutate "$P" "the caller's overrides are ignored" \
  "  layer(out, overrides);" "  "
mutate "$P" "an override of a field the Laws own is allowed" \
  "if (f.owner === OWNER.LAW) {" "if (false) {"
mutate "$P" "an unknown field is accepted as an override" \
  "if (!f) { errors.push(k + ': no such field'); continue; }" \
  "if (!f) { continue; }"
mutate "$P" "a value outside the Law's range is accepted" \
  "if (range && typeof v === 'number' && (v < range[0] || v > range[1]))" \
  "if (false)"
mutate "$P" "the narrower international pitch range is not enforced" \
  "if (competition && k === 'pitchLengthM' && competition.pitchLengthRangeM)" "if (false)"
mutate "$P" "the overrides are applied without being checked" \
  "if (!check.ok) throw new Error" "if (false) throw new Error"
mutate "$P" "a NOT STATED field can be read through strict() after all" \
  "if (typeof key === 'string' && key in FIELDS && !isStated(v))" "if (false)"
mutate "$P" "the competition's tolerance never reaches the offside code" \
  "const laws = { ...LAWS, levelToleranceM: isStated(out.levelToleranceM)" \
  "const laws = { ...LAWS, levelToleranceM: isStated(undefined)"
mutate "$P" "the competition's pitch never reaches the geometry" \
  "halfWidth:  isStated(out.pitchWidthM)  ? out.pitchWidthM / 2  : PITCH.halfWidth };" \
  "halfWidth:  PITCH.halfWidth };"
mutate "$P" "a substitution allowance is defaulted into the base profile" \
  "  substitutionsAllowed: NOT_STATED," "  substitutionsAllowed: 5,"
mutate "$P" "the base assumes a video assistant referee" \
  "  videoAssistantReferee: NOT_STATED," "  videoAssistantReferee: true,"
mutate "$P" "a league fixture is no longer a draw by definition" \
  "    drawIsAllowed: true,
    extraTime: false," "    drawIsAllowed: NOT_STATED,
    extraTime: false,"
mutate "$P" "a knockout tie is allowed to end in a draw" \
  "    name: 'a single leg knockout tie',
    drawIsAllowed: false," "    name: 'a single leg knockout tie',
    drawIsAllowed: true,"
mutate "$P" "the base uses sin bins" "  temporaryDismissals: false," "  temporaryDismissals: true,"
mutate "$P" "the base allows return substitutes" \
  "  returnSubstitutes: false," "  returnSubstitutes: true,"
mutate "$P" "a competition is dropped from the list" \
  "  copa:          comp('copa', 'Copa America', 'CONMEBOL', 'CONMEBOL')," "  "
mutate "$P" "the report stops listing what has to be filled in" \
  "      for (const k of r.unstated)" "      for (const k of [])"
mutate "$P" "the minimum of seven is moved by a profile" \
  "  minimumPlayers: TEAM.minimumToPlay," "  minimumPlayers: 6,"

echo
echo "================================================================"
echo "  $((KILLED+SURVIVED)) mutations, $KILLED killed, $SURVIVED survived"
if [ "$SURVIVED" -gt 0 ]; then
  echo "  a survivor is a rule with no real test behind it:$SURVIVORS"
fi
echo "================================================================"
[ "$SURVIVED" -eq 0 ]
