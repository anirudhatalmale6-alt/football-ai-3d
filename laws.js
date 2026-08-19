// ==============================================================================================
// laws.js - the Laws of the Game as plain data and plain functions
// Copyright (c) AI2ORBIT Co. 2026
//
// WHY THIS IS A SEPARATE FILE, WITH NOTHING GRAPHICAL IN IT
//
// If this project is handed to a games studio in September they will bring their own renderer,
// and everything tied to the renderer will be thrown away. What survives a change of engine is
// the rules and the data model. So the rules live here: no three.js, no DOM, no canvas, no
// import of anything at all. This module runs unchanged in a browser, under node, and inside
// somebody else's engine. It is tested under node with no browser present, which is the proof
// that it is portable rather than the claim.
//
// Every function is PURE. It is handed a description of the world and returns a decision. It
// never moves a player, never writes to the screen and never keeps a secret. A referee decision
// that cannot be reproduced from the same inputs is not a rule, it is a mood.
//
// WHERE THE NUMBERS COME FROM, AND WHERE THEY DO NOT
//
// The distances are the Laws of the Game as published by the IFAB: 9.15 m at a free kick and a
// corner, 11 m for the penalty mark, a 9.15 m penalty arc, a 1 m corner arc, 4 m at a dropped
// ball, six seconds for a goalkeeper holding the ball, a 16.5 m by 40.3 m penalty area and a
// 5.5 m by 18.32 m goal area.
//
// The WORDS in the comments are my own summary of each Law and are not quoted text. Where a Law
// leaves something to the referee - "a few seconds" of advantage, what counts as clearly
// impacting an opponent - there is no number to copy, so this file invents one, and every such
// number is marked DECISION with the reason beside it. A decision printed as though it were a
// Law is the commonest way a rules engine misleads the person reading its output.
//
// Anything I could not source is marked NOT STATED rather than guessed at.
// ==============================================================================================

// ---------------------------------------------------------------------------------- geometry
//
// Coordinates. x runs along the length of the pitch, from -halfLength to +halfLength, and the
// halfway line is x = 0. z runs across the width. A team's `dir` is +1 if it attacks +x and -1
// if it attacks -x, so `x * dir` is always "how far towards the goal being attacked", which
// removes every left/right special case from the offside code below.

export const PITCH = {
  halfLength: 52.5,            // 105 m long, the middle of the Law 1 range
  halfWidth: 34,               // 68 m wide
  goalHalfWidth: 3.66,         // 7.32 m between the posts
  crossbar: 2.44,              // 2.44 m to the underside of the bar
  penaltyAreaDepth: 16.5,
  penaltyAreaHalfWidth: 20.15, // 40.3 m across
  goalAreaDepth: 5.5,
  goalAreaHalfWidth: 9.15,     // 18.32 m across
  penaltyMarkFromGoal: 11,
  penaltyArcRadius: 9.15,
  cornerArcRadius: 1,
  ballRadius: 0.11,            // a size 5 ball is 0.22 m across
  lineWidth: 0.12,
};

// The numbers a competition is allowed to move sit here rather than being typed into the code,
// because a profile per competition is the seam that lets UEFA, FIFA and the rest differ from
// each other without any of them forking a rule. Week 2 built that layer: profiles.js resolves
// a competition into an object shaped exactly like this one, and hands it to the functions
// below as their `laws` argument. Nothing in this file knows profiles.js exists, and it must
// stay that way - the moment a rule here branches on a competition name, the seam is gone.
export const LAWS = {
  freeKickDistance: 9.15,
  cornerKickDistance: 9.15,
  droppedBallSeparation: 4,
  wallAttackerGap: 1,          // an attacker must stay 1 m from a wall of three or more
  goalkeeperSeconds: 6,

  // DECISION, not a Law. The Law says a player level with the second last opponent is NOT
  // offside, and states no tolerance. Positions here are point masses, so a strict comparison
  // makes a player offside by a millimetre. Zero is the Law; a competition running semi
  // automated offside publishes its own, and profiles.js sets it without touching this file.
  levelToleranceM: 0,

  // DECISION, not a Law. The Law says the referee allows play to continue for "a few seconds".
  // Four is inside every reading of that phrase I can defend and is not copied from anywhere.
  advantageSeconds: 4,

  // DECISION, not a Law. "Interfering with an opponent" is a judgement in the Law and a
  // distance here. 2 m is close enough to challenge; the vision cone below is the other half.
  clearImpactM: 2.0,
  visionConeDeg: 14,
};

export const RESTART = {
  KICK_OFF:   'kickOff',
  THROW_IN:   'throwIn',
  GOAL_KICK:  'goalKick',
  CORNER:     'cornerKick',
  DIRECT:     'directFreeKick',
  INDIRECT:   'indirectFreeKick',
  PENALTY:    'penaltyKick',
  DROPPED:    'droppedBall',
};

// A goal cannot be scored DIRECTLY from these. From the others it can.
const NO_DIRECT_GOAL = new Set([RESTART.THROW_IN, RESTART.INDIRECT, RESTART.DROPPED]);
export function canScoreDirectly(restartType){ return !NO_DIRECT_GOAL.has(restartType); }

// Law 11: there is no offside offence from these three. Note that a dropped ball and a free
// kick are NOT on the list - offside applies from those.
const NO_OFFSIDE_FROM = new Set([RESTART.THROW_IN, RESTART.GOAL_KICK, RESTART.CORNER]);
export function offsideAppliesFrom(restartType){ return !NO_OFFSIDE_FROM.has(restartType); }

export function inPenaltyArea(x, z, dir, pitch = PITCH){
  // The penalty area DEFENDED by a team whose attacking direction is dir sits at -dir.
  return x * dir <= -(pitch.halfLength - pitch.penaltyAreaDepth)
      && x * dir >= -pitch.halfLength
      && Math.abs(z) <= pitch.penaltyAreaHalfWidth;
}

export function inGoalArea(x, z, dir, pitch = PITCH){
  return x * dir <= -(pitch.halfLength - pitch.goalAreaDepth)
      && x * dir >= -pitch.halfLength
      && Math.abs(z) <= pitch.goalAreaHalfWidth;
}

export function penaltyMark(dir, pitch = PITCH){
  // The mark in front of the goal DEFENDED at -dir.
  return { x: -dir * (pitch.halfLength - pitch.penaltyMarkFromGoal), z: 0 };
}

// ---------------------------------------------------------------------------------- Law 9
//
// BALL IN AND OUT OF PLAY. The ball is out only when the WHOLE of it has passed over the whole
// of the line, on the ground or in the air. The first version of this game tested the CENTRE of
// the ball against the line, which puts the ball out half a ball early and, on a shot along the
// ground beside the post, decides a goal that a referee would not give. The ball's radius is in
// the test now.
//
// STATED ASSUMPTION: halfWidth and halfLength here are taken to the OUTER edge of the line, and
// the line belongs to the field, so the ball is out when its near face has cleared that edge.

export function ballIsOut(x, z, pitch = PITCH){
  const r = pitch.ballRadius;
  return Math.abs(z) - r > pitch.halfWidth || Math.abs(x) - r > pitch.halfLength;
}

// The goal itself. Handed the ball's position before and after a step, this interpolates the
// crossing rather than sampling it, so the answer does not depend on the frame rate. The whole
// ball must pass over the whole line, so the crossing plane is the far side of the ball.
export function goalCrossing(prev, now, pitch = PITCH){
  const r = pitch.ballRadius;
  for (const s of [-1, 1]) {
    const plane = s * (pitch.halfLength + r);      // whole ball over the whole line
    const wasBefore = (prev.x - plane) * s < 0;
    const isAfter   = (now.x  - plane) * s >= 0;
    if (!(wasBefore && isAfter)) continue;
    const dx = now.x - prev.x;
    const t  = Math.abs(dx) < 1e-9 ? 0 : (plane - prev.x) / dx;
    const z  = prev.z + (now.z - prev.z) * t;
    const y  = prev.y + (now.y - prev.y) * t;
    // The posts and the bar are the INSIDE edges of the goal, so the ball is in when its centre
    // is inside them by less than its own radius on either side.
    const inside = Math.abs(z) < pitch.goalHalfWidth - r && y < pitch.crossbar - r && y >= 0;
    return { crossed: true, side: s, z, y, t, goal: inside };
  }
  return { crossed: false, goal: false };
}

// ---------------------------------------------------------------------------------- Law 15/16/17
//
// WHAT THE RESTART IS WHEN THE BALL LEAVES THE FIELD.
//
//   over a touchline                    throw in to the opponents of the last touch
//   over a goal line, last touched by
//     an attacker                       goal kick
//     a defender                        corner kick
//
// "Attacker" and "defender" are relative to the goal line it went over, not to who is winning.

export function restartForOut({ x, z, lastTouchTeam, lastTouchDir, pitch = PITCH }){
  const r = pitch.ballRadius;
  if (Math.abs(z) - r > pitch.halfWidth) {
    const side = Math.sign(z) || 1;
    return {
      type: RESTART.THROW_IN,
      team: lastTouchTeam === null || lastTouchTeam === undefined ? 0 : 1 - lastTouchTeam,
      // Taken from the point it crossed, so the x is kept and the z is put back on the line.
      x: Math.max(-pitch.halfLength, Math.min(pitch.halfLength, x)),
      z: side * pitch.halfWidth,
      reason: 'the whole ball passed over the touchline',
    };
  }
  if (Math.abs(x) - r > pitch.halfLength) {
    const side = Math.sign(x) || 1;            // which goal line it went over
    // The team that DEFENDS this line is the one whose dir points away from it.
    const defendingTeamAttacksAway = -side;
    const lastTouchWasDefender = lastTouchDir === defendingTeamAttacksAway;
    if (lastTouchWasDefender) {
      return {
        type: RESTART.CORNER,
        team: lastTouchTeam === null || lastTouchTeam === undefined ? 0 : 1 - lastTouchTeam,
        x: side * pitch.halfLength,
        z: (Math.sign(z) || 1) * pitch.halfWidth,
        reason: 'the whole ball passed over the goal line, last touched by a defender',
      };
    }
    return {
      type: RESTART.GOAL_KICK,
      team: lastTouchTeam === null || lastTouchTeam === undefined ? 0 : 1 - lastTouchTeam,
      // Anywhere in the goal area. The centre of it is a defensible default and is a DECISION.
      x: side * (pitch.halfLength - pitch.goalAreaDepth * 0.5),
      z: 0,
      reason: 'the whole ball passed over the goal line, last touched by an attacker',
    };
  }
  return { type: null, reason: 'the ball is still in play' };
}

// The corner arc: the ball is placed inside a quarter circle of 1 m at the corner flag.
export function cornerSpot(sideX, sideZ, pitch = PITCH){
  return { x: sideX * (pitch.halfLength - 0.12), z: sideZ * (pitch.halfWidth - 0.12) };
}

// ---------------------------------------------------------------------------------- Law 11
//
// OFFSIDE, AS A DECISION IN THREE PARTS, WHICH IS HOW IT IS ACTUALLY REFEREED
//
//   1. POSITION, frozen at the moment a team mate PLAYS the ball, never when it arrives. A
//      player is in an offside position if any part of the head, body or feet is in the
//      opponents' half AND nearer to the opponents' goal line than BOTH the ball AND the
//      second last opponent. Level with either is NOT offside. The arms and hands do not count,
//      which this model cannot represent - see NOT STATED below.
//
//   2. INVOLVEMENT, judged when the ball is next played. Being in an offside position is not an
//      offence. It becomes one only by interfering with play, interfering with an opponent, or
//      gaining an advantage from a rebound or a deliberate save.
//
//   3. THE AWARD: an indirect free kick where the offence happened, including in the offending
//      player's own half.
//
// NOT STATED: this model carries one point per player, so it cannot tell a shoulder from a hand
// and it cannot apply the "only the parts that can score" clause. Every offside decision below
// is therefore taken on the player's CENTRE, and the margin in metres is returned beside every
// verdict so a caller can see how close the call was rather than being handed a bare yes.

export function offsideLine({ opponents, ballX, dir, pitch = PITCH, laws = LAWS }){
  // Every opponent still on the field, measured towards the goal being attacked.
  const proj = opponents.filter(o => o.on !== false).map(o => o.x * dir).sort((a, b) => b - a);
  // "The second last opponent" counts the goalkeeper. A keeper who has come out is the reason
  // this must never be written as "the last defender".
  const secondLast = proj.length >= 2 ? proj[1]
                   : proj.length === 1 ? proj[0]
                   : -pitch.halfLength;
  const ballProj = ballX * dir;
  // Beyond ALL THREE: the ball, the second last opponent, and the halfway line. "Beyond all
  // three" is the LARGEST of them, not the smallest.
  //
  // The first version of this line wrote Math.min, and every check that only asked "is a player
  // 35 m up the pitch offside" still passed, because with the minimum the line collapsed onto
  // the halfway line and nearly everybody in the opponents' half came back offside. It was the
  // check for the player who is past the ball but BEHIND the defence - onside, and the whole
  // point of the word "both" in the Law - that failed. A rule tested only where it says yes is
  // a rule that cannot fail its own test.
  const limit = Math.max(secondLast, ballProj, 0);
  return { limitProj: limit, secondLastProj: secondLast, ballProj, dir,
           x: limit * dir, tolerance: laws.levelToleranceM };
}

export function inOffsidePosition(player, line, laws = LAWS){
  const proj = player.x * line.dir;
  const margin = proj - line.limitProj;          // positive means beyond the line
  return { offside: margin > laws.levelToleranceM, marginM: +margin.toFixed(4),
           beyondBall: proj > line.ballProj, beyondSecondLast: proj > line.secondLastProj,
           inOpponentHalf: proj > 0 };
}

// Step 1: freeze the picture at the moment the ball is played.
export function snapshotOffside({ attackers, opponents, ballX, dir, restartType,
                                  pitch = PITCH, laws = LAWS }){
  const applies = offsideAppliesFrom(restartType || null);
  const line = offsideLine({ opponents, ballX, dir, pitch, laws });
  const flagged = [];
  if (applies) {
    for (const a of attackers) {
      if (a.on === false) continue;
      const v = inOffsidePosition(a, line, laws);
      if (v.offside) flagged.push({ id: a.id, marginM: v.marginM, x: a.x, z: a.z });
    }
  }
  return { line, flagged, applies, restartType: restartType || null,
           flaggedIds: new Set(flagged.map(f => f.id)) };
}

// Step 2: when the ball is next played, was one of those players involved?
//
// `contact` describes what happened: who touched it, whether the touch came off a post, the bar,
// an opponent or a deliberate save, and whether an opponent was deliberately playing the ball.
export function offsideOffence(snapshot, contact, laws = LAWS){
  const none = { offence: false };
  if (!snapshot || !snapshot.applies || snapshot.flagged.length === 0) return none;

  const flagged = snapshot.flagged.find(f => f.id === contact.touchedBy);

  // A player who receives the ball directly from an opponent who DELIBERATELY played it is not
  // committing an offence - unless that deliberate play was a save. This is the clause that
  // stops a defender's clearance putting his own opponent offside.
  if (contact.fromDeliberateOpponentPlay && !contact.fromSave)
    return { offence: false, reason: 'received from an opponent who deliberately played it' };

  if (flagged) {
    if (contact.fromRebound || contact.fromSave)
      return { offence: true, kind: 'gaining an advantage', id: flagged.id,
               marginM: flagged.marginM,
               reason: contact.fromSave ? 'played the ball after a deliberate save'
                                        : 'played the ball after a rebound' };
    return { offence: true, kind: 'interfering with play', id: flagged.id,
             marginM: flagged.marginM, reason: 'played or touched the ball' };
  }

  // Interfering with an OPPONENT, without touching the ball at all. Two tests, both stated as
  // decisions above: standing in the goalkeeper's line of sight, or close enough to an opponent
  // who is trying to play it that the opponent is clearly impacted.
  for (const f of snapshot.flagged) {
    if (contact.blockedVisionOf && contact.blockedVisionOf === f.id)
      return { offence: true, kind: 'interfering with an opponent', id: f.id,
               marginM: f.marginM, reason: 'obstructed the line of vision' };
    if (contact.challengedBy && contact.challengedBy === f.id)
      return { offence: true, kind: 'interfering with an opponent', id: f.id,
               marginM: f.marginM, reason: 'challenged an opponent for the ball' };
  }
  return none;
}

// Is a player standing in the keeper's line of sight to the ball? Cone test, both ends checked:
// the player must be BETWEEN the keeper and the ball, not merely in the same direction.
export function blocksVision({ player, keeper, ball, laws = LAWS }){
  const kx = ball.x - keeper.x, kz = ball.z - keeper.z;
  const px = player.x - keeper.x, pz = player.z - keeper.z;
  const kl = Math.hypot(kx, kz), pl = Math.hypot(px, pz);
  if (kl < 1e-6 || pl < 1e-6) return false;
  if (pl > kl) return false;                                  // behind the ball, not in the way
  const cos = (kx * px + kz * pz) / (kl * pl);
  const ang = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
  return ang <= laws.visionConeDeg;
}

// ---------------------------------------------------------------------------------- Law 12
//
// FOULS. The Law splits them by what the restart is, not by how bad they look.
//
//   DIRECT free kick: charging, jumping at, kicking, pushing, striking, tackling or challenging,
//                     tripping, holding, impeding WITH contact, biting, spitting, throwing
//                     something at the ball, and handling the ball deliberately.
//   INDIRECT free kick: playing dangerously, impeding WITHOUT contact, dissent, holding the ball
//                     more than six seconds as goalkeeper, handling after a deliberate kick or
//                     throw in from a team mate, and a second touch at a restart.
//
// A direct free kick offence by a defender INSIDE their own penalty area is a penalty kick. An
// indirect free kick offence inside it stays an indirect free kick.

const DIRECT_OFFENCES = new Set(['charge','jump','kick','push','strike','tackle','trip','hold',
                                 'impedeContact','handball','throwObject','bite','spit']);
const INDIRECT_OFFENCES = new Set(['dangerousPlay','impedeNoContact','dissent','sixSeconds',
                                   'backPass','secondTouch','offside','goalkeeperRelease']);

export function offenceIsDirect(offence){ return DIRECT_OFFENCES.has(offence); }
export function offenceIsIndirect(offence){ return INDIRECT_OFFENCES.has(offence); }

export function foulRestart({ offence, x, z, offenderDir, offenderIsDefending,
                              pitch = PITCH }){
  const known = DIRECT_OFFENCES.has(offence) || INDIRECT_OFFENCES.has(offence);
  if (!known) return { type: null, reason: 'NOT STATED: no such offence in this model' };

  if (INDIRECT_OFFENCES.has(offence))
    return { type: RESTART.INDIRECT, x, z, offence,
             reason: 'an indirect free kick offence, wherever it happened' };

  // A direct free kick offence by a player defending, inside the area they defend.
  if (offenderIsDefending && inPenaltyArea(x, z, offenderDir, pitch)) {
    const mark = penaltyMark(offenderDir, pitch);
    return { type: RESTART.PENALTY, x: mark.x, z: mark.z, offence,
             reason: 'a direct free kick offence by a defender inside their own penalty area' };
  }
  return { type: RESTART.DIRECT, x, z, offence,
           reason: 'a direct free kick offence outside the penalty area' };
}

// ---------------------------------------------------------------------------------- advantage
//
// The referee lets play run if the team that was fouled keeps the ball and a promising attack
// is on. If the advantage does not come off within a few seconds, the original offence is
// brought back. This is a small state machine because the decision is made across time and not
// at a single instant, and writing it as a pure step keeps it testable with no clock.

export function advantageOpen(t, foul){ return { openedAt: t, foul, resolved: null }; }

export function advantagePoll(adv, t, world, laws = LAWS){
  if (!adv || adv.resolved) return adv;
  const elapsed = t - adv.openedAt;
  if (world.foulingTeamHasBall)
    return { ...adv, resolved: 'pullBack',
             reason: 'the ball went back to the offending side, so there was no advantage' };
  if (world.goalScored)
    return { ...adv, resolved: 'played', reason: 'the attack ended in a goal' };
  if (elapsed >= laws.advantageSeconds)
    return { ...adv, resolved: world.attackStillOn ? 'played' : 'pullBack',
             reason: world.attackStillOn ? 'the advantage came off'
                                         : 'the advantage did not come off in time' };
  return adv;                                     // still being held
}

// ---------------------------------------------------------------------------------- Law 13
//
// FREE KICKS. Opponents stay 9.15 m away until the ball is in play, which is when it is kicked
// and clearly moves. From an INDIRECT free kick a goal cannot be scored until a second player
// touches the ball; if it goes straight in, the restart is a goal kick, or a corner if it goes
// into the kicker's own goal.
//
// The wall. Where a wall of three or more defenders is formed, every attacker must stay at least
// 1 m from it until the ball is in play.

export function wallFor({ ballX, ballZ, defendDir, count, pitch = PITCH, laws = LAWS }){
  const goalX = -defendDir * pitch.halfLength;
  let dx = goalX - ballX, dz = 0 - ballZ;
  const d = Math.hypot(dx, dz) || 1;
  dx /= d; dz /= d;
  const cx = ballX + dx * laws.freeKickDistance;
  const cz = ballZ + dz * laws.freeKickDistance;
  const px = -dz, pz = dx;                        // across the line of the kick
  const out = [];
  const spacing = 0.55;                           // shoulder to shoulder
  for (let i = 0; i < count; i++) {
    const off = (i - (count - 1) / 2) * spacing;
    out.push({ x: cx + px * off, z: cz + pz * off });
  }
  return { positions: out, distance: laws.freeKickDistance,
           attackerGap: count >= 3 ? laws.wallAttackerGap : 0 };
}

export function freeKickLegal({ opponents, ballX, ballZ, laws = LAWS }){
  const tooClose = opponents.filter(o => o.on !== false &&
    Math.hypot(o.x - ballX, o.z - ballZ) < laws.freeKickDistance - 1e-9);
  return { legal: tooClose.length === 0, encroaching: tooClose.map(o => o.id),
           required: laws.freeKickDistance };
}

// ---------------------------------------------------------------------------------- Law 14
//
// THE PENALTY KICK. The ball is on the mark. The kicker is identified. The defending goalkeeper
// stays on the goal line, facing the kicker, with at least part of one foot touching or in line
// with it, until the ball is kicked. Everybody else is on the field, outside the penalty area,
// behind the penalty mark, and at least 9.15 m from it - which is exactly what the arc is for.

export function penaltySetup({ defendDir, pitch = PITCH, laws = LAWS }){
  const mark = penaltyMark(defendDir, pitch);
  const goalX = -defendDir * pitch.halfLength;
  return {
    mark,
    keeperLine: { x: goalX, zRange: [-pitch.goalHalfWidth, pitch.goalHalfWidth] },
    // "Behind the ball" means further from the goal being attacked than the mark is.
    behindMarkX: mark.x,
    minimumFromMark: laws.penaltyArcRadius || pitch.penaltyArcRadius,
    // Behind the ball, which is away from the goal being attacked, so towards +defendDir.
    kickerRunUpFrom: { x: mark.x + defendDir * 3, z: 0 },
  };
}

export function penaltyLegal({ others, defendDir, mark, pitch = PITCH }){
  const bad = [];
  for (const p of others) {
    if (p.on === false) continue;
    if (inPenaltyArea(p.x, p.z, defendDir, pitch)) { bad.push({ id: p.id, why: 'in the area' }); continue; }
    if (Math.hypot(p.x - mark.x, p.z - mark.z) < pitch.penaltyArcRadius - 1e-9) {
      bad.push({ id: p.id, why: 'inside the arc' }); continue;
    }
    // Behind the mark: nearer the halfway line than the mark is to the goal being attacked.
    const towardsGoal = (p.x - mark.x) * -defendDir;
    if (towardsGoal > 1e-9) bad.push({ id: p.id, why: 'ahead of the ball' });
  }
  return { legal: bad.length === 0, encroaching: bad };
}

// ---------------------------------------------------------------------------------- Law 8
//
// THE DROPPED BALL. Play restarts with a dropped ball when the referee stops play for a reason
// that is not an offence. Who it is dropped for is decided by WHERE, not by who deserves it:
//
//   the ball was in the penalty area, or play stopped there   -> dropped for the defending
//                                                                goalkeeper
//   anywhere else                                             -> dropped for one player of the
//                                                                team that last touched it, at
//                                                                the place it last touched a
//                                                                player, an outside agent or
//                                                                the ground
//
// Every other player stays 4 m away until the ball is in play, which is when it touches the
// ground. There is no offside exemption at a dropped ball: offside applies.

export function droppedBall({ x, z, lastTouchTeam, lastTouchDir, teams, pitch = PITCH,
                              laws = LAWS }){
  for (const t of (teams || [])) {
    if (inPenaltyArea(x, z, t.dir, pitch)) {
      return { type: RESTART.DROPPED, team: t.team, toGoalkeeper: true,
               x, z, separation: laws.droppedBallSeparation,
               reason: 'play stopped inside a penalty area, so it is dropped for that keeper' };
    }
  }
  return { type: RESTART.DROPPED,
           team: lastTouchTeam === null || lastTouchTeam === undefined ? 0 : lastTouchTeam,
           toGoalkeeper: false, x, z, separation: laws.droppedBallSeparation,
           reason: 'dropped for the team that last touched it, where it last touched' };
}

// ---------------------------------------------------------------------------------- Law 12
//
// THE GOALKEEPER'S SIX SECONDS, and the back pass. A keeper may not control the ball with the
// hands for more than six seconds, and may not handle it at all after a team mate has
// deliberately kicked it to them or thrown it in to them. Both are indirect free kicks.

export function goalkeeperHold(seconds, laws = LAWS){
  return { offence: seconds > laws.goalkeeperSeconds,
           restart: seconds > laws.goalkeeperSeconds ? RESTART.INDIRECT : null,
           allowed: laws.goalkeeperSeconds, held: +seconds.toFixed(2) };
}

export function backPassOffence({ handled, lastTouchWasTeamMate, deliberateKick, fromThrowIn }){
  const offence = !!handled && !!lastTouchWasTeamMate && (!!deliberateKick || !!fromThrowIn);
  return { offence, restart: offence ? RESTART.INDIRECT : null,
           reason: offence ? 'the keeper handled a deliberate kick or throw in from a team mate'
                           : 'not a back pass offence' };
}

// ---------------------------------------------------------------------------------- summary
//
// A one line description of every restart, used by the on screen referee and by the tests, so
// the words the player reads and the words a check asserts on are the same string.

export const RESTART_TEXT = {
  [RESTART.KICK_OFF]:  'KICK OFF',
  [RESTART.THROW_IN]:  'THROW IN',
  [RESTART.GOAL_KICK]: 'GOAL KICK',
  [RESTART.CORNER]:    'CORNER',
  [RESTART.DIRECT]:    'FREE KICK',
  [RESTART.INDIRECT]:  'INDIRECT FREE KICK',
  [RESTART.PENALTY]:   'PENALTY',
  [RESTART.DROPPED]:   'DROPPED BALL',
};

export const LAWS_VERSION = 'week 1 - Laws 8, 9, 11, 12, 13, 14, 15, 16, 17';
// match.js carries the LAWS the MATCH is governed by (3, 5, 6, 7, 10 and the cards of 12) and
// profiles.js carries what each competition is allowed to change. Neither is imported here.
