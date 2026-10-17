// ==============================================================================================
// profiles.js - the competition profile layer
// Copyright (c) AI2ORBIT Co. 2026
//
// THE POINT OF THIS FILE, IN ONE PARAGRAPH
//
// UEFA, FIFA, the English, Spanish, German, Swedish, Belgian, French, Canadian, Mexican, Latin
// American, Copa and US competitions all play under the SAME Laws of the Game. There is one set,
// published by the IFAB, and none of those bodies writes its own. What differs between them is
// not the Laws, it is the COMPETITION REGULATIONS - how many substitutes may be named, whether
// there is a video assistant referee, what happens when a knockout tie is level. The Laws
// themselves say so, over and over: "competition rules must state...".
//
// So the right seam is not one rules engine per competition. It is one rules engine, and a thin
// profile of the fields the Laws hand to the competition. That is this file. Adding a
// competition adds a profile; it never forks a rule. laws.js and match.js do not know this file
// exists, and nothing here is imported by them.
//
// WHY MOST OF THESE PROFILES ARE MOSTLY EMPTY, AND WHY THAT IS THE HONEST ANSWER
//
// A competition's regulations are a published document that changes every season. I do not have
// those fourteen documents, so I have not typed numbers into them from memory. Every field a
// competition owns and that I cannot source is marked NOT STATED, and reading one gives you the
// words NOT STATED rather than a plausible number.
//
// This is deliberate and it is the most useful thing in the file. A profile that quietly
// defaulted "five substitutes" would be wrong for some of these competitions and nobody would
// ever find out, because the wrong answer looks exactly like the right one. A profile that says
// NOT STATED produces a printable checklist - see `report()` - of precisely which fields have to
// be filled in per competition, and nothing more. Fill one in and it is used everywhere at once.
//
// What IS stated here is what the Laws state, plus what is true by definition of the kind of
// match being played: a league fixture that ends level is a draw, because that is what a league
// fixture means. Nothing else has been assumed.
// ==============================================================================================

import { PITCH, LAWS } from './laws.js';
import { NOT_STATED, isStated, DURATION, TEAM } from './match.js';

export { NOT_STATED, isStated };

// ---------------------------------------------------------------------------------- the fields
//
// Every field this layer knows about, with the one thing that matters most beside it: WHO OWNS
// IT. A field owned by the Law cannot be changed by a competition and an override of one is
// refused. A field owned by the competition has no defensible default at all, which is exactly
// why it is here.
//
// `lawRange` is present where the Law fixes limits the competition must choose inside. Law 1
// gives the pitch a range; Law 3 caps the substitutes that may be named at fifteen and the
// substitution opportunities at three. An override outside those limits is refused rather than
// clamped, because silently clamping a value produces a match played under rules nobody wrote.

export const OWNER = { LAW: 'law', COMPETITION: 'competition' };

export const FIELDS = {
  // ---- Law 1, the field of play. The competition chooses inside the Law's range.
  pitchLengthM:  { owner: OWNER.COMPETITION, lawRange: [90, 120],
                   note: 'Law 1 range. International matches are 100-110 m.' },
  pitchWidthM:   { owner: OWNER.COMPETITION, lawRange: [45, 90],
                   note: 'Law 1 range. International matches are 64-75 m.' },

  // ---- Law 3, the players.
  minimumPlayers:          { owner: OWNER.LAW, note: 'seven, and the competition cannot move it' },
  namedSubstitutes:        { owner: OWNER.COMPETITION, lawRange: [3, 15],
                             note: 'Law 3: the competition must state a number in this range' },
  substitutionsAllowed:    { owner: OWNER.COMPETITION, lawRange: [0, 5],
                             note: 'up to five, except return substitutes in the football the '
                                 + 'Law allows them in' },
  substitutionOpportunities: { owner: OWNER.COMPETITION, lawRange: [0, 3],
                             note: 'Law 3 caps these at three, not counting the intervals' },
  returnSubstitutes:       { owner: OWNER.COMPETITION,
                             note: 'the Law permits these only in youth, veteran, disability '
                                 + 'and grassroots football' },
  extraTimeExtraSubstitution: { owner: OWNER.COMPETITION },
  extraTimeExtraOpportunity:  { owner: OWNER.COMPETITION },
  concussionSubstitutes:   { owner: OWNER.COMPETITION,
                             note: 'permanent, additional, and only where the competition is '
                                 + 'approved to operate the protocol' },

  // ---- Law 6 and the technology, every piece of which is a competition decision.
  videoAssistantReferee:   { owner: OWNER.COMPETITION },
  goalLineTechnology:      { owner: OWNER.COMPETITION },
  semiAutomatedOffside:    { owner: OWNER.COMPETITION },
  levelToleranceM:         { owner: OWNER.COMPETITION,
                             note: 'the Law states no tolerance at all; a competition running '
                                 + 'semi automated offside publishes its own' },
  fourthOfficial:          { owner: OWNER.COMPETITION },
  reserveAssistantReferee: { owner: OWNER.COMPETITION },

  // ---- Law 7, the clock.
  halfMinutes:             { owner: OWNER.COMPETITION, lawRange: [1, 45],
                             note: 'may only be reduced, by agreement before the match' },
  halfTimeIntervalMinutes: { owner: OWNER.COMPETITION, lawRange: [0, 15] },
  drinksBreaks:            { owner: OWNER.COMPETITION },
  coolingBreaks:           { owner: OWNER.COMPETITION },

  // ---- Law 10, finding a winner. None of this is in the Laws.
  drawIsAllowed:           { owner: OWNER.COMPETITION },
  extraTime:               { owner: OWNER.COMPETITION },
  kicksFromThePenaltyMark: { owner: OWNER.COMPETITION },
  awayGoalsRule:           { owner: OWNER.COMPETITION,
                             note: 'most competitions that used it have dropped it, so neither '
                                 + 'answer is a safe default' },
  replayIfDrawn:           { owner: OWNER.COMPETITION },

  // ---- Law 12, discipline beyond the card itself.
  temporaryDismissals:     { owner: OWNER.COMPETITION,
                             note: 'the Law permits sin bins only in youth, veteran, disability '
                                 + 'and grassroots football' },
  temporaryDismissalMinutes: { owner: OWNER.COMPETITION },
  cautionsBeforeSuspension:  { owner: OWNER.COMPETITION,
                             note: 'entirely a competition matter; the Laws say nothing' },
};

// ---------------------------------------------------------------------------------- the base
//
// The IFAB base. Only what the Laws themselves state. Everything a competition owns starts here
// as NOT STATED, and that is the point: this object is the list of questions, not the answers.

export const BASE = Object.freeze({
  id: 'ifab',
  name: 'The Laws of the Game',
  authority: 'IFAB',
  note: 'the Laws every competition below plays under, unchanged',

  minimumPlayers: TEAM.minimumToPlay,
  halfMinutes: DURATION.halfMinutes,
  halfTimeIntervalMinutes: DURATION.halfTimeIntervalMaxMinutes,
  pitchLengthM: PITCH.halfLength * 2,
  pitchWidthM: PITCH.halfWidth * 2,

  // The Law's own default: a substituted player takes no further part.
  returnSubstitutes: false,
  // Sin bins exist in the Laws only for the football listed against the field above.
  temporaryDismissals: false,
  // Zero is the Law. laws.js already marks this a DECISION where it is consumed.
  levelToleranceM: LAWS.levelToleranceM,
  // The Law caps these; it does not set them. The cap is the honest value for the base.
  substitutionOpportunities: 3,

  namedSubstitutes: NOT_STATED,
  substitutionsAllowed: NOT_STATED,
  extraTimeExtraSubstitution: NOT_STATED,
  extraTimeExtraOpportunity: NOT_STATED,
  concussionSubstitutes: NOT_STATED,
  videoAssistantReferee: NOT_STATED,
  goalLineTechnology: NOT_STATED,
  semiAutomatedOffside: NOT_STATED,
  fourthOfficial: NOT_STATED,
  reserveAssistantReferee: NOT_STATED,
  drinksBreaks: NOT_STATED,
  coolingBreaks: NOT_STATED,
  drawIsAllowed: NOT_STATED,
  extraTime: NOT_STATED,
  kicksFromThePenaltyMark: NOT_STATED,
  awayGoalsRule: NOT_STATED,
  replayIfDrawn: NOT_STATED,
  temporaryDismissalMinutes: NOT_STATED,
  cautionsBeforeSuspension: NOT_STATED,
});

// ---------------------------------------------------------------------------------- contexts
//
// The KIND of match, which is a separate axis from the competition running it. The same
// competition plays league fixtures and knockout ties under different resolutions of a draw, so
// putting "extra time" on the competition would be wrong for half its matches.
//
// Only the things that are true BY DEFINITION of the kind of match are stated. A league fixture
// that finishes level is a draw - that is what a league fixture is. What a drawn knockout tie
// does next is a regulation and stays NOT STATED, because competitions genuinely differ: some
// play extra time, some go straight to kicks, some still replay.

export const CONTEXT = {
  leagueFixture: {
    id: 'leagueFixture',
    name: 'a league fixture',
    drawIsAllowed: true,
    extraTime: false,
    kicksFromThePenaltyMark: false,
    awayGoalsRule: false,
    replayIfDrawn: false,
    why: 'a league fixture that ends level is a draw, by definition of a league',
  },
  knockoutSingleLeg: {
    id: 'knockoutSingleLeg',
    name: 'a single leg knockout tie',
    drawIsAllowed: false,
    awayGoalsRule: false,
    why: 'a knockout tie must produce a winner; HOW is a regulation and is left NOT STATED',
  },
  knockoutTwoLeg: {
    id: 'knockoutTwoLeg',
    name: 'a two legged knockout tie',
    drawIsAllowed: false,
    why: 'decided on aggregate; whether away goals separate a level aggregate is NOT STATED',
  },
  // Two fully specified shapes, offered so a competition can point at one the day somebody
  // confirms which it uses. They are shapes, not any competition's published regulations.
  knockoutExtraTimeThenKicks: {
    id: 'knockoutExtraTimeThenKicks',
    name: 'a knockout tie: extra time, then kicks from the penalty mark',
    drawIsAllowed: false, extraTime: true, kicksFromThePenaltyMark: true,
    awayGoalsRule: false, replayIfDrawn: false,
    extraTimeExtraSubstitution: true, extraTimeExtraOpportunity: true,
    why: 'a shape a competition may select, not a claim about any particular competition',
  },
  knockoutKicksOnly: {
    id: 'knockoutKicksOnly',
    name: 'a knockout tie: straight to kicks from the penalty mark',
    drawIsAllowed: false, extraTime: false, kicksFromThePenaltyMark: true,
    awayGoalsRule: false, replayIfDrawn: false,
    why: 'a shape a competition may select, not a claim about any particular competition',
  },
};

// ---------------------------------------------------------------------------------- the list
//
// The thirteen variants asked for, plus the base. Each states its name, the body that runs it
// and the confederation it sits in - facts about the competition, not regulations - and then
// states that it plays under the IFAB Laws, which is the fact that makes this whole layer
// possible.
//
// Every regulation field is inherited as NOT STATED. `report()` prints the list per competition.

const comp = (id, name, body, confederation, extra = {}) =>
  Object.freeze({ id, name, body, confederation, lawsPublishedBy: 'IFAB', ...extra });

export const COMPETITIONS = Object.freeze({
  ifab:          comp('ifab', 'The Laws of the Game', 'IFAB', 'worldwide',
                      { note: 'the base every other profile inherits' }),
  fifa:          comp('fifa', 'FIFA competitions', 'FIFA', 'worldwide',
                      { note: 'international matches: Law 1 narrows the pitch to 100-110 m '
                            + 'by 64-75 m, which is the one regulation the Law itself sets',
                        pitchLengthRangeM: [100, 110], pitchWidthRangeM: [64, 75] }),
  uefa:          comp('uefa', 'UEFA competitions', 'UEFA', 'Europe'),
  english:       comp('english', 'English football', 'The Football Association', 'UEFA'),
  spanish:       comp('spanish', 'Spanish football', 'Real Federacion Espanola de Futbol', 'UEFA'),
  german:        comp('german', 'German football', 'Deutscher Fussball-Bund', 'UEFA'),
  swedish:       comp('swedish', 'Swedish football', 'Svenska Fotbollforbundet', 'UEFA'),
  belgian:       comp('belgian', 'Belgian football', 'Royal Belgian Football Association', 'UEFA'),
  french:        comp('french', 'French football', 'Federation Francaise de Football', 'UEFA'),
  canadian:      comp('canadian', 'Canadian football', 'Canada Soccer', 'CONCACAF'),
  mexican:       comp('mexican', 'Mexican football', 'Federacion Mexicana de Futbol', 'CONCACAF'),
  us:            comp('us', 'United States football', 'United States Soccer Federation',
                      'CONCACAF'),
  latinAmerican: comp('latinAmerican', 'South American club football', 'CONMEBOL',
                      'CONMEBOL'),
  copa:          comp('copa', 'Copa America', 'CONMEBOL', 'CONMEBOL'),
});

// ---------------------------------------------------------------------------------- resolving
//
// BASE, then the context, then the competition, then whatever the caller supplies. Later beats
// earlier, and a NOT STATED value never overwrites a stated one - a profile that says nothing
// must not erase a fact, only fail to add one.
//
// WHY THE COMPETITION BEATS THE CONTEXT, since the opposite order looks just as reasonable.
//
// The context supplies what is true by DEFINITION of the kind of match, which makes it a
// default rather than a regulation. A competition is entitled to contradict that default and
// some have: a league whose drawn fixtures were settled by a shoot out was still a league. So
// the competition's own regulations win, and the caller's overrides win over those, which is
// the escape hatch for a single match that differs from both.
//
// This ordering is not obvious from reading the code, so it has its own check in the suite -
// swapping these two lines changed no answer at all until that check existed.

function layer(into, from){
  for (const [k, v] of Object.entries(from || {})) {
    if (!(k in FIELDS)) continue;              // names, notes and prose are not fields
    if (!isStated(v)) continue;                // NOT STATED adds nothing; it does not erase
    into[k] = v;
  }
  return into;
}

// An override is checked before it is applied, not after. Three ways it is refused: a field
// nobody has heard of, a field the Law owns, and a value outside the range the Law allows.
export function validateOverrides(overrides, competition){
  const errors = [];
  for (const [k, v] of Object.entries(overrides || {})) {
    const f = FIELDS[k];
    if (!f) { errors.push(k + ': no such field'); continue; }
    if (f.owner === OWNER.LAW) {
      errors.push(k + ': owned by the Laws, not by a competition, so it cannot be overridden');
      continue;
    }
    if (!isStated(v)) continue;
    let range = f.lawRange;
    // FIFA's international matches carry a narrower pitch range, and it is the Law that
    // narrows it, so it is enforced here rather than left as a comment.
    if (competition && k === 'pitchLengthM' && competition.pitchLengthRangeM)
      range = competition.pitchLengthRangeM;
    if (competition && k === 'pitchWidthM' && competition.pitchWidthRangeM)
      range = competition.pitchWidthRangeM;
    if (range && typeof v === 'number' && (v < range[0] || v > range[1]))
      errors.push(k + ': ' + v + ' is outside the range the Law allows, ' +
                  range[0] + ' to ' + range[1]);
  }
  return { ok: errors.length === 0, errors };
}

export function resolve({ competition = 'ifab', context = null, overrides = null } = {}){
  const c = typeof competition === 'string' ? COMPETITIONS[competition] : competition;
  if (!c) throw new Error('no such competition profile: ' + competition);
  const ctx = context == null ? null
            : (typeof context === 'string' ? CONTEXT[context] : context);
  if (context != null && !ctx) throw new Error('no such match context: ' + context);

  const check = validateOverrides(overrides, c);
  if (!check.ok) throw new Error('the overrides are not usable: ' + check.errors.join('; '));

  const out = {};
  for (const [k, v] of Object.entries(BASE)) if (k in FIELDS) out[k] = v;
  layer(out, ctx);
  layer(out, c);
  layer(out, overrides);

  const unstated = Object.keys(FIELDS).filter(k => !isStated(out[k])).sort();

  // The half the rest of the engine consumes. `laws` is shaped exactly like LAWS in laws.js so
  // it drops straight into the week 1 functions - which is what "the competitions differ
  // without forking the rules" has to mean in code rather than in a sentence.
  const laws = { ...LAWS, levelToleranceM: isStated(out.levelToleranceM)
                                             ? out.levelToleranceM : LAWS.levelToleranceM };
  const pitch = { ...PITCH,
                  halfLength: isStated(out.pitchLengthM) ? out.pitchLengthM / 2 : PITCH.halfLength,
                  halfWidth:  isStated(out.pitchWidthM)  ? out.pitchWidthM / 2  : PITCH.halfWidth };

  return {
    id: c.id,
    name: c.name,
    body: c.body,
    confederation: c.confederation,
    lawsPublishedBy: 'IFAB',
    context: ctx ? ctx.id : null,
    contextName: ctx ? ctx.name : null,
    ...out,
    laws, pitch,
    unstated,
    stated: Object.keys(FIELDS).filter(k => isStated(out[k])).sort(),
  };
}

// Reading a NOT STATED field by accident is the failure this whole file exists to prevent, and
// a comment does not prevent it. `strict()` wraps a resolved profile so that reading one throws
// with the field's name in the message. Use it in anything that must not run on a guess.
export function strict(resolved){
  return new Proxy(resolved, {
    get(target, key){
      const v = target[key];
      if (typeof key === 'string' && key in FIELDS && !isStated(v))
        throw new Error('"' + key + '" is NOT STATED for the ' + target.name + ' profile. ' +
                        (FIELDS[key].note ? FIELDS[key].note + '. ' : '') +
                        'The Laws leave it to the competition, so it has to come from that ' +
                        "competition's published regulations rather than from a default.");
      return v;
    },
  });
}

// ---------------------------------------------------------------------------------- the report
//
// The printable checklist. This is the artefact the profile layer is actually FOR: hand it to
// whoever holds a competition's regulations and every line is one thing to fill in.

// 64 columns, and third person throughout, which is how every report on this project is set.
const RPT_WIDTH = 64;
function wrapLine(text, indent){
  const pad = ' '.repeat(indent);
  const out = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (!line) { line = word; continue; }
    if ((line + ' ' + word).length + indent > RPT_WIDTH) { out.push(pad + line); line = word; }
    else line += ' ' + word;
  }
  if (line) out.push(pad + line);
  return out;
}

export function report(competitionId = null, contextId = null){
  const ids = competitionId ? [competitionId] : Object.keys(COMPETITIONS);
  const lines = [];
  for (const id of ids) {
    const r = resolve({ competition: id, context: contextId });
    lines.push(...wrapLine(r.name + '  (' + r.body + ', ' + r.confederation + ')' +
                           (r.contextName ? ' - ' + r.contextName : ''), 0));
    lines.push(...wrapLine('plays under: the Laws of the Game, published by IFAB, '
                           + 'unchanged', 2));
    lines.push('  stated here: ' + r.stated.length + ' fields');
    if (r.unstated.length === 0) {
      lines.push('  to be filled in from the published regulations: none');
    } else {
      lines.push('  to be filled in from the published regulations, ' +
                 r.unstated.length + ' fields:');
      for (const k of r.unstated) {
        lines.push('    ' + k);
        if (FIELDS[k].note) lines.push(...wrapLine(FIELDS[k].note, 6));
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

export const PROFILES_VERSION =
  'week 2 - the competition profile layer, ' + Object.keys(COMPETITIONS).length + ' profiles';
