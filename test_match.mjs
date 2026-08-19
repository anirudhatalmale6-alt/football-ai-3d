// ==============================================================================================
// test_match.mjs - the match layer and the competition profiles, checked with no browser present
// Copyright (c) AI2ORBIT Co. 2026
//
//   node test_match.mjs
//
// Same two reasons as test_laws.mjs. The ordinary one: a rule nobody tested is a rule nobody
// has. The one that matters more here: this file runs under node with no window, no canvas and
// no three.js, so "the match layer is portable" is a result rather than a promise.
//
// Wherever a rule has a boundary, both sides of it are checked. Six seconds is allowed and six
// and a bit is not; a second caution is NOT reviewable although a direct red card is; the same
// tackle is a sending off outside the penalty area and a caution inside it. A rule tested only
// where it says yes is a rule that cannot fail its own test.
//
// The last section is the one that would catch the worst failure this layer could have: a
// competition field that was never filled in being READ as though it had a value. Every profile
// is checked to make sure that throws rather than returning a plausible number.
// ==============================================================================================

import * as M from './match.js';
import * as P from './profiles.js';
import * as L from './laws.js';

let pass = 0, fail = 0;
const ok  = m => { pass++; console.log('  ok   ' + m); };
const bad = m => { fail++; console.log('  FAIL ' + m); };
const chk = (c, m) => c ? ok(m) : bad(m);
const near = (a, b, tol, m) => chk(Math.abs(a - b) <= tol, m + ' (' + (+a.toFixed(3)) + ')');
const head = t => console.log('\n' + t);
const threw = (f) => { try { f(); return false; } catch { return true; } };

console.log('================================================================');
console.log('test_match.mjs - the shape of a match, and the competitions');
console.log('================================================================');
console.log('  ' + M.MATCH_VERSION);
console.log('  ' + P.PROFILES_VERSION);

// ------------------------------------------------------------------ portable, like laws.js
head('  0. it does not need a browser either');
chk(typeof globalThis.window === 'undefined', 'there is no window object in this process');
chk(typeof globalThis.document === 'undefined', 'and no document');
chk(typeof M.kicksRecord === 'function' && typeof P.resolve === 'function',
    'and both modules loaded anyway');

// ------------------------------------------------------------------ Law 7
head('  1. Law 7 - the duration');
chk(M.DURATION.halfMinutes === 45, 'a half is 45 minutes');
chk(M.DURATION.halfTimeIntervalMaxMinutes === 15, 'the interval is no more than 15');
chk(M.DURATION.extraTimeHalfMinutes === 15, 'extra time is two periods of 15');

head('  2. added time is a MINIMUM, and its reasons are a closed list');
let at = M.addedTime([{ reason: 'substitution', seconds: 30 },
                      { reason: 'injuryAssessment', seconds: 45 },
                      { reason: 'goalCelebration', seconds: 20 }]);
chk(at.lostSeconds === 95, 'the stoppages are added up in seconds');
chk(at.announcedMinutes === 2, 'and announced rounded UP, so nothing lost goes unannounced');
chk(at.isMinimum === true, 'the figure is labelled a minimum, not a limit');
chk(M.addedTime([{ reason: 'substitution', seconds: 60 }]).announcedMinutes === 1,
    'exactly one minute announces one');
chk(M.addedTime([{ reason: 'substitution', seconds: 61 }]).announcedMinutes === 2,
    'and a second more announces two, because it is a minimum');
at = M.addedTime([{ reason: 'crowdNoise', seconds: 300 }]);
chk(!at.ok && at.lostSeconds === 0 && at.rejected[0] === 'crowdNoise',
    'a reason the Law does not list is REFUSED, not quietly added to the clock');
chk(M.ADDED_TIME_REASONS.has('videoReview'),
    'but a video check or review is on the list, and counts');

head('  3. a half is never shortened, and a penalty extends it');
const per = o => M.periodEnded({ elapsedSeconds: o.e, periodSeconds: 2700,
                                 addedSeconds: o.a || 0, penaltyPending: o.p,
                                 penaltyComplete: o.c });
chk(per({ e: 2699 }).ended === false, 'a second short of 45 minutes it is still running');
chk(per({ e: 2700 }).ended === true, 'at 45 minutes with no addition it ends');
chk(per({ e: 2700, a: 120 }).ended === false, 'with two minutes added it does not');
chk(per({ e: 2821, a: 120 }).ended === true, 'and ends once the addition has run too');
chk(per({ e: 3000, a: 120, p: true }).ended === false,
    'but not while a penalty kick is still to be taken');
chk(per({ e: 3000, a: 120, p: true }).extended === true, 'the period is extended for it');
chk(per({ e: 3000, a: 120, p: true, c: true }).ended === true,
    'and ends the moment that kick is completed');

// ------------------------------------------------------------------ Law 3
head('  4. Law 3 - the players');
chk(M.TEAM.onField === 11, 'eleven a side');
chk(M.teamCanPlay(7).ok === true, 'seven players is enough to play');
chk(M.teamCanPlay(6).ok === false, 'six is not');
chk(/start or continue/.test(M.teamCanPlay(6).reason),
    'and the reason says CONTINUE as well as start, which is the half usually missed');

head('  5. substitutions: the numbers belong to the competition, and are refused if absent');
const bare = P.resolve({ competition: 'english' });
let s = M.substitutionCheck({ playerOnId: 's1', namedSubstitutes: ['s1'], profile: bare });
chk(s.allowed === false && s.notStated.includes('substitutionsAllowed'),
    'with nothing stated, a substitution is REFUSED and the missing field is named');
chk(!/\d/.test(String(s.allowed)) && s.notStated.length >= 1,
    'no number was invented to let it through');

// A competition that HAS published its numbers - supplied here by the caller, not by me.
const filled = P.resolve({ competition: 'english', context: 'leagueFixture', overrides: {
  substitutionsAllowed: 5, substitutionOpportunities: 3, returnSubstitutes: false,
  namedSubstitutes: 9, videoAssistantReferee: true,
} });
const sub = o => M.substitutionCheck({ playerOnId: 's1', namedSubstitutes: ['s1', 's2'],
                                       profile: filled, ...o });
chk(sub({}).allowed === true, 'with the numbers stated, a named substitute may come on');
chk(sub({}).usesOpportunity === true, 'and it spends one of the three opportunities');
chk(sub({ atInterval: true }).usesOpportunity === false,
    'a substitution at the interval spends NO opportunity, which is the clause usually missed');
chk(sub({ playerOnId: 'x9' }).allowed === false, 'a player who was never named may not come on');
chk(sub({ substitutionsUsed: 5 }).allowed === false, 'the sixth substitution is refused');
chk(sub({ substitutionsUsed: 4 }).allowed === true, 'the fifth is not');
chk(sub({ opportunitiesUsed: 3 }).allowed === false, 'the fourth opportunity is refused');
chk(sub({ opportunitiesUsed: 3, atInterval: true }).allowed === true,
    'but the interval is still available after all three have been used');
chk(sub({ alreadySubstituted: ['s1'] }).allowed === false,
    'a substituted player takes no further part');
const youth = P.resolve({ competition: 'ifab', overrides: {
  substitutionsAllowed: 5, substitutionOpportunities: 3, returnSubstitutes: true } });
chk(M.substitutionCheck({ playerOnId: 's1', namedSubstitutes: ['s1'],
                          alreadySubstituted: ['s1'], profile: youth }).allowed === true,
    'unless the competition permits return substitutes, which the Law allows only in some football');
chk(sub({ inExtraTime: true }).allowed === false,
    'in extra time the extra substitution is a competition matter, so it is refused until stated');
const et = P.resolve({ competition: 'ifab', overrides: {
  substitutionsAllowed: 5, substitutionOpportunities: 3, returnSubstitutes: false,
  extraTimeExtraSubstitution: true, extraTimeExtraOpportunity: true } });
chk(M.substitutionCheck({ playerOnId: 's1', namedSubstitutes: ['s1'], substitutionsUsed: 5,
                          inExtraTime: true, profile: et }).allowed === true,
    'with it stated, a sixth substitution in extra time is allowed');
// The other side of the same line: a competition that states it does NOT grant the extra one.
const noEt = P.resolve({ competition: 'ifab', overrides: {
  substitutionsAllowed: 5, substitutionOpportunities: 3, returnSubstitutes: false,
  extraTimeExtraSubstitution: false, extraTimeExtraOpportunity: false } });
chk(M.substitutionCheck({ playerOnId: 's1', namedSubstitutes: ['s1'], substitutionsUsed: 5,
                          inExtraTime: true, profile: noEt }).allowed === false,
    'and a competition that grants no extra one in extra time does not get it');
// The base's own answer, with nothing overriding it: a substituted player does not return.
const baseSubs = P.resolve({ competition: 'english', overrides: {
  substitutionsAllowed: 5, substitutionOpportunities: 3 } });
chk(baseSubs.returnSubstitutes === false,
    'the base states that a substituted player takes no further part');
chk(M.substitutionCheck({ playerOnId: 's1', namedSubstitutes: ['s1'],
                          alreadySubstituted: ['s1'], profile: baseSubs }).allowed === false,
    'so he is refused even when no competition has said anything about it');

head('  6. the concussion substitution is additional to everything else');
chk(M.substitutionCheck({ playerOnId: 's1', namedSubstitutes: ['s1'], concussion: true,
                          profile: filled }).allowed === false,
    'the protocol is a competition matter, so it is refused until stated');
const conc = P.resolve({ competition: 'ifab', overrides: {
  substitutionsAllowed: 5, substitutionOpportunities: 3, returnSubstitutes: false,
  concussionSubstitutes: 1 } });
const cs = M.substitutionCheck({ playerOnId: 's1', namedSubstitutes: ['s1'], concussion: true,
                                 substitutionsUsed: 5, opportunitiesUsed: 3, profile: conc });
chk(cs.allowed === true, 'with it stated it is allowed even with everything else used up');
chk(cs.usesOpportunity === false && cs.countsTowardsAllowance === false,
    'because it spends neither an opportunity nor part of the allowance');
chk(cs.opponentGains.substitutions === 1 && cs.opponentGains.opportunities === 1,
    'and the opposing team gains one of each, which is returned so a caller cannot forget it');

head('  7. changing the goalkeeper');
chk(M.goalkeeperChange({ duringStoppage: true, refereeInformed: true }).allowed === true,
    'at a stoppage with the referee told, it is allowed');
chk(M.goalkeeperChange({ duringStoppage: false, refereeInformed: true }).allowed === false,
    'during play it is not');
chk(M.goalkeeperChange({ duringStoppage: true, refereeInformed: false }).caution.length === 2,
    'and doing it without telling the referee cautions BOTH players');

// ------------------------------------------------------------------ Law 6
head('  8. Law 6 - the officials and their duties');
chk(Object.keys(M.OFFICIAL_DUTIES).length === 6, 'six kinds of match official are described');
chk(M.OFFICIAL_DUTIES[M.OFFICIAL.RESERVE_ASSISTANT].length === 1,
    'the reserve assistant referee has exactly one duty');
chk(M.OFFICIAL_DUTIES[M.OFFICIAL.ASSISTANT].some(d => /offside/.test(d)),
    'the assistant indicates offside');
chk(M.OFFICIAL_DUTIES[M.OFFICIAL.ASSISTANT].some(d => /goal line before/.test(d)),
    'and whether the keeper came off the line at a penalty');
chk(M.OFFICIAL_DUTIES[M.OFFICIAL.FOURTH].some(d => /minimum additional time/.test(d)),
    'the fourth official indicates the MINIMUM additional time');
chk(M.DECISIONS_ARE_THE_REFEREES === true, 'and the decisions are the referee’s');

// ------------------------------------------------------------------ Law 5
head('  9. Law 5 - when a decision may still be changed');
const mcr = o => M.mayChangeRestart(o);
chk(mcr({ playRestarted: false, periodEnded: false }).may === true,
    'before the restart, a wrong decision may be corrected');
chk(mcr({ playRestarted: true }).may === false, 'after the restart it may not');
chk(mcr({ playRestarted: false, periodEnded: true, refereeLeftField: true }).may === false,
    'nor once the half has ended and the referee has left the field');
chk(mcr({ playRestarted: false, periodEnded: true, refereeLeftField: false }).may === true,
    'but the half ending is not enough on its own');

head(' 10. the card outlives the restart at the end of a half');
chk(M.mayStillSanction({ periodEnded: true, refereeLeftField: false }).may === true,
    'an offence before the end may be sanctioned while the referee is still on the field');
chk(M.mayStillSanction({ periodEnded: true, refereeLeftField: true }).may === false,
    'not once the referee has left it');
chk(M.mayStillSanction({ periodEnded: true, refereeLeftField: true,
                         goingToReviewArea: true }).may === true,
    'unless the referee left only to go to the review area - the clause people miss');
chk(M.mayStillSanction({ periodEnded: true, refereeLeftField: true,
                         recallingPlayers: true }).may === true,
    'or to send the players back out');
chk(M.mayStillSanction({ matchTerminated: true, periodEnded: true }).may === false,
    'a terminated match ends both questions');
// The pair that proves the two questions are answered SEPARATELY rather than collapsed.
chk(M.mayChangeRestart({ playRestarted: false, periodEnded: true, refereeLeftField: true,
                         goingToReviewArea: true }).may === false &&
    M.mayStillSanction({ periodEnded: true, refereeLeftField: true,
                         goingToReviewArea: true }).may === true,
    'in the same situation the restart cannot change but the red card can still be given');

// ------------------------------------------------------------------ the VAR
head(' 11. the video assistant referee, and the four categories');
const noVar = M.varMayReview({ category: M.VAR_CATEGORY.GOAL, clearAndObviousError: true,
                               profile: {} });
chk(noVar.review === false,
    'with no profile it is refused, because whether there is a VAR at all is a competition matter');
// Refusing is not enough. "There is no VAR here" and "nobody has said" are different answers,
// and only the second one is a question somebody still has to go and settle.
chk(noVar.notStated && noVar.notStated.includes('videoAssistantReferee'),
    'and it is refused as NOT STATED, not as a competition that decided against having one');
const varOn = P.resolve({ competition: 'uefa', overrides: { videoAssistantReferee: true } });
const V = o => M.varMayReview({ profile: varOn, ...o });
chk(V({ category: M.VAR_CATEGORY.GOAL, clearAndObviousError: true }).review === true,
    'goal or no goal, with a clear and obvious error, is reviewable');
chk(V({ category: M.VAR_CATEGORY.PENALTY, seriousMissedIncident: true }).review === true,
    'so is a serious missed incident at a penalty');
chk(V({ category: M.VAR_CATEGORY.PENALTY }).review === false,
    'but not a penalty decision that was neither of those');
chk(V({ category: M.VAR_CATEGORY.IDENTITY, clearAndObviousError: true }).review === true,
    'mistaken identity is the fourth category');
chk(V({ category: 'offside', clearAndObviousError: true }).review === false,
    'an offside decision on its own is not a category - it reaches the VAR through a goal');
chk(V({ category: M.VAR_CATEGORY.RED_CARD, clearAndObviousError: true }).review === true,
    'a direct red card is reviewable');
chk(V({ category: M.VAR_CATEGORY.RED_CARD, secondCaution: true,
        clearAndObviousError: true }).review === false,
    'a SECOND CAUTION is not, although the player is sent off just the same');
const varOff = P.resolve({ competition: 'uefa', overrides: { videoAssistantReferee: false } });
chk(M.varMayReview({ category: M.VAR_CATEGORY.GOAL, clearAndObviousError: true,
                     profile: varOff }).review === false,
    'and a competition without a VAR reviews nothing');
chk(V({ category: M.VAR_CATEGORY.GOAL, clearAndObviousError: true }).finalDecisionBy
      === M.OFFICIAL.REFEREE, 'the final decision is the referee’s');
chk(M.reviewOutcome({ initiatedBy: M.OFFICIAL.VAR, decidedBy: M.OFFICIAL.REFEREE }).valid === false,
    'a review the video official started is not valid');
chk(M.reviewOutcome({ initiatedBy: M.OFFICIAL.REFEREE, decidedBy: M.OFFICIAL.VAR }).valid === false,
    'nor is one the video official decided');
chk(M.reviewOutcome({ initiatedBy: M.OFFICIAL.REFEREE, decidedBy: M.OFFICIAL.REFEREE,
                      originalDecision: 'noPenalty', finalDecision: 'penalty' }).changed === true,
    'and a valid review can change the decision');

// ------------------------------------------------------------------ Law 12
head(' 12. Law 12 - the card, which is a different question from the restart');
const D = o => M.disciplinaryAction(o);
chk(D({ offence: 'seriousFoulPlay' }).card === M.CARD.RED, 'serious foul play is a red card');
chk(D({ offence: 'violentConduct' }).card === M.CARD.RED, 'so is violent conduct');
chk(D({ offence: 'spit' }).card === M.CARD.RED, 'and spitting at someone');
chk(D({ offence: 'dissent' }).card === M.CARD.YELLOW, 'dissent is a caution');
chk(D({ offence: 'delayingRestart' }).card === M.CARD.YELLOW, 'so is delaying the restart');
chk(D({ offence: 'trip', secondCaution: true }).card === M.CARD.RED,
    'a second caution in the same match is a red card');
chk(D({ offence: 'trip' }).card === M.CARD.NONE,
    'and an ordinary trip on its own carries no card at all');

head(' 13. the clause that replaced the triple punishment');
const dogso = o => D({ deniedGoalScoringOpportunity: true, ...o });
chk(dogso({ offence: 'trip' }).card === M.CARD.RED,
    'denying an obvious goal-scoring opportunity by a trip is a sending off');
chk(dogso({ offence: 'trip', inOwnPenaltyArea: true, penaltyAwarded: true }).card
      === M.CARD.YELLOW,
    'the SAME trip inside their own area, with a penalty given, is only a caution');
chk(dogso({ offence: 'trip', inOwnPenaltyArea: true, penaltyAwarded: true }).mitigated === true,
    'and the mitigation is reported rather than left to be inferred');
chk(dogso({ offence: 'hold', inOwnPenaltyArea: true, penaltyAwarded: true }).card === M.CARD.RED,
    'but holding carries no mitigation, so it stays a red card');
chk(dogso({ offence: 'push', inOwnPenaltyArea: true, penaltyAwarded: true }).card === M.CARD.RED,
    'nor does pushing');
chk(dogso({ offence: 'trip', inOwnPenaltyArea: true, penaltyAwarded: true,
            couldPlayTheBall: false }).card === M.CARD.RED,
    'and neither does a challenge with no possibility of playing the ball');
chk(dogso({ offence: 'violentConduct', inOwnPenaltyArea: true,
            penaltyAwarded: true }).card === M.CARD.RED,
    'an offence that is a red card anywhere is still a red card in the area');
chk(dogso({ offence: 'trip', inOwnPenaltyArea: true, penaltyAwarded: false }).card === M.CARD.RED,
    'the mitigation depends on a penalty actually being AWARDED, not on the location alone');

head(' 14. handling, and the promising attack');
chk(D({ handballDeniedGoal: true, offence: 'handball' }).card === M.CARD.RED,
    'handling to deny a goal is a sending off');
chk(D({ handballDeniedGoal: true, offence: 'handball',
        offenderIsGoalkeeperInOwnArea: true }).card === M.CARD.NONE,
    'except by the goalkeeper inside their own penalty area');
chk(D({ stoppedPromisingAttack: true, offence: 'trip' }).card === M.CARD.YELLOW,
    'stopping a promising attack is a caution');
chk(D({ stoppedPromisingAttack: true, offence: 'trip', inOwnPenaltyArea: true,
        penaltyAwarded: true }).card === M.CARD.NONE,
    'but not when a penalty kick has already been given for it');
chk(D({ stoppedPromisingAttack: true, offence: 'dissent', inOwnPenaltyArea: true,
        penaltyAwarded: true }).card === M.CARD.YELLOW,
    'unless the offence would have been cautioned anyway');

head(' 15. the sin bin exists only where a competition adopts it');
chk(D({ offence: 'temporaryDismissal', profile: {} }).notStated.includes('temporaryDismissals'),
    'with nothing stated it is NOT STATED, not assumed');
chk(D({ offence: 'temporaryDismissal', profile: P.resolve({ competition: 'ifab' }) }).card
      === M.CARD.NONE, 'the Laws base does not use them');
const bin = P.resolve({ competition: 'ifab', overrides: { temporaryDismissals: true,
                                                          temporaryDismissalMinutes: 10 } });
chk(D({ offence: 'temporaryDismissal', profile: bin }).temporaryDismissal === true,
    'a competition that adopts them gets them');
chk(D({ offence: 'temporaryDismissal', profile: bin }).minutes === 10,
    'with the competition’s own length, not one of mine');

// ------------------------------------------------------------------ Law 10
head(' 16. Law 10 - the result');
chk(M.matchResult({ goalsHome: 2, goalsAway: 1 }).result === M.RESULT.HOME, 'more goals wins');
chk(M.matchResult({ goalsHome: 0, goalsAway: 0 }).result === M.RESULT.DRAW, 'level is a draw');
const league = P.resolve({ competition: 'german', context: 'leagueFixture' });
chk(M.decideDrawnMatch({ goalsHome: 1, goalsAway: 1, profile: league }).result === M.RESULT.DRAW,
    'a league fixture that ends level stays a draw');
const cupUnknown = P.resolve({ competition: 'english', context: 'knockoutSingleLeg' });
let dd = M.decideDrawnMatch({ goalsHome: 1, goalsAway: 1, profile: cupUnknown });
chk(dd.result === null && dd.notStated.includes('extraTime'),
    'a knockout tie that ends level returns NOT STATED, because HOW it is decided is a regulation');
// One question at a time. A competition that has settled extra time but not the kicks must be
// stopped at the SECOND question, not carried past it on the answer to the first.
const halfStated = P.resolve({ competition: 'english', context: 'knockoutSingleLeg',
                               overrides: { extraTime: false } });
dd = M.decideDrawnMatch({ goalsHome: 1, goalsAway: 1, profile: halfStated });
chk(dd.result === null && dd.notStated.includes('kicksFromThePenaltyMark'),
    'with extra time ruled out but the kicks unstated, it stops at the kicks');
const cup = P.resolve({ competition: 'uefa', context: 'knockoutExtraTimeThenKicks' });
chk(M.decideDrawnMatch({ goalsHome: 1, goalsAway: 1, profile: cup }).result
      === M.RESULT.EXTRA_TIME, 'with the shape stated, a level score goes to extra time');
chk(M.decideDrawnMatch({ goalsHome: 1, goalsAway: 1, phase: M.PERIOD.EXTRA_SECOND,
                         profile: cup }).result === M.RESULT.KICKS,
    'and still level after extra time, to kicks from the penalty mark');

head(' 17. the two legged tie');
const twoLeg = P.resolve({ competition: 'uefa', context: 'knockoutTwoLeg' });
let tie = M.tieResult({ legs: [{ home: 'A', away: 'B', goalsHome: 2, goalsAway: 0 },
                               { home: 'B', away: 'A', goalsHome: 1, goalsAway: 0 }],
                        profile: twoLeg });
chk(tie.winner === 'A' && tie.by === 'aggregate', 'the aggregate decides it when it is not level');
tie = M.tieResult({ legs: [{ home: 'A', away: 'B', goalsHome: 2, goalsAway: 1 },
                           { home: 'B', away: 'A', goalsHome: 1, goalsAway: 0 }],
                    profile: twoLeg });
chk(tie.winner === null && tie.notStated.includes('awayGoalsRule'),
    'a level aggregate returns NOT STATED rather than applying away goals to it');
const away = P.resolve({ competition: 'uefa', context: 'knockoutTwoLeg',
                         overrides: { awayGoalsRule: true } });
tie = M.tieResult({ legs: [{ home: 'A', away: 'B', goalsHome: 2, goalsAway: 1 },
                           { home: 'B', away: 'A', goalsHome: 1, goalsAway: 0 }],
                    profile: away });
chk(tie.winner === 'B' && tie.by === 'awayGoals',
    'a competition that states the rule has it applied, and B wins on the away goal');
const noAway = P.resolve({ competition: 'uefa', context: 'knockoutTwoLeg',
                           overrides: { awayGoalsRule: false, extraTime: true,
                                        kicksFromThePenaltyMark: true } });
tie = M.tieResult({ legs: [{ home: 'A', away: 'B', goalsHome: 2, goalsAway: 1 },
                           { home: 'B', away: 'A', goalsHome: 1, goalsAway: 0 }],
                    profile: noAway });
chk(tie.winner === null && tie.next === M.RESULT.EXTRA_TIME,
    'and the same tie without the rule goes to extra time instead');

// ------------------------------------------------------------------ kicks from the mark
head(' 18. kicks from the penalty mark - reducing to equal numbers');
let red = M.kicksReduceToEqual({ eligibleA: [1,2,3,4,5,6,7,8,9,10,11],
                                 eligibleB: [1,2,3,4,5,6,7,8,9,10] });
chk(red.mustReduce === 'A' && red.removeCount === 1 && red.equalNumber === 10,
    'the team with eleven reduces to the ten the other side has');
chk(/tells the referee/.test(red.chosenBy),
    'WHICH players are left out is the team’s choice, and the model refuses to make it');
chk(M.kicksReduceToEqual({ eligibleA: [1,2], eligibleB: [1,2] }).mustReduce === null,
    'equal numbers need no reduction');

head(' 19. the order, the turn and one kick each before anybody kicks twice');
const five = ['a','b','c','d','e'];
let k = M.kicksOpen({ firstTeam: 'A', eligibleA: five, eligibleB: five });
chk(M.kicksTurn(k) === 'A', 'the team that won the toss kicks first');
chk(M.kicksRecord(k, { team: 'B', playerId: 'a', scored: true }).ok === false,
    'the other team may not kick out of turn');
chk(M.kicksRecord(k, { team: 'A', playerId: 'z', scored: true }).ok === false,
    'and a player who was not on the field at the end may not kick at all');
k = M.kicksRecord(k, { team: 'A', playerId: 'a', scored: true }).state;
chk(M.kicksTurn(k) === 'B', 'then it is the other team’s turn');
k = M.kicksRecord(k, { team: 'B', playerId: 'a', scored: true }).state;
chk(M.kicksRecord(k, { team: 'A', playerId: 'a', scored: true }).ok === false,
    'the same player may not take a second kick before his team mates have taken one');

head(' 20. it stops the moment the other team cannot catch up');
// A scores three, B misses three. After six kicks B can reach two at most and A already has
// three, so the Law ends it there - and code that simply runs all ten would not.
k = M.kicksOpen({ firstTeam: 'A', eligibleA: five, eligibleB: five });
const seq = [['A','a',true],['B','a',false],['A','b',true],['B','b',false]];
for (const [t, p, sc] of seq) k = M.kicksRecord(k, { team: t, playerId: p, scored: sc }).state;
chk(M.kicksStatus(k).decided === false, 'at 2-0 after two each it is not decided - B can reach 2');
k = M.kicksRecord(k, { team: 'A', playerId: 'c', scored: true }).state;
chk(M.kicksStatus(k).decided === false,
    'at 3-0 with B still to take its third it is not decided either, because B could reach 3');
k = M.kicksRecord(k, { team: 'B', playerId: 'c', scored: false }).state;
let st = M.kicksStatus(k);
chk(st.decided === true && st.winner === 'A',
    'B missing its third ends it at 3-0 with four kicks unused');
chk(M.kicksRecord(k, { team: 'A', playerId: 'd', scored: true }).ok === false,
    'and no further kick may be taken');

head(' 21. level after five each, and sudden death that is not sudden');
k = M.kicksOpen({ firstTeam: 'A', eligibleA: five, eligibleB: five });
for (let i = 0; i < 5; i++) {
  k = M.kicksRecord(k, { team: 'A', playerId: five[i], scored: true }).state;
  k = M.kicksRecord(k, { team: 'B', playerId: five[i], scored: true }).state;
}
st = M.kicksStatus(k);
chk(st.decided === false && st.scored.A === 5 && st.scored.B === 5,
    'five each, all scored, and it is not decided');
k = M.kicksRecord(k, { team: 'A', playerId: 'a', scored: true }).state;
chk(M.kicksStatus(k).decided === false,
    'A scoring the sixth does NOT end it - the pair has to be completed first');
k = M.kicksRecord(k, { team: 'B', playerId: 'a', scored: false }).state;
st = M.kicksStatus(k);
chk(st.decided === true && st.winner === 'A',
    'B missing its sixth ends it, one goal ahead from the same number of kicks');

head(' 22. where everybody stands');
const kp = M.kicksPositions({ goalSide: 1 });
near(kp.mark.x, 41.5, 0.001, 'the ball is on the penalty mark');
near(Math.abs(kp.kickersKeeperAt.z), L.PITCH.penaltyAreaHalfWidth, 0.001,
     'the kicker’s own goalkeeper waits where the goal line meets the penalty area');
chk(kp.everyoneElse.inCentreCircle === true, 'everybody else is in the centre circle');
chk(/tosses a coin/.test(kp.goalChosenBy),
    'and which goal is used comes from a coin, so the caller supplies it');

// ------------------------------------------------------------------ the profile layer
head(' 23. every competition plays the SAME Laws');
const ids = Object.keys(P.COMPETITIONS);
chk(ids.length === 14, 'fourteen profiles: the Laws, and the thirteen variants asked for');
for (const want of ['uefa','fifa','english','spanish','german','swedish','belgian','french',
                    'canadian','mexican','latinAmerican','copa','us'])
  chk(ids.includes(want), 'there is a profile for ' + want);
chk(ids.every(id => P.resolve({ competition: id }).lawsPublishedBy === 'IFAB'),
    'and every one of them says its Laws are published by the IFAB, unchanged');
chk(ids.every(id => P.resolve({ competition: id }).minimumPlayers === 7),
    'so seven players is seven players in all fourteen');

head(' 24. the layering: base, then context, then competition, then the caller');
const eng = P.resolve({ competition: 'english', context: 'leagueFixture' });
chk(eng.drawIsAllowed === true,
    'the English profile states nothing about draws, so the LEAGUE context supplies it');
chk(eng.halfMinutes === 45, 'and the base still supplies the 45 minute half');
chk(P.resolve({ competition: 'english' }).drawIsAllowed === P.NOT_STATED,
    'with no context it goes back to NOT STATED, because it depends on the kind of match');
const over = P.resolve({ competition: 'english', context: 'leagueFixture',
                         overrides: { halfMinutes: 40 } });
chk(over.halfMinutes === 40, 'the caller beats all of them');
chk(P.resolve({ competition: 'ifab', context: 'knockoutKicksOnly' }).extraTime === false,
    'a context may state a field the base leaves open');
// Silence must not erase. A layer that says NOT STATED is a layer with nothing to add, and it
// has to leave the fact underneath it alone.
chk(P.resolve({ competition: 'english', context: 'leagueFixture',
                overrides: { halfMinutes: P.NOT_STATED } }).halfMinutes === 45,
    'a NOT STATED value on top of a stated one does not erase it');
// And the order of the two middle layers, which is invisible until they disagree.
const contradicts = { id: 'test', name: 'a competition that settles its drawn league fixtures',
                      body: 'test', confederation: 'test', drawIsAllowed: false };
chk(P.resolve({ competition: contradicts, context: 'leagueFixture' }).drawIsAllowed === false,
    'a competition may contradict the context default, and beats it');

head(' 25. a field that is NOT STATED must not be readable as a value');
const q = P.resolve({ competition: 'spanish' });
chk(q.substitutionsAllowed === P.NOT_STATED,
    'how many substitutions a competition allows is NOT STATED, not five');
chk(q.unstated.includes('videoAssistantReferee'),
    'whether it operates a video assistant referee is NOT STATED too');
chk(q.unstated.length > 10, 'and so are the rest of the regulation fields');
const strictQ = P.strict(q);
chk(threw(() => strictQ.substitutionsAllowed),
    'reading one through strict() THROWS rather than returning a plausible number');
chk(strictQ.halfMinutes === 45, 'while a field that IS stated reads normally');
let msg = '';
try { void P.strict(q).namedSubstitutes; } catch (e) { msg = e.message; }
chk(/namedSubstitutes/.test(msg) && /published regulations/.test(msg),
    'and the message names the field and says where the answer has to come from');

head(' 26. an override is checked before it is used');
chk(threw(() => P.resolve({ competition: 'english', overrides: { minimumPlayers: 5 } })),
    'a field the LAWS own cannot be overridden by a competition');
chk(threw(() => P.resolve({ competition: 'english', overrides: { pitchLengthM: 130 } })),
    'a pitch longer than the Law allows is refused, not clamped');
chk(!threw(() => P.resolve({ competition: 'english', overrides: { pitchLengthM: 100 } })),
    'and one inside the range is accepted');
// The narrower international range is the one the Law itself sets, so it is enforced: 95 m is a
// legal pitch for a domestic match and an illegal one for an international.
chk(!threw(() => P.resolve({ competition: 'english', overrides: { pitchLengthM: 95 } })),
    '95 m is a legal pitch under Law 1');
chk(threw(() => P.resolve({ competition: 'fifa', overrides: { pitchLengthM: 95 } })),
    'but not for an international match, where the Law narrows it to 100-110 m');
chk(threw(() => P.resolve({ competition: 'english', overrides: { nonsenseField: 1 } })),
    'a field nobody has heard of is refused');
chk(threw(() => P.resolve({ competition: 'atlantis' })), 'so is a competition nobody has heard of');

head(' 27. THE SEAM: the same rules code, a different competition, a different answer');
// This is the check the whole layer exists for. laws.js is not touched, not forked and not
// even aware of profiles.js - the profile is handed to the SAME function as an argument.
const opp = [{ id: 'gk', x: 50 }, { id: 'd1', x: 30 }, { id: 'd2', x: 22 }];
const line = L.offsideLine({ opponents: opp, ballX: 10, dir: 1 });
const strictLaws = P.resolve({ competition: 'ifab' });
const semiAuto = P.resolve({ competition: 'uefa',
                             overrides: { semiAutomatedOffside: true, levelToleranceM: 0.10 } });
chk(L.inOffsidePosition({ x: 30.05, z: 0 }, line, strictLaws.laws).offside === true,
    'five centimetres past the second last opponent is offside under the Laws as written');
chk(L.inOffsidePosition({ x: 30.05, z: 0 }, line, semiAuto.laws).offside === false,
    'and onside under a competition that publishes a ten centimetre tolerance');
chk(L.inOffsidePosition({ x: 30.15, z: 0 }, line, semiAuto.laws).offside === true,
    'while fifteen centimetres past is offside under both');
// The pitch travels the same way, which is what week 3 will use.
const narrow = P.resolve({ competition: 'english', overrides: { pitchWidthM: 64 } });
chk(L.ballIsOut(0, 33, narrow.pitch) === true && L.ballIsOut(0, 33, strictLaws.pitch) === false,
    'a ball 33 m off centre is out on a 64 m pitch and in play on a 68 m one, same function');

head(' 28. the report is a checklist, not a claim');
const rep = P.report('mexican');
chk(/Federacion Mexicana/.test(rep), 'it names the body that runs the competition');
// Asserted on the words rather than on one literal string: the report wraps at 64 columns, so
// a phrase can legitimately be split across two lines and a substring match would break on a
// change of wording length rather than on a change of meaning.
chk(/published by IFAB/.test(rep) && /unchanged/.test(rep),
    'it says the Laws are not forked');
chk(rep.split('\n').every(l => l.length <= 64), 'and the report is 64 columns, like the others');
chk(/substitutionsAllowed/.test(rep), 'and it lists the fields somebody has to fill in');
chk(P.report().split('\n').filter(l => /plays under/.test(l)).length === 14,
    'and with no argument it does all fourteen');

// ------------------------------------------------------------------ honesty of the modules
head(' 29. the decisions are labelled as decisions');
const fs = await import('node:fs/promises');
const srcM = await fs.readFile('./match.js', 'utf8');
const srcP = await fs.readFile('./profiles.js', 'utf8');
chk(/DECISION, not a Law[\s\S]{0,400}rounded UP/.test(srcM),
    'the rounding of added time is marked DECISION in match.js, beside its reason');
chk(/DECISION of the team/.test(srcM), 'and so is the choice the model refuses to make');
chk(/NOT STATED/.test(srcM) && /NOT STATED/.test(srcP),
    'both modules say NOT STATED where they cannot source something');
chk(/competition rules must state/i.test(srcM) || /competition rules must state/i.test(srcP),
    'and both record that the Laws hand these fields to the competition');
chk(!/three\.js|document\.|window\./.test(srcM.replace(/no three\.js/g, '')),
    'match.js contains no renderer and no DOM');
chk(!/three\.js|document\.|window\./.test(srcP), 'and neither does profiles.js');

console.log('\n================================================================');
console.log('  ' + (pass + fail) + ' checks, ' + pass + ' passed, ' + fail + ' failed');
console.log('================================================================');
process.exit(fail ? 1 : 0);
