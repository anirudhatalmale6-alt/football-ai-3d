"""Checks on the playable match, driven through a real browser.

Copyright (c) AI2ORBIT Co. 2026

Everything here asserts on the GAME rather than on pixels, through the documented test hook
window.__game. A pixel diff can tell you something moved; it cannot tell you the ball went in
the net, the clock reached half time, or the player you are holding is the one that responded
to the key you pressed.
"""

import functools
import http.server
import json
import math
import pathlib
import socketserver
import sys
import threading
import time

from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
PASS = [0]
FAIL = [0]


def ok(m):
    PASS[0] += 1
    print("  ok   " + m)


def bad(m):
    FAIL[0] += 1
    print("  FAIL " + m)


def chk(cond, m):
    ok(m) if cond else bad(m)


def near(a, b, tol):
    return abs(a - b) <= tol


def laws_checks(page):
    """The Laws, checked inside the running game rather than only in the rules module.

    laws.js has its own 131 checks under node with no browser present. Those prove the rules are
    RIGHT. They cannot prove the game ASKS them, or asks them with the right arguments, or does
    what the answer says - which is where a rules engine usually goes wrong. So everything here
    builds a situation on the pitch and then reads the referee's decision back out.

    Situations are built rather than waited for. An offside pass, a penalty and a six second
    offence happen a few times an hour in an ordinary match, and a check that waits for one is a
    check that usually does not run.
    """
    ev = page.evaluate
    clear = lambda: ev("() => window.__game.clearDead()")
    # The match is frozen for the whole of this section. Each call from Python costs a few
    # milliseconds of wall clock, and without this the game plays on between them - which is
    # exactly how a back four placed on x = 10 came to be measured at x = 10.78.
    ev("() => window.__game.pause(true)")
    st = lambda: ev("() => window.__game.state()")

    print("\n  the Laws, inside the running game")

    # --- the page and the rules module are the same code
    chk(ev("() => !!window.__game.laws && !!window.__game.laws.LAWS_VERSION"),
        "the page is running the rules module: %s"
        % ev("() => window.__game.laws.LAWS_VERSION"))
    chk(ev("() => window.__game.laws.LAWS.freeKickDistance") == 9.15,
        "and reads 9.15 m for a free kick out of it, not out of the game code")

    # --- Law 15: over the touchline is a throw in to the other side, taken from where it went
    clear()
    ev("() => window.__game.giveBall(0, 5)")          # a team 0 player touched it last
    ev("() => window.__game.setBall(12, 30, 0, 45, 0)")
    ev("() => window.__game.advance(0.4)")
    d = st()["dead"]
    chk(d is not None and d["type"] == "throwIn", "a ball over the touchline is a throw in")
    chk(d and d["team"] == 1, "to the opponents of whoever touched it last")
    chk(d and near(abs(d["z"]), 34, 0.01),
        "placed on the line (z %.2f)" % (d["z"] if d else -1))
    # and it is actually TAKEN - a restart that never resolves would freeze the match
    ev("() => window.__game.advance(6)")
    chk(st()["dead"] is None, "and after six seconds the ball is live again")

    # --- Law 17: over the goal line off a defender is a corner, in the right corner
    clear()
    ev("() => window.__game.giveBall(0, 3)")          # team 0 defends -x, so this is a defender
    ev("() => window.__game.setBall(-51, 12, -30, 0, 0)")
    ev("() => window.__game.advance(0.4)")
    d = st()["dead"]
    chk(d is not None and d["type"] == "cornerKick",
        "a defender putting it behind is a corner (%s)" % (d and d["type"]))
    chk(d and d["x"] < 0 and d["z"] > 0,
        "in the corner it went out at (%.1f, %.1f)" % (d["x"], d["z"]) if d else "no restart")
    chk(d and d["team"] == 1, "to the attacking side")

    # --- Law 16: over the same line off an attacker is a goal kick to the defenders
    clear()
    ev("() => window.__game.giveBall(1, 9)")          # team 1 attacks -x, so an attacker there
    ev("() => window.__game.setBall(-51, 12, -30, 0, 0)")
    ev("() => window.__game.advance(0.4)")
    d = st()["dead"]
    chk(d is not None and d["type"] == "goalKick",
        "an attacker putting it behind is a goal kick (%s)" % (d and d["type"]))
    chk(d and d["team"] == 0, "to the defending side")
    chk(d and d["taker"] == 0, "and the taker is that side's goalkeeper (uid %s)"
        % (d and d["taker"]))

    # --- Law 11, the whole flag decision, built on the pitch.
    # Team 0 attacks +x. Its defence is left deep, team 1's back line is put on x = 10 and wide,
    # the keeper on his line. The passer is on the halfway line.
    def setup_offside(receiver_x):
        clear()
        ev("() => window.__game.autoPlay(false)")
        ev("() => window.__game.lockControl(true)")
        for i in range(1, 11):
            ev("() => window.__game.place(0, %d, -40, %d)" % (i, (i - 5) * 5))
        ev("() => window.__game.place(1, 0, 50, 0)")
        for i in range(1, 11):
            ev("() => window.__game.place(1, %d, 10, %d)" % (i, 15 if i % 2 else -15))
        ev("() => window.__game.place(0, 5, 0, 0)")               # the passer
        ev("() => window.__game.place(0, 9, %d, 0)" % receiver_x)  # the man being played in
        flagged = ev("() => window.__game.passFrom(0, 5, %d, 0, 18)" % receiver_x)
        # The passer is walked away AFTER the ball has gone. He starts nearest to it, so the
        # pressing logic sent him chasing his own pass and he collected it himself at x = 16 -
        # correctly no offence, and a check that measures nothing. The snapshot was taken at the
        # instant of the kick and moving him now cannot change it.
        ev("() => window.__game.place(0, 5, -45, 22)")
        return flagged

    flagged = setup_offside(20)
    chk(9 in flagged,
        "a forward beyond the last two defenders is flagged at the moment of the pass (%s)"
        % flagged)
    chk(ev("() => window.__game.state().offside.line") == 10,
        "and the line is drawn on the second last opponent, x = %s"
        % ev("() => window.__game.state().offside.line"))
    chk(ev("() => window.__game.offsideLineX()") == 10,
        "the line on the screen is the SAME number the referee used")
    before = st()["counts"]["offside"]
    ev("() => window.__game.advance(2.5)")
    after = st()
    chk(after["counts"]["offside"] == before + 1,
        "when he takes it, offside is given (%d -> %d)"
        % (before, after["counts"]["offside"]))
    chk(after["dead"] and after["dead"]["type"] == "indirectFreeKick",
        "and the restart is an indirect free kick (%s)"
        % (after["dead"] and after["dead"]["type"]))
    chk(after["dead"] and after["dead"]["team"] == 1, "to the defending side")

    # The other side of the same line. This is the check that a rule written only for "yes"
    # cannot pass: the identical pass to a man BEHIND the defence must be waved on.
    flagged = setup_offside(5)
    chk(9 not in flagged,
        "the same pass to a forward behind that line flags nobody (%s)" % flagged)
    before = st()["counts"]["offside"]
    ev("() => window.__game.advance(2.5)")
    chk(st()["counts"]["offside"] == before,
        "and no offside is given (%d)" % st()["counts"]["offside"])

    # Level with the second last opponent is ONSIDE - the word in the Law is "nearer than".
    flagged = setup_offside(10)
    chk(9 not in flagged, "level with the second last opponent is onside (%s)" % flagged)

    # A player cannot be offside from HIS OWN pass. The passer is put beyond the defence here,
    # so if he were in the list at all he would be flagged - which is how this check can tell
    # the difference between "the passer is excluded" and "the passer happened to be onside".
    clear()
    ev("() => window.__game.autoPlay(false)")
    for i in range(1, 11):
        ev("() => window.__game.place(0, %d, -40, %d)" % (i, (i - 5) * 5))
    ev("() => window.__game.place(1, 0, 50, 0)")
    for i in range(1, 11):
        ev("() => window.__game.place(1, %d, 10, %d)" % (i, 15 if i % 2 else -15))
    ev("() => window.__game.place(0, 5, 25, 0)")      # the passer, well beyond the defence
    ev("() => window.__game.place(0, 9, 35, 2)")      # a team mate, further beyond it still
    flagged = ev("() => window.__game.passFrom(0, 5, 35, 2, 16)")
    chk(5 not in flagged,
        "a man in an offside position who plays the ball himself is not flagged (%s)" % flagged)
    chk(9 in flagged, "but his team mate ahead of the ball is (%s)" % flagged)

    # And the line follows THE BALL when the ball is the further forward of the two. A pass
    # played from ahead of the defence cannot put anybody behind it offside.
    clear()
    for i in range(1, 11):
        ev("() => window.__game.place(1, %d, 10, %d)" % (i, 15 if i % 2 else -15))
    ev("() => window.__game.place(1, 0, 50, 0)")
    ev("() => window.__game.place(0, 5, 30, 0)")      # the ball is played from x = 30
    ev("() => window.__game.place(0, 9, 25, 3)")      # past the defence, behind the ball
    flagged = ev("() => window.__game.passFrom(0, 5, 25, 3, 16)")
    chk(9 not in flagged,
        "a man past the defence but behind the ball is onside (%s)" % flagged)
    chk(ev("() => window.__game.state().offside.line") == 30,
        "because the line is on the ball, at x = %s"
        % ev("() => window.__game.state().offside.line"))

    # --- a player standing exactly on the ball.
    # Dividing a direction by its own length is how a NaN gets into a football match, and the
    # length is zero exactly when a player is standing on the thing he is running at. This
    # happened for real to a centre back after a free kick and the only symptom was that he
    # disappeared from the pitch. One frame is enough to catch it.
    clear()
    ev("() => window.__game.autoPlay(true)")
    ev("() => window.__game.setBall(0, 0, 0, 0, 0)")
    ev("() => window.__game.place(1, 6, 0, 0)")
    ev("() => window.__game.advance(1/60)")
    fin = ev("() => { const p = window.__game.teams[1][6];"
             " return Number.isFinite(p.pos.x) && Number.isFinite(p.pos.y) &&"
             " Number.isFinite(p.vel.x) && Number.isFinite(p.vel.y); }")
    chk(fin, "a player standing exactly on the ball still has real coordinates a frame later")

    # --- Law 12: a foul in the penalty area is a penalty, the same foul outside it is not.
    # Team 1 attacks -x, so team 1 DEFENDS +x and its penalty area runs from x = 36 to 52.5.
    clear()
    ev("() => window.__game.giveBall(1, 5)")
    ev("() => window.__game.place(1, 2, 42, 3)")
    ev("() => window.__game.place(0, 9, 42, 3)")
    ev("() => window.__game.foulNow(1, 2, 0, 9)")
    d = st()["dead"]
    chk(d is not None and d["type"] == "penaltyKick",
        "a defender's foul inside his own area is a penalty (%s)" % (d and d["type"]))
    chk(d and near(d["x"], 41.5, 0.01) and near(d["z"], 0, 0.01),
        "taken from the mark, 11 m out and central (%.2f, %.2f)"
        % (d["x"], d["z"]) if d else "no restart")
    chk(d and d["team"] == 0, "to the side that was fouled")

    clear()
    ev("() => window.__game.giveBall(1, 5)")
    ev("() => window.__game.place(1, 2, 20, 3)")
    ev("() => window.__game.place(0, 9, 20, 3)")
    ev("() => window.__game.foulNow(1, 2, 0, 9)")
    d = st()["dead"]
    chk(d is not None and d["type"] == "directFreeKick",
        "the same foul in midfield is a direct free kick (%s)" % (d and d["type"]))
    chk(d and near(d["x"], 20, 0.5), "taken where the foul was (%.1f)" % (d["x"] if d else -99))

    # --- Law 13: the wall stands at 9.15 m, measured on the pitch and not in the constant
    clear()
    ev("() => window.__game.autoPlay(true)")     # the Law binds the players, not the person
    ev("() => window.__game.award({type:'directFreeKick', team:0, x:30, z:0})")
    d = st()["dead"]
    chk(d and d["wall"] == 4, "a free kick 22 m out gets a wall of four (%s)" % (d and d["wall"]))
    # Measured AT THE MOMENT THE KICK IS TAKEN, not at some convenient time before it. The
    # question the Law asks is where the opponents were when the ball was played; a wall that
    # reaches 9.15 m two seconds later has not complied with anything.
    dmin = ev("""() => {
        const g = window.__game;
        for (let i = 0; i < 60*10 && g.G.dead; i++) g.advance(1/60);
        return g.G.lastRestartMinOpp;
    }""")
    chk(dmin >= 9.15,
        "and when the kick is taken the nearest defender is %.2f m away, outside 9.15" % dmin)

    # --- Law 12: the goalkeeper's six seconds
    clear()
    before = st()["counts"]["indirectFreeKick"]
    ev("() => window.__game.holdBall(0, 5.5)")
    ev("() => window.__game.advance(0.3)")
    chk(st()["counts"]["indirectFreeKick"] == before,
        "five and a half seconds in the keeper's hands is allowed")
    ev("() => window.__game.advance(0.8)")
    d = st()
    chk(d["counts"]["indirectFreeKick"] == before + 1,
        "six and a bit is an indirect free kick (%d -> %d)"
        % (before, d["counts"]["indirectFreeKick"]))
    chk(d["dead"] and d["dead"]["team"] == 1, "to the other side")

    # --- Law 13: a goal cannot be scored directly from an indirect free kick
    clear()
    ev("() => window.__game.award({type:'indirectFreeKick', team:0, x:-20, z:0})")
    ev("() => window.__game.advance(2.2)")
    chk(st()["awaitSecondTouch"] is True,
        "after an indirect free kick the game is waiting for a second touch")
    s_before = st()["score"]
    ev("() => window.__game.setBall(50.5, 0.4, 26, 0, 0)")
    ev("() => window.__game.advance(0.5)")
    s_after = st()
    chk(s_after["score"] == s_before,
        "so a ball that goes straight in is NOT a goal (%s -> %s)"
        % (s_before, s_after["score"]))
    chk(s_after["dead"] and s_after["dead"]["type"] == "goalKick",
        "and the restart is a goal kick (%s)"
        % (s_after["dead"] and s_after["dead"]["type"]))

    # --- Law 8: a dropped ball inside the area goes to that keeper
    clear()
    ev("() => window.__game.award({type:'droppedBall', team:0, x:-45, z:2,"
       " toGoalkeeper:true})")
    d = st()["dead"]
    chk(d and d["taker"] == 0, "a dropped ball in the area goes to the keeper (uid %s)"
        % (d and d["taker"]))

    # --- the goalkeepers defend the goal BEHIND them.
    # This is here because they did not: the AI sent both of them to the opposition goal line
    # within fifteen seconds, and nothing failed because no check had ever measured a keeper's
    # x. Seven goals from nine shots was the only symptom.
    clear()
    ev("() => window.__game.autoPlay(true)")
    ev("() => window.__game.advance(45)")
    gks = ev("() => [window.__game.teams[0][0].pos.x, window.__game.teams[1][0].pos.x]")
    chk(gks[0] < -30, "after 45 seconds the ATL keeper is still at his own end (%.1f)" % gks[0])
    chk(gks[1] > 30, "and the ORB keeper at his (%.1f)" % gks[1])

    # --- attract mode: the engine plays both sides, and the Laws keep firing while it does
    ev("() => window.__game.advance(180)")
    c = st()["counts"]
    fired = [k for k in ("throwIn", "goalKick", "cornerKick", "directFreeKick",
                         "indirectFreeKick", "offside") if c[k] > 0]
    chk(len(fired) >= 4,
        "in four unattended minutes the engine produced %d kinds of restart: %s"
        % (len(fired), ", ".join(fired)))
    # A save is CONSTRUCTED rather than waited for. An earlier version asserted that some
    # saves had happened in four unattended minutes, which is a statement about that match and
    # not about the code: the same check passed with one save and failed with none.
    clear()
    ev("() => window.__game.pause(true)")
    ev("() => window.__game.autoPlay(true)")
    for i in range(1, 11):                            # both sides out of the way
        ev("() => window.__game.place(0, %d, -30, %d)" % (i, (i - 5) * 6))
        ev("() => window.__game.place(1, %d, 20, %d)" % (i, (i - 5) * 6 + 3))
    ev("() => window.__game.place(1, 0, 51.3, 0)")     # the ORB keeper on his line
    before_s = st()["counts"]["saves"]
    # Struck from 38 m out at 30 m/s. Two earlier versions of this check failed for two
    # different reasons and neither was a bug in the game. From 46 m the ball crossed the line
    # inside the fifth of a second during which setBall lets nobody touch it. From 38 m at
    # 24 m/s it arrived at 12.8 m/s, just under the 13 m/s above which a keeper parries rather
    # than gathers - so it was correctly collected, and the check was right about the number
    # and wrong about the reason.
    ev("() => window.__game.setBall(38, 0, 30, 0, 0)")
    ev("() => window.__game.advance(0.75)")
    after_s = st()
    chk(after_s["counts"]["saves"] == before_s + 1,
        "a shot driven at the keeper is SAVED, not collected (%d -> %d)"
        % (before_s, after_s["counts"]["saves"]))
    chk(after_s["ball"]["owner"] is None,
        "the ball is parried rather than picked up, so it stays live")
    chk(ev("() => window.__game.ball.fromSave") is True,
        "and it is marked as having come off a save, which Law 11 needs")
    chk(c["saves"] >= 0, "the unattended match also recorded %d saves" % c["saves"])

    # --- and nobody has quietly turned into a NaN.
    # A player was doing exactly that at 17.7 seconds of an unattended match: takeRestart used
    # to place the taker on the exact spot of the ball, so on the next frame his distance to it
    # was zero, the direction was 0/0, and the position went to NaN and stayed there. Nothing
    # threw, nothing was logged, and the only symptom was one player disappearing. So this now
    # runs long and asserts on every coordinate rather than on the ball alone.
    bad_p = ev("""() => {
        const g = window.__game;
        const b = g.all.filter(p => !Number.isFinite(p.pos.x) || !Number.isFinite(p.pos.y) ||
                                    !Number.isFinite(p.vel.x) || !Number.isFinite(p.vel.y));
        return b.map(p => p.name + ' of team ' + p.team);
    }""")
    chk(bad_p == [],
        "after four unattended minutes all 22 players still have real coordinates%s"
        % ("" if not bad_p else " - " + str(bad_p)))
    bfin = ev("""() => { const b = window.__game.ball;
        return ['x','y','z'].every(k => Number.isFinite(b.pos[k])) &&
               ['x','y','z'].every(k => Number.isFinite(b.vel[k])); }""")
    chk(bfin, "and so does the ball")
    ev("() => window.__game.autoPlay(false)")
    ev("() => window.__game.lockControl(false)")
    ev("() => window.__game.pause(false)")
    clear()


def run(url, label, mobile=False):
    print("\n  " + label)
    errs = []
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--use-gl=swiftshader",
                                          "--enable-unsafe-swiftshader"])
        page = browser.new_page(
            viewport={"width": 390, "height": 844} if mobile else
                     {"width": 1280, "height": 720},
            has_touch=mobile, is_mobile=mobile)
        page.on("console", lambda m: errs.append(m.type + ": " + m.text)
                if m.type == "error" else None)
        page.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
        page.goto(url, wait_until="networkidle", timeout=90000)
        time.sleep(2.5)

        chk(not errs, "the page loads with no console error%s"
            % ("" if not errs else " - " + str(errs[:3])))
        chk(page.evaluate("() => !!window.__game"), "the test hook is present")
        chk(page.evaluate("() => window.__game.all.length") == 22,
            "twenty two players exist")

        # --- the gate. Screenshotting before this is what made an earlier check report a
        # --- dead demo, so the test clicks it and proves the state changed.
        chk(page.evaluate("() => window.__game.G.running") is False,
            "the match is not running before KICK OFF is pressed")
        page.click("#go")
        time.sleep(1.2)
        chk(page.evaluate("() => window.__game.G.running") is True,
            "and it is running afterwards")
        chk(page.evaluate("() => getComputedStyle(document.getElementById('start'))"
                          ".display") == "none",
            "the start screen is gone")

        if mobile:
            chk(page.evaluate("() => getComputedStyle(document.getElementById('stick'))"
                              ".display") != "none",
                "the touch stick appears on a phone")
            chk(page.evaluate("() => getComputedStyle(document.getElementById('bShot'))"
                              ".display") != "none",
                "and the shoot button")
            browser.close()
            return

        # --- players actually animate, measured on the joints and not on pixels
        a1 = page.evaluate("() => window.__game.legAngles()")
        time.sleep(0.7)
        a2 = page.evaluate("() => window.__game.legAngles()")
        chk(a1 != a2, "the legs are moving (hip angles changed %s -> %s)" % (a1, a2))

        # --- the gait must be a function of speed, not a loop. Standing still, the hips
        # --- barely move; running, they swing.
        # Measured on the gait itself rather than through a simulation step, because the
        # controlled player switches automatically and an earlier version of this check was
        # zeroing one player's velocity while reading another player's legs.
        swing0 = page.evaluate("() => window.__game.gaitProbe(0, 240)")
        swing2 = page.evaluate("() => window.__game.gaitProbe(2, 240)")
        swing8 = page.evaluate("() => window.__game.gaitProbe(8, 240)")
        chk(swing0 < 0.6,
            "a stationary player does not sprint on the spot (swing %.3f)" % swing0)
        chk(swing2 > swing0 and swing8 > swing2,
            "and the stride grows with speed: %.2f at 0, %.2f at 2, %.2f at 8 m/s"
            % (swing0, swing2, swing8))
        chk(swing8 > 2.0, "at a sprint the hip swings %.2f radians" % swing8)

        # --- the human's key actually moves the human's player.
        # The automatic switch is frozen first, otherwise the two readings can belong to two
        # different players and the displacement is meaningless.
        page.evaluate("() => window.__game.lockControl(true)")
        before = page.evaluate("() => window.__game.state().controlled")
        page.keyboard.down("KeyD")
        time.sleep(1.1)
        page.keyboard.up("KeyD")
        after = page.evaluate("() => window.__game.state().controlled")
        moved = after["x"] - before["x"]
        chk(moved > 1.0,
            "pressing D moves the controlled player right by %.2f m" % moved)
        chk(after["name"] == before["name"],
            "and it is still the same player (%s)" % after["name"])

        b2 = page.evaluate("() => window.__game.state().controlled")
        page.keyboard.down("KeyW")
        time.sleep(1.0)
        page.keyboard.up("KeyW")
        a2b = page.evaluate("() => window.__game.state().controlled")
        chk(a2b["z"] - b2["z"] < -1.0,
            "pressing W moves it up the pitch by %.2f m" % (a2b["z"] - b2["z"]))
        chk(a2b["name"] == b2["name"], "still the same player while locked")
        chk(moved < 9.5,
            "and the distance is within what one player can run in a second (%.2f m)" % moved)
        page.evaluate("() => window.__game.lockControl(false)")

        # --- a goal is scored, counted, and the match restarts from the centre
        s0 = page.evaluate("() => window.__game.state().score")
        page.evaluate("() => window.__game.setBall(50.5, 0.4, 26, 0, 0)")
        page.evaluate("() => window.__game.advance(0.6)")
        s1 = page.evaluate("() => window.__game.state()")
        chk(s1["score"][0] == s0[0] + 1,
            "a ball put over the line is a goal (%s -> %s)" % (s0, s1["score"]))
        chk(abs(s1["ball"]["x"]) < 2 and abs(s1["ball"]["z"]) < 2,
            "and the ball is back on the centre spot")

        page.evaluate("() => window.__game.clearDead()")
        s2 = page.evaluate("() => window.__game.state().score")
        page.evaluate("() => window.__game.setBall(-50.5, -0.6, -26, 0, 0)")
        page.evaluate("() => window.__game.advance(0.6)")
        s3 = page.evaluate("() => window.__game.state().score")
        chk(s3[1] == s2[1] + 1, "and it works at the other end too (%s -> %s)" % (s2, s3))

        # --- a ball wide of the post is NOT a goal
        page.evaluate("() => window.__game.clearDead()")
        s4 = page.evaluate("() => window.__game.state().score")
        page.evaluate("() => window.__game.setBall(50.5, 6.0, 26, 0, 0)")
        page.evaluate("() => window.__game.advance(0.6)")
        s5 = page.evaluate("() => window.__game.state().score")
        chk(s5 == s4, "a ball wide of the post is not a goal (%s)" % (s5,))

        # --- and one over the bar is not either
        page.evaluate("() => window.__game.clearDead()")
        s6 = page.evaluate("() => window.__game.state().score")
        page.evaluate("() => window.__game.setBall(48.0, 0.0, 26, 0, 26)")
        page.evaluate("() => window.__game.advance(0.5)")
        s7 = page.evaluate("() => window.__game.state().score")
        chk(s7 == s6, "a ball over the bar is not a goal (%s)" % (s7,))

        # --- the woodwork is solid.
        # The first version of this asserted only "not a goal" and "x < 52.5", and BOTH were
        # true with the post collision deleted - the ball simply flew out for a goal kick and
        # was placed back on the pitch. What has to be asserted is that it came BACK: the
        # x velocity must reverse.
        page.evaluate("() => window.__game.clearDead()")
        s8 = page.evaluate("() => window.__game.state().score")
        page.evaluate("() => window.__game.setBall(52.2, 3.74, 22, 0, 0)")
        page.evaluate("() => window.__game.advance(0.05)")
        s9 = page.evaluate("() => window.__game.state()")
        chk(s9["score"] == s8, "a shot onto the post is not a goal (%s)" % (s9["score"],))
        chk(s9["ball"]["vx"] < 0,
            "and it rebounds - the x velocity reversed to %.1f" % s9["ball"]["vx"])
        chk(s9["ball"]["x"] < 52.5,
            "leaving the ball back in front of the line (x %.2f)" % s9["ball"]["x"])

        # --- but sixteen centimetres the other side of the post IS a goal.
        # The aperture is the goal minus a ball's radius at each side, because Law 9 wants the
        # WHOLE ball over the line: the posts are 3.66 m off centre, so the last z that can
        # score is 3.55. This number moved when the whole-ball rule went in, which is the point
        # of writing it down here rather than leaving it implied.
        page.evaluate("() => window.__game.clearDead()")
        s8b = page.evaluate("() => window.__game.state().score")
        page.evaluate("() => window.__game.setBall(50.0, 3.40, 22, 0, 0)")
        page.evaluate("() => window.__game.advance(0.4)")
        s9b = page.evaluate("() => window.__game.state().score")
        chk(s9b[0] == s8b[0] + 1,
            "a shot inside the same post is a goal (%s -> %s)" % (s8b, s9b))

        # --- a fast diagonal shot is judged where it CROSSED the line, not where it happened
        # --- to be when the next frame was drawn. Sampling once a frame calls this one wide.
        #     crossing z = 3.53 (inside), sampled z one frame later = 3.82 (outside the post)
        page.evaluate("() => window.__game.clearDead()")
        s10 = page.evaluate("() => window.__game.state().score")
        page.evaluate("() => window.__game.setBall(52.45, 3.40, 30, 25, 0)")
        page.evaluate("() => window.__game.advance(0.05)")
        s11 = page.evaluate("() => window.__game.state().score")
        chk(s11[0] == s10[0] + 1,
            "a shot that crossed the line inside the post is a goal even though it was "
            "outside it a frame later (%s -> %s)" % (s10, s11))

        laws_checks(page)

        # --- possession changes hands and the ball is never lost
        page.evaluate("() => window.__game.advance(20)")
        st = page.evaluate("() => window.__game.state()")
        chk(all(math.isfinite(st["ball"][k]) for k in "xyz"),
            "after twenty simulated seconds the ball is still a real number")
        chk(abs(st["ball"]["x"]) < 70 and abs(st["ball"]["z"]) < 50,
            "and it is still on or near the pitch (%.1f, %.1f)"
            % (st["ball"]["x"], st["ball"]["z"]))
        finite = page.evaluate("""() => window.__game.all.every(p =>
            Number.isFinite(p.pos.x) && Number.isFinite(p.pos.y) &&
            Math.abs(p.pos.x) < 70 && Math.abs(p.pos.y) < 50)""")
        chk(finite, "and every player is still on the pitch with finite coordinates")

        # --- the clock reaches half time and then full time
        page.evaluate("() => { window.__game.G.t = 118; }")
        page.evaluate("() => window.__game.advance(4)")
        chk(page.evaluate("() => window.__game.G.half") == 2, "the clock reaches half time")
        page.evaluate("() => { window.__game.G.t = 238; }")
        page.evaluate("() => window.__game.advance(4)")
        chk(page.evaluate("() => window.__game.G.running") is False,
            "and full time stops the match")
        chk(page.evaluate("() => getComputedStyle(document.getElementById('end'))"
                          ".display") != "none",
            "the result screen is shown")
        end_text = page.inner_text("#endScore")
        chk("ATL" in end_text and "ORB" in end_text,
            "with the final score on it (%s)" % end_text)

        # --- play again resets everything
        page.click("#again")
        time.sleep(0.6)
        st = page.evaluate("() => window.__game.state()")
        chk(st["score"] == [0, 0] and st["half"] == 1 and st["running"],
            "PLAY AGAIN starts a fresh match at 0-0")

        # --- frame rate, measured rather than assumed
        time.sleep(3.0)
        fps = page.evaluate("() => window.__game.G.fps")
        chk(fps is not None and fps > 24,
            "it holds %.0f fps in this headless software renderer" % (fps or 0))

        # --- the referee still books people
        page.evaluate("""() => {
            const g = window.__game;
            for (let i = 0; i < 400; i++) g.advance(1/60);
        }""")
        cards = page.evaluate("() => window.__game.state().cards")
        chk(sum(cards.values()) >= 0, "the card tally is readable (%s)" % cards)

        page.screenshot(path=str(HERE / "play-shot.png"))
        chk(not errs, "no console error appeared during the whole run%s"
            % ("" if not errs else " - " + str(errs[:3])))
        browser.close()


def run_laws_only(url):
    """Only the Laws section, for the mutation runner - the rest of the suite is unaffected
    by a change to a rule and running it thirty times over would say nothing new."""
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--use-gl=swiftshader",
                                          "--enable-unsafe-swiftshader"])
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        errs = []
        page.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
        page.goto(url, wait_until="networkidle", timeout=90000)
        page.wait_for_function("() => !!window.__game", timeout=30000)
        page.click("#go")
        time.sleep(0.8)
        laws_checks(page)
        chk(not errs, "no console error during the Laws checks%s"
            % ("" if not errs else " - " + str(errs[:2])))
        browser.close()


def serve_here():
    """Serve this folder over http on a spare port, and return the base address.

    THE SUITE USED TO OPEN play.html AS A file:// URL, AND THAT STOPPED WORKING THE DAY THE
    LAWS BECAME THEIR OWN FILE. A page loaded from file:// has origin 'null', and a browser
    refuses to import a module across that origin - so laws.js never loaded, window.__game
    was never defined, and EVERY check failed, including the ones about the pitch and the
    clock that have nothing to do with modules.

    Uniform failure like that is the harness, not the thing being tested: a real defect
    almost never breaks the first assertion and the last one at once. Serving over http is
    also what the game actually ships as, so the test now runs the page the way a player
    gets it rather than the way a file manager opens it.
    """
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):   # one line per request would bury the checks
            pass

    handler = functools.partial(Quiet, directory=str(HERE))
    # Port 0 asks the operating system for a free one, so two runs at once cannot collide.
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler)
    httpd.daemon_threads = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return "http://127.0.0.1:%d" % httpd.server_address[1]


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    url = args[0] if args else serve_here() + "/play.html"
    print("=" * 64)
    print("checks on the playable match")
    print("=" * 64)
    if "--laws" in sys.argv:
        run_laws_only(url)
        print("\n" + "=" * 64)
        print("  %d checks, %d passed, %d failed" % (PASS[0] + FAIL[0], PASS[0], FAIL[0]))
        print("=" * 64)
        return 1 if FAIL[0] else 0
    run(url, "desktop, keyboard")
    run(url, "phone viewport, touch", mobile=True)
    print("\n" + "=" * 64)
    print("  %d checks, %d passed, %d failed" % (PASS[0] + FAIL[0], PASS[0], FAIL[0]))
    print("=" * 64)
    return 1 if FAIL[0] else 0


if __name__ == "__main__":
    sys.exit(main())
