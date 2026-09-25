/* THE RUN CYCLE, IN ONE PLACE.
 *
 * AI2ORBIT Co. (c) 2026.
 *
 * WHY THIS FILE EXISTS. The gait was copied into play.html, into
 * runner.html and into demo.html, and the three copies drifted.
 * When the run cycle turned out to be wrong it was wrong three
 * times, and fixing two of them would have left the third to be
 * found later by whoever happened to open that page. There is now
 * one copy and three pages that call it.
 *
 * WHICH WAY IS FORWARD, AND WHICH WAY A JOINT BENDS. Every sign
 * below rests on these two facts, so they are written down rather
 * than left to be rediscovered:
 *
 *   The boot is mounted at +Z of the ankle, so +Z IS FORWARD.
 *   A positive rotation about X swings a bone hanging along -Y
 *   towards -Z, ie. BACKWARDS.
 *
 * So a NEGATIVE hip angle puts the thigh in front, a POSITIVE knee
 * angle takes the heel backwards - which is the only way a knee
 * bends - and a NEGATIVE chest angle leans the body forward.
 *
 * WHAT WAS WRONG. The feet ran out in front of the body. Measured
 * from the hip, the boot reached 0.82 m forward at speed, on a leg
 * 0.82 m long: straight out and horizontal. The chest meanwhile
 * leaned 15 degrees BACKWARDS. Two sign mistakes, and neither was
 * visible in a hip angle - the hip swing was healthy throughout,
 * which is exactly why the check that watched the hip passed while
 * the thing looked wrong. The knee was bending the wrong way, so
 * the shin was thrown forward instead of the heel folding up
 * behind, and the chest lean had simply been set positive.
 *
 * What is measured now is the BOOT's position relative to the hip,
 * and the numbers that matter are:
 *
 *   PLANT   forward offset of the boot where it is lowest, ie.
 *           where it meets the grass. A runner plants underneath
 *           himself. Now within 5 cm of under the hip; it was the
 *           reach, not the plant, that had gone.
 *   REACH   furthest forward. 0.28 to 0.40 m by speed, from 0.53
 *           to 0.82 m before.
 *   PUSH    furthest back. 0.38 to 0.61 m. Running has a push off
 *           phase and a cycle without one paddles on the spot.
 *
 * THE CYCLE IS DELIBERATELY NOT SYMMETRIC, because running is not:
 *   forward half  the thigh comes through with the knee FOLDED, so
 *                 the foot travels under the body rather than out
 *                 in front of it, unfolding only to plant.
 *   back half     the leg drives out straight behind.
 *
 * Cadence and stride both come from SPEED, so a player who slows
 * down stops sprinting on the spot. Everything here is a rotation
 * about a joint; nothing is a position keyframe.
 */
(function (root) {
  "use strict";

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* opts.idleBelow   speed under which the player is standing
   * opts.idleSway    true for a small standing sway rather than a
   *                  freeze - used by the close up page, where a
   *                  motionless rig reads as a crash.
   */
  function stride(rig, speed, dt, kicking, tackling, opts) {
    var o = opts || {};
    var idleBelow = o.idleBelow === undefined ? 0.15 : o.idleBelow;

    var cadence = speed < idleBelow ? 0.55
                                    : 1.05 + 0.62 * Math.pow(speed, 0.85);
    rig.phase += cadence * dt * 6.283185;

    var drive = clamp(speed / 7.5, 0, 1);      // 0 standing, 1 flat out
    var fwdSwing  = 0.30 + 0.34 * drive;       // thigh lifted in front
    var backDrive = 0.30 + 0.76 * drive;       // leg extended behind
    var tuck      = 0.55 + 1.55 * drive;       // heel towards the backside

    rig.legs.forEach(function (L, i) {
      var ph = i === 0 ? rig.phase : rig.phase + Math.PI;
      var f = Math.sin(ph);                    // f > 0 is the forward half
      L.hip.rotation.x = f > 0 ? -f * fwdSwing : -f * backDrive;
      /* A knee bends ONE WAY and the clamp at zero is what keeps it
       * that way. Folded while the leg comes through, straight
       * where the foot plants, with a soft middle through the
       * stance so the player is not running on stilts. */
      L.kn.rotation.x = tuck * Math.max(0, Math.sin(ph + 0.9)) + 0.07
                      + (f < 0 ? 0.26 * drive * Math.sin(-f * Math.PI) : 0);
      /* Toes down on the push, slightly up coming through so the
       * boot clears the grass. */
      L.an.rotation.x = 0.42 * drive * Math.max(0, -f)
                      - 0.14 * drive * Math.max(0, f);
    });

    rig.arms.forEach(function (A, i) {
      /* Arms oppose the legs, and this line has to move WITH the
       * hip sign above. The hip angle used to be +sin, so a
       * positive half sent the leg backwards; it is now -sin, which
       * sends it forwards. Flipping one and not the other is how a
       * rig ends up walking like a wind up toy. */
      var ph = i === 0 ? rig.phase : rig.phase + Math.PI;
      A.sh.rotation.x = Math.sin(ph) * (0.20 + 0.85 * drive);
      A.sh.rotation.z = A.side * (0.10 + 0.16 * drive);
      A.el.rotation.x = -(0.25 + 0.95 * drive)
                      - 0.3 * Math.max(0, Math.sin(ph));
    });

    rig.chest.rotation.x = -0.26 * drive;      // NEGATIVE is forward
    rig.hips.position.y = 0.92
                        + Math.abs(Math.cos(rig.phase)) * 0.045 * drive;

    if (speed < idleBelow) {
      rig.hips.position.y = o.idleSway
        ? 0.92 + Math.sin(rig.phase * 0.6) * 0.008
        : 0.92;
      rig.chest.rotation.x = -0.03;
      /* A PLAYER WHO IS NOT MOVING DOES NOT MOVE HIS LEGS. The swing
       * above is scaled by drive, but both halves of it have a base
       * that does not go to zero - so a man standing on the halfway
       * line was working his legs through 34 degrees, which is a jog
       * performed on the spot. Standing is its own pose and it is set
       * here rather than being left to fall out of the running one. */
      rig.legs.forEach(function (L, i) {
        L.hip.rotation.x = i === 0 ? 0.02 : -0.02;   // feet a little apart
        L.kn.rotation.x = 0.05;
        L.an.rotation.x = 0;
      });
      rig.arms.forEach(function (A) {
        A.sh.rotation.x = 0.04;
        A.el.rotation.x = -0.22;
      });
    }

    if (kicking > 0) {                         // a kick overrides the right leg
      var k = Math.sin(clamp(kicking, 0, 1) * Math.PI);
      rig.legs[1].hip.rotation.x = -1.5 * k;
      rig.legs[1].kn.rotation.x = 0.12 + 0.85 * (1 - k);  // cocked, then through it
      rig.chest.rotation.x = -0.26 * drive - 0.18 * k;
    }

    if (tackling > 0) {                        // a slide: legs out, body low
      var t = Math.sin(clamp(tackling, 0, 1) * Math.PI);
      rig.hips.position.y = 0.92 - 0.5 * t;
      rig.chest.rotation.x = -0.26 * drive - 0.75 * t;
      rig.legs.forEach(function (L) {
        L.hip.rotation.x = -1.1 * t;
        L.kn.rotation.x = 0.10;
      });
    }
  }

  root.GAIT = { stride: stride };
})(typeof window !== "undefined" ? window : this);
