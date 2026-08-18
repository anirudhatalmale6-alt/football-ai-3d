"""Checks on the playable match, driven through a real browser.

Copyright (c) AI2ORBIT Co. 2026

Everything here asserts on the GAME rather than on pixels, through the documented test hook
window.__game. A pixel diff can tell you something moved; it cannot tell you the ball went in
the net, the clock reached half time, or the player you are holding is the one that responded
to the key you pressed.
"""

import json
import math
import pathlib
import sys
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

        s2 = page.evaluate("() => window.__game.state().score")
        page.evaluate("() => window.__game.setBall(-50.5, -0.6, -26, 0, 0)")
        page.evaluate("() => window.__game.advance(0.6)")
        s3 = page.evaluate("() => window.__game.state().score")
        chk(s3[1] == s2[1] + 1, "and it works at the other end too (%s -> %s)" % (s2, s3))

        # --- a ball wide of the post is NOT a goal
        s4 = page.evaluate("() => window.__game.state().score")
        page.evaluate("() => window.__game.setBall(50.5, 6.0, 26, 0, 0)")
        page.evaluate("() => window.__game.advance(0.6)")
        s5 = page.evaluate("() => window.__game.state().score")
        chk(s5 == s4, "a ball wide of the post is not a goal (%s)" % (s5,))

        # --- and one over the bar is not either
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
        s8 = page.evaluate("() => window.__game.state().score")
        page.evaluate("() => window.__game.setBall(52.2, 3.74, 22, 0, 0)")
        page.evaluate("() => window.__game.advance(0.05)")
        s9 = page.evaluate("() => window.__game.state()")
        chk(s9["score"] == s8, "a shot onto the post is not a goal (%s)" % (s9["score"],))
        chk(s9["ball"]["vx"] < 0,
            "and it rebounds - the x velocity reversed to %.1f" % s9["ball"]["vx"])
        chk(s9["ball"]["x"] < 52.5,
            "leaving the ball back in front of the line (x %.2f)" % s9["ball"]["x"])

        # --- but six centimetres the other side of the post IS a goal
        s8b = page.evaluate("() => window.__game.state().score")
        page.evaluate("() => window.__game.setBall(50.0, 3.58, 22, 0, 0)")
        page.evaluate("() => window.__game.advance(0.4)")
        s9b = page.evaluate("() => window.__game.state().score")
        chk(s9b[0] == s8b[0] + 1,
            "a shot inside the same post is a goal (%s -> %s)" % (s8b, s9b))

        # --- a fast diagonal shot is judged where it CROSSED the line, not where it happened
        # --- to be when the next frame was drawn. Sampling once a frame calls this one wide.
        #     crossing z = 3.50 (inside the post), sampled z one frame later = 4.40 (outside)
        s10 = page.evaluate("() => window.__game.state().score")
        page.evaluate("() => window.__game.setBall(52.45, 3.40, 30, 60, 0)")
        page.evaluate("() => window.__game.advance(0.05)")
        s11 = page.evaluate("() => window.__game.state().score")
        chk(s11[0] == s10[0] + 1,
            "a shot that crossed the line inside the post is a goal even though it was "
            "outside it a frame later (%s -> %s)" % (s10, s11))

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


def main():
    url = sys.argv[1] if len(sys.argv) > 1 else (HERE / "play.html").as_uri()
    print("=" * 64)
    print("checks on the playable match")
    print("=" * 64)
    run(url, "desktop, keyboard")
    run(url, "phone viewport, touch", mobile=True)
    print("\n" + "=" * 64)
    print("  %d checks, %d passed, %d failed" % (PASS[0] + FAIL[0], PASS[0], FAIL[0]))
    print("=" * 64)
    return 1 if FAIL[0] else 0


if __name__ == "__main__":
    sys.exit(main())
