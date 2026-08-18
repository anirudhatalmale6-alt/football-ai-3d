// ==============================================================================================
// test_laws.mjs - the rules layer checked with no browser present
// Copyright (c) AI2ORBIT Co. 2026
//
//   node test_laws.mjs
//
// This file exists for two reasons. The first is the ordinary one: the Laws are fiddly and a
// rule nobody tested is a rule nobody has. The second is the point of the whole exercise - it
// runs under node, with no window, no canvas and no three.js, which is what "the rules layer is
// portable" means when it is a result rather than a promise. If a studio drops their own engine
// underneath this in September, THIS FILE STILL PASSES.
//
// Several checks below deliberately test the OTHER side of a line: level with the second last
// opponent is not offside, a ball on the line is not out, a defender's touch is a corner and an
// attacker's is a goal kick. A rule tested only on the side where it says yes is a rule that
// cannot fail its own test.
// ==============================================================================================

import * as L from './laws.js';

let pass = 0, fail = 0;
const ok  = m => { pass++; console.log('  ok   ' + m); };
const bad = m => { fail++; console.log('  FAIL ' + m); };
const chk = (c, m) => c ? ok(m) : bad(m);
const near = (a, b, tol, m) => chk(Math.abs(a - b) <= tol, m + ' (' + (+a.toFixed(3)) + ')');
const head = t => console.log('\n' + t);

console.log('================================================================');
console.log('test_laws.mjs - the Laws, with no renderer anywhere near them');
console.log('================================================================');
console.log('  ' + L.LAWS_VERSION);

// ------------------------------------------------------------------ the module is really pure
head('  0. it does not need a browser');
chk(typeof globalThis.window === 'undefined', 'there is no window object in this process');
chk(typeof globalThis.document === 'undefined', 'and no document');
chk(typeof L.offsideLine === 'function' && typeof L.foulRestart === 'function',
    'and the rules loaded anyway');

// ------------------------------------------------------------------ Law 1 numbers
head('  1. the pitch numbers are the ones the Laws give');
chk(L.PITCH.goalHalfWidth * 2 === 7.32, 'the goal is 7.32 m between the posts');
chk(L.PITCH.crossbar === 2.44, 'the bar is 2.44 m up');
chk(L.PITCH.penaltyAreaDepth === 16.5 && L.PITCH.penaltyAreaHalfWidth * 2 === 40.3,
    'the penalty area is 16.5 m by 40.3 m');
chk(L.PITCH.goalAreaDepth === 5.5 && L.PITCH.goalAreaHalfWidth * 2 === 18.3,
    'the goal area is 5.5 m by 18.3 m');
chk(L.PITCH.penaltyMarkFromGoal === 11, 'the penalty mark is 11 m out');
chk(L.LAWS.freeKickDistance === 9.15, 'opponents stand 9.15 m off at a free kick');
chk(L.LAWS.droppedBallSeparation === 4, 'and 4 m off at a dropped ball');
chk(L.LAWS.goalkeeperSeconds === 6, 'a keeper gets six seconds');

// ------------------------------------------------------------------ Law 9, in and out
head('  2. Law 9 - the WHOLE ball over the WHOLE line');
const r = L.PITCH.ballRadius;
chk(!L.ballIsOut(0, L.PITCH.halfWidth), 'a ball centred exactly on the touchline is IN');
chk(!L.ballIsOut(0, L.PITCH.halfWidth + r - 0.001), 'and still in when it is nearly clear');
chk(L.ballIsOut(0, L.PITCH.halfWidth + r + 0.001), 'out once the whole ball has passed it');
chk(!L.ballIsOut(L.PITCH.halfLength, 0), 'the same on the goal line');
chk(L.ballIsOut(L.PITCH.halfLength + r + 0.01, 0), 'and the same once it is clear of it');

head('  3. Law 10 - the ball crosses the goal line, worked out by interpolation');
const gc = L.goalCrossing({ x: 51.0, y: 1.0, z: 0.5 }, { x: 54.0, y: 1.0, z: 0.5 });
chk(gc.crossed && gc.goal, 'a shot through the middle at knee height is a goal');
near(gc.z, 0.5, 0.02, 'and the crossing z is carried through');
const wide = L.goalCrossing({ x: 51.0, y: 1.0, z: 3.9 }, { x: 54.0, y: 1.0, z: 3.9 });
chk(wide.crossed && !wide.goal, 'a shot outside the post is not');
const over = L.goalCrossing({ x: 51.0, y: 2.9, z: 0.0 }, { x: 54.0, y: 2.9, z: 0.0 });
chk(over.crossed && !over.goal, 'nor is one over the bar');
const stay = L.goalCrossing({ x: 40.0, y: 1.0, z: 0.0 }, { x: 45.0, y: 1.0, z: 0.0 });
chk(!stay.crossed, 'a ball that never reaches the line does not cross it');
// A ball moving 3 m in one step would be MISSED by a per frame position test. This is the check
// that the interpolation is doing the work rather than luck.
const fast = L.goalCrossing({ x: 51.5, y: 1.0, z: 0.0 }, { x: 58.0, y: 1.0, z: 0.0 });
chk(fast.crossed && fast.goal, 'a ball that jumps 6.5 m in one step is still caught');
chk(fast.t > 0 && fast.t < 1, 'and the crossing happened partway through the step');
// The WHOLE ball. A ball whose centre is past the line but whose back edge is not is still in
// play, and this is the pair of checks that says so - one either side of the ball's radius.
const lip = L.goalCrossing({ x: 52.40, y: 1.0, z: 0.0 }, { x: 52.55, y: 1.0, z: 0.0 });
chk(!lip.crossed, 'a ball resting with its centre past the line has NOT wholly crossed it');
const clear = L.goalCrossing({ x: 52.40, y: 1.0, z: 0.0 }, { x: 52.70, y: 1.0, z: 0.0 });
chk(clear.crossed && clear.goal, 'once the whole ball is past, it is a goal');
// And a ball already behind the line does not score again on the next frame. A per frame
// position test cannot tell these two cases apart; only a crossing test can.
const again = L.goalCrossing({ x: 55.0, y: 1.0, z: 0.0 }, { x: 56.0, y: 1.0, z: 0.0 });
chk(!again.crossed, 'a ball that was ALREADY past the line does not cross it a second time');

// ------------------------------------------------------------------ Law 15/16/17
head('  4. Laws 15, 16 and 17 - what the restart is');
// Team 0 attacks +x, team 1 attacks -x.
const out = (x, z, team, dir) => L.restartForOut({ x, z, lastTouchTeam: team, lastTouchDir: dir });
let d = out(10, 34.5, 0, 1);
chk(d.type === L.RESTART.THROW_IN, 'over the touchline is a throw in');
chk(d.team === 1, 'to the opponents of whoever touched it last');
near(d.x, 10, 0.001, 'taken from where it crossed');
near(d.z, 34, 0.001, 'and placed back on the line');

// Over the +x goal line. Team 0 attacks +x, so team 0 is the ATTACKER there and team 1 defends.
d = out(53.0, 8, 0, 1);
chk(d.type === L.RESTART.GOAL_KICK, 'an attacker put it out over the goal line - goal kick');
chk(d.team === 1, 'to the defending side');
d = out(53.0, 8, 1, -1);
chk(d.type === L.RESTART.CORNER, 'a defender put it out over the same line - corner');
chk(d.team === 0, 'to the attacking side');
chk(Math.abs(d.x) === L.PITCH.halfLength && Math.abs(d.z) === L.PITCH.halfWidth,
    'and the corner is at the corner');
chk(Math.sign(d.z) === 1, 'on the side it went out');
d = out(-53.0, -8, 0, 1);
chk(d.type === L.RESTART.CORNER, 'the mirror image at the other end is a corner too');
chk(Math.sign(d.x) === -1 && Math.sign(d.z) === -1, 'in the right corner of the right end');
chk(out(0, 0, 0, 1).type === null, 'a ball in the middle is not a restart at all');

head('  5. what a goal can be scored from directly');
chk(!L.canScoreDirectly(L.RESTART.THROW_IN), 'not from a throw in');
chk(!L.canScoreDirectly(L.RESTART.INDIRECT), 'not from an indirect free kick');
chk(!L.canScoreDirectly(L.RESTART.DROPPED), 'not from a dropped ball');
chk(L.canScoreDirectly(L.RESTART.CORNER), 'yes from a corner');
chk(L.canScoreDirectly(L.RESTART.GOAL_KICK), 'yes from a goal kick');
chk(L.canScoreDirectly(L.RESTART.DIRECT), 'yes from a direct free kick');

// ------------------------------------------------------------------ Law 11
head('  6. Law 11 - the offside line');
// Attacking +x. Opponents: keeper deep, a defender, and one further up.
const opp = [{ id:'gk', x: 50 }, { id:'d1', x: 30 }, { id:'d2', x: 22 }, { id:'d3', x: 18 }];
let line = L.offsideLine({ opponents: opp, ballX: 10, dir: 1 });
near(line.secondLastProj, 30, 0.001, 'the second last opponent is the one at 30, not the keeper');
near(line.limitProj, 30, 0.001, 'with the ball behind them, the defence sets the line');
// The case the word "both" in the Law exists for: a player past the BALL but behind the
// defence is ONSIDE, and a player past the defence but behind the BALL is onside too.
chk(L.inOffsidePosition({ x: 20, z: 0 }, line).offside === false,
    'a player 10 m past the ball but behind the defence is onside');
line = L.offsideLine({ opponents: opp, ballX: 40, dir: 1 });
near(line.limitProj, 40, 0.001, 'with the ball played from ahead of them, the BALL sets it');
chk(L.inOffsidePosition({ x: 35, z: 0 }, line).offside === false,
    'and a player past the defence but behind the ball is onside');
// The keeper up the pitch: the second last opponent is then an outfielder behind him. This is
// the case that breaks any code written as "the last defender".
const rush = [{ id:'gk', x: 5 }, { id:'d1', x: 30 }, { id:'d2', x: 28 }];
near(L.offsideLine({ opponents: rush, ballX: 40, dir: 1 }).secondLastProj, 28, 0.001,
     'with the keeper upfield the line is the second last of ALL opponents');
// Own half.
const deep = L.offsideLine({ opponents: [{id:'a',x:-40},{id:'b',x:-42}], ballX: -45, dir: 1 });
near(deep.limitProj, 0, 0.001, 'with everybody deep in their own half the line is the halfway');
chk(L.inOffsidePosition({ x: -1, z: 0 }, deep).offside === false,
    'so a player in their OWN half is never offside, however far up the opponents are');
chk(L.inOffsidePosition({ x: 1, z: 0 }, deep).offside === true,
    'a metre into the opponents half, past everyone and past the ball, he is');

head('  7. level is NOT offside');
line = L.offsideLine({ opponents: opp, ballX: 10, dir: 1 });   // the defence sets the line, at 30
chk(L.inOffsidePosition({ x: 30.0, z: 0 }, line).offside === false,
    'exactly level with the second last opponent is onside');
chk(L.inOffsidePosition({ x: 30.001, z: 0 }, line).offside === true,
    'a millimetre past is offside');
chk(L.inOffsidePosition({ x: 29.9, z: 0 }, line).offside === false, 'behind it is onside');
near(L.inOffsidePosition({ x: 31.5, z: 0 }, line).marginM, 1.5, 0.001,
     'and the margin in metres is reported, not just a yes');
// The tolerance hook a competition profile will use in week 2.
const tol = { ...L.LAWS, levelToleranceM: 0.10 };
chk(L.inOffsidePosition({ x: 30.05, z: 0 }, line, tol).offside === false,
    'with a 10 cm tolerance set, 5 cm past is given onside');
chk(L.inOffsidePosition({ x: 30.15, z: 0 }, line, tol).offside === true, 'and 15 cm past is not');

head('  8. offside position is not an offence on its own');
const atk = [{ id:'a1', x: 35, z: 2 }, { id:'a2', x: 20, z: -5 }];
let snap = L.snapshotOffside({ attackers: atk, opponents: opp, ballX: 15, dir: 1 });
chk(snap.flagged.length === 1 && snap.flagged[0].id === 'a1', 'one attacker is flagged');
chk(L.offsideOffence(snap, { touchedBy: 'a2' }).offence === false,
    'the ONSIDE player receiving it is no offence');
chk(L.offsideOffence(snap, { touchedBy: 'a1' }).offence === true,
    'the flagged player receiving it is');
chk(L.offsideOffence(snap, { touchedBy: 'a1' }).kind === 'interfering with play',
    'and the reason given is interfering with play');
chk(L.offsideOffence(snap, { touchedBy: null }).offence === false,
    'a flagged player who never touches it and impacts nobody is no offence');

head('  9. the exemptions');
for (const t of [L.RESTART.THROW_IN, L.RESTART.GOAL_KICK, L.RESTART.CORNER]) {
  const s = L.snapshotOffside({ attackers: atk, opponents: opp, ballX: 15, dir: 1,
                                restartType: t });
  chk(s.flagged.length === 0 && L.offsideOffence(s, { touchedBy: 'a1' }).offence === false,
      'no offside from a ' + t);
}
for (const t of [L.RESTART.DROPPED, L.RESTART.DIRECT, L.RESTART.INDIRECT]) {
  const s = L.snapshotOffside({ attackers: atk, opponents: opp, ballX: 15, dir: 1,
                                restartType: t });
  chk(s.flagged.length === 1, 'but offside DOES apply from a ' + t);
}
chk(L.offsideOffence(snap, { touchedBy: 'a1', fromDeliberateOpponentPlay: true }).offence === false,
    'a defender deliberately playing it to him is no offence');
chk(L.offsideOffence(snap, { touchedBy: 'a1', fromDeliberateOpponentPlay: true,
                             fromSave: true }).offence === true,
    'unless that deliberate play was a save');
chk(L.offsideOffence(snap, { touchedBy: 'a1', fromRebound: true }).kind === 'gaining an advantage',
    'off a post and in is gaining an advantage');

head(' 10. interfering with an opponent, without touching the ball');
chk(L.offsideOffence(snap, { touchedBy: 'a2', blockedVisionOf: 'a1' }).offence === true,
    'a flagged player in the keeper line of sight is an offence');
chk(L.offsideOffence(snap, { touchedBy: 'a2', challengedBy: 'a1' }).kind
      === 'interfering with an opponent', 'so is challenging for it');
chk(L.blocksVision({ player: { x: 40, z: 0 }, keeper: { x: 50, z: 0 }, ball: { x: 20, z: 0 } }),
    'standing between the keeper and the ball blocks the view');
chk(!L.blocksVision({ player: { x: 40, z: 9 }, keeper: { x: 50, z: 0 }, ball: { x: 20, z: 0 } }),
    'standing well to one side does not');
chk(!L.blocksVision({ player: { x: 10, z: 0 }, keeper: { x: 50, z: 0 }, ball: { x: 20, z: 0 } }),
    'and neither does standing BEHIND the ball, which a one ended cone test would get wrong');

// ------------------------------------------------------------------ Law 12/13/14
head(' 11. Law 12 - which restart a foul earns');
const fk = o => L.foulRestart({ offence: o, x: -20, z: 5, offenderDir: 1,
                                offenderIsDefending: true });
chk(fk('trip').type === L.RESTART.DIRECT, 'a trip outside the area is a direct free kick');
chk(fk('handball').type === L.RESTART.DIRECT, 'so is a deliberate handball');
chk(fk('dangerousPlay').type === L.RESTART.INDIRECT, 'dangerous play is indirect');
chk(fk('sixSeconds').type === L.RESTART.INDIRECT, 'so is the six seconds');
chk(fk('backPass').type === L.RESTART.INDIRECT, 'and so is a back pass picked up');
chk(fk('somethingElse').type === null, 'an offence not in the model is NOT STATED, not guessed');

head(' 12. the same foul inside the penalty area');
// Team with dir +1 defends the -x goal, whose area runs from x = -52.5 to x = -36.
const pen = (o, x) => L.foulRestart({ offence: o, x, z: 4, offenderDir: 1,
                                      offenderIsDefending: true });
chk(pen('trip', -40).type === L.RESTART.PENALTY, 'a trip at x -40 is a penalty');
chk(pen('trip', -35.9).type === L.RESTART.DIRECT, 'a trip 10 cm outside the area is not');
chk(pen('dangerousPlay', -40).type === L.RESTART.INDIRECT,
    'an INDIRECT offence in the area stays indirect - it is not a penalty');
chk(L.foulRestart({ offence: 'trip', x: -40, z: 4, offenderDir: 1,
                    offenderIsDefending: false }).type === L.RESTART.DIRECT,
    'an ATTACKER fouling in that same area gives a free kick, not a penalty against himself');
chk(L.foulRestart({ offence: 'trip', x: -40, z: 25, offenderDir: 1,
                    offenderIsDefending: true }).type === L.RESTART.DIRECT,
    'and a foul level with the area but wide of it is a free kick');
near(pen('trip', -40).x, -41.5, 0.001, 'the penalty is taken from the mark, 11 m out');
near(pen('trip', -40).z, 0, 0.001, 'and the mark is central');

head(' 13. Law 13 - the wall');
const w = L.wallFor({ ballX: -30, ballZ: 0, defendDir: 1, count: 4 });
chk(w.positions.length === 4, 'a wall of four is four players');
const dw = Math.hypot(w.positions[0].x + 30, w.positions[0].z - 0);
near(dw, 9.15, 0.35, 'standing about 9.15 m from the ball');
chk(w.positions.every(p => p.x < -30), 'between the ball and the goal being defended');
chk(w.attackerGap === 1, 'and an attacker must stay 1 m off a wall of three or more');
chk(L.wallFor({ ballX: -30, ballZ: 0, defendDir: 1, count: 2 }).attackerGap === 0,
    'a wall of two carries no such requirement');
const enc = L.freeKickLegal({ opponents: [{ id:'x', x: -25, z: 0 }, { id:'y', x: -10, z: 0 }],
                              ballX: -30, ballZ: 0 });
chk(!enc.legal && enc.encroaching.length === 1 && enc.encroaching[0] === 'x',
    'a defender 5 m away is encroaching and is named');
chk(L.freeKickLegal({ opponents: [{ id:'y', x: -10, z: 0 }], ballX: -30, ballZ: 0 }).legal,
    'one 20 m away is not');

head(' 14. Law 14 - the penalty');
const ps = L.penaltySetup({ defendDir: 1 });
near(ps.mark.x, -41.5, 0.001, 'the mark is 11 m from the goal line');
near(Math.abs(ps.keeperLine.x), 52.5, 0.001, 'the keeper stands on the goal line');
// 'c' is the case that separates the three tests from each other: wide of the penalty area, and
// 25 m from the mark so well outside the arc, but standing NEARER the goal than the ball is.
// Without him, deleting the "ahead of the ball" rule changes no answer, because everybody else
// is already caught by one of the other two.
const others = [{ id:'a', x: -30, z: 0 }, { id:'b', x: -40, z: 10 }, { id:'c', x: -45, z: 25 }];
const pl = L.penaltyLegal({ others, defendDir: 1, mark: ps.mark });
chk(!pl.legal, 'this set of positions is not legal');
chk(pl.encroaching.find(e => e.id === 'b' && e.why === 'in the area'),
    'the one standing in the area is named, with the reason');
chk(pl.encroaching.find(e => e.id === 'c' && e.why === 'ahead of the ball'),
    'and the one wide of the area but ahead of the ball is named for THAT reason');
chk(L.penaltyLegal({ others: [{ id:'c', x: -38, z: 25 }], defendDir: 1,
                     mark: ps.mark }).legal,
    'the same player behind the mark and wide of the area is legal');
chk(L.penaltyLegal({ others: [{ id:'a', x: -25, z: 0 }], defendDir: 1, mark: ps.mark }).legal,
    'a player 16 m behind the mark and outside the area is fine');
chk(!L.penaltyLegal({ others: [{ id:'a', x: -34, z: 0 }], defendDir: 1,
                      mark: ps.mark }).legal,
    'one 7.5 m behind it is inside the arc and is not');

// ------------------------------------------------------------------ Law 8
head(' 15. Law 8 - the dropped ball');
const TEAMS = [{ team: 0, dir: 1 }, { team: 1, dir: -1 }];
let db = L.droppedBall({ x: -45, z: 3, lastTouchTeam: 0, teams: TEAMS });
chk(db.toGoalkeeper === true, 'stopped inside a penalty area, it goes to a goalkeeper');
chk(db.team === 0, 'the keeper of the side DEFENDING that area, whoever touched it last');
db = L.droppedBall({ x: 0, z: 3, lastTouchTeam: 1, teams: TEAMS });
chk(db.toGoalkeeper === false && db.team === 1,
    'in midfield it goes to the side that last touched it');
near(db.x, 0, 0.001, 'dropped where play stopped');
chk(db.separation === 4, 'everybody else stands 4 m off');

// ------------------------------------------------------------------ keeper
head(' 16. the goalkeeper');
chk(L.goalkeeperHold(5.9).offence === false, 'holding it 5.9 seconds is allowed');
chk(L.goalkeeperHold(6.0).offence === false, 'six seconds exactly is allowed');
chk(L.goalkeeperHold(6.1).offence === true, 'six and a bit is not');
chk(L.goalkeeperHold(6.1).restart === L.RESTART.INDIRECT, 'and it is an indirect free kick');
chk(L.backPassOffence({ handled: true, lastTouchWasTeamMate: true,
                        deliberateKick: true }).offence === true,
    'picking up a deliberate kick from a team mate is an offence');
chk(L.backPassOffence({ handled: true, lastTouchWasTeamMate: true,
                        deliberateKick: false }).offence === false,
    'but a deflection off a team mate is not');
chk(L.backPassOffence({ handled: true, lastTouchWasTeamMate: false,
                        deliberateKick: true }).offence === false,
    'and a ball kicked by an OPPONENT can always be picked up');
chk(L.backPassOffence({ handled: true, lastTouchWasTeamMate: true,
                        fromThrowIn: true }).offence === true,
    'a throw in from a team mate counts as well');

// ------------------------------------------------------------------ advantage
head(' 17. advantage, which is a decision made across time');
const A = L.advantageOpen(10.0, { offence: 'trip' });
chk(A.resolved === null, 'the referee holds it at first');
chk(L.advantagePoll(A, 11.0, { attackStillOn: true }).resolved === null,
    'one second later it is still being held');
chk(L.advantagePoll(A, 11.0, { foulingTeamHasBall: true }).resolved === 'pullBack',
    'the ball going back to the offending side pulls it back at once');
chk(L.advantagePoll(A, 11.0, { goalScored: true }).resolved === 'played',
    'a goal settles it immediately');
chk(L.advantagePoll(A, 14.5, { attackStillOn: true }).resolved === 'played',
    'after four seconds with the attack alive, play on');
chk(L.advantagePoll(A, 14.5, { attackStillOn: false }).resolved === 'pullBack',
    'after four seconds with it dead, come back for the foul');
chk(L.LAWS.advantageSeconds === 4, 'and that four is declared as a decision, not as a Law');

// ------------------------------------------------------------------ honesty of the module
head(' 18. the decisions are labelled as decisions');
const src = await (await import('node:fs/promises')).readFile('./laws.js', 'utf8');
for (const k of ['levelToleranceM', 'advantageSeconds', 'clearImpactM'])
  chk(new RegExp('DECISION[\\s\\S]{0,400}' + k).test(src),
      k + ' is marked DECISION in the source, beside its reason');
chk(/NOT STATED/.test(src), 'and what could not be sourced says NOT STATED');

console.log('\n================================================================');
console.log('  ' + (pass + fail) + ' checks, ' + pass + ' passed, ' + fail + ' failed');
console.log('================================================================');
process.exit(fail ? 1 : 0);
