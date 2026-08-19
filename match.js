// ==============================================================================================
// match.js - the shape of a match: its periods, its officials, and how it is decided
// Copyright (c) AI2ORBIT Co. 2026
//
// Week 1 put the Laws that govern the BALL into laws.js - offside, fouls, restarts, the goal.
// This file is the other half: the Laws that govern the MATCH. Law 3 (the players and the
// substitutions), Law 5 (the referee), Law 6 (the other match officials, including the video
// assistant referee), Law 7 (the duration), Law 10 (how a winner is found), and the part of
// Law 12 that decides a card rather than a restart.
//
// Same discipline as laws.js and for the same reason: it imports nothing, it touches no DOM, no
// canvas and no three.js, every function is pure, and it is tested under node with no browser
// present. A studio that brings its own engine in September keeps this file unchanged.
//
// It imports laws.js for the pitch geometry ONLY, and nothing flows the other way. The
// dependency runs laws.js <- match.js <- profiles.js and never loops, so any one of the three
// can be read on its own.
//
// WHERE THE NUMBERS COME FROM
//
// The durations, the minimum of seven players, the fifteen minute interval, the four video
// review categories and the procedure for kicks from the penalty mark are the Laws of the Game
// as published by the IFAB. The WORDS are my own summary and are not quoted text.
//
// Almost everything else in a real match is not in the Laws at all - it is in the COMPETITION's
// own regulations, and the Laws say so explicitly ("competition rules must state..."). How many
// substitutes may be named, how many may be used, whether there is a video assistant referee,
// whether a drawn tie goes to extra time: none of that is a Law, and none of it is invented
// here. It is the profile layer's job, and profiles.js marks every one of those fields
// NOT STATED until a competition's published regulations fill it in.
//
// Anything decided by this file rather than by a Law is marked DECISION with the reason beside
// it. A decision printed as though it were a Law is the commonest way a rules engine misleads
// the person reading its output.
// ==============================================================================================

import { PITCH } from './laws.js';

// ---------------------------------------------------------------------------------- Law 7
//
// THE DURATION OF THE MATCH.
//
// Two equal halves of 45 minutes, which may be reduced only if that is agreed before the match
// and is in the competition rules. The half time interval is not more than 15 minutes. Where a
// competition requires extra time, it is two equal periods of 15 minutes.
//
// A half is never SHORTENED. If a penalty kick has to be taken or completed, the half is
// extended until it is finished, and that extension ends the moment the kick is over.

export const PERIOD = {
  FIRST_HALF:     'firstHalf',
  SECOND_HALF:    'secondHalf',
  EXTRA_FIRST:    'extraFirst',
  EXTRA_SECOND:   'extraSecond',
  KICKS:          'kicksFromThePenaltyMark',
};

export const DURATION = {
  halfMinutes: 45,
  halfTimeIntervalMaxMinutes: 15,
  extraTimeHalfMinutes: 15,
  // The Law provides for a drinks break of no more than one minute, and for cooling breaks,
  // which it puts at ninety seconds to three minutes. Both are only where the competition
  // permits them, so the profile layer decides whether they happen at all.
  drinksBreakMaxSeconds: 60,
  coolingBreakSeconds: [90, 180],
  // No interval between the two periods of extra time; the teams change ends and restart. There
  // IS a short interval before extra time begins, which the Law puts at no more than five
  // minutes and the competition may set.
  beforeExtraTimeMaxMinutes: 5,
};

// The reasons a period may be extended. This is the Law's own list, and it is a CLOSED list on
// purpose: an unrecognised reason is refused rather than quietly added, because a clock that
// accepts any excuse is a clock that cannot be audited afterwards.
export const ADDED_TIME_REASONS = new Set([
  'substitution',
  'injuryAssessment',
  'injuryRemoval',
  'timeWasting',
  'disciplinarySanction',
  'medicalStoppage',        // drinks and cooling breaks, where the competition permits them
  'videoReview',            // both a check and a review at the pitchside monitor
  'goalCelebration',
  'otherSignificantDelay',
]);

// The fourth official indicates the MINIMUM additional time. The referee may add more than was
// indicated but never less, and that asymmetry is the whole point of the word minimum.
//
// DECISION, not a Law: the announced figure is rounded UP to the next whole minute. The Law
// gives no rounding rule. Rounding down would announce less time than was actually lost, which
// contradicts the one thing the Law does say about this number - that it is a minimum.
export function addedTime(stoppages, opts = {}){
  let lost = 0;
  const rejected = [];
  for (const s of (stoppages || [])) {
    if (!ADDED_TIME_REASONS.has(s.reason)) { rejected.push(s.reason); continue; }
    lost += Math.max(0, s.seconds || 0);
  }
  const announced = Math.ceil(lost / 60);
  return {
    lostSeconds: lost,
    announcedMinutes: announced,
    // Named so a caller cannot mistake the announced figure for a limit.
    isMinimum: true,
    rejected,
    ok: rejected.length === 0,
    reason: rejected.length
      ? 'NOT STATED: these are not reasons the Law allows time for: ' + rejected.join(', ')
      : 'the sum of the stoppages, rounded up, announced as a minimum',
  };
}

// A period ends when its own time and the announced addition have run, UNLESS a penalty kick is
// still to be taken or completed - in which case it ends when that kick ends and not before.
export function periodEnded({ elapsedSeconds, periodSeconds, addedSeconds = 0,
                              penaltyPending = false, penaltyComplete = false }){
  const past = elapsedSeconds >= periodSeconds + addedSeconds;
  if (!past) return { ended: false, reason: 'the period is still running' };
  if (penaltyPending && !penaltyComplete)
    return { ended: false, extended: true,
             reason: 'the period is extended for a penalty kick to be taken or completed' };
  return { ended: true, reason: penaltyComplete
    ? 'the period ended when the extended penalty kick was completed'
    : 'the period ran its time and its addition' };
}

// ---------------------------------------------------------------------------------- Law 3
//
// THE PLAYERS.
//
// Eleven a side, one of whom is the goalkeeper. A match may not START or CONTINUE if either team
// has fewer than seven players. Note both verbs: seven is not only a condition for kicking off.

export const TEAM = {
  onField: 11,
  minimumToPlay: 7,
};

export function teamCanPlay(playersOnField){
  return {
    ok: playersOnField >= TEAM.minimumToPlay,
    playersOnField,
    minimum: TEAM.minimumToPlay,
    reason: playersOnField >= TEAM.minimumToPlay
      ? 'the team has enough players'
      : 'a match may not start or continue with fewer than seven players in a team',
  };
}

// SUBSTITUTIONS.
//
// Every number here belongs to the competition, not to the Law, so this function takes them
// from the profile and states nothing itself. What it DOES own is the shape of the rules, which
// is the same everywhere:
//
//   - only a named substitute may come on
//   - a substituted player takes no further part, unless the competition permits return
//     substitutes (which the Law allows only in youth, veteran, disability and grassroots)
//   - the count of substitutions and the count of OPPORTUNITIES are two separate limits, and
//     the second is the one that is usually implemented wrongly
//   - a substitution made at half time, before extra time, or at half time in extra time does
//     NOT use an opportunity
//   - where the competition permits it, extra time carries one further substitution and one
//     further opportunity
//   - a concussion substitution, where the competition operates the protocol, is additional to
//     all of the above and does not use an opportunity
//
// `profile` is the resolved competition profile. A field it leaves NOT STATED is refused here
// rather than defaulted, because defaulting a competition's number is inventing it.

export const NOT_STATED = '__NOT_STATED__';
export function isStated(v){ return v !== NOT_STATED && v !== undefined; }

export function substitutionCheck({ playerOffId, playerOnId, namedSubstitutes = [],
                                    substitutionsUsed = 0, opportunitiesUsed = 0,
                                    alreadySubstituted = [], atInterval = false,
                                    inExtraTime = false, concussion = false,
                                    simultaneousWithOpponent = false, profile }){
  const p = profile || {};
  const need = (k) => isStated(p[k]) ? p[k] : null;

  const missing = [];
  for (const k of ['substitutionsAllowed', 'substitutionOpportunities', 'returnSubstitutes'])
    if (need(k) === null) missing.push(k);
  if (concussion && need('concussionSubstitutes') === null) missing.push('concussionSubstitutes');
  if (inExtraTime) {
    for (const k of ['extraTimeExtraSubstitution', 'extraTimeExtraOpportunity'])
      if (need(k) === null) missing.push(k);
  }
  if (missing.length)
    return { allowed: false, notStated: missing,
             reason: 'NOT STATED in this profile: ' + missing.join(', ') +
                     '. The Law leaves these to the competition and none has been assumed.' };

  if (!namedSubstitutes.includes(playerOnId))
    return { allowed: false, reason: 'only a named substitute may take part' };

  if (alreadySubstituted.includes(playerOnId) && !p.returnSubstitutes)
    return { allowed: false,
             reason: 'a substituted player takes no further part in this competition' };

  if (concussion) {
    const used = p.concussionSubstitutionsUsed || 0;
    if (used >= p.concussionSubstitutes)
      return { allowed: false, reason: 'the concussion substitutions for this team are used up' };
    // A concussion substitution is permanent, is additional to the normal allowance, and does
    // not use an opportunity. The opposing team receives an additional substitution and an
    // additional opportunity, which is returned here so a caller cannot forget it.
    return { allowed: true, usesOpportunity: false, countsTowardsAllowance: false,
             opponentGains: { substitutions: 1, opportunities: 1 },
             reason: 'a concussion substitution, additional to the normal allowance' };
  }

  const allowance = p.substitutionsAllowed +
    (inExtraTime && p.extraTimeExtraSubstitution ? 1 : 0);
  if (substitutionsUsed >= allowance)
    return { allowed: false, used: substitutionsUsed, allowance,
             reason: 'the team has used all of its substitutions' };

  // The interval does not spend an opportunity. Nor does a substitution made before extra time
  // or at half time in extra time - all three are intervals, which is why one flag covers them.
  const usesOpportunity = !atInterval;
  const opportunities = p.substitutionOpportunities +
    (inExtraTime && p.extraTimeExtraOpportunity ? 1 : 0);
  if (usesOpportunity && opportunitiesUsed >= opportunities)
    return { allowed: false, opportunitiesUsed, opportunities,
             reason: 'the team has used all of its substitution opportunities' };

  return {
    allowed: true,
    usesOpportunity,
    countsTowardsAllowance: true,
    // Both teams substituting at the same stoppage spends ONE opportunity for each of them, not
    // one between them.
    opportunitySharedWithOpponent: !!simultaneousWithOpponent,
    playerOffId, playerOnId,
    reason: atInterval
      ? 'a substitution at an interval, which does not use an opportunity'
      : 'a substitution during play, which uses one of the opportunities',
  };
}

// Any of the players may change places with the goalkeeper, during a stoppage, with the referee
// told first. Doing it without telling the referee is a caution for both players.
export function goalkeeperChange({ duringStoppage, refereeInformed }){
  const ok = !!duringStoppage && !!refereeInformed;
  return { allowed: ok,
           caution: duringStoppage && !refereeInformed ? ['playerOff', 'playerOn'] : [],
           reason: !duringStoppage ? 'a change of goalkeeper must wait for a stoppage'
                 : !refereeInformed ? 'the referee was not told, so both players are cautioned'
                 : 'a permitted change of goalkeeper' };
}

// ---------------------------------------------------------------------------------- Law 6
//
// THE MATCH OFFICIALS. The duties below are my own one line summaries, not quoted text, and
// they are the duties the Laws give rather than anything a broadcaster or a competition adds.

export const OFFICIAL = {
  REFEREE:            'referee',
  ASSISTANT:          'assistantReferee',
  FOURTH:             'fourthOfficial',
  RESERVE_ASSISTANT:  'reserveAssistantReferee',
  VAR:                'videoAssistantReferee',
  AVAR:               'assistantVideoAssistantReferee',
};

export const OFFICIAL_DUTIES = {
  [OFFICIAL.REFEREE]: [
    'enforces the Laws of the Game',
    'controls the match in cooperation with the other match officials',
    'acts as timekeeper and keeps a record of the match',
    'stops, suspends or abandons the match for any offence or outside interference',
    'takes disciplinary action, and allows play to continue when advantage is on',
    'stops play for a serious injury and allows play to continue for a slight one',
  ],
  [OFFICIAL.ASSISTANT]: [
    'indicates when the whole ball leaves the field, and which team restarts',
    'indicates when a player may be penalised for being in an offside position',
    'indicates when a substitution is requested',
    'at a penalty kick, indicates whether the goalkeeper moves off the goal line before the '
      + 'ball is kicked, and whether the ball crosses the line',
  ],
  [OFFICIAL.FOURTH]: [
    'assists with administrative duties before, during and after the match',
    'supervises the substitution procedure',
    'checks a replacement ball',
    'indicates the minimum additional time the referee intends to play',
    'reports irresponsible behaviour in the technical area to the referee',
  ],
  [OFFICIAL.RESERVE_ASSISTANT]: [
    'has one duty only: to replace an assistant referee or fourth official who cannot continue',
  ],
  [OFFICIAL.VAR]: [
    'assists the referee only for a clear and obvious error or a serious missed incident, and '
      + 'only in the four categories of decision listed below',
  ],
  [OFFICIAL.AVAR]: [
    'assists the video assistant referee, and watches the live play while a check is under way',
  ],
};

// The Law is explicit that only the REFEREE takes the decision, that other officials ADVISE, and
// that the referee's decisions on points of fact connected with play are final.
export const DECISIONS_ARE_THE_REFEREES = true;

// ---------------------------------------------------------------------------------- Law 5
//
// CHANGING A DECISION.
//
// The referee may correct a restart decision on realising it was wrong, or on the advice of
// another official, but only while play has not restarted and the half has not ended with the
// referee off the field.
//
// There is a separate clause that catches people out: at the end of a half, if the referee is
// leaving the field to go to the review area or to send the players back out, an offence that
// happened before the half ended can STILL be sanctioned. The card survives even though the
// restart cannot be changed - so the two questions are answered separately here rather than
// being collapsed into one boolean.

export function mayChangeRestart({ playRestarted, periodEnded: ended, refereeLeftField,
                                   matchTerminated }){
  if (playRestarted)
    return { may: false, reason: 'play has restarted, so the decision stands' };
  if (matchTerminated)
    return { may: false, reason: 'the match has been terminated' };
  if (ended && refereeLeftField)
    return { may: false,
             reason: 'the half ended and the referee has left the field of play' };
  return { may: true, reason: 'play has not restarted, so the decision may still be corrected' };
}

export function mayStillSanction({ periodEnded: ended, refereeLeftField, goingToReviewArea,
                                   recallingPlayers, matchTerminated, offenceBeforeEnd = true }){
  if (matchTerminated)
    return { may: false, reason: 'the match has been terminated' };
  if (!ended) return { may: true, reason: 'the period is still running' };
  if (!offenceBeforeEnd)
    return { may: false, reason: 'the offence did not happen before the end of the period' };
  if (!refereeLeftField)
    return { may: true, reason: 'the referee has not left the field of play' };
  if (goingToReviewArea || recallingPlayers)
    return { may: true,
             reason: 'the referee left the field only to go to the review area or to recall '
                   + 'the players, so an offence before the end may still be sanctioned' };
  return { may: false, reason: 'the referee has left the field of play' };
}

// ---------------------------------------------------------------------------------- the VAR
//
// The video assistant referee may assist with FOUR categories of decision and no others, and
// then only for a clear and obvious error or a serious missed incident:
//
//   1. goal / no goal
//   2. penalty / no penalty
//   3. direct red card - NOT a second caution
//   4. mistaken identity, where the referee cautions or sends off the wrong player
//
// The exclusion of the second caution is the clause most often got wrong, so it is a separate
// branch here and has its own check in the suite. A second yellow card is not reviewable even
// though its consequence - a player sent off - is identical to a red.

export const VAR_CATEGORY = {
  GOAL:     'goalOrNoGoal',
  PENALTY:  'penaltyOrNoPenalty',
  RED_CARD: 'directRedCard',
  IDENTITY: 'mistakenIdentity',
};

const VAR_CATEGORIES = new Set(Object.values(VAR_CATEGORY));

export function varMayReview({ category, secondCaution = false, clearAndObviousError = false,
                               seriousMissedIncident = false, profile }){
  const p = profile || {};
  if (!isStated(p.videoAssistantReferee))
    return { review: false, notStated: ['videoAssistantReferee'],
             reason: 'NOT STATED in this profile: whether this competition operates a video '
                   + 'assistant referee. It is a competition decision, not a Law.' };
  if (!p.videoAssistantReferee)
    return { review: false, reason: 'this competition does not operate a video assistant referee' };
  if (!VAR_CATEGORIES.has(category))
    return { review: false, reason: 'not one of the four reviewable categories' };
  if (category === VAR_CATEGORY.RED_CARD && secondCaution)
    return { review: false,
             reason: 'a second caution is not reviewable, even though the player is sent off' };
  if (!clearAndObviousError && !seriousMissedIncident)
    return { review: false,
             reason: 'reviewable in principle, but there is no clear and obvious error and no '
                   + 'serious missed incident' };
  return { review: true, category,
           initiatedBy: OFFICIAL.REFEREE,
           finalDecisionBy: OFFICIAL.REFEREE,
           reason: seriousMissedIncident ? 'a serious missed incident'
                                         : 'a clear and obvious error' };
}

// Only the referee may start a review and only the referee takes the final decision. A model
// that lets the video official decide is not modelling this competition's referee.
export function reviewOutcome({ initiatedBy, decidedBy, originalDecision, finalDecision }){
  const ok = initiatedBy === OFFICIAL.REFEREE && decidedBy === OFFICIAL.REFEREE;
  return { valid: ok, originalDecision, finalDecision,
           changed: ok && finalDecision !== originalDecision,
           reason: ok ? 'the referee started the review and took the decision'
                      : 'only the referee may start a review and only the referee decides' };
}

// ---------------------------------------------------------------------------------- Law 12
//
// CARDS, as opposed to restarts. laws.js already decides what the RESTART is; this decides what
// the player gets, which is a different question with a different answer for the same offence.
//
// The clause worth writing carefully is the one that replaced what used to be called the triple
// punishment. Where a player commits an offence against an opponent inside their OWN penalty
// area, denies an obvious goal-scoring opportunity, and a penalty kick is awarded, the offender
// is CAUTIONED rather than sent off - unless the offence was holding, pulling or pushing, or the
// offender had no possibility to play the ball, or it is an offence that is a red card wherever
// it happens. So the same tackle is a red card a metre outside the area and a yellow inside it,
// and any implementation that maps offence to card without looking at the location gets this
// wrong in both directions.

export const CARD = { NONE: 'none', YELLOW: 'yellow', RED: 'red' };

// Offences the Law lists as a caution in their own right.
const CAUTIONABLE = new Set(['unsportingBehaviour', 'dissent', 'persistentOffences',
                             'delayingRestart', 'failingToRespectDistance',
                             'enteringOrLeavingWithoutPermission', 'enteringReviewArea',
                             'excessiveReviewSignal']);

// Offences the Law lists as a sending off wherever on the field they happen.
const RED_ANYWHERE = new Set(['seriousFoulPlay', 'violentConduct', 'bite', 'spit',
                              'offensiveLanguage', 'enteringVideoOperationRoom']);

// The three that keep a denied goal-scoring opportunity a red card even inside the area.
const NO_MITIGATION = new Set(['hold', 'pull', 'push']);

export function disciplinaryAction({ offence, secondCaution = false,
                                     deniedGoalScoringOpportunity = false,
                                     stoppedPromisingAttack = false,
                                     handballDeniedGoal = false,
                                     offenderIsGoalkeeperInOwnArea = false,
                                     inOwnPenaltyArea = false, penaltyAwarded = false,
                                     couldPlayTheBall = true, profile }){
  const p = profile || {};

  if (secondCaution)
    return { card: CARD.RED, secondCaution: true,
             reason: 'a second caution in the same match' };

  if (RED_ANYWHERE.has(offence))
    return { card: CARD.RED, reason: 'a sending off offence wherever it happens' };

  // Handling to deny a goal or an obvious goal-scoring opportunity is a red card, except for a
  // goalkeeper inside their own penalty area.
  if (handballDeniedGoal) {
    if (offenderIsGoalkeeperInOwnArea)
      return { card: CARD.NONE,
               reason: 'a goalkeeper handling inside their own penalty area is not sent off '
                     + 'for it, whatever it denied' };
    return { card: CARD.RED,
             reason: 'denying a goal or an obvious goal-scoring opportunity by handling' };
  }

  if (deniedGoalScoringOpportunity) {
    const mitigated = inOwnPenaltyArea && penaltyAwarded
                   && !NO_MITIGATION.has(offence) && couldPlayTheBall;
    if (mitigated)
      return { card: CARD.YELLOW, mitigated: true,
               reason: 'an attempt to play the ball inside their own penalty area, with a '
                     + 'penalty kick awarded, so it is a caution and not a sending off' };
    return { card: CARD.RED,
             reason: inOwnPenaltyArea && penaltyAwarded
               ? (NO_MITIGATION.has(offence)
                   ? 'holding, pulling or pushing carries no mitigation inside the area'
                   : 'there was no possibility of playing the ball')
               : 'denying an obvious goal-scoring opportunity' };
  }

  if (stoppedPromisingAttack) {
    // The mirror of the clause above: inside their own area with a penalty given, stopping a
    // promising attack is not cautioned unless the offence would be cautioned anyway.
    if (inOwnPenaltyArea && penaltyAwarded && !CAUTIONABLE.has(offence))
      return { card: CARD.NONE, mitigated: true,
               reason: 'a penalty kick was awarded, so stopping a promising attack inside their '
                     + 'own area is not cautioned as well' };
    return { card: CARD.YELLOW, reason: 'stopping a promising attack' };
  }

  if (CAUTIONABLE.has(offence))
    return { card: CARD.YELLOW, reason: 'a cautionable offence' };

  // A temporary dismissal - a sin bin - exists in the Laws only for youth, veteran, disability
  // and grassroots football, and only where the competition adopts it. It is never assumed.
  if (offence === 'temporaryDismissal') {
    if (!isStated(p.temporaryDismissals))
      return { card: CARD.NONE, notStated: ['temporaryDismissals'],
               reason: 'NOT STATED in this profile: whether this competition uses temporary '
                     + 'dismissals. The Law permits them only in youth, veteran, disability '
                     + 'and grassroots football.' };
    if (!p.temporaryDismissals)
      return { card: CARD.NONE, reason: 'this competition does not use temporary dismissals' };
    return { card: CARD.YELLOW, temporaryDismissal: true,
             minutes: isStated(p.temporaryDismissalMinutes) ? p.temporaryDismissalMinutes : null,
             reason: 'a temporary dismissal, where the competition uses them' };
  }

  return { card: CARD.NONE,
           reason: 'NOT STATED: this offence carries no card in this model' };
}

// ---------------------------------------------------------------------------------- Law 10
//
// FINDING A WINNER.
//
// The match itself is simple: more goals wins, equal is a draw. Everything after that belongs to
// the competition, and the Law is unusually direct about it - away goals, extra time and kicks
// from the penalty mark are the ONLY permitted procedures for deciding a drawn match or tie.
// Whether any of them applies is a competition decision, so this file refuses to guess.

export const RESULT = { HOME: 'home', AWAY: 'away', DRAW: 'draw',
                        EXTRA_TIME: 'extraTime', KICKS: 'kicksFromThePenaltyMark' };

export function matchResult({ goalsHome, goalsAway }){
  if (goalsHome > goalsAway) return { result: RESULT.HOME, reason: 'the home team scored more' };
  if (goalsAway > goalsHome) return { result: RESULT.AWAY, reason: 'the away team scored more' };
  return { result: RESULT.DRAW, reason: 'the scores are equal, so the match is drawn' };
}

// A drawn match, resolved according to the competition. Everything this function does is driven
// by the profile; with a profile that states nothing, it returns NOT STATED rather than a
// winner, which is the correct answer to "who won" when nobody has said how to decide.
export function decideDrawnMatch({ goalsHome, goalsAway, phase = PERIOD.SECOND_HALF, profile }){
  const p = profile || {};
  const base = matchResult({ goalsHome, goalsAway });
  if (base.result !== RESULT.DRAW) return base;

  if (!isStated(p.drawIsAllowed))
    return { result: null, notStated: ['drawIsAllowed'],
             reason: 'NOT STATED in this profile: whether a drawn match stands. That is in the '
                   + 'competition rules, not in the Laws.' };
  if (p.drawIsAllowed) return { result: RESULT.DRAW, reason: 'a drawn match stands' };

  if (phase === PERIOD.SECOND_HALF) {
    if (!isStated(p.extraTime))
      return { result: null, notStated: ['extraTime'],
               reason: 'NOT STATED in this profile: whether extra time is played' };
    if (p.extraTime) return { result: RESULT.EXTRA_TIME, reason: 'extra time is played' };
  }
  if (!isStated(p.kicksFromThePenaltyMark))
    return { result: null, notStated: ['kicksFromThePenaltyMark'],
             reason: 'NOT STATED in this profile: whether kicks from the penalty mark are taken' };
  if (p.kicksFromThePenaltyMark)
    return { result: RESULT.KICKS, reason: 'kicks from the penalty mark' };
  return { result: null,
           reason: 'NOT STATED: this profile forbids a draw but provides no way to decide it' };
}

// A two legged tie. The away goals rule is a competition decision and, since it was dropped by
// most competitions that used to apply it, defaulting it either way would be wrong. So it is
// NOT STATED unless the profile says.
export function tieResult({ legs, profile }){
  const p = profile || {};
  // legs: [{ home: 'A', away: 'B', goalsHome, goalsAway }, ...] in the order they were played.
  let aggA = 0, aggB = 0, awayA = 0, awayB = 0;
  for (const leg of legs) {
    if (leg.home === 'A') { aggA += leg.goalsHome; aggB += leg.goalsAway; awayB += leg.goalsAway; }
    else                  { aggB += leg.goalsHome; aggA += leg.goalsAway; awayA += leg.goalsAway; }
  }
  if (aggA > aggB) return { winner: 'A', aggregate: [aggA, aggB], by: 'aggregate' };
  if (aggB > aggA) return { winner: 'B', aggregate: [aggA, aggB], by: 'aggregate' };

  if (!isStated(p.awayGoalsRule))
    return { winner: null, aggregate: [aggA, aggB], awayGoals: [awayA, awayB],
             notStated: ['awayGoalsRule'],
             reason: 'NOT STATED in this profile: whether away goals separate a level '
                   + 'aggregate. Most competitions that used the rule have dropped it, so '
                   + 'assuming either way would be inventing a regulation.' };
  if (p.awayGoalsRule) {
    if (awayA > awayB) return { winner: 'A', aggregate: [aggA, aggB], by: 'awayGoals' };
    if (awayB > awayA) return { winner: 'B', aggregate: [aggA, aggB], by: 'awayGoals' };
  }
  const next = decideDrawnMatch({ goalsHome: 0, goalsAway: 0, profile: p });
  return { winner: null, aggregate: [aggA, aggB], awayGoals: [awayA, awayB],
           next: next.result, notStated: next.notStated,
           reason: 'the aggregate is level' + (p.awayGoalsRule ? ' and so are the away goals' : '') };
}

// ---------------------------------------------------------------------------------- Law 10
//
// KICKS FROM THE PENALTY MARK. Written out in full because nearly every part of it is a rule
// that an obvious implementation gets wrong:
//
//   - both teams take FIVE kicks, alternately
//   - they stop early the moment one team has scored more than the other could reach even if it
//     took all of its remaining kicks. This is the rule that ends a shoot out at 3-0 after four
//     kicks each, and code that simply runs all ten misses it
//   - level after five each, it goes on in the same order until one team leads after an EQUAL
//     number of kicks. "Sudden death" is not sudden: the pair has to be completed
//   - only players on the field at the end of play, and those temporarily off it, are eligible
//   - if one team ends with more players than the other, it must REDUCE to the same number
//   - every eligible player must take a kick before any player takes a second
//
// The reduction and the coin toss are choices, not calculations - the model reports what has to
// be chosen and by whom, and refuses to choose. A model that picked the five takers itself would
// be inventing a manager.

export function kicksReduceToEqual({ eligibleA, eligibleB }){
  const a = eligibleA.length, b = eligibleB.length;
  const n = Math.min(a, b);
  return {
    equalNumber: n,
    mustReduce: a === b ? null : (a > b ? 'A' : 'B'),
    removeCount: Math.abs(a - b),
    // DECISION of the team, not of this model: which players are left out is the team's choice
    // and is told to the referee. Nothing here picks them.
    chosenBy: a === b ? null : 'the team, which tells the referee which players are excluded',
    reason: a === b ? 'the teams already have equal numbers'
                    : 'the team with more players reduces to the same number',
  };
}

export function kicksOpen({ firstTeam = 'A', eligibleA = [], eligibleB = [] }){
  return { firstTeam, eligible: { A: eligibleA.slice(), B: eligibleB.slice() },
           kicks: [], scored: { A: 0, B: 0 }, taken: { A: 0, B: 0 } };
}

export function kicksTurn(state){
  const other = state.firstTeam === 'A' ? 'B' : 'A';
  return state.kicks.length % 2 === 0 ? state.firstTeam : other;
}

export function kicksRecord(state, { team, playerId, scored }){
  const status = kicksStatus(state);
  if (status.decided)
    return { ok: false, state, reason: 'the kicks are already decided' };
  const due = kicksTurn(state);
  if (team !== due)
    return { ok: false, state, reason: 'it is ' + due + "'s turn to kick" };
  if (!state.eligible[team].includes(playerId))
    return { ok: false, state,
             reason: 'only a player on the field at the end of the match may take a kick' };
  // Every eligible player takes one before anybody takes a second, which also means the rule
  // applies again for the third round and so on.
  const byPlayer = state.kicks.filter(k => k.team === team && k.playerId === playerId).length;
  const round = Math.floor(state.taken[team] / state.eligible[team].length);
  if (byPlayer > round)
    return { ok: false, state,
             reason: 'every eligible player must take a kick before any player takes another' };

  const next = {
    ...state,
    kicks: state.kicks.concat([{ team, playerId, scored: !!scored }]),
    scored: { ...state.scored, [team]: state.scored[team] + (scored ? 1 : 0) },
    taken:  { ...state.taken,  [team]: state.taken[team] + 1 },
  };
  return { ok: true, state: next, status: kicksStatus(next) };
}

export function kicksStatus(state){
  const { A, B } = state.scored;
  const tA = state.taken.A, tB = state.taken.B;
  const firstFive = tA < 5 || tB < 5;

  if (firstFive) {
    const leftA = Math.max(0, 5 - tA), leftB = Math.max(0, 5 - tB);
    if (A > B + leftB)
      return { decided: true, winner: 'A', scored: { A, B }, taken: { A: tA, B: tB },
               reason: 'B cannot reach A even by scoring all of its remaining kicks' };
    if (B > A + leftA)
      return { decided: true, winner: 'B', scored: { A, B }, taken: { A: tA, B: tB },
               reason: 'A cannot reach B even by scoring all of its remaining kicks' };
    return { decided: false, scored: { A, B }, taken: { A: tA, B: tB },
             reason: 'inside the first five, and still reachable' };
  }
  // Beyond five each. A lead only counts after an equal number of kicks.
  if (tA !== tB)
    return { decided: false, scored: { A, B }, taken: { A: tA, B: tB },
             reason: 'the pair of kicks is not complete' };
  if (A !== B)
    return { decided: true, winner: A > B ? 'A' : 'B', scored: { A, B }, taken: { A: tA, B: tB },
             reason: 'one team leads after an equal number of kicks' };
  return { decided: false, scored: { A, B }, taken: { A: tA, B: tB },
           reason: 'level after an equal number of kicks, so they continue' };
}

// Where everyone stands. The kicker's own goalkeeper waits on the field, outside the penalty
// area, on the goal line where it meets the penalty area boundary. Every other player is in the
// centre circle.
export function kicksPositions({ goalSide = 1, pitch = PITCH }){
  return {
    mark: { x: goalSide * (pitch.halfLength - pitch.penaltyMarkFromGoal), z: 0 },
    defendingKeeperOn: { x: goalSide * pitch.halfLength,
                         zRange: [-pitch.goalHalfWidth, pitch.goalHalfWidth] },
    kickersKeeperAt: { x: goalSide * pitch.halfLength, z: pitch.penaltyAreaHalfWidth },
    everyoneElse: { x: 0, z: 0, inCentreCircle: true },
    // NOT STATED here: which goal is used. The Law has the referee toss a coin for it, and a
    // coin is not a calculation, so the caller supplies goalSide.
    goalChosenBy: 'the referee tosses a coin, unless the ground or safety decides it',
  };
}

export const MATCH_VERSION = 'week 2 - Laws 3, 5, 6, 7, 10 and the cards of Law 12';
